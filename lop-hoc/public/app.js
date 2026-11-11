// Lớp Học Nét Vẽ — phía trình duyệt: vào lớp, tách nền ảnh, sân lớp 3D, bảng duyệt của giáo viên.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { makeFigure, STYLES } from './figure.js';
import { Rig, loadCharacter } from './rig/rig.js';

const $ = (id) => document.getElementById(id);
const INK = '#2434b4', PAPER = '#f3eedb', CARD = '#fbf8ec';
const ROOM = { hx: 12.5, z0: -9, z1: 9 };         // vùng đi lại hình chữ nhật (mét), trùng với máy chủ
const ROOM_DRAW = { hx: 13.1, z0: -9.6, z1: 9.6 }; // nét viền vẽ trên giấy, rộng hơn vùng đi lại một chút
const WALL_Z = ROOM_DRAW.z0 - 0.3;                  // bảng và màn chiếu đứng sát mép sau của sân
const clampRoom = (x, z) => ({ x: Math.max(-ROOM.hx, Math.min(ROOM.hx, x)), z: Math.max(ROOM.z0, Math.min(ROOM.z1, z)) });
const PHRASES = ['Xin chào!', 'Cảm ơn bạn!', 'Bạn vẽ đẹp quá!', 'Chơi cùng mình nhé!', 'Mình đồng ý!', 'Giỏi lắm!', 'Cả lớp chú ý nào!', 'Tạm biệt!'];
const EMOJI = { wave: '👋', laugh: '😆', cry: '😭', angry: '💢', jump: '✨', heart: '❤️', star: '⭐' };

// ================================================================ Tách nền ảnh
// 1) Lấy màu giấy từ vùng sáng ở giữa ảnh. 2) Tìm trang giấy (mảng màu giấy lớn nhất) và cắt theo nó,
// để bỏ mặt bàn, bàn tay quanh trang. 3) "Đổ" từ mép vào: giấy thông với mép thành trong suốt; phần giấy
// nằm kín trong nét vẽ được giữ lại nên nhân vật trông như hình cắt giấy. Vật lạ thò vào từ mép
// (ngón tay, gáy lò xo) chỉ bị xoá trong một dải sát mép để không ăn vào nét vẽ.
const WHITE = [253, 250, 244];
function cutout(img, thr) {
  const scale = Math.min(1, 420 / Math.max(img.width, img.height));
  const W = Math.max(8, Math.round(img.width * scale)), H = Math.max(8, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const src = g.getImageData(0, 0, W, H).data;

  // màu giấy: trung vị của nửa sáng hơn trong vùng giữa ảnh
  const mid = [];
  for (let y = H >> 2; y < (H * 3) >> 2; y += 2) for (let x = W >> 2; x < (W * 3) >> 2; x += 2) mid.push((y * W + x) * 4);
  const lum = (i) => src[i] + src[i + 1] + src[i + 2];
  mid.sort((p, q) => lum(q) - lum(p));
  const bright = mid.slice(0, mid.length >> 1);
  const paper = [0, 1, 2].map((k) => bright.map((i) => src[i + k]).sort((p, q) => p - q)[bright.length >> 1]);
  const paperLike = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4, dr = src[i] - paper[0], dg = src[i + 1] - paper[1], db = src[i + 2] - paper[2], mean = (dr + dg + db) / 3;
    // lệch sáng/tối đều (bóng đổ trên giấy) được nới hơn lệch màu
    paperLike[p] = Math.max(Math.abs(dr - mean), Math.abs(dg - mean), Math.abs(db - mean)) * 2 + Math.abs(mean) * 0.8 < thr ? 1 : 0;
  }

  // trang giấy = khung bao của các mảng màu giấy đủ lớn (nét vẽ dày có thể chia trang thành nhiều mảng)
  const comp = new Int32Array(W * H), stack = [];
  let bestN = 0, bx0 = W, by0 = H, bx1 = 0, by1 = 0;
  for (let s = 0, id = 0; s < W * H; s++) {
    if (!paperLike[s] || comp[s]) continue;
    id++;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    comp[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q >= 0 && paperLike[q] && !comp[q]) { comp[q] = id; stack.push(q); }
      }
    }
    if (n > bestN) bestN = n;
    if (n >= W * H * 0.004) { bx0 = Math.min(bx0, x0); by0 = Math.min(by0, y0); bx1 = Math.max(bx1, x1); by1 = Math.max(by1, y1); }
  }
  if (bestN < W * H * 0.08) return null; // không thấy trang giấy
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1;

  // đổ từ mép trang: 1 = giấy nền, 2 = vật lạ sát mép
  const state = new Uint8Array(w * h), band = Math.round(Math.min(w, h) * 0.1);
  const at = (x, y) => (y + by0) * W + (x + bx0);
  const visit = (x, y, from) => {
    const p = y * w + x;
    if (state[p]) return;
    if (paperLike[at(x, y)]) state[p] = 1;
    else if (from === 2 && Math.min(x, y, w - 1 - x, h - 1 - y) < band) state[p] = 2;
    else return;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) { visit(x, 0, 2); visit(x, h - 1, 2); }
  for (let y = 0; y < h; y++) { visit(0, y, 2); visit(w - 1, y, 2); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0, st = state[p];
    if (x > 0) visit(x - 1, y, st);
    if (x < w - 1) visit(x + 1, y, st);
    if (y > 0) visit(x, y - 1, st);
    if (y < h - 1) visit(x, y + 1, st);
  }

  // bỏ các mảnh rời nhỏ (chữ viết, vết bẩn): chỉ giữ mảng lớn nhất và những mảng đủ lớn so với nó
  const lab = new Int32Array(w * h), sizes = [0];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (state[s0] || lab[s0]) continue;
    const id = sizes.length;
    let n = 0;
    lab[s0] = id; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      n++;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { // nối cả các nét cách nhau 1–2 điểm ảnh
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (!state[q] && !lab[q]) { lab[q] = id; stack.push(q); }
      }
    }
    sizes.push(n);
  }
  const biggest = Math.max(...sizes);
  for (let p = 0; p < w * h; p++) if (!state[p] && sizes[lab[p]] < biggest * 0.06) state[p] = 1;

  const out = g.createImageData(w, h), o = out.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, kept = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (state[p]) continue;
    const i = at(x, y) * 4;
    // cân lại màu để giấy thành trắng ngà dù ảnh chụp bị ám màu hay thiếu sáng
    // và đậm nét mực lên một chút để nét bút nhạt vẫn rõ
    for (let k = 0; k < 3; k++) o[p * 4 + k] = Math.max(0, 255 - (255 - Math.min(255, (src[i + k] * WHITE[k]) / Math.max(60, paper[k]))) * 1.35);
    o[p * 4 + 3] = 255;
    kept++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (kept < 60 || kept > w * h * 0.97) return null; // toàn giấy, hoặc không tách được nền
  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  full.getContext('2d').putImageData(out, 0, 0);
  const res = document.createElement('canvas');
  res.width = x1 - x0 + 1; res.height = y1 - y0 + 1;
  res.getContext('2d').drawImage(full, x0, y0, res.width, res.height, 0, 0, res.width, res.height);
  return res;
}
function toDataURL(cv) { // PNG vừa đủ nhỏ cho máy chủ (≤ 400 KB)
  let c = cv;
  for (let i = 0; i < 4; i++) {
    const url = c.toDataURL('image/png');
    if (url.length * 0.75 < 380 * 1024) return url;
    const s = document.createElement('canvas');
    s.width = Math.round(c.width * 0.75); s.height = Math.round(c.height * 0.75);
    s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
    c = s;
  }
  return null;
}
function drawFit(target, src) {
  const g = target.getContext('2d');
  g.clearRect(0, 0, target.width, target.height);
  if (!src) return;
  const k = Math.min(target.width / src.width, target.height / src.height) * 0.94;
  g.drawImage(src, (target.width - src.width * k) / 2, (target.height - src.height * k) / 2, src.width * k, src.height * k);
}

// ================================================================ Cảnh 3D
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
scene.fog = new THREE.Fog(PAPER, 34, 90); // sân rộng: chỉ nhạt dần ở rất xa
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 4.2, 9.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.9, 0);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.47;

function inkCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.strokeStyle = g.fillStyle = INK;
  g.lineCap = g.lineJoin = 'round';
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// Sân lớp: trang giấy có vòng tròn nét đứt và vài hình vẽ nguệch ngoạc
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({
  map: inkCanvas(2048, 2048, (g) => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = PAPER; g.fillRect(0, 0, 2048, 2048);
    // khung chữ nhật vẽ tay: nét liền hơi run, nét đứt ở ngoài (1 m = 51,2 điểm ảnh, gốc ở giữa ảnh)
    const X0 = 1024 - ROOM_DRAW.hx * 51.2, X1 = 1024 + ROOM_DRAW.hx * 51.2, Y0 = 1024 + ROOM_DRAW.z0 * 51.2, Y1 = 1024 + ROOM_DRAW.z1 * 51.2;
    const rect = (pad, wob) => {
      g.beginPath();
      const pts = [[X0 - pad, Y0 - pad], [X1 + pad, Y0 - pad], [X1 + pad, Y1 + pad], [X0 - pad, Y1 + pad], [X0 - pad, Y0 - pad]];
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 24);
        for (let k = 1; k <= n; k++) g.lineTo(ax + ((bx - ax) * k) / n + (rnd() - 0.5) * wob, ay + ((by - ay) * k) / n + (rnd() - 0.5) * wob);
      }
      g.stroke();
    };
    g.lineWidth = 4; rect(0, 4);
    g.setLineDash([14, 16]); g.lineWidth = 2.5; rect(18, 0);
    g.setLineDash([]);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * 2048, y = rnd() * 2048, r = 12 + rnd() * 16;
      g.lineWidth = 2.2;
      g.beginPath();
      if (i % 3 === 0) for (let t = 0; t < 9; t += 0.25) g.lineTo(x + Math.cos(t) * t * r * 0.11, y + Math.sin(t) * t * r * 0.11);
      else if (i % 3 === 1) { g.moveTo(x, y + r * 0.6); g.bezierCurveTo(x - r * 1.3, y - r * 0.3, x - r * 0.5, y - r, x, y - r * 0.3); g.bezierCurveTo(x + r * 0.5, y - r, x + r * 1.3, y - r * 0.3, x, y + r * 0.6); }
      else for (let k = 0; k < 5; k++) { const a = k * 1.2566; g.moveTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.5); g.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.36, 0, Math.PI * 2); }
      g.stroke();
    }
  }),
}));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Bảng lớp ở cuối sân, hiện tên lớp và mã lớp
const boardCv = document.createElement('canvas');
boardCv.width = 1024; boardCv.height = 560;
const boardTex = new THREE.CanvasTexture(boardCv);
boardTex.colorSpace = THREE.SRGBColorSpace;
const boardState = { img: null, url: null, caption: '', title: '' };
function drawBoard(code) {
  const g = boardCv.getContext('2d'), W = 1024, H = 560;
  g.fillStyle = CARD; g.fillRect(0, 0, W, H);
  g.strokeStyle = INK; g.lineWidth = 2; g.globalAlpha = 0.35;
  for (let k = -H; k < W; k += 14) { g.beginPath(); g.moveTo(k, H); g.lineTo(k + H, 0); g.stroke(); }
  g.globalAlpha = 1; g.lineWidth = 12; g.strokeRect(8, 8, W - 16, H - 16);
  g.textAlign = 'center'; g.fillStyle = INK;
  if (boardState.img) { // giáo viên đang chiếu một hình vẽ
    const im = boardState.img, aw = W - 120, ah = H - 150, k = Math.min(aw / im.width, ah / im.height);
    const w = im.width * k, h = im.height * k, x = (W - w) / 2, y = 38 + (ah - h) / 2;
    g.fillStyle = '#fff'; g.fillRect(x - 8, y - 8, w + 16, h + 16);
    g.drawImage(im, x, y, w, h);
    g.lineWidth = 5; g.strokeRect(x - 8, y - 8, w + 16, h + 16);
    g.fillStyle = INK; g.font = '52px "Patrick Hand", sans-serif';
    g.fillText(boardState.caption.slice(0, 40), W / 2, H - 38);
  } else {
    g.fillStyle = CARD; g.fillRect(120, 90, 784, 300);
    g.lineWidth = 4; g.strokeRect(120, 90, 784, 300);
    g.fillStyle = INK;
    const title = boardState.title || 'Lớp Học Nét Vẽ';
    g.font = `700 ${title.length > 16 ? 64 : 92}px "Dancing Script", cursive`;
    g.fillText(title, 512, 230);
    g.font = '64px "Patrick Hand", sans-serif';
    g.fillText(code ? `Mã lớp: ${code}` : 'Chào mừng các bạn!', 512, 340);
  }
  boardTex.needsUpdate = true;
}
function setBoard(b) { // b: { url, name } hoặc null
  boardState.url = b ? b.url : null;
  if (!b) { boardState.img = null; drawBoard(session.code || ''); return; }
  const im = new Image();
  im.onload = () => { if (boardState.url !== b.url) return; boardState.img = im; boardState.caption = `Hình của ${b.name}`; drawBoard(session.code || ''); };
  im.src = b.url;
}
drawBoard('');
document.fonts?.ready.then(() => { drawBoard(session.code || ''); drawScreen(!!vid.cur); });
const board = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 4), new THREE.MeshBasicMaterial({ map: boardTex }));
board.position.set(0, 2.6, WALL_Z);
scene.add(board);
for (const x of [-3.45, 3.45]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), new THREE.MeshBasicMaterial({ color: INK }));
  leg.position.set(x, 0.45, WALL_Z);
  scene.add(leg);
}

// Màn chiếu phim đặt cạnh bảng: video YouTube phủ lên đúng mặt màn này (xem placeDock)
const SCREEN = { x: -7.8, y: 2.5, z: WALL_Z, w: 5.6, h: 3.15 };
const VR = { x: 20, y: 12, w: 984, h: 552 }; // vùng 16:9 trên mặt màn (toạ độ ảnh 1024×576) mà khung video phủ lên
const screenCv = document.createElement('canvas');
screenCv.width = 1024; screenCv.height = 576;
const screenTex = new THREE.CanvasTexture(screenCv);
screenTex.colorSpace = THREE.SRGBColorSpace;
function drawScreen(on) {
  const g = screenCv.getContext('2d'), W = 1024, H = 576;
  g.textAlign = 'center';
  if (on) { // đang chiếu: nền tối, khung video YouTube phủ lên
    g.fillStyle = '#0d1450'; g.fillRect(0, 0, W, H);
    g.fillStyle = CARD; g.beginPath(); g.moveTo(450, 200); g.lineTo(450, 340); g.lineTo(580, 270); g.closePath(); g.fill();
    g.font = '44px "Patrick Hand", sans-serif'; g.fillText('Đang chiếu video…', W / 2, 430);
  } else { // màn tắt: tờ giấy trống có nét gạch như bảng
    g.fillStyle = '#ebe5cf'; g.fillRect(0, 0, W, H);
    g.strokeStyle = INK; g.globalAlpha = 0.18; g.lineWidth = 2;
    for (let k = -H; k < W; k += 16) { g.beginPath(); g.moveTo(k, H); g.lineTo(k + H, 0); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = INK;
    g.font = '700 110px "Dancing Script", cursive'; g.fillText('Màn chiếu', W / 2, 290);
    g.font = '44px "Patrick Hand", sans-serif'; g.fillText('Chưa chiếu video', W / 2, 370);
  }
  screenTex.needsUpdate = true;
}
drawScreen(false);
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: screenTex }));
screenMesh.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 0.03);
const frameMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w + 0.3, SCREEN.h + 0.3), new THREE.MeshBasicMaterial({ color: INK }));
frameMesh.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
const roller = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.w + 0.6, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: INK }));
roller.position.set(SCREEN.x, SCREEN.y + SCREEN.h / 2 + 0.22, SCREEN.z);
scene.add(frameMesh, screenMesh, roller);
for (const dx of [-SCREEN.w / 2 - 0.1, SCREEN.w / 2 + 0.1]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, SCREEN.y + SCREEN.h / 2 + 0.22, 0.1), new THREE.MeshBasicMaterial({ color: INK }));
  post.position.set(SCREEN.x + dx, (SCREEN.y + SCREEN.h / 2 + 0.22) / 2, SCREEN.z);
  scene.add(post);
}

