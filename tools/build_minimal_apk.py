import os, struct, hashlib, zlib, zipfile, subprocess, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)

# ----------------- helpers -----------------
def uleb(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7f
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)

def align(data: bytearray, n=4):
    while len(data) % n:
        data.append(0)

def p16(x): return struct.pack('<H', x)
def p32(x): return struct.pack('<I', x)

# ----------------- DEX builder -----------------
def build_dex() -> bytes:
    class_desc = 'Lcom/example/chembalanceai/MainActivity;'
    descriptors = [
        'V', 'Z', class_desc, 'Landroid/app/Activity;', 'Landroid/os/Bundle;',
        'Landroid/content/Context;', 'Landroid/view/View;', 'Landroid/webkit/WebView;',
        'Landroid/webkit/WebSettings;', 'Ljava/lang/String;'
    ]

    proto_specs = {
        'void0': ('V', ()),
        'bundle_void': ('V', ('Landroid/os/Bundle;',)),
        'context_void': ('V', ('Landroid/content/Context;',)),
        'settings0': ('Landroid/webkit/WebSettings;', ()),
        'bool_void': ('V', ('Z',)),
        'view_void': ('V', ('Landroid/view/View;',)),
        'string_void': ('V', ('Ljava/lang/String;',)),
    }
    methods = [
        ('Landroid/app/Activity;', '<init>', 'void0'),
        ('Landroid/app/Activity;', 'onCreate', 'bundle_void'),
        ('Landroid/app/Activity;', 'setContentView', 'view_void'),
        ('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'bool_void'),
        ('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'bool_void'),
        ('Landroid/webkit/WebSettings;', 'setAllowFileAccessFromFileURLs', 'bool_void'),
        ('Landroid/webkit/WebSettings;', 'setAllowUniversalAccessFromFileURLs', 'bool_void'),
        ('Landroid/webkit/WebView;', '<init>', 'context_void'),
        ('Landroid/webkit/WebView;', 'getSettings', 'settings0'),
        ('Landroid/webkit/WebView;', 'loadUrl', 'string_void'),
        (class_desc, '<init>', 'void0'),
        (class_desc, 'onCreate', 'bundle_void'),
    ]
    url = 'file:///android_asset/index.html'

    def shorty_type(t):
        return t if len(t) == 1 else 'L'
    shorties = [shorty_type(r) + ''.join(shorty_type(p) for p in ps) for r, ps in proto_specs.values()]
    strings = set(descriptors + shorties + [m[1] for m in methods] + [url])
    strings = sorted(strings)
    sidx = {s:i for i,s in enumerate(strings)}

    # type_ids sorted by descriptor_idx
    type_descs = sorted(descriptors, key=lambda s: sidx[s])
    tidx = {t:i for i,t in enumerate(type_descs)}

    proto_list = []
    for key,(ret,params) in proto_specs.items():
        shorty = shorty_type(ret) + ''.join(shorty_type(p) for p in params)
        proto_list.append((key, ret, params, shorty))
    proto_list.sort(key=lambda x: (tidx[x[1]], tuple(tidx[p] for p in x[2])))
    pidx = {x[0]:i for i,x in enumerate(proto_list)}

    method_list = list(methods)
    method_list.sort(key=lambda m: (tidx[m[0]], sidx[m[1]], pidx[m[2]]))
    midx = {m:i for i,m in enumerate(method_list)}

    header_size = 0x70
    string_ids_off = header_size
    type_ids_off = string_ids_off + 4*len(strings)
    proto_ids_off = type_ids_off + 4*len(type_descs)
    method_ids_off = proto_ids_off + 12*len(proto_list)
    class_defs_off = method_ids_off + 8*len(method_list)
    data_off = class_defs_off + 32
    data = bytearray()

    # type_lists first, aligned
    param_offsets = {}
    for _,_,params,_ in proto_list:
        if not params or params in param_offsets:
            continue
        align(data,4)
        off = data_off + len(data)
        param_offsets[params] = off
        data += p32(len(params))
        for p in params:
            data += p16(tidx[p])
        align(data,4)

    # Instruction helpers
    def invoke(op, method_index, regs):
        A = len(regs)
        rr = list(regs) + [0]*(5-len(regs))
        C,D,E,F,G = rr[0],rr[1],rr[2],rr[3],rr[4]
        return [op | (G<<8) | (A<<12), method_index, C | (D<<4) | (E<<8) | (F<<12)]
    def ins21c(op, reg, idx): return [op | (reg<<8), idx]
    def ins11x(op, reg): return [op | (reg<<8)]
    def const4(reg, value): return [0x12 | (reg<<8) | ((value & 0xf)<<12)]

    # code item builder
    def add_code(registers, ins_size, outs, words):
        align(data,4)
        off = data_off + len(data)
        data.extend(struct.pack('<HHHHII', registers, ins_size, outs, 0, 0, len(words)))
        data.extend(struct.pack('<' + 'H'*len(words), *words))
        return off

    ctor_words = []
    ctor_words += invoke(0x70, midx[('Landroid/app/Activity;', '<init>', 'void0')], [0])
    ctor_words += [0x000e]
    ctor_off = add_code(1,1,1,ctor_words)

    # v0=WebView, v1=WebSettings/String, v2=true, p0=v3, p1=v4
    on_words = []
    on_words += invoke(0x6f, midx[('Landroid/app/Activity;', 'onCreate', 'bundle_void')], [3,4])
    on_words += ins21c(0x22, 0, tidx['Landroid/webkit/WebView;'])
    on_words += invoke(0x70, midx[('Landroid/webkit/WebView;', '<init>', 'context_void')], [0,3])
    on_words += invoke(0x6e, midx[('Landroid/webkit/WebView;', 'getSettings', 'settings0')], [0])
    on_words += ins11x(0x0c,1)
    on_words += const4(2,1)
    on_words += invoke(0x6e, midx[('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'bool_void')], [1,2])
    on_words += invoke(0x6e, midx[('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'bool_void')], [1,2])
    on_words += invoke(0x6e, midx[('Landroid/webkit/WebSettings;', 'setAllowFileAccessFromFileURLs', 'bool_void')], [1,2])
    on_words += invoke(0x6e, midx[('Landroid/webkit/WebSettings;', 'setAllowUniversalAccessFromFileURLs', 'bool_void')], [1,2])
    on_words += invoke(0x6e, midx[('Landroid/app/Activity;', 'setContentView', 'view_void')], [3,0])
    on_words += ins21c(0x1a,1,sidx[url])
    on_words += invoke(0x6e, midx[('Landroid/webkit/WebView;', 'loadUrl', 'string_void')], [0,1])
    on_words += [0x000e]
    oncreate_off = add_code(5,2,2,on_words)

    # class_data item
    class_data_off = data_off + len(data)
    main_ctor_idx = midx[(class_desc,'<init>','void0')]
    main_on_idx = midx[(class_desc,'onCreate','bundle_void')]
    class_data = bytearray()
    class_data += uleb(0) + uleb(0) + uleb(1) + uleb(1)
    class_data += uleb(main_ctor_idx) + uleb(0x10001) + uleb(ctor_off)
    class_data += uleb(main_on_idx) + uleb(0x4) + uleb(oncreate_off)
    data += class_data

    # string data items
    string_data_offsets = []
    string_data_start = data_off + len(data)
    for s in strings:
        string_data_offsets.append(data_off + len(data))
        enc = s.encode('utf-8')
        utf16_len = len(s.encode('utf-16-le')) // 2
        data += uleb(utf16_len) + enc + b'\x00'

    # map list at end aligned
    align(data,4)
    map_off = data_off + len(data)
    # sections with offsets; string data offset is min
    map_items = [
        (0x0000,1,0),
        (0x0001,len(strings),string_ids_off),
        (0x0002,len(type_descs),type_ids_off),
        (0x0003,len(proto_list),proto_ids_off),
        (0x0005,len(method_list),method_ids_off),
        (0x0006,1,class_defs_off),
    ]
    if param_offsets:
        map_items.append((0x1001,len(param_offsets),min(param_offsets.values())))
    map_items += [
        (0x2001,2,ctor_off),
        (0x2000,1,class_data_off),
        (0x2002,len(strings),string_data_start),
        (0x1000,1,map_off),
    ]
    map_items.sort(key=lambda x:x[2])
    data += p32(len(map_items))
    for typ,size,off in map_items:
        data += struct.pack('<HHII',typ,0,size,off)

    file_size = data_off + len(data)
    out = bytearray(b'\x00'*header_size)
    # string_ids
    for off in string_data_offsets: out += p32(off)
    # type_ids
    for t in type_descs: out += p32(sidx[t])
    # proto_ids
    for _,ret,params,shorty in proto_list:
        out += p32(sidx[shorty]) + p32(tidx[ret]) + p32(param_offsets.get(params,0))
    # method_ids
    for cls,name,proto in method_list:
        out += struct.pack('<HHI',tidx[cls],pidx[proto],sidx[name])
    # class_def
    out += struct.pack('<IIIIIIII',
        tidx[class_desc], 0x21, tidx['Landroid/app/Activity;'], 0,
        0xffffffff, 0, class_data_off, 0)
    assert len(out) == data_off
    out += data
    assert len(out) == file_size

    data_size = file_size - data_off
    header = bytearray()
    header += b'dex\n035\x00'
    header += b'\x00'*4  # checksum
    header += b'\x00'*20 # signature
    header += struct.pack('<20I',
        file_size, header_size, 0x12345678,
        0,0,map_off,
        len(strings),string_ids_off,
        len(type_descs),type_ids_off,
        len(proto_list),proto_ids_off,
        0,0,
        len(method_list),method_ids_off,
        1,class_defs_off,
        data_size,data_off)
    assert len(header)==header_size
    out[:header_size]=header
    sig = hashlib.sha1(out[32:]).digest()
    out[12:32]=sig
    checksum = zlib.adler32(out[12:]) & 0xffffffff
    out[8:12]=p32(checksum)
    return bytes(out)

# ----------------- Binary XML builder -----------------
RES_XML_TYPE=0x0003
RES_STRING_POOL_TYPE=0x0001
RES_XML_RESOURCE_MAP_TYPE=0x0180
RES_XML_START_NAMESPACE_TYPE=0x0100
RES_XML_END_NAMESPACE_TYPE=0x0101
RES_XML_START_ELEMENT_TYPE=0x0102
RES_XML_END_ELEMENT_TYPE=0x0103
NO_INDEX=0xffffffff
TYPE_REFERENCE=0x01
TYPE_STRING=0x03
TYPE_INT_DEC=0x10
TYPE_INT_BOOLEAN=0x12
ANDROID_URI='http://schemas.android.com/apk/res/android'
ANDROID_PREFIX='android'

ATTR_IDS = {
    'theme':0x01010000,
    'label':0x01010001,
    'icon':0x01010002,
    'name':0x01010003,
    'exported':0x01010010,
    'minSdkVersion':0x0101020c,
    'versionCode':0x0101021b,
    'versionName':0x0101021c,
    'targetSdkVersion':0x01010270,
}

def enc_len8(n):
    if n > 0x7f:
        return bytes([(n>>8)|0x80, n&0xff])
    return bytes([n])

def build_string_pool(strings):
    offsets=[]; blob=bytearray()
    for s in strings:
        offsets.append(len(blob))
        b=s.encode('utf-8')
        u16=len(s.encode('utf-16-le'))//2
        blob += enc_len8(u16)+enc_len8(len(b))+b+b'\x00'
    while len(blob)%4: blob.append(0)
    header_size=28
    strings_start=header_size+4*len(strings)
    size=strings_start+len(blob)
    out=bytearray(struct.pack('<HHI',RES_STRING_POOL_TYPE,header_size,size))
    out += struct.pack('<IIIII',len(strings),0,0x100,strings_start,0)
    out += b''.join(p32(x) for x in offsets)
    out += blob
    return bytes(out)

def node_header(typ,size,line=1):
    return struct.pack('<HHIII',typ,16,size,line,NO_INDEX)

def build_axml():
    # Put framework attribute names first so resource map can index directly.
    strings=[]
    def add(s):
        if s not in strings: strings.append(s)
        return strings.index(s)
    for name in ATTR_IDS: add(name)
    for s in [ANDROID_PREFIX,ANDROID_URI,'manifest','package','com.example.chembalanceai','1.2.5',
              'uses-permission','android.permission.INTERNET','android.permission.ACCESS_NETWORK_STATE',
              'uses-sdk','application','Chemistry balance','activity',
              'com.example.chembalanceai.MainActivity','intent-filter','action',
              'android.intent.action.MAIN','category','android.intent.category.LAUNCHER']:
        add(s)
    idx={s:i for i,s in enumerate(strings)}
    sp=build_string_pool(strings)

    # resource map through framework attrs
    max_i=max(idx[n] for n in ATTR_IDS)
    ids=[0]*(max_i+1)
    for n,rid in ATTR_IDS.items(): ids[idx[n]]=rid
    rmap=struct.pack('<HHI',RES_XML_RESOURCE_MAP_TYPE,8,8+4*len(ids))+b''.join(p32(x) for x in ids)

    chunks=bytearray()
    # namespace start
    chunks += node_header(RES_XML_START_NAMESPACE_TYPE,24)+p32(idx[ANDROID_PREFIX])+p32(idx[ANDROID_URI])

    def typed_value(dtype,data): return struct.pack('<HBBI',8,0,dtype,data)
    def attr(ns,name,raw,dtype,data):
        return p32(ns)+p32(idx[name])+p32(raw)+typed_value(dtype,data)
    def start(tag, attrs):
        # attrs: (ns_index, name, raw_idx, dtype, data)
        size=16+20+20*len(attrs)
        out=bytearray(node_header(RES_XML_START_ELEMENT_TYPE,size))
        out += struct.pack('<IIHHHHHH',NO_INDEX,idx[tag],20,20,len(attrs),0,0,0)
        for a in attrs: out += attr(*a)
        return out
    def end(tag): return node_header(RES_XML_END_ELEMENT_TYPE,24)+p32(NO_INDEX)+p32(idx[tag])

    A=idx[ANDROID_URI]
    # manifest
    chunks += start('manifest',[
        (NO_INDEX,'package',idx['com.example.chembalanceai'],TYPE_STRING,idx['com.example.chembalanceai']),
        (A,'versionCode',NO_INDEX,TYPE_INT_DEC,8),
        (A,'versionName',idx['1.2.5'],TYPE_STRING,idx['1.2.5']),
    ])
    chunks += start('uses-permission',[(A,'name',idx['android.permission.INTERNET'],TYPE_STRING,idx['android.permission.INTERNET'])])
    chunks += end('uses-permission')
    chunks += start('uses-permission',[(A,'name',idx['android.permission.ACCESS_NETWORK_STATE'],TYPE_STRING,idx['android.permission.ACCESS_NETWORK_STATE'])])
    chunks += end('uses-permission')
    chunks += start('uses-sdk',[
        (A,'minSdkVersion',NO_INDEX,TYPE_INT_DEC,23),
        (A,'targetSdkVersion',NO_INDEX,TYPE_INT_DEC,28),
    ])
    chunks += end('uses-sdk')
    chunks += start('application',[
        (A,'label',idx['Chemistry balance'],TYPE_STRING,idx['Chemistry balance']),
        (A,'icon',NO_INDEX,TYPE_REFERENCE,0x7f010000),
    ])
    chunks += start('activity',[
        (A,'name',idx['com.example.chembalanceai.MainActivity'],TYPE_STRING,idx['com.example.chembalanceai.MainActivity']),
        (A,'exported',NO_INDEX,TYPE_INT_BOOLEAN,0xffffffff),
    ])
    chunks += start('intent-filter',[])
    chunks += start('action',[(A,'name',idx['android.intent.action.MAIN'],TYPE_STRING,idx['android.intent.action.MAIN'])])
    chunks += end('action')
    chunks += start('category',[(A,'name',idx['android.intent.category.LAUNCHER'],TYPE_STRING,idx['android.intent.category.LAUNCHER'])])
    chunks += end('category')
    chunks += end('intent-filter')
    chunks += end('activity')
    chunks += end('application')
    chunks += end('manifest')
    chunks += node_header(RES_XML_END_NAMESPACE_TYPE,24)+p32(idx[ANDROID_PREFIX])+p32(idx[ANDROID_URI])

    total=8+len(sp)+len(rmap)+len(chunks)
    return struct.pack('<HHI',RES_XML_TYPE,8,total)+sp+rmap+chunks


# ----------------- Minimal resources.arsc builder -----------------
RES_TABLE_TYPE = 0x0002
RES_TABLE_PACKAGE_TYPE = 0x0200
RES_TABLE_TYPE_TYPE = 0x0201
RES_TABLE_TYPE_SPEC_TYPE = 0x0202


def build_resources_arsc() -> bytes:
    """Build one app resource: @drawable/app_icon -> res/drawable/app_icon.png."""
    global_pool = build_string_pool(['res/drawable/app_icon.png'])
    type_pool = build_string_pool(['drawable'])
    key_pool = build_string_pool(['app_icon'])

    # One type spec, one public entry at index 0.
    type_spec = bytearray(struct.pack('<HHI', RES_TABLE_TYPE_SPEC_TYPE, 16, 20))
    type_spec += struct.pack('<BBHI', 1, 0, 0, 1)
    type_spec += p32(0)

    # ResTable_config with the original 28-byte layout and all qualifiers unset.
    config = bytearray(28)
    config[0:4] = p32(28)
    type_header_size = 20 + len(config)  # 48
    entries_start = type_header_size + 4  # one uint32 entry offset
    entry = struct.pack('<HHI', 8, 0, 0)  # ResTable_entry, key index 0
    value = struct.pack('<HBBI', 8, 0, TYPE_STRING, 0)  # global string pool index 0
    type_size = entries_start + len(entry) + len(value)
    type_chunk = bytearray(struct.pack('<HHI', RES_TABLE_TYPE_TYPE, type_header_size, type_size))
    type_chunk += struct.pack('<BBHII', 1, 0, 0, 1, entries_start)
    type_chunk += config
    type_chunk += p32(0)  # entry 0 begins immediately at entriesStart
    type_chunk += entry + value

    package_header_size = 288
    type_strings_off = package_header_size
    key_strings_off = type_strings_off + len(type_pool)
    package_body = type_pool + key_pool + bytes(type_spec) + bytes(type_chunk)
    package_size = package_header_size + len(package_body)
    package = bytearray(struct.pack('<HHI', RES_TABLE_PACKAGE_TYPE, package_header_size, package_size))
    package += p32(0x7f)
    name = 'com.example.chembalanceai'.encode('utf-16le')
    package += name + b'\x00' * (256 - len(name))
    package += struct.pack('<IIIII', type_strings_off, 1, key_strings_off, 1, 0)
    assert len(package) == package_header_size
    package += package_body

    total_size = 12 + len(global_pool) + len(package)
    table = bytearray(struct.pack('<HHII', RES_TABLE_TYPE, 12, total_size, 1))
    table += global_pool + package
    return bytes(table)

# Build
classes = build_dex()
manifest = build_axml()
resources = build_resources_arsc()
(OUT/'classes.dex').write_bytes(classes)
(OUT/'AndroidManifest.xml').write_bytes(manifest)
(OUT/'resources.arsc').write_bytes(resources)
unsigned=OUT/'Chemistry-balance-unsigned.apk'
with zipfile.ZipFile(unsigned,'w') as z:
    z.writestr('AndroidManifest.xml',manifest,compress_type=zipfile.ZIP_STORED)
    z.writestr('classes.dex',classes,compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('resources.arsc',resources,compress_type=zipfile.ZIP_STORED)
    z.write(ROOT/'app/src/main/res/drawable/app_icon.png','res/drawable/app_icon.png',compress_type=zipfile.ZIP_DEFLATED)
    z.write(ROOT/'app/src/main/assets/index.html','assets/index.html',compress_type=zipfile.ZIP_DEFLATED)
    z.write(ROOT/'app/src/main/assets/app_logo.png','assets/app_logo.png',compress_type=zipfile.ZIP_DEFLATED)

# Create a debug keystore and sign with JAR/v1 signature.
keystore=OUT/'debug.keystore'
if not keystore.exists():
    subprocess.run([
        'keytool','-genkeypair','-v','-keystore',str(keystore),'-storepass','android',
        '-alias','androiddebugkey','-keypass','android','-keyalg','RSA','-keysize','2048',
        '-validity','10000','-dname','CN=Android Debug,O=ChemistryBalance,C=VN'
    ],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
final=OUT/'Chemistry-balance-v1.2.5.apk'
shutil.copy2(unsigned,final)
subprocess.run([
    'jarsigner','-keystore',str(keystore),'-storepass','android','-keypass','android',
    '-sigalg','SHA256withRSA','-digestalg','SHA-256',str(final),'androiddebugkey'
],check=True)
print(final)
print('APK bytes:', final.stat().st_size)
print('DEX bytes:', len(classes), 'Manifest bytes:', len(manifest), 'Resources bytes:', len(resources))
