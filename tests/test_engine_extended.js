'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const engine = script.slice(0, script.indexOf('// ---------- UI ----------'));
const context = { console };
vm.createContext(context);
vm.runInContext(`${engine}\nfunction escapeHtml(s){ return String(s); }\nglobalThis.balanceChemicalEquation = balanceChemicalEquation;`, context);

const cases = [
// Inorganic / mineral / redox / precipitation / hydrates
['FeS2 + O2 -> Fe2O3 + SO2', [4,11,2,8], 'inorganic'],
['KClO3 -> KCl + O2', [2,2,3], 'inorganic'],
['KMnO4 -> K2MnO4 + MnO2 + O2', [2,1,1,1], 'inorganic'],
['NH3 + O2 -> NO + H2O', [4,5,4,6], 'inorganic'],
['NH3 + O2 -> N2 + H2O', [4,3,2,6], 'inorganic'],
['P4 + O2 -> P2O5', [1,5,2], 'inorganic'],
['Na2O2 + H2O -> NaOH + O2', [2,2,4,1], 'inorganic'],
['Cl2 + NaOH -> NaCl + NaClO + H2O', [1,2,1,1,1], 'inorganic'],
['Cl2 + NaOH -> NaCl + NaClO3 + H2O', [3,6,5,1,3], 'inorganic'],
['MnO2 + HCl -> MnCl2 + Cl2 + H2O', [1,4,1,1,2], 'inorganic'],
['K2Cr2O7 + HCl -> KCl + CrCl3 + Cl2 + H2O', [1,14,2,2,3,7], 'inorganic'],
['Fe2O3 + CO -> Fe + CO2', [1,3,2,3], 'inorganic'],
['Al + Fe2O3 -> Al2O3 + Fe', [2,1,1,2], 'inorganic'],
['Cu + HNO3 -> Cu(NO3)2 + NO2 + H2O', [1,4,1,2,2], 'inorganic'],
['Cu + HNO3 -> Cu(NO3)2 + NO + H2O', [3,8,3,2,4], 'inorganic'],
['Zn + HNO3 -> Zn(NO3)2 + NH4NO3 + H2O', [4,10,4,1,3], 'inorganic'],
['H2S + SO2 -> S + H2O', [2,1,3,2], 'inorganic'],
['SO2 + O2 -> SO3', [2,1,2], 'inorganic'],
['N2 + H2 -> NH3', [1,3,2], 'inorganic'],
['Ca3(PO4)2 + SiO2 + C -> P4 + CaSiO3 + CO', [2,6,10,1,6,10], 'inorganic'],
['Na2CO3 + SiO2 -> Na2SiO3 + CO2', [1,1,1,1], 'inorganic'],
['CaCO3 + HCl -> CaCl2 + CO2 + H2O', [1,2,1,1,1], 'inorganic'],
['NaHCO3 -> Na2CO3 + CO2 + H2O', [2,1,1,1], 'inorganic'],
['Al2(SO4)3 + Ca(OH)2 -> Al(OH)3 + CaSO4', [1,3,2,3], 'inorganic'],
['FeCl3 + NaOH -> Fe(OH)3 + NaCl', [1,3,1,3], 'inorganic'],
['Pb(NO3)2 + KI -> PbI2 + KNO3', [1,2,1,2], 'inorganic'],
['BaCl2 + Na2SO4 -> BaSO4 + NaCl', [1,1,1,2], 'inorganic'],
['AgNO3 + Na3PO4 -> Ag3PO4 + NaNO3', [3,1,1,3], 'inorganic'],
['CuSO4.5H2O -> CuSO4 + H2O', [1,1,5], 'hydrate'],
['Na2S2O3.5H2O -> Na2S2O3 + H2O', [1,1,5], 'hydrate'],
['Al4C3 + H2O -> Al(OH)3 + CH4', [1,12,4,3], 'inorganic'],
['CaC2 + H2O -> C2H2 + Ca(OH)2', [1,2,1,1], 'inorganic'],
['SiCl4 + H2O -> SiO2 + HCl', [1,2,1,4], 'inorganic'],
['PCl5 + H2O -> H3PO4 + HCl', [1,4,1,5], 'inorganic'],
['B2H6 + O2 -> B2O3 + H2O', [1,3,1,3], 'inorganic'],
['Na2S2O3 + HCl -> NaCl + SO2 + S + H2O', [1,2,2,1,1,1], 'inorganic'],
['KNO3 + C + S -> K2S + N2 + CO2', [2,3,1,1,1,3], 'inorganic'],
['C + H2SO4 -> CO2 + SO2 + H2O', [1,2,1,2,2], 'inorganic'],
['P4 + KOH + H2O -> PH3 + KH2PO2', [1,3,3,1,3], 'inorganic'],
['I2 + Na2S2O3 -> NaI + Na2S4O6', [1,2,2,1], 'inorganic'],
['K2Cr2O7 + H2SO4 + FeSO4 -> K2SO4 + Cr2(SO4)3 + Fe2(SO4)3 + H2O', [1,7,6,1,1,3,7], 'inorganic'],
['KMnO4 + H2SO4 + FeSO4 -> K2SO4 + MnSO4 + Fe2(SO4)3 + H2O', [2,8,10,1,2,5,8], 'inorganic'],
['KClO3 + HCl -> KCl + Cl2 + H2O', [1,6,1,3,3], 'inorganic'],
['NaNO3 + H2SO4 -> NaHSO4 + HNO3', [1,1,1,1], 'inorganic'],
['Ca(OH)2 + NH4Cl -> CaCl2 + NH3 + H2O', [1,2,1,2,2], 'inorganic'],
['Mg3N2 + H2O -> Mg(OH)2 + NH3', [1,6,3,2], 'inorganic'],
['Na3PO4 + MgCl2 -> Mg3(PO4)2 + NaCl', [2,3,1,6], 'inorganic'],
['Fe3O4 + H2 -> Fe + H2O', [1,4,3,4], 'inorganic'],
['PbS + O2 -> PbO + SO2', [2,3,2,2], 'inorganic'],
['As2S3 + O2 -> As2O3 + SO2', [2,9,2,6], 'inorganic'],
['(NH4)2Cr2O7 -> Cr2O3 + N2 + H2O', [1,1,1,4], 'inorganic'],
['Ca5(PO4)3F + H2SO4 -> H3PO4 + CaSO4 + HF', [1,5,3,5,1], 'inorganic'],
['Na2B4O7.10H2O + HCl -> H3BO3 + NaCl + H2O', [1,2,4,2,5], 'hydrate'],
['K4Fe(CN)6 + KMnO4 + H2SO4 -> KHSO4 + Fe2(SO4)3 + MnSO4 + HNO3 + CO2 + H2O', [10,122,299,162,5,122,60,60,188], 'complex'],
// Organic combustion and transformations
['CH4 + O2 -> CO2 + H2O', [1,2,1,2], 'organic'],
['C2H6 + O2 -> CO2 + H2O', [2,7,4,6], 'organic'],
['C3H8 + O2 -> CO2 + H2O', [1,5,3,4], 'organic'],
['C4H10 + O2 -> CO2 + H2O', [2,13,8,10], 'organic'],
['C6H6 + O2 -> CO2 + H2O', [2,15,12,6], 'organic'],
['C7H8 + O2 -> CO2 + H2O', [1,9,7,4], 'organic'],
['C8H18 + O2 -> CO2 + H2O', [2,25,16,18], 'organic'],
['C2H5OH + O2 -> CO2 + H2O', [1,3,2,3], 'organic'],
['CH3CH2OH + O2 -> CO2 + H2O', [1,3,2,3], 'organic-condensed'],
['CH3OH + O2 -> CO2 + H2O', [2,3,2,4], 'organic'],
['C3H8O3 + O2 -> CO2 + H2O', [2,7,6,8], 'organic'],
['C6H12O6 + O2 -> CO2 + H2O', [1,6,6,6], 'organic'],
['C12H22O11 + O2 -> CO2 + H2O', [1,12,12,11], 'organic'],
['C2H4 + H2 -> C2H6', [1,1,1], 'organic'],
['C2H2 + H2 -> C2H6', [1,2,1], 'organic'],
['C6H6 + H2 -> C6H12', [1,3,1], 'organic'],
['C2H4 + Br2 -> C2H4Br2', [1,1,1], 'organic'],
['C2H2 + Br2 -> C2H2Br4', [1,2,1], 'organic'],
['C2H5OH -> C2H4 + H2O', [1,1,1], 'organic'],
['C2H5OH -> CH3CHO + H2', [1,1,1], 'organic-condensed'],
['CH3CHO + O2 -> CH3COOH', [2,1,2], 'organic-condensed'],
['C2H5OH + O2 -> CH3COOH + H2O', [1,1,1,1], 'organic-condensed'],
['C2H5OH + CuO -> CH3CHO + Cu + H2O', [1,1,1,1,1], 'organic-condensed'],
['CH3COOH + C2H5OH -> CH3COOC2H5 + H2O', [1,1,1,1], 'organic-condensed'],
['C2H4 + H2O -> C2H5OH', [1,1,1], 'organic'],
['C2H2 + HCl -> C2H3Cl', [1,1,1], 'organic'],
['C2H5Cl + NaOH -> C2H5OH + NaCl', [1,1,1,1], 'organic'],
['C2H5Cl + NaOH -> C2H4 + NaCl + H2O', [1,1,1,1,1], 'organic'],
['CH3COOH + NaOH -> CH3COONa + H2O', [1,1,1,1], 'organic-condensed'],
['C6H12O6 -> C2H5OH + CO2', [1,2,2], 'organic'],
['C6H12O6 -> C3H6O3', [1,2], 'organic'],
['C6H12O6 + Ag2O -> C6H12O7 + Ag', [1,1,1,2], 'organic'],
['C6H5OH + NaOH -> C6H5ONa + H2O', [1,1,1,1], 'organic'],
['C6H5OH + Br2 -> C6H2Br3OH + HBr', [1,3,1,3], 'organic-condensed'],
['C6H6 + Br2 -> C6H5Br + HBr', [1,1,1,1], 'organic'],
['C6H6 + HNO3 -> C6H5NO2 + H2O', [1,1,1,1], 'organic'],
['C6H5NO2 + H2 -> C6H5NH2 + H2O', [1,3,1,2], 'organic-condensed'],
['C6H5NH2 + HCl -> C6H5NH3Cl', [1,1,1], 'organic-condensed'],
['C6H5NH2 + Br2 -> C6H2Br3NH2 + HBr', [1,3,1,3], 'organic-condensed'],
['C3H5(OH)3 + HNO3 -> C3H5(ONO2)3 + H2O', [1,3,1,3], 'organic-nested'],
['C6H12 + O2 -> CO2 + H2O', [1,9,6,6], 'organic'],
['C6H10 + O2 -> CO2 + H2O', [2,17,12,10], 'organic'],
['C2H6O2 + O2 -> CO2 + H2O', [2,5,4,6], 'organic'],
['C3H6O + O2 -> CO2 + H2O', [1,4,3,3], 'organic'],
['C4H8O2 + O2 -> CO2 + H2O', [1,5,4,4], 'organic'],
['C8H8 + O2 -> CO2 + H2O', [1,10,8,4], 'organic'],
['C9H8O4 + O2 -> CO2 + H2O', [1,9,9,4], 'organic'],
['C8H9NO2 + O2 -> CO2 + H2O + N2', [4,37,32,18,2], 'organic'],
['C10H8 + O2 -> CO2 + H2O', [1,12,10,4], 'organic'],
['C20H42 + O2 -> CO2 + H2O', [2,61,40,42], 'organic'],
['C57H104O6 + O2 -> CO2 + H2O', [1,80,57,52], 'organic'],
['C6H5COOH + O2 -> CO2 + H2O', [2,15,14,6], 'organic-condensed'],
['CH3COCH3 + O2 -> CO2 + H2O', [1,4,3,3], 'organic-condensed'],
['C2H5NH2 + O2 -> CO2 + H2O + N2', [4,15,8,14,2], 'organic-condensed'],
['C2H5SH + O2 -> CO2 + H2O + SO2', [2,9,4,6,2], 'organic-condensed'],
['CH3Cl + O2 -> CO2 + H2O + HCl', [2,3,2,2,2], 'organic'],
['C2H4Cl2 + O2 -> CO2 + H2O + HCl', [2,5,4,2,4], 'organic'],
['C2H5NO2 + O2 -> CO2 + H2O + N2', [4,9,8,10,2], 'organic'],
['C3H7NO2 + O2 -> CO2 + H2O + N2', [4,15,12,14,2], 'organic'],
['C5H11NO2 + O2 -> CO2 + H2O + N2', [4,27,20,22,2], 'organic'],
['C27H46O + O2 -> CO2 + H2O', [1,38,27,23], 'organic'],
['C8H18 + N2O -> CO2 + H2O + N2', [1,25,8,9,25], 'organic'],
['C2H5OH + Na -> C2H5ONa + H2', [2,2,2,1], 'organic'],
['C2H5OH + PCl5 -> C2H5Cl + POCl3 + HCl', [1,1,1,1,1], 'organic'],
['CH3COOH + PCl5 -> CH3COCl + POCl3 + HCl', [1,1,1,1,1], 'organic-condensed'],
['CH3COOH + NH3 -> CH3COONH4', [1,1,1], 'organic-condensed'],
['CH3COONa + NaOH -> CH4 + Na2CO3', [1,1,1,1], 'organic-condensed'],
['C6H5COONa + NaOH -> C6H6 + Na2CO3', [1,1,1,1], 'organic-condensed'],
['C6H5CH3 + KMnO4 -> C6H5COOK + MnO2 + KOH + H2O', [1,2,1,2,1,1], 'organic-condensed'],
['CH3COOH + NaHCO3 -> CH3COONa + CO2 + H2O', [1,1,1,1,1], 'organic-condensed'],
['CH3COOC2H5 + NaOH -> CH3COONa + C2H5OH', [1,1,1,1], 'organic-condensed'],
['CH3COOC2H5 + H2O -> CH3COOH + C2H5OH', [1,1,1,1], 'organic-condensed'],
['C3H5(OOCCH3)3 + NaOH -> C3H5(OH)3 + CH3COONa', [1,3,1,3], 'organic-nested'],
['C12H22O11 + H2O -> C6H12O6 + C6H12O6', [1,1,1,1], 'organic'],
['C2H4 -> (C2H4)n', null, 'symbolic'],
];