const shadowTex = inkCanvas(128, 128, (g) => {
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.clip();
  g.globalAlpha = 0.75; g.lineWidth = 2.5;
  for (let k = -128; k < 128; k += 9) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); }
});
const spriteCache = new Map();
function emojiTex(ch) {
  if (!spriteCache.has(ch)) spriteCache.set(ch, inkCanvas(128, 128, (g) => {
    g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 64, 70);
  }));
  return spriteCache.get(ch);
}
function wrapLines(text, max = 22, maxLines = 3) {
  const lines = [];
  let cur = '';
  for (let w of text.split(' ')) {
    while (w.length > max) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, max)); w = w.slice(max); }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, max - 1)}…`; }
  return lines;
}
function textSprite(text, { teacher = false, bubble = false } = {}) {
  const font = `${bubble ? 44 : 40}px "Patrick Hand", "Comic Sans MS", sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const lines = bubble ? wrapLines(text) : [teacher ? `★ ${text}` : text];
  const w = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + 44;
  const boxH = bubble ? lines.length * 50 + 12 : 56, h = bubble ? boxH + 22 : 62;
  const tex = inkCanvas(w, h, (g) => {
    g.fillStyle = teacher && !bubble ? INK : CARD;
    g.lineWidth = 4;
    g.beginPath(); g.roundRect(3, 3, w - 6, bubble ? boxH : h - 6, 18); g.fill(); g.stroke();
    if (bubble) { g.beginPath(); g.moveTo(w / 2 - 12, boxH - 2); g.lineTo(w / 2, h - 3); g.lineTo(w / 2 + 12, boxH - 2); g.fill(); g.stroke(); }
    g.fillStyle = teacher && !bubble ? CARD : INK;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cy = 3 + (bubble ? boxH : h - 6) / 2;
    lines.forEach((l, i) => g.fillText(l, w / 2, cy + (i - (lines.length - 1) / 2) * 50 + 2));
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  if (bubble) sp.scale.set(w / 168, h / 168, 1); else sp.scale.set((w / h) * 0.34, 0.34, 1);
  sp.renderOrder = bubble ? 12 : 10;
  return sp;
}
// Hình mặc định khi giáo viên không tải ảnh: người que cầm thước
const defaultTex = inkCanvas(256, 384, (g) => {
  g.fillStyle = CARD; g.lineWidth = 7;
  g.beginPath(); g.arc(128, 86, 58, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(84, 150); g.lineTo(60, 340); g.lineTo(196, 340); g.lineTo(172, 150); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.arc(106, 80, 14, 0, Math.PI * 2); g.moveTo(164, 80); g.arc(150, 80, 14, 0, Math.PI * 2); g.moveTo(120, 80); g.lineTo(136, 80);
  g.moveTo(108, 110); g.quadraticCurveTo(128, 126, 148, 110);
  g.moveTo(84, 180); g.lineTo(30, 240); g.moveTo(172, 180); g.lineTo(228, 130); g.lineTo(240, 60);
  g.moveTo(100, 340); g.lineTo(100, 378); g.moveTo(156, 340); g.lineTo(156, 378); g.stroke();
});
const figShared = { uLight: { value: new THREE.Vector3(0.4, 0.7, 0.6) }, uPx: { value: 1 } };
const LIGHT = new THREE.Vector3(0.45, 0.8, 0.6).normalize();
const rigShared = { uLight: figShared.uLight, uPx: figShared.uPx, uBoil: { value: 0 } }; // cho nhân vật đóng gói
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd6f5, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.copy(LIGHT).multiplyScalar(10);
scene.add(sun);
const EMOTE_ACTION = { wave: 'wave', laugh: 'laugh', cry: 'cry', angry: 'angry', heart: 'talk', star: 'laugh' };
const turnTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// ---------------------------------------------------------------- Nhân vật cắt giấy
const avatars = new Map();
const texLoader = new THREE.TextureLoader();
class Avatar {
  constructor(m) {
    this.id = m.id; this.name = m.name; this.role = m.role;
    this.pos = new THREE.Vector3(m.x, 0, m.z);
    this.target = this.pos.clone();
    this.phase = Math.random() * 6; this.speed = 0; this.face = 1; this.fx = 1; this.turn = 0;
    this.style = STYLES.includes(m.style) ? m.style : 'flat'; this.seed = m.seed | 0;
    this.emote = null; this.emoteT = 0; this.y = 0; this.vy = 0; this.spawn = 0;
    this.root = new THREE.Group();
    this.flip = new THREE.Group();
    this.h = 1.5;
    this.src = defaultTex.image; // ảnh nguồn (đã tách nền) để dựng hình theo kiểu đang chọn
    this.heading = 0; this.char = m.char || null;
    if (m.char) { // nhân vật đóng gói được gán sẵn: có bộ xương, biểu cảm và ba kiểu hiển thị riêng
      loadCharacter(m.char).then((pkg) => {
        if (this.gone) return;
        this.rig = new Rig(pkg, rigShared);
        this.rig.setMode(this.style);
        scene.add(this.rig.group);
        this.flip.visible = false;
        this.h = this.rig.height;
        this.label.position.y = this.h + 0.28;
      }).catch(() => {}); // không tải được gói thì giữ hình mặc định
    } else if (m.img) {
      const im = new Image();
      im.onload = () => { if (!this.gone) { this.src = im; this.rebuild(); } };
      im.src = m.img;
    }
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.label = textSprite(m.name, { teacher: m.role === 'teacher' });
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.icon.renderOrder = 11; this.icon.visible = false;
    this.root.add(this.flip, this.label, this.icon);
    this.rebuild();
    scene.add(this.root, this.shadow);
    this.muted = !!m.muted;
    this.away = !!m.away; // mất kết nối nhưng vẫn giữ chỗ: hiện 💤
    this.awayIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('💤'), transparent: true, depthTest: false }));
    this.awayIcon.renderOrder = 11; this.awayIcon.scale.setScalar(0.42); this.awayIcon.visible = this.away;
    this.root.add(this.awayIcon);
    if (m.held) this.setHeld(m.held);
  }
  rebuild() { // dựng lại hình khi có ảnh hoặc khi đổi kiểu
    if (this.rig) { this.rig.setMode(this.style); return; }
    if (this.fig) { this.flip.remove(this.fig.mesh); this.fig.dispose(); }
    this.fig = makeFigure(this.src, this.style, this.seed, figShared);
    this.flip.add(this.fig.mesh);
    this.h = this.fig.height;
    this.label.position.y = this.h + 0.28;
  }
  setStyle(style, seed) {
    if (!STYLES.includes(style)) return;
    this.style = style; this.seed = seed | 0;
    this.rebuild();
  }
  play(e) {
    this.emote = e; this.emoteT = 0;
    if (e === 'jump' && this.y === 0) this.vy = 5;
    this.icon.material.map = emojiTex(EMOJI[e]); this.icon.material.needsUpdate = true;
    this.icon.visible = true;
  }
  say(i) { this.sayText(PHRASES[i]); }
  sayText(text, secs = 3.2) {
    if (this.bubble) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); }
    this.bubble = textSprite(text, { bubble: true });
    this.bubbleT = 0; this.bubbleDur = secs;
    this.root.add(this.bubble);
  }
  setHeld(url) { // tờ hình vẽ nhân vật đang cầm (null = cất đi)
    if (this.held) {
      this.root.remove(this.held);
      this.held.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      this.held = null;
    }
    this.heldUrl = url || null;
    if (!url) return;
    texLoader.load(url, (tex) => {
      if (this.gone || this.heldUrl !== url) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      const a = tex.image.width / tex.image.height, S = 0.66;
      const w = a >= 1 ? S : S * a, h = a >= 1 ? S / a : S;
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, h + 0.06), new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide }));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      pic.position.z = 0.004;
      g.add(frame, pic);
      this.held = g;
      this.root.add(g);
    });
  }
  update(dt, t) {
    const d = this.target.clone().sub(this.pos), dist = d.length();
    const want = dist > 0.05 ? (dist > 4 ? 3.4 : 1.7) : 0;
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * 8));
    if (dist > 0.05) {
      this.pos.addScaledVector(d, Math.min(1, (this.speed * dt) / dist));
      camera.getWorldDirection(tmp);
      const side = d.x * -tmp.z + d.z * tmp.x; // hướng đi trên màn hình: phải (+) hay trái (−)
      if (Math.abs(side) > 0.08 * dist) this.face = side > 0 ? 1 : -1;
    }
    this.phase += dt * this.speed * 4.4;
    if (this.y > 0 || this.vy > 0) { this.vy -= 15 * dt; this.y = Math.max(0, this.y + this.vy * dt); if (this.y === 0) this.vy = 0; }
    this.spawn = Math.min(1, this.spawn + dt * 3);

    const s = Math.sin, mv = Math.min(1, this.speed / 1.7), e = this.emote;
    let rz = s(this.phase) * 0.08 * mv + s(t * 1.5 + this.phase) * 0.012, hop = Math.abs(s(this.phase)) * 0.06 * mv, sx = 1, sy = 1 + s(t * 2 + this.phase) * 0.012, dx = 0;
    if (e) {
      this.emoteT += dt;
      const k = this.emoteT;
      if (e === 'wave') rz = s(k * 9) * 0.16;
      if (e === 'laugh') { hop = Math.abs(s(k * 11)) * 0.12; sy = 1 + s(k * 22) * 0.04; }
      if (e === 'cry') { rz = 0.1 + s(k * 16) * 0.02; sy = 0.94; }
      if (e === 'angry') { dx = s(k * 45) * 0.03; sy = 1.04; }
      if (e === 'heart' || e === 'star') { hop = Math.abs(s(k * 6)) * 0.08; rz = s(k * 6) * 0.06; }
      this.icon.position.set(e === 'wave' ? 0.55 : 0, this.h + 0.75 + Math.min(0.25, k * 0.5), 0);
      this.icon.scale.setScalar(0.5 + s(k * 8) * 0.05);
      if (k > 2.6) { this.emote = null; this.icon.visible = false; }
    }
    if (this.y > 0) { sy *= 1 + this.vy * 0.015; sx = 2 - sy; }
    this.root.position.set(this.pos.x + dx, this.y + hop, this.pos.z);
    this.root.rotation.y = Math.atan2(camera.position.x - this.pos.x, camera.position.z - this.pos.z);
    this.flip.rotation.z = rz;
    this.fx += (this.face - this.fx) * (1 - Math.exp(-dt * 14)); // lật mượt khi đổi hướng
    if (this.rig) {
      const moving = dist > 0.05;
      this.heading = moving ? Math.atan2(d.x, d.z) : turnTo(this.heading, Math.atan2(camera.position.x - this.pos.x, camera.position.z - this.pos.z), 1 - Math.exp(-dt * 3));
      const action = this.y > 0 ? 'jump' : this.speed > 2.5 ? 'run' : this.speed > 0.15 ? 'walk'
        : e && EMOTE_ACTION[e] ? EMOTE_ACTION[e] : this.bubble && this.bubbleT < 2.6 ? 'talk' : 'idle';
      this.root.position.y = 0; // nhãn tên đứng yên, nhân vật tự nhún theo bộ xương
      this.rig.update(dt, t, { x: this.pos.x + dx, z: this.pos.z, y: this.y, vy: this.vy, speed: this.speed, phase: this.phase, heading: this.heading, action },
        { camera, width: canvas.width, height: canvas.height });
    } else if (this.fig.flat) { // tấm giấy: lật trái/phải
      this.flip.scale.set(this.fx * sx * this.spawn, sy * this.spawn, 1);
      this.flip.rotation.y = 0;
    } else {             // khối 3D: xoay người theo hướng đi, đứng yên thì đung đưa nhẹ để thấy khối
      this.turn += (this.face * 0.75 * mv + s(t * 0.7 + this.phase) * 0.28 * (1 - mv) - this.turn) * (1 - Math.exp(-dt * 8));
      this.flip.scale.set(sx * this.spawn, sy * this.spawn, sx * this.spawn);
      this.flip.rotation.y = this.turn;
    }
    this.shadow.position.set(this.pos.x, 0.012, this.pos.z);
    this.shadow.scale.setScalar(Math.max(0.5, 1 - this.y * 0.35) * this.spawn);
    this.awayIcon.visible = this.away;
    if (this.away) this.awayIcon.position.set(0.35, this.h + 0.62 + s(t * 2) * 0.04, 0);
    if (this.held) { // tờ hình ở bên tay, lật theo hướng đi, đung đưa khi bước
      const xo = this.rig ? 0.62 : Math.min(0.9, (this.fig?.width || 0.8) * 0.5 + 0.18), yo = this.rig ? 0.95 : Math.max(0.5, this.h * 0.4);
      this.held.position.set((this.rig ? 1 : this.fx) * xo, yo + s(t * 2 + this.phase) * 0.01, this.rig ? 0.5 : 0.12);
      this.held.rotation.z = -0.1 * (this.rig ? 1 : this.fx) + s(this.phase) * 0.06 * mv;
      this.held.scale.setScalar(this.spawn * THREE.MathUtils.clamp(this.h / 1.5, 0.8, 1.4));
    }
    if (this.bubble) {
      this.bubbleT += dt;
      this.bubble.position.set(0, this.h + 0.45 + this.bubble.scale.y / 2, 0);
      if (this.bubbleT > (this.bubbleDur || 3.2)) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble = null; }
    }
  }
  dispose() {
    this.gone = true;
    this.setHeld(null);
    this.rig?.dispose();
    scene.remove(this.root, this.shadow);
    this.fig.dispose();
    this.label.material.map.dispose();
  }
}
const tmp = new THREE.Vector3();

