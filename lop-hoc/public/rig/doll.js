// Con rối giấy từ chính nét vẽ tay: các lớp cắt (thân, đầu, bạn đồng hành) lấy từ character.json.
// Biểu cảm (chớp mắt, cười, khóc, giận, nói) được vẽ đè bằng nét mực lên đúng vị trí mắt/miệng.
// Toạ độ trong character.json: "doll" dùng điểm ảnh của bản vẽ đã cắt; riêng "face" tính trong ảnh lớp đầu.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();

export function createDoll(meta, baseUrl) {
  const D = meta.doll, K = D.metersPerPx, INK = D.ink || '#2434b4', PAPER = D.paper || '#fdfaf4';
  const toWorld = (x, y) => [(x - D.feet.x) * K, (D.feet.y - y) * K];
  const sheet = (L, order) => { // tấm giấy cho một lớp; gốc của nhóm là điểm xoay của lớp
    const tex = loader.load(`${new URL(L.file, baseUrl).href}?v=${meta.version || 1}`); // đổi "version" trong character.json thì hình được tải lại
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L.w * K, L.h * K),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide }));
    mesh.position.set((L.x + L.w / 2 - L.px) * K, (L.py - (L.y + L.h / 2)) * K, 0);
    mesh.renderOrder = order;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    return pivot;
  };

  const root = new THREE.Group(), flip = new THREE.Group();
  const body = sheet(D.body, 1);
  body.position.set(...toWorld(D.body.px, D.body.py), 0);
  flip.add(body);
  root.add(flip);
  const inBody = (x, y) => [(x - D.body.px) * K, (D.body.py - y) * K];

  let head = null, faceTex = null, g = null;
  const H = D.head, S = 2;
  if (H) {
    head = sheet(H, 2);
    head.position.set(...inBody(H.px, H.py), 0.02);
    body.add(head);
    const cv = document.createElement('canvas');
    cv.width = H.w * S; cv.height = H.h * S;
    g = cv.getContext('2d');
    faceTex = new THREE.CanvasTexture(cv);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(H.w * K, H.h * K),
      new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    faceMesh.position.copy(head.children[0].position);
    faceMesh.position.z = 0.012;
    faceMesh.renderOrder = 3;
    head.add(faceMesh);
  }

  // Bàn tay vẫy chào vẽ thêm bằng nét mực (bản vẽ thường không có cánh tay tách riêng)
  const hc = document.createElement('canvas');
  hc.width = hc.height = 128;
  const hg = hc.getContext('2d');
  hg.strokeStyle = INK; hg.fillStyle = PAPER; hg.lineWidth = 5; hg.lineJoin = hg.lineCap = 'round';
  hg.beginPath();
  hg.moveTo(44, 118); hg.lineTo(40, 70);
  for (const [x, y] of [[30, 30], [50, 16], [68, 12], [86, 22]]) { hg.quadraticCurveTo(x - 8, y - 14, x + 6, y); hg.lineTo(x + 8, y + 34); }
  hg.quadraticCurveTo(112, 50, 100, 78); hg.lineTo(84, 118); hg.closePath();
  hg.fill(); hg.stroke();
  const hand = new THREE.Group();
  const handMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  handMesh.position.y = 0.17;
  handMesh.renderOrder = 4;
  hand.add(handMesh);
  const hp = D.hand || { x: D.body.x + D.body.w * 0.9, y: D.body.y + D.body.h * 0.35 };
  hand.position.set(...inBody(hp.x, hp.y), 0.03);
  hand.visible = false;
  body.add(hand);

  const anger = new THREE.Group(); // main gắn dấu giận vào đây
  const ap = D.anger || (H ? { x: H.x + H.w * 0.85, y: H.y + H.h * 0.15 } : { x: D.body.x + D.body.w * 0.8, y: D.body.y });
  const anchor = head || body, ref = H || D.body;
  anger.position.set((ap.x - ref.px) * K, (ref.py - ap.y) * K, 0.05);
  anchor.add(anger);

  const companion = D.companion ? sheet(D.companion, 1) : null; // bay riêng, rig.js đặt vị trí

  const F = D.face, eyes = F?.eyes || [], mouth = F?.mouth;
  const u = eyes.length ? eyes.reduce((s, e) => s + e[2], 0) / eyes.length / 12.5 : 1; // tỉ lệ nét theo cỡ mắt
  const midX = eyes.length ? eyes.reduce((s, e) => s + e[0], 0) / eyes.length : 0;
  let key = '';
  // v: { closed, happy, angry, mouth, tears }
  function drawFace(v, t) {
    if (!g || !F) return;
    const k = [v.closed > 0.5, v.happy > 0.5, v.angry > 0.5, Math.round(v.mouth * 6), v.tears > 0.5 ? Math.floor(t * 12) : 0].join('|');
    if (k === key) return;
    key = k;
    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, H.w, H.h);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = INK;
    if (v.closed > 0.5 || v.happy > 0.5) {
      for (const [x, y, r] of eyes) { // che mắt gốc bằng màu giấy rồi vẽ mắt nhắm / mắt cười
        g.fillStyle = PAPER;
        g.fillRect(x - r - 1, y - 6 * u, r * 2 + 3, 17 * u);
        g.lineWidth = 2.6 * u;
        g.beginPath();
        if (v.happy > 0.5) { g.moveTo(x - r, y + 6 * u); g.quadraticCurveTo(x, y - 9 * u, x + r, y + 6 * u); }
        else { g.moveTo(x - r, y); g.quadraticCurveTo(x, y + 9 * u, x + r, y); }
        g.stroke();
      }
    }
    if (v.angry > 0.5) { // lông mày xếch: đầu ngoài cao, đầu trong thấp
      g.lineWidth = 4.2 * u;
      g.beginPath();
      for (const [x, y, r] of eyes) { const o = x < midX ? -1 : 1; g.moveTo(x + o * (r + 1), y - 9 * u); g.lineTo(x - o * (r + 2), y + 1.5 * u); }
      g.stroke();
    }
    if (mouth && (v.mouth > 0.08 || v.happy > 0.5 || v.tears > 0.5)) { // miệng mở vẽ đè lên miệng gốc
      const [mx, my] = mouth, o = Math.max(v.mouth, v.happy > 0.5 ? 0.6 : 0.25), w = (6 + o * 6) * u, h = (3 + o * 11) * u;
      g.fillStyle = PAPER;
      g.fillRect(mx - 12 * u, my - 9 * u, 26 * u, 14 * u);
      g.fillStyle = INK;
      g.lineWidth = 2 * u;
      g.beginPath();
      if (v.tears > 0.5 || v.angry > 0.5) { g.moveTo(mx - w, my + 5 * u); g.quadraticCurveTo(mx, my + 5 * u - h * 2, mx + w, my + 5 * u); }
      else { g.moveTo(mx - w, my - 4 * u); g.quadraticCurveTo(mx, my - 4 * u + h * 2, mx + w, my - 4 * u); }
      g.closePath();
      g.fill(); g.stroke();
    }
    if (v.tears > 0.5) {
      g.lineWidth = 2.2 * u;
      for (const [x, y, r] of eyes) {
        const p = (t * 1.4 + x * 0.01) % 1;
        g.fillStyle = 'rgba(120,150,235,0.55)';
        g.fillRect(x - 3.5 * u, y + 7 * u, 7 * u, 37 * u);
        const dx = x + (x < midX ? -r - 3 : r + 3), dy = y + (4 + p * 34) * u;
        g.fillStyle = PAPER;
        g.beginPath(); g.moveTo(dx, dy - 8 * u); g.quadraticCurveTo(dx + 7 * u, dy + 3 * u, dx, dy + 6 * u); g.quadraticCurveTo(dx - 7 * u, dy + 3 * u, dx, dy - 8 * u); g.fill(); g.stroke();
      }
    }
    faceTex.needsUpdate = true;
  }

  return { root, flip, body, head, hand, anger, companion, drawFace };
}
