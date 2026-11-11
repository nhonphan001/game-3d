#!/usr/bin/env node
// Chụp ảnh kiểm tra một gói nhân vật: mọi kiểu hiển thị × các hành động, ghép thành một tấm.
//   node tools/nhan-vat/preview.cjs <id> [thư-mục-xuất] [cổng]
// Cần máy chủ lớp học đang chạy (cd lop-hoc && npm start) và Playwright + Pillow.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');
const [id, out = '.', port = '3000'] = process.argv.slice(2);
if (!id) { console.error('Thiếu mã nhân vật.'); process.exit(1); }
const ACTS = ['idle', 'walk', 'run', 'jump', 'talk', 'laugh', 'wave', 'cry', 'angry'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 520, height: 600 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(`http://localhost:${port}/nhan-vat.html?id=${encodeURIComponent(id)}`);
  await p.waitForFunction(() => window.viewer?.ready || window.viewer?.error, null, { timeout: 20000 });
  const err = await p.evaluate(() => window.viewer.error);
  if (err) { console.error('Không nạp được gói:', err, errs); process.exit(1); }
  const modes = await p.evaluate(() => viewer.rig.modes);
  fs.mkdirSync(out, { recursive: true });
  const files = [];
  for (const m of modes) for (const a of ACTS) {
    await p.evaluate(([m, a]) => { viewer.setMode(m); viewer.setAction('idle'); viewer.setAction(a); }, [m, a]);
    await p.waitForTimeout(a === 'jump' ? 350 : 1300);
    const f = path.join(out, `_${m}_${a}.png`);
    await p.screenshot({ path: f, clip: { x: 60, y: 70, width: 400, height: 420 } });
    files.push(f);
  }
  await b.close();
  const sheet = path.join(out, `xem-thu-${id}.png`);
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
files, cols, sheet = sys.argv[2:], int(sys.argv[1]), None
sheet = files.pop()
W = Image.new('RGB', (cols * 300, (len(files) // cols) * 315), 'white')
for i, f in enumerate(files):
    W.paste(Image.open(f).resize((300, 315)), ((i % cols) * 300, (i // cols) * 315))
W.save(sheet)`, String(ACTS.length), ...files, sheet]);
  for (const f of files) fs.unlinkSync(f);
  console.log(`Kiểu: ${modes.join(', ')} · hàng = kiểu, cột = ${ACTS.join(', ')}`);
  console.log('Ảnh xem thử:', sheet);
  if (errs.length) { console.log('LỖI TRONG TRÌNH DUYỆT:', errs); process.exit(1); }
})();