// ================================================================ Kết nối + trạng thái
const session = { ws: null, me: null, role: null, code: '', title: '', max: 40, pending: new Map(), sid: null, reconnecting: false, shown: false, lastPong: 0, joinName: '',
  arts: new Map(), pendingArts: new Map(), roster: new Map(), autoArt: false, hasArt: false };
const chat = { open: false, unread: 0, off: false, muted: false };
let role = 'student', cut = null, srcImg = null, look = { style: 'flat', seed: 0 };

function show(screen) {
  for (const id of ['home', 'wait', 'room', 'boot']) $(id).hidden = id !== screen;
}
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3500);
}
// ---------------------------------------------------------------- Bộ nhớ trên máy (localStorage)
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bộ nhớ bị chặn */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* bỏ qua */ } },
};
function deviceKey() { // dấu nhận máy: để lần sau vào lại lớp không cần được duyệt
  let k = store.get('lhnv-dev');
  if (typeof k !== 'string' || k.length < 16) {
    k = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    store.set('lhnv-dev', k);
  }
  return k;
}
const joinedId = (code, name) => `${code}|${name.toLowerCase()}`;
const wasJoined = (code, name) => !!(store.get('lhnv-joined') || {})[joinedId(code, name)];
function markJoined(code, name) { const j = store.get('lhnv-joined') || {}; j[joinedId(code, name)] = 1; store.set('lhnv-joined', j); }
const myClasses = () => store.get('lhnv-classes') || [];
const classKey = (code) => myClasses().find((c) => c.code === code)?.key || null;
function rememberClass(c) {
  const old = myClasses().find((x) => x.code === c.code) || {};
  store.set('lhnv-classes', [{ ...old, ...c }, ...myClasses().filter((x) => x.code !== c.code)].slice(0, 20));
  renderMyClasses();
}
function forgetClass(code) { store.set('lhnv-classes', myClasses().filter((c) => c.code !== code)); renderMyClasses(); }

// ---------------------------------------------------------------- Kết nối, tự nối lại
const net = { tries: 0, timer: null, since: 0 };
const setNet = (on) => { $('net').hidden = !on; };
function closeSocket() {
  if (!session.ws) return;
  session.ws.onclose = null; session.ws.onmessage = null;
  try { session.ws.close(); } catch { /* đã đóng */ }
  session.ws = null;
}
function resetRoom(msg) {
  clearTimeout(net.timer); net.tries = 0; session.reconnecting = false; session.shown = false; setNet(false);
  for (const a of avatars.values()) a.dispose();
  avatars.clear();
  session.pending.clear(); session.arts.clear(); session.pendingArts.clear(); session.roster.clear(); session.hasArt = false;
  $('chatLog').replaceChildren(); chat.off = chat.muted = false; chat.unread = 0;
  for (const k of Object.keys(panels)) applyPanel(k, false);
  $('keyBox').hidden = true;
  boardState.title = '';
  setBoard(null);
  applyVideo(null);
  session.me = null; session.code = ''; session.role = null; session.sid = null; session.title = '';
  store.del('lhnv-session');
  drawBoard('');
  show('home');
  renderMyClasses();
  prefill();
  $('err').textContent = msg || '';
  $('submit').disabled = false;
}
function connect(first) {
  closeSocket();
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  session.ws = ws; session.lastPong = Date.now();
  ws.onopen = () => ws.send(JSON.stringify(first));
  ws.onmessage = (ev) => { let d; try { d = JSON.parse(ev.data); } catch { return; } on[d.t]?.(d); };
  ws.onclose = () => { if (session.ws !== ws) return; session.ws = null; onDisconnected(); };
}
function onDisconnected() {
  if (session.sid) { startReconnect(); return; } // đang trong lớp hoặc chờ duyệt: tự nối lại
  $('err').textContent = 'Không kết nối được máy chủ lớp học.'; $('submit').disabled = false; show('home'); // lần vào đầu tiên thất bại
}
function startReconnect() {
  if (!session.sid) return;
  if (!session.reconnecting) { session.reconnecting = true; net.since = Date.now(); net.tries = 0; }
  if (Date.now() - net.since > 20 * 60 * 1000) { resetRoom('Mất kết nối với lớp học quá lâu. Em hãy vào lại nhé.'); return; }
  setNet(true);
  clearTimeout(net.timer);
  net.timer = setTimeout(tryReconnect, Math.min(5000, 700 * 2 ** net.tries++));
}
function tryReconnect() {
  if (!session.sid || !session.reconnecting || session.ws) return;
  connect({ t: 'resume', code: session.sid.code, id: session.sid.id, token: session.sid.resume });
}
function forceReconnect() { // kết nối treo (điện thoại ngủ, đổi mạng): bỏ và nối lại ngay
  if (!session.sid) return;
  closeSocket(); clearTimeout(net.timer); net.tries = 0;
  if (!session.reconnecting) { session.reconnecting = true; net.since = Date.now(); }
  setNet(true); tryReconnect();
}
function checkAlive() { // gọi khi mở lại trình duyệt / có mạng trở lại
  if (!session.sid) return;
  if (!session.ws || session.ws.readyState !== 1) { if (session.reconnecting) { clearTimeout(net.timer); tryReconnect(); } else startReconnect(); return; }
  const t0 = session.lastPong;
  sendMsg({ t: 'ping' });
  setTimeout(() => { if (session.lastPong === t0 && session.ws) forceReconnect(); }, 3000);
}
const sendMsg = (d) => { if (session.ws?.readyState === 1) session.ws.send(JSON.stringify(d)); };

