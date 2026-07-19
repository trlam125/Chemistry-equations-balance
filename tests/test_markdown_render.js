const fs = require('fs');
const vm = require('vm');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const start = html.indexOf('function escapeHtml');
const end = html.indexOf('// ---------- Tabs ----------');

if (start < 0 || end < 0 || end <= start) {
  throw new Error('Không tìm thấy hàm render Markdown trong index.html');
}

const context = {};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);

const cases = [
  ['**Hóa học** là khoa học.', '<strong>Hóa học</strong> là khoa học.'],
  ['1. **Chất:** Thành phần', '1. <strong>Chất:</strong> Thành phần'],
  ['Dùng `H2O` và *chú ý*.', 'Dùng <code>H2O</code> và <em>chú ý</em>.'],
  ['## Tiêu đề', '<span class="md-heading md-h2">Tiêu đề</span>'],
];

for (const [input, expected] of cases) {
  const actual = context.renderMarkdown(input);
  if (actual !== expected) {
    throw new Error(`Sai render:\nInput: ${input}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

const escaped = context.renderMarkdown('<img src=x onerror=alert(1)> **an toàn**');
if (escaped.includes('<img') || !escaped.includes('&lt;img') || !escaped.includes('<strong>an toàn</strong>')) {
  throw new Error(`HTML escape không an toàn: ${escaped}`);
}

if (html.includes('Đang hỏi Gemini...') || html.includes('Đang xử lý ngoại tuyến...')) {
  throw new Error('Vẫn còn trạng thái chờ cũ');
}
if (!html.includes("addMessage('Chatbot đang suy nghĩ...', 'bot', 'typing')")) {
  throw new Error('Thiếu trạng thái Chatbot đang suy nghĩ...');
}

console.log('PASS: 6 UI/Markdown checks');