let failed = 0;
const stats = {};
for (const [input, expected, category] of cases) {
  stats[category] = stats[category] || {pass:0, fail:0};
  try {
    const result = context.balanceChemicalEquation(input);
    const actual = result.coeffs.map(x => typeof x === 'bigint' ? Number(x) : x.toString());
    let ok = true;
    if (expected) ok = actual.length === expected.length && actual.every((v,i)=>v===expected[i]);
    // independent conservation check based on engine's parsed counts/results
    for (const el of result.elements) {
      if (String(result.atoms.left[el]) !== String(result.atoms.right[el])) ok = false;
    }
    if (!ok) {
      failed++; stats[category].fail++;
      console.log(`FAIL [${category}] ${input}`);
      console.log(`  expected: ${expected ? expected.join(',') : '(symbolic conservation)'}`);
      console.log(`  actual:   ${actual.join(',')} :: ${result.text}`);
    } else {
      stats[category].pass++;
      console.log(`PASS [${category}] ${input} => ${result.text}`);
    }
  } catch (e) {
    failed++; stats[category].fail++;
    console.log(`ERROR [${category}] ${input}`);
    console.log(`  ${e.name}: ${e.message}`);
  }
}

const expectedErrors = [
  ['KMnO4 + H2SO4 + H2O2 -> K2SO4 + MnSO4 + O2 + H2O', /nhiều bộ hệ số|oxi hóa-khử/i, 'ambiguous-redox'],
  ['Ag + HCl -> AgCl + H2', /đứng sau H|không xảy ra/i, 'feasibility'],
  ['Cu + ZnSO4 -> CuSO4 + Zn', /kém hoạt động hơn Zn|không xảy ra/i, 'feasibility'],
  ['I2 + KBr -> KI + Br2', /kém hoạt động hơn Br2|không xảy ra/i, 'feasibility'],
  ['Cu + HNO3 -> Cu(NO3)2 + H2', /không tạo khí H2|không xảy ra/i, 'feasibility'],
];
for (const [input, pattern, category] of expectedErrors) {
  stats[category] = stats[category] || {pass:0, fail:0};
  try {
    context.balanceChemicalEquation(input);
    failed++; stats[category].fail++;
    console.log(`FAIL [${category}] expected rejection: ${input}`);
  } catch (e) {
    if (!pattern.test(e.message)) {
      failed++; stats[category].fail++;
      console.log(`FAIL [${category}] wrong error for ${input}: ${e.name}: ${e.message}`);
    } else {
      stats[category].pass++;
      console.log(`PASS [${category}] rejected ${input} => ${e.message}`);
    }
  }
}

console.log('\nSUMMARY');
const total = cases.length + expectedErrors.length;
console.log(JSON.stringify({total, failed, passed:total-failed, balancingCases:cases.length, rejectionCases:expectedErrors.length, stats}, null, 2));
process.exit(failed ? 1 : 0);