const on = {
  error(d) {
    closeSocket();
    if (session.sid) { resetRoom(d.msg); return; } // đang nối lại / vào lại mà bị từ chối
    $('err').textContent = d.msg; $('submit').disabled = false; show('home');
  },
  pending(d) {
    session.sid = { code: d.code, id: d.id, resume: d.resume, role: 'student', name: session.joinName || session.sid?.name || '' };
    store.set('lhnv-session', session.sid);
    clearTimeout(net.timer); net.tries = 0; session.reconnecting = false; setNet(false);
    drawFit($('waitImg'), cut);
    $('waitText').textContent = d.teacherHere ? 'Cô giáo sẽ xem hình của em rồi cho vào lớp.' : 'Cô giáo chưa có mặt. Em chờ một chút nhé, đừng đóng trình duyệt.';
    show('wait');
  },
  rejected() { closeSocket(); resetRoom('Cô giáo chưa duyệt hình này. Em thử vẽ lại hoặc chọn ảnh khác nhé.'); },
  kicked() { closeSocket(); resetRoom('Cô giáo đã mời em ra khỏi lớp.'); },
  classgone() { if (session.role === 'teacher') forgetClass(session.code); closeSocket(); resetRoom('Lớp này đã bị xoá.'); },
  noresume() { // phiên cũ không còn (máy chủ khởi động lại, hoặc quá thời gian giữ chỗ): thử vào lại bằng cách khác
    closeSocket();
    const sd = session.sid;
    if (sd?.role === 'teacher' && classKey(sd.code)) { connect({ t: 'open', code: sd.code, key: classKey(sd.code) }); return; }
    if (sd?.role === 'student' && sd.name && wasJoined(sd.code, sd.name)) { connect({ t: 'join', code: sd.code, name: sd.name, dev: deviceKey() }); return; }
    resetRoom('Đã quá thời gian giữ chỗ trong lớp. Em hãy vào lại nhé.');
  },
  pong() { session.lastPong = Date.now(); },
  welcome(d) {
    const resumed = session.reconnecting && session.shown; // nối lại trong cùng một lần mở trang: giữ nguyên bảng đang mở
    clearTimeout(net.timer); net.tries = 0; session.reconnecting = false; setNet(false);
    for (const a of avatars.values()) a.dispose();
    avatars.clear();
    Object.assign(session, { me: d.you, role: d.role, code: d.code, max: d.max, title: d.title || '' });
    session.pending = new Map((d.pending || []).map((m) => [m.id, m]));
    for (const m of d.members) avatars.set(m.id, new Avatar(m));
    const mine = d.members.find((m) => m.id === d.you);
    const myName = mine?.name || session.joinName || session.sid?.name || '';
    session.sid = { code: d.code, id: d.you, resume: d.resume, role: d.role, name: myName };
    store.set('lhnv-session', session.sid);
    if (d.role === 'student') { markJoined(d.code, myName); store.set('lhnv-last', { code: d.code, name: myName }); }
    if (d.role === 'teacher') {
      const ok = session.openKey?.code === d.code ? session.openKey.key : null;
      rememberClass({ code: d.code, title: d.title || '', name: myName, last: Date.now(), ...(d.key ? { key: d.key } : ok ? { key: ok } : {}) });
      session.openKey = null;
    }
    $('roomCode').textContent = d.code;
    $('panelToggle').hidden = d.role !== 'teacher';
    boardState.title = d.title || '';
    show('room');
    session.shown = true;
    chat.off = !!d.chatOff; chat.muted = !!mine?.muted; chat.unread = 0;
    $('chatLog').replaceChildren();
    for (const m of d.chat || []) addChat(m, true);
    session.arts = new Map((d.arts || []).map((a) => [a.id, a]));
    session.pendingArts = new Map((d.pendingArts || []).map((a) => [a.id, a]));
    session.roster = new Map((d.roster || []).map((r) => [r.key, r]));
    session.autoArt = !!d.autoArt;
    session.hasArt = !!avatars.get(d.you)?.heldUrl;
    setBoard(d.board || null);
    applyVideo(d.video || null);
    look = { style: mine?.style || 'flat', seed: mine?.seed || 0 };
    syncStyleButtons();
    if (!resumed) {
      setPanel('chat', innerWidth >= 900);
      setPanel('teacher', d.role === 'teacher' && innerWidth >= 900);
      const me = avatars.get(d.you);
      if (me) { controls.target.set(me.pos.x, 0.9, me.pos.z); camera.position.set(me.pos.x, 4.2, Math.max(me.pos.z + 9, 9.5)); } // lùi đủ xa để thấy trọn bảng, kể cả khi giáo viên đứng gần bảng
    }
    syncChat(); syncHold();
    refreshLists();
    if (d.key) showKeyBox(d.code, d.key);
  },
  away(d) { const a = avatars.get(d.id); if (a) a.away = d.on; refreshLists(); },
  video(d) { applyVideo(d.v); refreshLists(); },
  rosteradd(d) { session.roster.set(d.r.key, d.r); refreshLists(); },
  rosterdel(d) { session.roster.delete(d.key); refreshLists(); },
  joined(d) {
    avatars.get(d.m.id)?.dispose();
    avatars.set(d.m.id, new Avatar(d.m));
    toast(`${d.m.name} vừa vào lớp`);
    refreshLists();
  },
  left(d) {
    const a = avatars.get(d.id);
    if (!a) return;
    toast(a.role === 'teacher' ? 'Cô giáo tạm rời lớp' : `${a.name} đã rời lớp`);
    a.dispose(); avatars.delete(d.id);
    refreshLists();
  },
  go(d) { avatars.get(d.id)?.target.set(d.x, 0, d.z); },
  emote(d) { avatars.get(d.id)?.play(d.e); },
  say(d) { avatars.get(d.id)?.say(d.i); },
  style(d) { avatars.get(d.id)?.setStyle(d.style, d.seed); },
  request(d) { session.pending.set(d.m.id, d.m); toast(`${d.m.name} xin vào lớp`); refreshLists(); },
  resolved(d) { session.pending.delete(d.id); refreshLists(); },
  notice(d) { toast(d.msg); },
  chat(d) { addChat(d.m); avatars.get(d.m.from)?.sayText(d.m.text, Math.min(7, 3 + d.m.text.length * 0.04)); },
  chatdel(d) { $('chatLog').querySelector(`li[data-id="${d.id}"]`)?.remove(); },
  chatoff(d) { chat.off = d.on; syncChat(); toast(d.on ? 'Cô giáo đã tắt trò chuyện.' : 'Trò chuyện đã được bật lại.'); refreshLists(); },
  muted(d) { const a = avatars.get(d.id); if (a) a.muted = d.on; if (d.id === session.me) { chat.muted = d.on; syncChat(); } refreshLists(); },
  artadd(d) {
    avatars.get(d.a.owner)?.setHeld(d.a.url);
    session.arts.set(d.a.id, d.a);
    if (d.a.owner === session.me) session.hasArt = true;
    syncHold(); refreshLists();
  },
  artdel(d) {
    session.arts.delete(d.id);
    avatars.get(d.owner)?.setHeld(d.held);
    if (d.owner === session.me) session.hasArt = d.left > 0;
    syncHold(); refreshLists();
  },
  held(d) { avatars.get(d.id)?.setHeld(d.url); syncHold(); },
  board(d) { setBoard(d.board); refreshLists(); },
  artreq(d) { session.pendingArts.set(d.a.id, d.a); toast(`${d.a.name} gửi một hình vẽ`); refreshLists(); },
  artres(d) { session.pendingArts.delete(d.id); refreshLists(); },
  autoart(d) { session.autoArt = d.on; refreshLists(); },
};

function refreshLists() {
  const students = [...avatars.values()].filter((a) => a.role === 'student');
  $('count').textContent = `${students.length}/${session.max}`;
  if (session.role !== 'teacher') return;
  const need = session.pending.size + session.pendingArts.size;
  $('panelBadge').textContent = need ? ` (${need})` : '';
  const row = (m, buttons) => {
    const li = document.createElement('li');
    if (m.img) { const im = document.createElement('img'); im.src = m.img; im.alt = `Hình của ${m.name}`; li.append(im); }
    const sp = document.createElement('span'); sp.textContent = m.name; li.append(sp);
    for (const [text, title, fn] of buttons) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text; b.title = title; b.setAttribute('aria-label', `${title}: ${m.name}`);
      b.onclick = fn; li.append(b);
    }
    return li;
  };
  $('pendingList').replaceChildren(...[...session.pending.values()].map((m) => row(m, [
    ['✓', 'Duyệt vào lớp', () => sendMsg({ t: 'approve', id: m.id })],
    ['✗', 'Từ chối', () => sendMsg({ t: 'reject', id: m.id })],
  ])));
  $('pendingCount').textContent = session.pending.size ? `(${session.pending.size})` : '';
  $('noPending').hidden = session.pending.size > 0;
  $('memberList').replaceChildren(...students.map((a) => row({ name: a.away ? `${a.name} 💤` : a.name }, [
    [a.muted ? 'Bật tiếng' : 'Tắt tiếng', a.muted ? 'Cho nhắn tin lại' : 'Không cho nhắn tin', () => sendMsg({ t: 'mute', id: a.id, on: !a.muted })],
    ['Mời ra', 'Mời ra khỏi lớp', () => sendMsg({ t: 'kick', id: a.id })],
  ])));
  const online = new Set(students.map((a) => a.name.toLowerCase()));
  const off = [...session.roster.values()].filter((r) => !online.has(r.key));
  $('rosterList').replaceChildren(...off.map((r) => row({ name: r.name, img: r.img }, [
    ['Xoá', 'Xoá khỏi danh sách lớp', () => sendMsg({ t: 'unroster', key: r.key })],
  ])));
  $('noRoster').hidden = off.length > 0;
  $('keyShown').textContent = ui.keyShown ? (classKey(session.code) || '(không có trên máy này)') : '•••••-•••••';
  const pend = [...session.pendingArts.values()];
  $('artPendingList').replaceChildren(...pend.map((a) => row({ name: a.name, img: a.url }, [
    ['✓', 'Duyệt hình', () => sendMsg({ t: 'artok', id: a.id })],
    ['✗', 'Từ chối hình', () => sendMsg({ t: 'artno', id: a.id })],
  ])));
  $('artPendingCount').textContent = pend.length ? `(${pend.length})` : '';
  $('noArtPending').hidden = pend.length > 0;
  const arts = [...session.arts.values()], onBoard = boardState.url;
  $('artGallery').replaceChildren(...arts.map((a) => {
    const w = document.createElement('div'), b = document.createElement('button'), x = document.createElement('button'), im = document.createElement('img');
    w.className = 'thumbwrap';
    b.type = 'button'; b.className = `thumb${a.url === onBoard ? ' on' : ''}`; b.title = `Chiếu lên bảng: hình của ${a.name}`;
    b.setAttribute('aria-label', `Chiếu lên bảng: hình của ${a.name}`);
    im.src = a.url; im.alt = `Hình của ${a.name}`; b.append(im);
    b.onclick = () => sendMsg({ t: 'board', art: a.id });
    x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.title = 'Xoá hình'; x.setAttribute('aria-label', `Xoá hình của ${a.name}`);
    x.onclick = () => sendMsg({ t: 'artdel', id: a.id });
    w.append(b, x);
    return w;
  }));
  $('noArts').hidden = arts.length > 0;
  $('boardClear').hidden = !onBoard;
  $('videoStop').hidden = !vid.cur;
  $('videoLookT').hidden = !vid.cur;
  $('chatOffBox').checked = chat.off;
  $('autoArtBox').checked = session.autoArt;
}

