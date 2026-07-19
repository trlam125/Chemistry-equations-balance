const fs = require('fs');
const vm = require('vm');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function evalSlice(startMarker, endMarker, context = {}) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Không tìm thấy đoạn mã: ${startMarker} -> ${endMarker}`);
  }
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  return context;
}

const markdown = evalSlice('function escapeHtml', '// ---------- Tabs ----------');
const markdownCases = [
  ['**Hóa học** rất quan trọng.', '<strong>Hóa học</strong> rất quan trọng.'],
  ['* **Y học và', '• Y học và'],
  ['- **Ứng dụng:** thuốc và vật liệu', '• <strong>Ứng dụng:</strong> thuốc và vật liệu'],
  ['Nội dung bị dở ở **cuối câu', 'Nội dung bị dở ở cuối câu'],
  ['Dùng `H2O` và *chú ý*.', 'Dùng <code>H2O</code> và <em>chú ý</em>.'],
  ['## Tiêu đề', '<span class="md-heading md-h2">Tiêu đề</span>'],
];

for (const [input, expected] of markdownCases) {
  const actual = markdown.renderMarkdown(input);
  if (actual !== expected) {
    throw new Error(`Sai Markdown:\nInput: ${input}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

const fenced = markdown.renderMarkdown('```txt\n**không in đậm**\n```');
if (!fenced.includes('<pre><code>**không in đậm**</code></pre>')) {
  throw new Error(`Khối mã bị thay đổi: ${fenced}`);
}

const helpers = evalSlice('function extractGeminiCandidate', 'async function requestGeminiChunk');
const parsed = helpers.extractGeminiCandidate({
  candidates: [{
    content: { parts: [{ text: 'Phần 1' }, { text: 'Phần 2' }] },
    finishReason: 'MAX_TOKENS'
  }]
});
if (parsed.text !== 'Phần 1\nPhần 2' || parsed.finishReason !== 'MAX_TOKENS') {
  throw new Error(`Không ghép đủ các content.parts: ${JSON.stringify(parsed)}`);
}

const merged = helpers.mergeContinuation(
  'Hóa học giúp tạo ra thuốc và vật liệu mới.',
  'thuốc và vật liệu mới. Ngoài ra còn bảo vệ môi trường.'
);
if (merged !== 'Hóa học giúp tạo ra thuốc và vật liệu mới. Ngoài ra còn bảo vệ môi trường.') {
  throw new Error(`Ghép phần nối tiếp bị lặp: ${merged}`);
}

if (!html.includes('maxOutputTokens: 4096')) {
  throw new Error('Chưa tăng giới hạn đầu ra Gemini lên 4096 token');
}
if (!html.includes("finishReason !== 'MAX_TOKENS'")) {
  throw new Error('Chưa xử lý finishReason MAX_TOKENS');
}
if (!html.includes('for (let partIndex = 0; partIndex < 3; partIndex++)')) {
  throw new Error('Chưa có cơ chế gọi nối tiếp phản hồi bị cắt');
}
if (html.includes('maxOutputTokens: 900')) {
  throw new Error('Vẫn còn giới hạn cũ 900 token');
}

console.log('PASS: 14 chat resilience checks');

(async () => {
  const requests = [];
  const responses = [
    {
      candidates: [{
        content: { parts: [{ text: 'Mở đầu **phần rất quan trọng' }] },
        finishReason: 'MAX_TOKENS'
      }]
    },
    {
      candidates: [{
        content: { parts: [{ text: 'phần rất quan trọng** và đã kết thúc đầy đủ.' }] },
        finishReason: 'STOP'
      }]
    }
  ];
  const context = {
    GEMINI_MODELS: ['gemini-test'],
    getApiKey: () => 'test-key',
    buildGeminiPrompt: text => `PROMPT:${text}`,
    AbortController: undefined,
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      const data = responses.shift();
      return { ok: true, status: 200, json: async () => data };
    }
  };
  evalSlice('function extractGeminiCandidate', 'async function sendChat', context);
  const answer = await context.requestGemini('Hóa học có quan trọng không?');
  if (requests.length !== 2) {
    throw new Error(`MAX_TOKENS phải gọi nối tiếp đúng 1 lần, thực tế: ${requests.length}`);
  }
  if (requests[0].body.generationConfig.maxOutputTokens !== 4096) {
    throw new Error('Request thực tế không dùng maxOutputTokens 4096');
  }
  if (requests[1].body.contents.length !== 3 || requests[1].body.contents[1].role !== 'model') {
    throw new Error('Request nối tiếp không gửi lại phần trả lời trước theo hội thoại');
  }
  if (answer !== 'Mở đầu **phần rất quan trọng** và đã kết thúc đầy đủ.') {
    throw new Error(`Phản hồi nối tiếp chưa được ghép đúng: ${answer}`);
  }
  console.log('PASS: MAX_TOKENS continuation mock');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
