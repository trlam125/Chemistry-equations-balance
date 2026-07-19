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
  ['Fe + O2 -> Fe2O3', '4Fe + 3O2 → 2Fe2O3'],
  ['C2H6 + O2 -> CO2 + H2O', '2C2H6 + 7O2 → 4CO2 + 6H2O'],
  ['KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2', '2KMnO4 + 16HCl → 2KCl + 2MnCl2 + 8H2O + 5Cl2'],
  ['Ca(OH)2 + HCl -> CaCl2 + H2O', 'Ca(OH)2 + 2HCl → CaCl2 + 2H2O'],
  ['CuSO4.5H2O -> CuSO4 + H2O', 'CuSO4.5H2O → CuSO4 + 5H2O'],
  ['CxHyOzNt + O2 -> CO2 + H2O + N2', '4 CxHyOzNt + (4x + y - 2z) O2 → 4x CO2 + 2y H2O + 2t N2'],
  ['C_nH_m + O2 -> CO2 + H2O', '4 C_nH_m + (m + 4n) O2 → 4n CO2 + 2m H2O'],
  ['(CH2)x + O2 -> CO2 + H2O', '2 (CH2)x + 3x O2 → 2x CO2 + 2x H2O'],
];

let failed = 0;
for (const [input, expected] of cases) {
  try {
    const result = context.balanceChemicalEquation(input);
    if (result.text !== expected) {
      failed++;
      console.error(`FAIL: ${input}\n  expected: ${expected}\n  actual:   ${result.text}`);
      continue;
    }
    for (const element of result.elements) {
      if (String(result.atoms.left[element]) !== String(result.atoms.right[element])) {
        failed++;
        console.error(`FAIL conservation: ${input}, ${element}`);
      }
    }
    console.log(`PASS: ${input} => ${result.text}`);
  } catch (error) {
    failed++;
    console.error(`ERROR: ${input}:`, error.stack || error);
  }
}



const impossibleCases = [
  ['Ag + HCl -> AgCl + H2', /Ag.*đứng sau H|không xảy ra/i],
  ['Cu + ZnSO4 -> CuSO4 + Zn', /Cu.*kém hoạt động hơn Zn|không xảy ra/i],
  ['I2 + KBr -> KI + Br2', /I2.*kém hoạt động hơn Br2|không xảy ra/i],
  ['Cu + HNO3 -> Cu(NO3)2 + H2', /HNO3.*không tạo khí H2|không xảy ra/i],
];

for (const [input, expectedMessage] of impossibleCases) {
  try {
    context.balanceChemicalEquation(input);
    failed++;
    console.error(`FAIL: impossible reaction was balanced: ${input}`);
  } catch (error) {
    if (error.name !== 'ReactionFeasibilityError' || !expectedMessage.test(error.message)) {
      failed++;
      console.error(`FAIL wrong feasibility error: ${input}\n  ${error.name}: ${error.message}`);
    } else {
      console.log(`PASS rejected: ${input} => ${error.message}`);
    }
  }
}

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} balancing tests and ${impossibleCases.length} feasibility tests passed.`);