// ================================================================ Giao diện vào lớp
function setRole(r) {
  role = r;
  $('tabStudent').classList.toggle('active', r === 'student');
  $('tabTeacher').classList.toggle('active', r === 'teacher');
  $('codeRow').hidden = r === 'teacher';
  $('titleRow').hidden = r !== 'teacher';
  $('studentNote').hidden = r === 'teacher';
  $('teacherNote').hidden = r !== 'teacher';
  $('openBox').hidden = r !== 'teacher';
  $('nameLabel').textContent = r === 'teacher' ? 'Tên giáo viên' : 'Tên của em';
  $('submit').textContent = r === 'teacher' ? 'Tạo lớp mới' : 'Xin vào lớp';
  $('err').textContent = '';
  renderMyClasses();
}
function prefill() { // điền sẵn mã lớp và tên của lần vào gần nhất (chỉ ô đang trống)
  const last = store.get('lhnv-last');
  if (role !== 'student' || !last?.code) return;
  if (!$('code').value) $('code').value = last.code;
  if (!$('name').value) $('name').value = last.name || '';
}
function renderMyClasses() { // các lớp đã tạo trên máy này, mở lại bằng một cái bấm
  const list = myClasses();
  $('myClasses').hidden = role !== 'teacher' || !list.length;
  $('myClassList').replaceChildren(...list.map((c) => {
    const li = document.createElement('li'), sp = document.createElement('span'), go = document.createElement('button'), x = document.createElement('button');
    sp.textContent = `${c.title || 'Lớp chưa đặt tên'} · ${c.code}`;
    go.type = 'button'; go.textContent = 'Mở lại'; go.disabled = !c.key; go.title = c.key ? '' : 'Không có mã giáo viên trên máy này';
    go.onclick = () => openClass(c.code, c.key);
    x.type = 'button'; x.textContent = '✕'; x.title = 'Quên lớp này trên máy này (không xoá lớp)'; x.setAttribute('aria-label', `Quên lớp ${c.code} trên máy này`);
    x.onclick = () => forgetClass(c.code);
    li.append(sp, go, x);
    return li;
  }));
}
function openClass(code, key) {
  code = String(code || '').trim().toUpperCase();
  if (code.length !== 6 || !String(key || '').trim()) { $('err').textContent = 'Hãy nhập mã lớp (6 ký tự) và mã giáo viên.'; return; }
  $('err').textContent = '';
  session.openKey = { code, key: String(key).trim() };
  connect({ t: 'open', code, key: String(key).trim() });
}
$('openForm').onsubmit = (e) => { e.preventDefault(); openClass($('openCode').value, $('openKey').value); };
$('tabStudent').onclick = () => setRole('student');
$('tabTeacher').onclick = () => setRole('teacher');

function recut() {
  if (!srcImg) return;
  cut = cutout(srcImg, Number($('thr').value));
  showPreview();
  $('previewBox').hidden = false;
  $('err').textContent = cut ? '' : 'Chưa tách được nhân vật. Em kéo thanh "Tách nền" hoặc chụp trên nền giấy trơn nhé.';
}
$('file').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => { srcImg = img; $('fileLabel').textContent = '📷 Đổi ảnh khác'; recut(); URL.revokeObjectURL(img.src); };
  img.onerror = () => { $('err').textContent = 'Không đọc được ảnh này.'; };
  img.src = URL.createObjectURL(f);
};
$('thr').oninput = recut;

$('joinForm').onsubmit = (e) => {
  e.preventDefault();
  const name = $('name').value.trim(), code = $('code').value.trim().toUpperCase();
  if (!name) { $('err').textContent = role === 'teacher' ? 'Hãy nhập tên giáo viên.' : 'Hãy nhập tên của em.'; return; }
  const pin = $('pin').value.trim(); // có mã bảo mật = dùng nhân vật đã được gán sẵn, không cần ảnh
  if (role === 'student') {
    if (code.length !== 6) { $('err').textContent = 'Mã lớp gồm 6 ký tự.'; return; }
    if (!cut && !pin && !wasJoined(code, name)) { $('err').textContent = 'Em hãy chọn ảnh nhân vật (hoặc nhập mã bảo mật nếu đã có nhân vật riêng). Đã vào lớp này rồi thì dùng đúng tên cũ.'; return; }
  }
  const img = cut && !pin ? toDataURL(cut) : null;
  if (cut && !pin && !img) { $('err').textContent = 'Ảnh quá lớn, em chọn ảnh khác nhé.'; return; }
  $('err').textContent = '';
  $('submit').disabled = true;
  session.joinName = name;
  if (role === 'student') store.set('lhnv-last', { code, name });
  const lk = img || pin ? look : {}; // quay lại không gửi ảnh thì giữ kiểu hiển thị đã lưu
  connect(role === 'teacher' ? { t: 'create', name, title: $('classTitle').value.trim(), img, pin, ...look } : { t: 'join', code, name, img, pin, dev: deviceKey(), ...lk });
};
const leave = () => { sendMsg({ t: 'bye' }); closeSocket(); resetRoom(''); };
$('cancelWait').onclick = leave;
$('leave').onclick = leave;

// ---------------------------------------------------------------- Chọn kiểu hiển thị: Nét vẽ / 3D / 3D tô màu
// Khung xem thử có trình vẽ 3D riêng, nhân vật xoay qua lại để thấy khối.
const pv = { renderer: null, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(32, 1, 0.1, 20), fig: null, pivot: new THREE.Group(),
  shared: { uLight: { value: new THREE.Vector3() }, uPx: { value: 1 } } };
pv.scene.add(pv.pivot);
pv.camera.position.set(0, 0.85, 4.1);
pv.camera.lookAt(0, 0.8, 0);
function showPreview() {
  if (pv.fig) { pv.pivot.remove(pv.fig.mesh); pv.fig.dispose(); pv.fig = null; }
  if (!cut) return;
  if (!pv.renderer) {
    pv.renderer = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true });
    pv.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    pv.renderer.setSize(200, 200, false);
    pv.shared.uPx.value = pv.renderer.getPixelRatio();
  }
  pv.fig = makeFigure(cut, look.style, look.seed, pv.shared, 1.6, 1.6);
  pv.pivot.add(pv.fig.mesh);
  pv.pivot.position.y = 0.8 - pv.fig.height / 2;
}
function syncStyleButtons() {
  for (const b of document.querySelectorAll('[data-style]')) b.classList.toggle('active', b.dataset.style === look.style);
  for (const b of document.querySelectorAll('.shuffle')) b.hidden = look.style !== 'color';
}
function chooseStyle(style, reshuffle) {
  look = { style, seed: reshuffle ? (look.seed + 1 + Math.floor(Math.random() * 6)) % 100 : look.seed };
  syncStyleButtons();
  const me = avatars.get(session.me);
  if (me) { me.setStyle(look.style, look.seed); sendMsg({ t: 'style', ...look }); if (!wide()) setPanel('style', false); } // đang trong lớp: đổi ngay và báo cho cả lớp
  else showPreview();
}
for (const b of document.querySelectorAll('[data-style]')) b.onclick = () => chooseStyle(b.dataset.style, false);
for (const b of document.querySelectorAll('.shuffle')) b.onclick = () => chooseStyle('color', true);
syncStyleButtons();

