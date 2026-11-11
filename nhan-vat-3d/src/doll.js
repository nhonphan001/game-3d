// Chế độ "Bản vẽ gốc": nhân vật là hình cắt giấy từ chính nét vẽ tay
// (3 lớp: thân, đầu, thú bông), luôn quay mặt về camera và cử động như con rối giấy.
// Biểu cảm (chớp mắt, cười, khóc, giận, nói) được vẽ đè bằng nét mực lên khuôn mặt.
import * as THREE from 'three';

const K = 1.9 / 900;           // mét trên mỗi điểm ảnh của bản vẽ
const FEET = { x: 370, y: 1050 };
const LAYERS = {
  body: { x: -2, y: 366, w: 744, h: 685, px: 370, py: 1050 },
  head: { x: 318, y: 153, w: 339, h: 349, px: 500, py: 480 },
  bunny: { x: -2, y: 73, w: 329, h: 397, px: 150, py: 265 },
};
const INK = '#1f2f9c', PAPER = '#fdfaf4';
const loader = new THREE.TextureLoader();

// Tấm giấy cho một lớp; gốc toạ độ của nhóm nằm ở điểm xoay của lớp
function sheet(name, order) {
  const L = LAYERS[name];
  const tex = loader.load(new URL(`../assets/${name}.png`, import.meta.url).href);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(L.w * K, L.h * K),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide }));
  mesh.position.set((L.x + L.w / 2 - L.px) * K, (L.py - (L.y + L.h / 2)) * K, 0);
  mesh.renderOrder = order;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  return pivot;
}

export function createDoll() {
  const root = new THREE.Group();   // đặt ở chân, quay về camera
  const flip = new THREE.Group();   // lật trái/phải
  const body = sheet('body', 1);    // xoay/nhún quanh gấu váy
  const head = sheet('head', 2);
  head.position.set((LAYERS.head.px - FEET.x) * K, (FEET.y - LAYERS.head.py) * K, 0.02);
  body.add(head);
  flip.add(body);
  root.add(flip);

  // Lớp vẽ đè biểu cảm, trùng khít với tấm đầu
  const H = LAYERS.head, S = 2;
  const cv = document.createElement('canvas');
  cv.width = H.w * S; cv.height = H.h * S;
  const g = cv.getContext('2d');
  const faceTex = new THREE.CanvasTexture(cv);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(H.w * K, H.h * K),
    new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  faceMesh.position.copy(head.children[0].position);
  faceMesh.position.z = 0.012;
  faceMesh.renderOrder = 3;
  head.add(faceMesh);

  // Bàn tay vẫy chào vẽ bằng nét mực
  const hc = document.createElement('canvas');
  hc.width = hc.height = 128;
  const hg = hc.getContext('2d');
  hg.strokeStyle = INK; hg.fillStyle = PAPER; hg.lineWidth = 5; hg.lineJoin = hg.lineCap = 'round';
  hg.beginPath();
  hg.moveTo(44, 118); hg.lineTo(40, 70);
  for (const [x, y] of [[30, 30], [50, 16], [68, 12], [86, 22]]) hg.quadraticCurveTo(x - 8, y - 14, x + 6, y), hg.lineTo(x + 8, y + 34);
  hg.quadraticCurveTo(112, 50, 100, 78); hg.lineTo(84, 118); hg.closePath();
  hg.fill(); hg.stroke();
  const hand = new THREE.Group();
  const handMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  handMesh.position.y = 0.17;
  handMesh.renderOrder = 4;
  hand.add(handMesh);
  hand.position.set(0.62, 0.95, 0.03);
  hand.visible = false;
  body.add(hand);

  const bunny = sheet('bunny', 1);  // bay riêng, do main.js đặt vị trí

  let key = '';
  // v: { closed, happy, angry, mouth, tears }
  function drawFace(v, t) {
    const k = [v.closed > 0.5, v.happy > 0.5, v.angry > 0.5, Math.round(v.mouth * 6), v.tears > 0.5 ? Math.floor(t * 12) : 0].join('|');
    if (k === key) return;
    key = k;
    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, H.w, H.h);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = INK;
    const eyes = [[111, 255, 11], [183, 256, 14]];
    if (v.closed > 0.5 || v.happy > 0.5) {
      for (const [x, y, r] of eyes) {
        g.fillStyle = PAPER;
        g.fillRect(x - r - 1, y - 6, r * 2 + 3, 17);
        g.lineWidth = 2.6;
        g.beginPath();
        if (v.happy > 0.5) { g.moveTo(x - r, y + 6); g.quadraticCurveTo(x, y - 9, x + r, y + 6); }
        else { g.moveTo(x - r, y); g.quadraticCurveTo(x, y + 9, x + r, y); }
        g.stroke();
      }
    }
    if (v.angry > 0.5) { // lông mày xếch
      g.lineWidth = 4.2;
      g.beginPath(); g.moveTo(99, 246); g.lineTo(124, 257); g.moveTo(199, 246); g.lineTo(169, 257); g.stroke();
    }
    if (v.mouth > 0.08 || v.happy > 0.5 || v.tears > 0.5) { // miệng mở vẽ đè lên miệng gốc
      const o = Math.max(v.mouth, v.happy > 0.5 ? 0.6 : 0.25), w = 6 + o * 6, h = 3 + o * 11;
      g.fillStyle = PAPER;
      g.fillRect(128, 286, 26, 14);
      g.fillStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      if (v.tears > 0.5 || v.angry > 0.5) { g.moveTo(140 - w, 300); g.quadraticCurveTo(140, 300 - h * 2, 140 + w, 300); g.closePath(); }
      else { g.moveTo(140 - w, 291); g.quadraticCurveTo(140, 291 + h * 2, 140 + w, 291); g.closePath(); }
      g.fill(); g.stroke();
    }
    if (v.tears > 0.5) {
      g.lineWidth = 2.2;
      for (const [x, y, r] of eyes) {
        const p = (t * 1.4 + x * 0.01) % 1;
        g.fillStyle = 'rgba(120,150,235,0.55)';
        g.beginPath(); g.moveTo(x - 3, y + 7); g.lineTo(x - 4, y + 44); g.lineTo(x + 4, y + 44); g.lineTo(x + 3, y + 7); g.fill();
        const dx = x + (x < 150 ? -r - 3 : r + 3), dy = y + 4 + p * 34;
        g.fillStyle = PAPER;
        g.beginPath(); g.moveTo(dx, dy - 8); g.quadraticCurveTo(dx + 7, dy + 3, dx, dy + 6); g.quadraticCurveTo(dx - 7, dy + 3, dx, dy - 8); g.fill(); g.stroke();
      }
    }
    faceTex.needsUpdate = true;
  }

  return { root, flip, body, head, hand, bunny, drawFace };
}
