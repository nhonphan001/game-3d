// Lớp Học Nét Vẽ — phía trình duyệt: vào lớp, tách nền ảnh, sân lớp 3D, bảng duyệt của giáo viên.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { makeFigure, STYLES } from './figure.js';

const $ = (id) => document.getElementById(id);
const INK = '#2434b4', PAPER = '#f3eedb', CARD = '#fbf8ec';
const ROOM_R = 9;
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
scene.fog = new THREE.Fog(PAPER, 18, 46);
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
    const R = (ROOM_R + 0.6) * 51.2;
    g.lineWidth = 4;
    g.beginPath();
    for (let a = 0; a <= 6.3; a += 0.05) g.lineTo(1024 + Math.cos(a) * (R + rnd() * 5), 1024 + Math.sin(a) * (R + rnd() * 5));
    g.stroke();
    g.setLineDash([14, 16]); g.lineWidth = 2.5;
    g.beginPath(); g.arc(1024, 1024, R + 18, 0, Math.PI * 2); g.stroke();
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
boardCv.width = 1024; boardCv.height = 420;
const boardTex = new THREE.CanvasTexture(boardCv);
boardTex.colorSpace = THREE.SRGBColorSpace;
function drawBoard(code) {
  const g = boardCv.getContext('2d');
  g.fillStyle = CARD; g.fillRect(0, 0, 1024, 420);
  g.strokeStyle = INK; g.lineWidth = 2; g.globalAlpha = 0.35;
  for (let k = -420; k < 1024; k += 14) { g.beginPath(); g.moveTo(k, 420); g.lineTo(k + 420, 0); g.stroke(); }
  g.globalAlpha = 1; g.lineWidth = 12; g.strokeRect(8, 8, 1008, 404);
  g.fillStyle = CARD; g.fillRect(120, 70, 784, 280);
  g.lineWidth = 4; g.strokeRect(120, 70, 784, 280);
  g.fillStyle = INK; g.textAlign = 'center';
  g.font = '700 92px "Dancing Script", cursive';
  g.fillText('Lớp Học Nét Vẽ', 512, 190);
  g.font = '64px "Patrick Hand", sans-serif';
  g.fillText(code ? `Mã lớp: ${code}` : 'Chào mừng các bạn!', 512, 300);
  boardTex.needsUpdate = true;
}
drawBoard('');
document.fonts?.ready.then(() => drawBoard(session.code || ''));
const board = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 3), new THREE.MeshBasicMaterial({ map: boardTex }));
board.position.set(0, 2.3, -ROOM_R - 1.6);
scene.add(board);
for (const x of [-3.2, 3.2]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), new THREE.MeshBasicMaterial({ color: INK }));
  leg.position.set(x, 0.45, -ROOM_R - 1.6);
  scene.add(leg);
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
function textSprite(text, { teacher = false, bubble = false } = {}) {
  const font = `${bubble ? 44 : 40}px "Patrick Hand", "Comic Sans MS", sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const label = teacher ? `★ ${text}` : text;
  const w = Math.ceil(probe.measureText(label).width) + 44, h = bubble ? 84 : 62;
  const tex = inkCanvas(w, h, (g) => {
    g.fillStyle = teacher && !bubble ? INK : CARD;
    g.lineWidth = 4;
    g.beginPath(); g.roundRect(3, 3, w - 6, h - (bubble ? 22 : 6), 18); g.fill(); g.stroke();
    if (bubble) { g.beginPath(); g.moveTo(w / 2 - 12, h - 20); g.lineTo(w / 2, h - 3); g.lineTo(w / 2 + 12, h - 20); g.fill(); g.stroke(); }
    g.fillStyle = teacher && !bubble ? CARD : INK;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, w / 2, (h - (bubble ? 16 : 0)) / 2 + 2);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set((w / h) * (bubble ? 0.5 : 0.34), bubble ? 0.5 : 0.34, 1);
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

// ---------------------------------------------------------------- Nhân vật cắt giấy
const avatars = new Map();
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
    if (m.img) {
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
  }
  rebuild() { // dựng lại hình khi có ảnh hoặc khi đổi kiểu
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
  say(i) {
    if (this.bubble) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); }
    this.bubble = textSprite(PHRASES[i], { bubble: true });
    this.bubbleT = 0;
    this.root.add(this.bubble);
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
    if (this.fig.flat) { // tấm giấy: lật trái/phải
      this.flip.scale.set(this.fx * sx * this.spawn, sy * this.spawn, 1);
      this.flip.rotation.y = 0;
    } else {             // khối 3D: xoay người theo hướng đi, đứng yên thì đung đưa nhẹ để thấy khối
      this.turn += (this.face * 0.75 * mv + s(t * 0.7 + this.phase) * 0.28 * (1 - mv) - this.turn) * (1 - Math.exp(-dt * 8));
      this.flip.scale.set(sx * this.spawn, sy * this.spawn, sx * this.spawn);
      this.flip.rotation.y = this.turn;
    }
    this.shadow.position.set(this.pos.x, 0.012, this.pos.z);
    this.shadow.scale.setScalar(Math.max(0.5, 1 - this.y * 0.35) * this.spawn);
    if (this.bubble) {
      this.bubbleT += dt;
      this.bubble.position.set(0, this.h + 0.72, 0);
      if (this.bubbleT > 3.2) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble = null; }
    }
  }
  dispose() {
    this.gone = true;
    scene.remove(this.root, this.shadow);
    this.fig.dispose();
    this.label.material.map.dispose();
  }
}
const tmp = new THREE.Vector3();

// ================================================================ Kết nối + trạng thái
const session = { ws: null, me: null, role: null, code: '', max: 40, pending: new Map(), wantRoom: false };
let role = 'student', cut = null, srcImg = null, look = { style: 'flat', seed: 0 };

function show(screen) {
  for (const id of ['home', 'wait', 'room']) $(id).hidden = id !== screen;
}
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3500);
}
function resetRoom(msg) {
  for (const a of avatars.values()) a.dispose();
  avatars.clear();
  session.pending.clear();
  session.me = null; session.code = ''; session.role = null;
  try { sessionStorage.removeItem('lhnv-teacher'); } catch { /* không có bộ nhớ phiên */ }
  drawBoard('');
  show('home');
  $('err').textContent = msg || '';
  $('submit').disabled = false;
}
function connect(first) {
  if (session.ws) { session.ws.onclose = null; session.ws.close(); }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  session.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify(first));
  ws.onmessage = (ev) => { let d; try { d = JSON.parse(ev.data); } catch { return; } on[d.t]?.(d); };
  ws.onclose = () => { if (session.ws === ws) resetRoom(session.closeMsg || 'Mất kết nối với lớp học.'); session.closeMsg = ''; };
  ws.onerror = () => { $('err').textContent = 'Không kết nối được máy chủ lớp học.'; $('submit').disabled = false; };
}
const sendMsg = (d) => { if (session.ws?.readyState === 1) session.ws.send(JSON.stringify(d)); };

const on = {
  error(d) { $('err').textContent = d.msg; $('submit').disabled = false; show('home'); session.ws.onclose = null; session.ws.close(); },
  pending(d) {
    drawFit($('waitImg'), cut);
    $('waitText').textContent = d.teacherHere ? 'Cô giáo sẽ xem hình của em rồi cho vào lớp.' : 'Cô giáo chưa có mặt. Em chờ một chút nhé.';
    show('wait');
  },
  rejected() { session.closeMsg = 'Cô giáo chưa duyệt hình này. Em thử vẽ lại hoặc chọn ảnh khác nhé.'; },
  kicked() { session.closeMsg = 'Cô giáo đã mời em ra khỏi lớp.'; },
  norejoin() { session.ws.onclose = null; session.ws.close(); resetRoom(''); },
  welcome(d) {
    for (const a of avatars.values()) a.dispose();
    avatars.clear();
    Object.assign(session, { me: d.you, role: d.role, code: d.code, max: d.max });
    session.pending = new Map((d.pending || []).map((m) => [m.id, m]));
    if (d.token) try { sessionStorage.setItem('lhnv-teacher', JSON.stringify({ code: d.code, token: d.token })); } catch { /* bỏ qua */ }
    for (const m of d.members) avatars.set(m.id, new Avatar(m));
    $('roomCode').textContent = d.code;
    $('teacherPanel').hidden = d.role !== 'teacher';
    drawBoard(d.code);
    show('room');
    refreshLists();
    look = { style: avatars.get(d.you)?.style || 'flat', seed: avatars.get(d.you)?.seed || 0 };
    syncStyleButtons();
    const me = avatars.get(d.you);
    if (me) { controls.target.set(me.pos.x, 0.9, me.pos.z); camera.position.set(me.pos.x, 4.2, me.pos.z + 9); }
  },
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
};

function refreshLists() {
  const students = [...avatars.values()].filter((a) => a.role === 'student');
  $('count').textContent = `${students.length}/${session.max} học sinh`;
  if (session.role !== 'teacher') return;
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
  $('memberList').replaceChildren(...students.map((a) => row({ name: a.name }, [
    ['Mời ra', 'Mời ra khỏi lớp', () => sendMsg({ t: 'kick', id: a.id })],
  ])));
}

// ================================================================ Giao diện vào lớp
function setRole(r) {
  role = r;
  $('tabStudent').classList.toggle('active', r === 'student');
  $('tabTeacher').classList.toggle('active', r === 'teacher');
  $('codeRow').hidden = r === 'teacher';
  $('teacherNote').hidden = r !== 'teacher';
  $('nameLabel').textContent = r === 'teacher' ? 'Tên giáo viên' : 'Tên của em';
  $('submit').textContent = r === 'teacher' ? 'Tạo lớp' : 'Xin vào lớp';
  $('err').textContent = '';
}
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
  if (role === 'student') {
    if (code.length !== 6) { $('err').textContent = 'Mã lớp gồm 6 ký tự.'; return; }
    if (!cut) { $('err').textContent = 'Em hãy chọn ảnh nhân vật trước.'; return; }
  }
  const img = cut ? toDataURL(cut) : null;
  if (cut && !img) { $('err').textContent = 'Ảnh quá lớn, em chọn ảnh khác nhé.'; return; }
  $('err').textContent = '';
  $('submit').disabled = true;
  connect(role === 'teacher' ? { t: 'create', name, img, ...look } : { t: 'join', code, name, img, ...look });
};
const leave = () => { if (session.ws) { session.ws.onclose = null; session.ws.close(); } resetRoom(''); };
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
  if (me) { me.setStyle(look.style, look.seed); sendMsg({ t: 'style', ...look }); } // đang trong lớp: đổi ngay và báo cho cả lớp
  else showPreview();
}
for (const b of document.querySelectorAll('[data-style]')) b.onclick = () => chooseStyle(b.dataset.style, false);
for (const b of document.querySelectorAll('.shuffle')) b.onclick = () => chooseStyle('color', true);
syncStyleButtons();

// Biểu cảm + câu chọn sẵn (không có chat tự do)
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
  if (!ray.ray.intersectPlane(floor, tmp)) return;
  if (tmp.length() > ROOM_R) tmp.setLength(ROOM_R);
  me.target.set(tmp.x, 0, tmp.z);
  sendMsg({ t: 'go', x: tmp.x, z: tmp.z });
});

// Giáo viên tải lại trang thì vào lại đúng lớp
try {
  const saved = JSON.parse(sessionStorage.getItem('lhnv-teacher') || 'null');
  if (saved?.code && saved?.token) connect({ t: 'rejoin', code: saved.code, token: saved.token });
} catch { /* không có bộ nhớ phiên */ }

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
  figShared.uLight.value.copy(LIGHT).transformDirection(camera.matrixWorldInverse);
  if (pv.fig && !$('home').hidden) { // khung xem thử ở màn hình vào lớp
    pv.pivot.rotation.y = Math.sin(t * 0.9) * (pv.fig.flat ? 0.3 : 0.8);
    pv.shared.uLight.value.copy(LIGHT).transformDirection(pv.camera.matrixWorldInverse);
    pv.renderer.render(pv.scene, pv.camera);
  }
  const me = avatars.get(session.me);
  if (me) prev.copy(me.pos);
  for (const a of avatars.values()) a.update(dt, t);
  if (me) { // camera đi theo nhân vật của mình
    camera.position.add(tmp.copy(me.pos).sub(prev));
    controls.target.set(me.pos.x, 0.9, me.pos.z);
  }
  controls.update();
  renderer.render(scene, camera);
});
window.lhnv = { session, avatars }; // tiện kiểm thử