// ---------------------------------------------------------------- Video YouTube trên bảng
// Khung video phủ khít lên bảng trên màn hình (bám theo camera); camera quay lệch khỏi bảng thì thành cửa sổ nhỏ ở góc.
// Giáo viên điều khiển: máy giáo viên báo phát / dừng / tua lên máy chủ, máy học sinh chạy theo.
const yt = { loading: null, player: null, ready: false, creating: false, sent: 0, t0: 0, last: '', docked: false };
const vid = { cur: null }; // { id, state: 'playing' | 'paused', pos, at }
const _v = new THREE.Vector3(), _c = new THREE.Vector3();
function loadYT() { // nạp thư viện chính thức của YouTube một lần
  if (yt.loading) return yt.loading;
  yt.loading = new Promise((res, rej) => {
    if (window.YT?.Player) { res(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = () => { yt.loading = null; rej(new Error('Không tải được YouTube')); };
    document.head.append(sc);
    setTimeout(() => { if (!window.YT?.Player) { yt.loading = null; rej(new Error('Quá thời gian chờ YouTube')); } }, 15000);
  });
  return yt.loading;
}
const showVideoMsg = (text) => { $('videoMsg').textContent = text || ''; $('videoMsg').hidden = !text; };
const videoWant = () => { const c = vid.cur; return !c ? 0 : c.state === 'playing' ? c.pos + (performance.now() - c.at) / 1000 : c.pos; };
async function ensurePlayer() {
  if (yt.player || yt.creating || !vid.cur) return;
  yt.creating = true;
  try {
    const YT = await loadYT();
    if (!vid.cur || yt.player) return;
    const teacher = session.role === 'teacher';
    const host = document.createElement('div');
    host.id = 'ytHost';
    $('videoDock').prepend(host);
    yt.player = new YT.Player('ytHost', {
      host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', videoId: vid.cur.id,
      playerVars: { autoplay: 1, controls: teacher ? 1 : 0, disablekb: teacher ? 0 : 1, fs: teacher ? 1 : 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3,
        start: Math.floor(videoWant()), origin: location.origin, enablejsapi: 1 },
      events: {
        onReady: (e) => {
          yt.ready = true;
          if (!navigator.userActivation?.hasBeenActive) e.target.mute(); // chưa chạm vào trang: trình duyệt chỉ cho tự phát khi tắt tiếng
          reconcile(true);
        },
        onStateChange: (e) => { if (session.role === 'teacher') teacherReport(true); else if (e.data === 1) $('videoPlay').hidden = true; },
        onError: () => showVideoMsg('Video này không phát được (chủ video có thể không cho nhúng). Hãy chọn video khác.'),
      },
    });
  } catch (e) {
    showVideoMsg('Không tải được YouTube. Em kiểm tra mạng nhé.');
  } finally { yt.creating = false; }
}
function reconcile(force) { // học sinh: chạy theo vị trí và trạng thái của giáo viên
  const p = yt.player;
  if (!p || !yt.ready || !vid.cur || session.role === 'teacher') return;
  const want = videoWant(), cur = p.getCurrentTime?.() ?? 0, st = p.getPlayerState?.();
  if (vid.cur.state === 'playing') {
    if (st !== 1 && st !== 3 && (force || st === 2 || st === 0 || st === 5)) p.playVideo();
    if (Math.abs(cur - want) > 2.5) p.seekTo(want, true);
  } else {
    if (st === 1 || st === 3) p.pauseVideo();
    if (Math.abs(cur - want) > 1) p.seekTo(want, true);
  }
}
function teacherReport(force) { // giáo viên: phát hiện bấm phát / dừng / tua rồi báo cho cả lớp
  const p = yt.player, ref = vid.cur;
  if (!p?.getCurrentTime || !ref) return;
  const st = p.getPlayerState();
  if (st === -1 || st === 5) return; // chưa bắt đầu: chưa có gì để báo
  const playing = st === 1 || st === 3, cur = p.getCurrentTime();
  const exp = ref.state === 'playing' ? ref.pos + (performance.now() - ref.at) / 1000 : ref.pos;
  const changed = (ref.state === 'playing') !== playing, jumped = Math.abs(cur - exp) > 2;
  const beat = playing && performance.now() - yt.sent > 6000;
  if (!(force || changed || jumped || beat)) return;
  vid.cur = { ...ref, state: playing ? 'playing' : 'paused', pos: cur, at: performance.now() };
  yt.sent = performance.now();
  sendMsg({ t: 'videostate', state: vid.cur.state, pos: cur });
}
function applyVideo(v) { // v: { id, state, pos } hoặc null
  if (!v) { if (vid.cur || yt.player) { vid.cur = null; teardownVideo(); } return; }
  const prev = vid.cur;
  vid.cur = { id: v.id, state: v.state, pos: v.pos, at: performance.now() };
  yt.t0 = performance.now();
  showVideoMsg('');
  drawScreen(true);
  $('videoDock').hidden = false;
  $('videoDock').classList.toggle('teacher', session.role === 'teacher');
  if (yt.player && yt.ready) {
    if (!prev || prev.id !== v.id) yt.player.loadVideoById({ videoId: v.id, startSeconds: v.pos });
    reconcile(true);
  } else ensurePlayer();
  if ((!prev || prev.id !== v.id) && !screenVisible(16)) focusScreen(); // video mới mà màn chiếu đang khuất: quay camera sang xem
}
function teardownVideo() {
  try { yt.player?.destroy(); } catch { /* đã gỡ */ }
  yt.player = null; yt.ready = false;
  document.getElementById('ytHost')?.remove();
  $('videoDock').hidden = true; $('videoDock').classList.remove('big', 'float');
  showVideoMsg(''); $('videoPlay').hidden = true;
  drawScreen(false);
  if (cam.mode === 'screen') followAvatar();
}
function videoTick() { // mỗi giây: giáo viên báo, học sinh chỉnh theo; cập nhật nút tiếng và nút "chạm để xem"
  if (!vid.cur || !yt.ready) return;
  if (session.role === 'teacher') teacherReport(false); else reconcile(false);
  $('videoMute').textContent = yt.player.isMuted?.() ? '🔇' : '🔊';
  if (session.role !== 'teacher') {
    const st = yt.player.getPlayerState?.();
    $('videoPlay').hidden = !(vid.cur.state === 'playing' && st !== 1 && st !== 3 && performance.now() - yt.t0 > 2500); // trình duyệt chặn tự phát: cần một cái chạm
  }
}
setInterval(videoTick, 1000);
const cam = { mode: 'follow', t: 0 }; // 'follow': bám theo nhân vật; 'screen': nhìn vào màn chiếu
const screenCorner = (x, y) => { // góc của vùng video trên màn chiếu, đổi ra toạ độ màn hình
  _v.set((x / 1024 - 0.5) * SCREEN.w, (0.5 - y / 576) * SCREEN.h, 0);
  screenMesh.localToWorld(_v); _v.project(camera);
  return { x: (_v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-_v.y * 0.5 + 0.5) * canvas.clientHeight, z: _v.z };
};
function screenQuad() { // vùng video trên màn hình: { L, T, w, h } nếu màn chiếu nhìn thấy rõ, không thì null
  camera.updateMatrixWorld(); screenMesh.updateWorldMatrix(true, false);
  const tl = screenCorner(VR.x, VR.y), tr = screenCorner(VR.x + VR.w, VR.y), bl = screenCorner(VR.x, VR.y + VR.h), br = screenCorner(VR.x + VR.w, VR.y + VR.h);
  if (![tl, tr, bl, br].every((p) => p.z < 1)) return null;
  if (_c.copy(camera.position).sub(screenMesh.position).normalize().z < 0.45) return null; // đứng lệch quá, không nhìn thẳng vào màn
  let L = Math.max(tl.x, bl.x), T = Math.max(tl.y, tr.y), w = Math.min(tr.x, br.x) - L, h = Math.min(bl.y, br.y) - T;
  if (w / h > 16 / 9) { const nw = (h * 16) / 9; L += (w - nw) / 2; w = nw; } else { const nh = (w * 9) / 16; T += (h - nh) / 2; h = nh; }
  return w > 100 && h > 56 ? { L, T, w, h } : null;
}
function screenVisible(margin) { // cả màn chiếu nằm gọn trong màn hình (trừ lề)?
  const q = screenQuad(), cw = canvas.clientWidth, ch = canvas.clientHeight;
  return !!q && q.L >= margin && q.T >= margin && q.L + q.w <= cw - margin && q.T + q.h <= ch - margin;
}
function focusScreen() { // quay camera sang nhìn thẳng vào màn chiếu, đủ gần để video lớn
  cam.mode = 'screen'; cam.t = 1.3;
  if (!wide()) for (const k of Object.keys(panels)) applyPanel(k, false); // điện thoại: đóng các bảng đang che
}
function followAvatar() { // về chỗ nhân vật
  cam.mode = 'follow';
  const me = avatars.get(session.me);
  if (me) { camera.position.set(me.pos.x, 4.2, Math.max(me.pos.z + 9, 9.5)); controls.target.set(me.pos.x, 0.9, me.pos.z); }
}
const toggleLook = () => { if (cam.mode === 'screen') followAvatar(); else focusScreen(); };
function stepCamera(dt) { // chuyển camera mượt sang màn chiếu trong khoảng 1,3 giây, sau đó để người dùng tự xoay
  if (cam.t <= 0) return;
  cam.t -= dt;
  const vf = (camera.fov * Math.PI) / 360, tanV = Math.tan(vf);
  const d = THREE.MathUtils.clamp(Math.max((SCREEN.w * 1.2) / 2 / (tanV * camera.aspect), (SCREEN.h * 1.6) / 2 / tanV), 5, 16);
  const k = 1 - Math.exp(-dt * 4);
  controls.target.lerp(_v.set(SCREEN.x, SCREEN.y, SCREEN.z), k);
  camera.position.lerp(_c.set(SCREEN.x, SCREEN.y + 0.4, SCREEN.z + d), k);
}
function placeDock() { // đặt khung video phủ lên màn chiếu; màn khuất khỏi tầm nhìn thì thu thành ô xem nhanh ở góc
  const el = $('videoDock');
  if (el.hidden || el.classList.contains('big')) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight, q = screenQuad();
  const m = yt.docked ? -4 : 16; // có độ trễ để khung không nhấp nháy giữa hai chế độ
  const docked = !!q && q.L >= m && q.T >= m && q.L + q.w <= cw - m && q.T + q.h <= ch - m;
  yt.docked = docked;
  let { L, T, w, h } = docked ? q : {};
  if (!docked) { w = cw < 700 ? 176 : 224; h = (w * 9) / 16; L = cw - w - 8; T = 66; } // ô xem nhanh: chạm vào để quay sang màn chiếu
  const key = [L, T, w, h, docked].map((n) => (typeof n === 'number' ? Math.round(n) : n)).join();
  if (key === yt.last) return;
  yt.last = key;
  el.classList.toggle('float', !docked);
  el.style.left = `${Math.round(L)}px`; el.style.top = `${Math.round(T)}px`; el.style.width = `${Math.round(w)}px`; el.style.height = `${Math.round(h)}px`;
}
$('videoShield').onclick = () => { // học sinh chạm vào video: phóng to, hoặc quay sang màn chiếu nếu đang là ô nhỏ (không bao giờ tới trình phát)
  const el = $('videoDock');
  if (el.classList.contains('big')) return;
  if (yt.docked) { el.classList.add('big'); yt.last = ''; } else focusScreen();
};
$('videoLook').onclick = toggleLook;
$('videoLookT').onclick = toggleLook;
$('videoMute').onclick = () => { const p = yt.player; if (!p?.isMuted) return; if (p.isMuted()) p.unMute(); else p.mute(); videoTick(); };
$('videoBig').onclick = () => { $('videoDock').classList.toggle('big'); yt.last = ''; };
$('videoPlay').onclick = () => { yt.player?.unMute?.(); yt.player?.playVideo?.(); $('videoPlay').hidden = true; };
$('videoForm').onsubmit = (e) => {
  e.preventDefault();
  const url = $('videoUrl').value.trim();
  if (!url) return;
  sendMsg({ t: 'video', url });
  $('videoUrl').value = '';
};
$('videoStop').onclick = () => sendMsg({ t: 'videostop' });
document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcile(true); });

// ---------------------------------------------------------------- Mã giáo viên, xoá lớp
function showKeyBox(code, key) { $('keyCode').textContent = code; $('keyText').textContent = key; $('keyBox').hidden = false; }
$('keyOk').onclick = () => { $('keyBox').hidden = true; };
$('keyReveal').onclick = () => { ui.keyShown = !ui.keyShown; $('keyReveal').textContent = ui.keyShown ? 'Ẩn' : 'Hiện'; refreshLists(); };
$('delClass').onclick = () => {
  const b = $('delClass');
  if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Bấm lần nữa để xoá lớp và mọi dữ liệu'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Xoá lớp này'; }, 5000); return; }
  sendMsg({ t: 'deleteclass', confirm: session.code });
};

// ---------------------------------------------------------------- Trò chuyện
function syncChat() {
  const can = session.role === 'teacher' || (!chat.off && !chat.muted);
  $('chatText').disabled = !can; $('chatSend').disabled = !can;
  $('chatText').placeholder = can ? 'Nhập tin nhắn…' : chat.muted ? 'Cô giáo đã tắt tiếng của em' : 'Cô giáo đang tắt trò chuyện';
  $('chatBadge').textContent = chat.unread ? ` (${chat.unread})` : '';
}
// Các bảng nổi: trên máy tính nằm cạnh sân; trên điện thoại trượt từ dưới lên và chỉ mở một bảng một lúc.
const panels = { chat: { el: 'chat', btn: 'chatToggle' }, teacher: { el: 'teacherPanel', btn: 'panelToggle' }, style: { el: 'styleMenu', btn: 'styleToggle' } };
const ui = { keyShown: false };
const wide = () => innerWidth >= 900;
function applyPanel(name, open) {
  const p = panels[name];
  $(p.el).hidden = !open;
  $(p.btn).setAttribute('aria-expanded', String(open));
  if (name === 'chat') {
    chat.open = open;
    if (open) { chat.unread = 0; syncChat(); $('chatLog').scrollTop = $('chatLog').scrollHeight; }
  }
}
function setPanel(name, open) {
  if (name === 'teacher' && session.role !== 'teacher') open = false;
  if (open) for (const k of Object.keys(panels)) if (k !== name && (!wide() || k === 'style')) applyPanel(k, false);
  applyPanel(name, open);
}
const setChatOpen = (open) => setPanel('chat', open);
for (const [name, p] of Object.entries(panels)) $(p.btn).onclick = () => setPanel(name, $(p.el).hidden);
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => setPanel(b.dataset.close, false);
function addChat(m, quiet) {
  const li = document.createElement('li'), b = document.createElement('b'), t = document.createElement('span');
  li.dataset.id = m.id;
  li.className = `${m.role === 'teacher' ? 'teacher' : ''} ${m.from === session.me ? 'mine' : ''}`.trim();
  b.textContent = `${m.role === 'teacher' ? '★ ' : ''}${m.name}:`;
  t.textContent = ` ${m.text}`;
  li.append(b, t);
  if (session.role === 'teacher') {
    const d = document.createElement('button');
    d.type = 'button'; d.className = 'del'; d.textContent = '✕'; d.title = 'Xoá tin nhắn'; d.setAttribute('aria-label', `Xoá tin nhắn của ${m.name}`);
    d.onclick = () => sendMsg({ t: 'delmsg', id: m.id });
    li.append(d);
  }
  const log = $('chatLog');
  log.append(li);
  while (log.children.length > 80) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  if (!quiet && !chat.open && m.from !== session.me) { chat.unread++; syncChat(); }
}
$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chatText').value.trim();
  if (!text) return;
  sendMsg({ t: 'chat', text });
  $('chatText').value = '';
};
$('chatOffBox').onchange = (e) => sendMsg({ t: 'chatoff', on: e.target.checked });
$('autoArtBox').onchange = (e) => sendMsg({ t: 'autoart', on: e.target.checked });

// ---------------------------------------------------------------- Hình vẽ: gửi lên, cầm trên tay, chiếu lên bảng
async function prepArt(file) { // thu nhỏ ảnh chụp thành JPEG vừa đủ nhỏ cho máy chủ (≤ 380 KB)
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  URL.revokeObjectURL(url);
  let long = 1000, q = 0.85;
  for (let i = 0; i < 6; i++) {
    const k = Math.min(1, long / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', q);
    if (data.length * 0.75 < 380 * 1024) return data;
    q = Math.max(0.55, q - 0.1); long = Math.round(long * 0.8);
  }
  return null;
}
$('artFile').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) return toast('Hãy chọn một tệp ảnh.');
  let data = null;
  try { data = await prepArt(f); } catch { return toast('Không đọc được ảnh này.'); }
  if (!data) return toast('Ảnh quá lớn, em chọn ảnh khác nhé.');
  sendMsg({ t: 'art', img: data });
};
function syncHold() {
  const me = avatars.get(session.me);
  $('holdBtn').hidden = !session.hasArt;
  $('holdBtn').textContent = me?.heldUrl ? '✋ Cất hình' : '🖼️ Cầm lại hình';
}
$('holdBtn').onclick = () => sendMsg({ t: 'hold', on: !avatars.get(session.me)?.heldUrl });
$('boardClear').onclick = () => sendMsg({ t: 'board', art: null });
function openLightbox(url, caption) { $('lightImg').src = url; $('lightCap').textContent = caption; $('lightbox').hidden = false; }
$('lightbox').onclick = () => { $('lightbox').hidden = true; };
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lightbox').hidden = true; });

// Biểu cảm + câu chọn sẵn
for (const b of document.querySelectorAll('#emotes button')) b.onclick = () => { avatars.get(session.me)?.play(b.dataset.e); sendMsg({ t: 'emote', e: b.dataset.e }); };
PHRASES.forEach((p, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = p;
  b.onclick = () => { avatars.get(session.me)?.say(i); sendMsg({ t: 'say', i }); };
  $('phrases').append(b);
});

// Chạm vào sân để đi tới đó (phân biệt với kéo để xoay)
const ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  const me = avatars.get(session.me);
  if (!down || !me || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return;
  ndc.set((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (boardState.img && ray.intersectObject(board).length) { openLightbox(boardState.url, boardState.caption); return; } // bấm vào bảng: xem hình to
  if (!ray.ray.intersectPlane(floor, tmp)) return;
  Object.assign(tmp, { ...clampRoom(tmp.x, tmp.z), y: 0 }); // chỉ đi trong hình chữ nhật
  if (cam.mode === 'screen') followAvatar(); // bấm sàn để đi thì camera về bám theo nhân vật
  me.target.set(tmp.x, 0, tmp.z);
  sendMsg({ t: 'go', x: tmp.x, z: tmp.z });
});

// Tải lại trang hoặc trình duyệt bị thu hồi bộ nhớ: tự vào lại đúng lớp đang tham gia
$('cancelBoot').onclick = () => { closeSocket(); resetRoom(''); };
const saved = store.get('lhnv-session');
if (saved?.code && saved?.id && saved?.resume) {
  session.sid = saved; session.reconnecting = true; net.since = Date.now();
  show('boot');
  connect({ t: 'resume', code: saved.code, id: saved.id, token: saved.resume });
}
setRole('student');
prefill();

// Giữ kết nối khi điện thoại ngủ / đổi mạng: nhịp tim 20 giây; mở lại trình duyệt thì kiểm tra ngay
setInterval(() => {
  if (session.ws?.readyState === 1 && session.sid) {
    sendMsg({ t: 'ping' });
    if (Date.now() - session.lastPong > 70000) forceReconnect();
  }
}, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAlive(); });
addEventListener('online', checkAlive);
if (window.visualViewport) { // bàn phím ảo che màn hình: đẩy các bảng lên trên bàn phím
  const upd = () => document.documentElement.style.setProperty('--kb', `${Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop)}px`);
  visualViewport.addEventListener('resize', upd); visualViewport.addEventListener('scroll', upd);
}

// ================================================================ Vòng lặp
const clock = new THREE.Clock(), prev = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w < h ? 56 : 42; camera.updateProjectionMatrix();
  }
  figShared.uPx.value = pr;
  rigShared.uBoil.value = Math.floor(t * 8) * 1.7;
  figShared.uLight.value.copy(LIGHT).transformDirection(camera.matrixWorldInverse);
  if (pv.fig && !$('home').hidden) { // khung xem thử ở màn hình vào lớp
    pv.pivot.rotation.y = Math.sin(t * 0.9) * (pv.fig.flat ? 0.3 : 0.8);
    pv.shared.uLight.value.copy(LIGHT).transformDirection(pv.camera.matrixWorldInverse);
    pv.renderer.render(pv.scene, pv.camera);
  }
  const me = avatars.get(session.me);
  if (me) prev.copy(me.pos);
  for (const a of avatars.values()) a.update(dt, t);
  if (me && cam.mode === 'follow') { // camera đi theo nhân vật của mình
    camera.position.add(tmp.copy(me.pos).sub(prev));
    controls.target.set(me.pos.x, 0.9, me.pos.z);
  } else if (cam.mode === 'screen') stepCamera(dt);
  controls.update();
  placeDock();
  renderer.render(scene, camera);
});
window.lhnv = { session, avatars, boardState, chat, store, setPanel, forceReconnect, vid, yt, camera, controls, cam, screenMesh, clampRoom, ROOM }; // tiện kiểm thử
