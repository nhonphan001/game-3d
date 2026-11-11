// Dựng mô hình 3D "Queen of White" (theo bản thiết kế màu) và bạn thú bông
// bằng các khối hình cơ bản, có nét viền kiểu hoạt hình.
import * as THREE from 'three';
import { Face } from './face.js';

export const PALETTE = {
  ink: 0x2434b4,
  skin: 0xffeee2,
  hair: 0xe1e8f5,
  streak: 0x4f86cf,
  white: 0xffffff,
  rose: 0x2f6cc4,
  roseDark: 0x1b3f86,
  pale: 0xc3d2ec,
  bodice: 0x2c6aa6,
  bow: 0x2456b8,
  gold: 0xf0c44a,
};

// ---------------------------------------------------------------- Phong cách bút bi
// Mọi vật liệu dùng chung một đoạn shader: khi uSketch = 1, màu tô được thay bằng
// nền giấy + nét gạch mực xanh (gạch thưa, gạch chéo, hoặc tô mực loang tuỳ độ đậm).
export const sketch = {
  uSketch: { value: 1 },
  uPaper: { value: new THREE.Color(0xf3eedb) },
  uInkCol: { value: new THREE.Color(0x2434b4) },
  uLight: { value: new THREE.Vector3(0.4, 0.7, 0.6) },
  uAnchor: { value: new THREE.Vector2() },
  uBoil: { value: 0 },
  uPx: { value: 1 },
};
const SKETCH_GLSL = `
uniform float uSketch; uniform vec3 uPaper; uniform vec3 uInkCol; uniform vec3 uLight;
uniform vec2 uAnchor; uniform float uBoil; uniform float uPx; uniform float uInk; uniform float uAng;
float skHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float skNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(skHash(i),skHash(i+vec2(1,0)),f.x), mix(skHash(i+vec2(0,1)),skHash(i+vec2(1,1)),f.x), f.y); }
float skHatch(vec2 p, float ang, float sp, float th){
  vec2 d=vec2(cos(ang),sin(ang)); float along=dot(p,d);
  float t=dot(p,vec2(-d.y,d.x)) + sin(along*0.07+ang*9.+uBoil)*1.3 + (skNoise(p*0.08+uBoil)-0.5)*2.5;
  float f=abs(fract(t/sp)-0.5)*sp;
  float gaps=smoothstep(0.12,0.3, skNoise(vec2(along*0.03, floor(t/sp)*3.7+uBoil)));
  return (1.-smoothstep(th,th+0.9,f))*gaps; }
`;
const SKETCH_MAIN = `
if (uSketch > 0.5) {
  vec2 skp = (gl_FragCoord.xy - uAnchor) / uPx;
  float baseLum = dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722));
  float tone = uInk < -0.5 ? (1.0 - smoothstep(0.0,0.8,baseLum))*0.85 : uInk;
  float ndl = dot(normalize(normal), uLight);
  float dark = tone + (1.0 - smoothstep(-0.15,0.4,ndl))*0.3;
  float a = skHatch(skp,uAng,6.5,0.55)*smoothstep(0.1,0.2,dark);
  a = max(a, skHatch(skp,uAng+1.2,7.5,0.55)*smoothstep(0.42,0.52,dark));
  float fill = smoothstep(0.64,0.74,dark)*(0.5+0.35*skNoise(skp*0.12));
  a = max(a*0.9, fill);
  gl_FragColor.rgb = mix(uPaper, uInkCol, a);
}
`;
function sketchPatch(shader) {
  Object.assign(shader.uniforms, sketch, { uInk: { value: this.userData.ink ?? -1 }, uAng: { value: this.userData.ang ?? 0.8 } });
  shader.fragmentShader = SKETCH_GLSL + shader.fragmentShader.replace('#include <tonemapping_fragment>', SKETCH_MAIN + '#include <tonemapping_fragment>');
}
// ink: độ đậm mực 0..1 (-1 = tự suy từ màu), ang: hướng nét gạch
export const toon = (color, extra = {}, ink = -1, ang = 0.8) => {
  const m = new THREE.MeshToonMaterial({ color, ...extra });
  m.userData = { ink, ang };
  m.onBeforeCompile = sketchPatch;
  return m;
};
// Nét viền: vỏ ngược, rung nhẹ như nét tay khi ở chế độ bút bi
export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2434b4, side: THREE.BackSide });
outlineMat.onBeforeCompile = (shader) => {
  shader.uniforms.uSketch = sketch.uSketch;
  shader.uniforms.uBoil = sketch.uBoil;
  shader.vertexShader = 'uniform float uSketch; uniform float uBoil;\n' + shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n transformed += normal * (sin(position.x*31.+uBoil*5.)+sin(position.y*27.+uBoil*3.)+sin(position.z*35.+uBoil))*0.0035*uSketch;');
};
export function setSketch(on) {
  sketch.uSketch.value = on ? 1 : 0;
  outlineMat.color.set(on ? 0x2434b4 : 0x1b2350);
}

// Tạo mesh kèm lớp viền (vỏ ngược phóng to một chút)
function part(geo, mat, w = 0.013) {
  const m = new THREE.Mesh(geo, mat);
  if (w > 0) {
    geo.computeBoundingSphere();
    const { radius, center } = geo.boundingSphere;
    const s = 1 + w / radius;
    const o = new THREE.Mesh(geo, outlineMat);
    o.scale.setScalar(s);
    o.position.copy(center).multiplyScalar(1 - s);
    m.add(o);
  }
  return m;
}

const Z = new THREE.Vector3(0, 0, 1);
function aim(obj, x, y, z) {
  obj.quaternion.setFromUnitVectors(Z, new THREE.Vector3(x, y, z).normalize());
  return obj;
}

function checkerTexture(repX, repY) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1c2a80'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Bông hồng xanh có đường xoắn ốc như trong tranh
export function makeRose(r, mats) {
  const g = new THREE.Group();
  const core = part(new THREE.SphereGeometry(r, 18, 14), mats.rose, r * 0.13);
  core.scale.z = 0.75;
  g.add(core);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 4.2;
    const rad = r * 0.82 * (i / 40);
    pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad,
      r * 0.75 * Math.sqrt(1 - (rad / r) ** 2) + r * 0.02));
  }
  const spiral = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r * 0.055, 5),
    mats.roseDark);
  g.add(spiral);
  return g;
}

function heartGeometry(size) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-1.6, 0.2, -0.8, 1.3, 0, 0.5);
  s.bezierCurveTo(0.8, 1.3, 1.6, 0.2, 0, -0.9);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
  geo.scale(size, size, size);
  return geo;
}

function angerSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#e8243c';
  g.lineWidth = 13;
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate((i * Math.PI) / 2);
    g.beginPath();
    g.moveTo(14, 50);
    g.quadraticCurveTo(14, 14, 50, 14);
    g.stroke();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.renderOrder = 10;
  return sp;
}

// Sợi tóc / dải dài uốn theo đường cong, có viền riêng
function strand(points, r, mat, w = 0.012) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, r, 10), mat);
  g.add(m, new THREE.Mesh(new THREE.TubeGeometry(curve, 28, r + w, 10), outlineMat));
  for (const p of [points[0], points[points.length - 1]]) {
    const cap = part(new THREE.SphereGeometry(r, 10, 8), mat, w);
    cap.position.set(...p);
    g.add(cap);
  }
  return g;
}

// Tầng váy có gấu hình răng cưa (ngôi sao)
function zigzagGeometry(points, rTop, yTop, rLong, yLong, rShort, yShort) {
  const N = points * 2, pos = [], idx = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, long = i % 2 === 0;
    const r = long ? rLong : rShort, y = long ? yLong : yShort;
    pos.push(Math.sin(a) * rTop, yTop, Math.cos(a) * rTop, Math.sin(a) * r, y, Math.cos(a) * r);
    const j = (i + 1) % N;
    idx.push(2 * i, 2 * i + 1, 2 * j + 1, 2 * i, 2 * j + 1, 2 * j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function stripeTexture(rep) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#2c6aa6'; g.fillRect(0, 0, 64, 8);
  g.fillStyle = '#9fc0ea'; g.fillRect(0, 0, 26, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lathe = (pts, seg = 44) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), seg);

export function createCharacter() {
  const mats = {
    skin: toon(PALETTE.skin, {}, -0.2), // da để trống giấy, không gạch bóng
    hair: toon(PALETTE.hair, { side: THREE.DoubleSide }, 0.3, 1.45),
    hairBlue: toon(PALETTE.streak, { side: THREE.DoubleSide }, 0.5, 1.45),
    dress: toon(PALETTE.white, { side: THREE.DoubleSide }),
    white: toon(PALETTE.white),
    bodice: toon(PALETTE.bodice, {}, 0.45),
    band: toon(PALETTE.pale, {}, 0.15),
    gold: toon(PALETTE.gold, {}, 0.9),
    bow: toon(PALETTE.bow, {}, 0.14, 0.3),
    bowLight: toon(0x9fc0ea, {}, 0.45, 0.3),
    silver: toon(0xeef2fa, { side: THREE.DoubleSide }),
    leaf: toon(0x5fa35a, {}, 0.45),
    rose: toon(PALETTE.rose, {}, 0.8),
    roseDark: new THREE.MeshBasicMaterial({ color: PALETTE.roseDark }),
    checker: toon(0xffffff, { map: checkerTexture(22, 2), side: THREE.DoubleSide }),
    ribbon: toon(0xffffff, { map: checkerTexture(2, 7), side: THREE.DoubleSide }),
    stripe: toon(0xffffff, { map: stripeTexture(26), side: THREE.DoubleSide }),
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // nhún + co giãn
  root.add(body);

  // ---------- Chân ----------
  const makeLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.47, 0);
    const shin = part(new THREE.CapsuleGeometry(0.052, 0.3, 4, 12), mats.skin, 0.01);
    shin.position.y = -0.2;
    const shoe = part(new THREE.SphereGeometry(0.08, 16, 12), mats.white, 0.012);
    shoe.scale.set(1, 0.75, 1.6);
    shoe.position.set(0, -0.415, 0.04);
    leg.add(shin, shoe);
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(0.105);
  const legR = makeLeg(-0.105);

  // ---------- Hông + váy nhiều tầng ----------
  const hips = new THREE.Group();
  hips.position.y = 0.47;
  body.add(hips);

  const skirt = new THREE.Group();
  skirt.position.y = 0.28;
  hips.add(skirt);

  // tầng trong cùng: sọc xanh + bèo trắng
  const inner = part(lathe([[0.3, -0.2], [0.5, -0.4], [0.6, -0.56]]), mats.stripe, 0.012);
  skirt.add(inner);
  // tầng dưới và tầng trên màu trắng
  const lower = part(lathe([[0.3, -0.12], [0.5, -0.3], [0.63, -0.42], [0.69, -0.5]]), mats.dress, 0.014);
  const upper = part(lathe([[0.14, 0.02], [0.2, -0.04], [0.38, -0.19], [0.5, -0.29], [0.57, -0.37]]), mats.dress, 0.014);
  skirt.add(lower, upper);
  const ring = (count, rad, y, size, mat) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const f = part(new THREE.SphereGeometry(size, 10, 8), mat, 0.01);
      f.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      f.scale.y = 0.75;
      skirt.add(f);
    }
  };
  ring(26, 0.6, -0.57, 0.05, mats.dress);  // bèo trong
  ring(24, 0.69, -0.5, 0.062, mats.dress); // bèo tầng dưới
  ring(14, 0.565, -0.37, 0.085, mats.dress); // gấu lượn sóng tầng trên
  for (const [rad, y] of [[0.655, -0.455], [0.5, -0.3]]) { // viền vàng
    const trim = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.008, 6, 60), mats.gold);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = y;
    skirt.add(trim);
  }
  // vạt áo răng cưa
  skirt.add(part(zigzagGeometry(9, 0.15, 0.03, 0.47, -0.25, 0.36, -0.15), mats.silver, 0.012));
  for (let i = 0; i < 7; i++) { // hoa hồng trên váy
    const a = (i / 7) * Math.PI * 2 + 0.45;
    const hi = i % 2 === 0;
    const rad = hi ? 0.47 : 0.6, y = hi ? -0.27 : -0.4;
    const r = makeRose(hi ? 0.055 : 0.06, mats);
    r.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
    aim(r, Math.sin(a), 0.7, Math.cos(a));
    skirt.add(r);
  }
  // đai caro vắt chéo + nơ caro bên hông
  const sash = part(new THREE.CylinderGeometry(0.3, 0.4, 0.1, 40, 1, true), mats.checker, 0.01);
  sash.position.set(0.02, -0.1, 0);
  sash.rotation.z = -0.3;
  skirt.add(sash);
  for (const [dx, rz, len] of [[0.0, 0.5, 0.42], [0.1, 0.95, 0.36]]) {
    const tail = part(new THREE.BoxGeometry(0.11, len, 0.014), mats.ribbon, 0.008);
    tail.geometry.translate(0, -len / 2, 0);
    tail.position.set(0.36 + dx * 0.3, -0.14, -0.12);
    tail.rotation.set(0.25, 0, rz);
    skirt.add(tail);
  }
  const hipRose = makeRose(0.065, mats);
  hipRose.position.set(-0.2, -0.02, 0.17);
  aim(hipRose, -0.5, 0.5, 1);
  skirt.add(hipRose);

  // ---------- Thân: áo xanh viền vàng ----------
  const torso = new THREE.Group();
  torso.position.y = 0.28;
  hips.add(torso);
  const bodice = part(new THREE.CylinderGeometry(0.15, 0.125, 0.24, 20), mats.bodice);
  bodice.position.y = 0.1;
  const shoulders = part(new THREE.SphereGeometry(0.152, 18, 12), mats.skin);
  shoulders.scale.y = 0.62;
  shoulders.position.y = 0.22;
  const bust = part(new THREE.CylinderGeometry(0.156, 0.154, 0.075, 20), mats.band, 0.011);
  bust.position.y = 0.2;
  const point = part(new THREE.ConeGeometry(0.115, 0.2, 14), mats.bodice, 0.011);
  point.scale.z = 0.5;
  point.rotation.x = Math.PI;
  point.position.set(0, -0.06, 0.1);
  torso.add(bodice, shoulders, bust, point);
  for (const y of [0.24, 0.163]) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.157, 0.007, 6, 36), mats.gold);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = y;
    torso.add(trim);
  }
  // hoa văn trái tim vàng trước ngực
  const heartPts = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const x = hx * 0.0048, y = 0.075 + hy * 0.0048;
    heartPts.push(new THREE.Vector3(x, y, Math.sqrt(Math.max(0.0001, 0.145 ** 2 - x * x)) + 0.004));
  }
  torso.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(heartPts, true), 60, 0.0075, 5, true), mats.gold));
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), mats.gold);
  gem.position.set(0, 0.2, 0.158);
  torso.add(gem);
  const choker = part(new THREE.TorusGeometry(0.068, 0.016, 8, 20), mats.bow, 0.006);
  choker.rotation.x = Math.PI / 2;
  choker.position.y = 0.305;
  torso.add(choker);

  // ---------- Tay: tay bồng + găng trắng ----------
  const makeArm = (s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.19, 0.22, 0);
    const puff = part(new THREE.SphereGeometry(0.105, 14, 12), mats.dress);
    puff.position.y = -0.02;
    const frill = part(new THREE.TorusGeometry(0.058, 0.024, 8, 14), mats.dress, 0.008);
    frill.rotation.x = Math.PI / 2;
    frill.position.y = -0.1;
    const upper = part(new THREE.CapsuleGeometry(0.04, 0.14, 4, 10), mats.skin, 0.01);
    upper.position.y = -0.13;
    const elbow = new THREE.Group();
    elbow.position.y = -0.22;
    const glove = part(new THREE.CapsuleGeometry(0.041, 0.14, 4, 10), mats.white, 0.01);
    glove.position.y = -0.09;
    const cuff = part(new THREE.CylinderGeometry(0.066, 0.044, 0.07, 12), mats.white, 0.009);
    cuff.position.y = -0.02;
    const hand = part(new THREE.SphereGeometry(0.058, 12, 10), mats.white, 0.01);
    hand.position.y = -0.225;
    elbow.add(glove, cuff, hand);
    arm.add(puff, frill, upper, elbow);
    torso.add(arm);
    return { arm, elbow };
  };
  const L = makeArm(1), R = makeArm(-1);

  // ---------- Đầu ----------
  const head = new THREE.Group();
  head.position.y = 0.3;
  torso.add(head);
  const HC = 0.36; // tâm đầu
  const skull = part(new THREE.SphereGeometry(0.4, 32, 24), mats.skin);
  skull.position.y = HC;
  head.add(skull);

  const face = new Face();
  const A = 0.9;
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.404, 32, 24, Math.PI / 2 - A, 2 * A, Math.PI / 2 - A, 2 * A),
    new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false }));
  faceMesh.position.y = HC;
  head.add(faceMesh);

  // Tóc bạc: mái bằng + ót + các lọn dài lượn sóng xen sợi xanh
  const hairTop = part(new THREE.SphereGeometry(0.44, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.455), mats.hair, 0.012);
  hairTop.position.y = HC;
  const hairBackCap = part(new THREE.SphereGeometry(0.44, 28, 18, Math.PI * 0.93, Math.PI * 1.14, 0, Math.PI * 0.74), mats.hair, 0.012);
  hairBackCap.position.y = HC;
  head.add(hairTop, hairBackCap);
  for (let i = -3; i <= 3; i++) { // các lọn mái nhỏ
    const b = part(new THREE.SphereGeometry(0.055, 10, 8), mats.hair, 0.008);
    const a = i * 0.24;
    b.scale.set(0.9, 1.1, 0.5);
    b.position.set(Math.sin(a) * 0.42, HC + 0.075, Math.cos(a) * 0.42);
    b.rotation.y = a;
    head.add(b);
  }

  const hairLong = new THREE.Group();
  hairLong.position.y = HC;
  const backFill = part(new THREE.CapsuleGeometry(0.36, 0.8, 8, 20), mats.hair, 0.014);
  backFill.scale.z = 0.36;
  backFill.position.set(0, -0.42, -0.3);
  hairLong.add(backFill);
  const wave = (x0, z0, r, mat, len, seed) => {
    const sg = Math.sign(x0) || 1, pts = [];
    for (let k = 0; k <= 5; k++) {
      const f = k / 5;
      pts.push([x0 * (1 + f * 0.55) + Math.sin(k * 1.5 + seed) * 0.05, 0.12 - f * len, z0 + Math.cos(k * 1.3 + seed) * 0.03]);
    }
    const end = pts[5];
    pts.push([end[0] + sg * 0.1, end[1] - 0.02, end[2]], [end[0] + sg * 0.14, end[1] + 0.07, end[2]]); // đuôi tóc cong lên
    return strand(pts, r, mat);
  };
  [[-0.47, -0.2, 1.25, 0], [-0.36, -0.27, 1.3, 1], [-0.2, -0.32, 1.2, 0], [0.2, -0.32, 1.2, 0], [0.36, -0.27, 1.3, 1], [0.47, -0.2, 1.25, 0],
    [-0.5, -0.12, 1.05, 1], [0.5, -0.12, 1.05, 1]].forEach(([x, z, len, blue], i) => {
    hairLong.add(wave(x, z, blue ? 0.075 : 0.1, blue ? mats.hairBlue : mats.hair, len, i * 1.7));
  });
  head.add(hairLong);
  for (const s of [-1, 1]) { // tóc mai dài trước vai
    head.add(strand([[s * 0.38, HC - 0.02, 0.17], [s * 0.41, HC - 0.2, 0.17], [s * 0.39, HC - 0.36, 0.16], [s * 0.43, HC - 0.48, 0.15]], 0.05, mats.hair, 0.01));
    head.add(strand([[s * 0.43, HC - 0.05, 0.06], [s * 0.48, HC - 0.3, 0.05], [s * 0.47, HC - 0.52, 0.04]], 0.045, mats.hairBlue, 0.01));
  }

  // Hoa hồng xanh + hoa trắng + lá hai bên đầu
  for (const s of [-1, 1]) {
    for (const [x, y, z, rad] of [[0.37, 0.24, 0.17, 0.105], [0.45, 0.06, 0.12, 0.1]]) {
      const r = makeRose(rad, mats);
      r.position.set(s * x, HC + y, z);
      aim(r, s * 0.8, 0.25, 0.7);
      head.add(r);
    }
    for (const [x, y, z, rad] of [[0.5, 0.22, 0.0, 0.07], [0.54, 0.1, -0.03, 0.06], [0.46, 0.33, 0.02, 0.06], [0.5, -0.05, 0.02, 0.055]]) {
      const fl = part(new THREE.SphereGeometry(rad, 10, 8), mats.white, 0.01);
      fl.position.set(s * x, HC + y, z);
      head.add(fl);
      const mid = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.3, 6, 6), mats.gold);
      mid.position.set(s * (x + rad * 0.75), HC + y, z + rad * 0.5);
      head.add(mid);
    }
    for (const [x, y, z, rz] of [[0.42, -0.08, 0.16, 0.9], [0.5, -0.13, 0.08, 0.3], [0.3, 0.36, 0.14, -0.6]]) {
      const leaf = part(new THREE.SphereGeometry(0.06, 8, 6), mats.leaf, 0.009);
      leaf.scale.set(0.5, 1, 0.25);
      leaf.position.set(s * x, HC + y, z);
      leaf.rotation.z = s * rz;
      head.add(leaf);
    }
  }

  // Nơ xanh lớn + nơ trắng nhỏ + vương miện
  const bow = new THREE.Group();
  bow.position.set(0, HC + 0.46, -0.04);
  for (const s of [-1, 1]) {
    const lobe = part(new THREE.SphereGeometry(0.3, 18, 14), mats.bow, 0.016);
    lobe.scale.set(0.82, 1, 0.3);
    lobe.position.set(s * 0.24, 0.16, 0);
    lobe.rotation.z = -s * 0.5;
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mats.bowLight);
    inner.scale.set(0.75, 1, 0.3);
    inner.position.set(s * 0.22, 0.15, 0.055);
    inner.rotation.z = -s * 0.5;
    const small = part(new THREE.SphereGeometry(0.13, 12, 10), mats.white, 0.012);
    small.scale.set(1, 0.7, 0.4);
    small.position.set(s * 0.13, 0.02, 0.13);
    small.rotation.z = s * 0.35;
    bow.add(lobe, inner, small);
  }
  const knot = part(new THREE.SphereGeometry(0.07, 12, 10), mats.bow, 0.01);
  knot.position.set(0, 0.0, 0.06);
  bow.add(knot);
  [[0, 0.13, 0.03], [-0.06, 0.09, 0.022], [0.06, 0.09, 0.022]].forEach(([x, h, r]) => { // vương miện
    const spike = part(new THREE.ConeGeometry(r, h, 4), mats.silver, 0.006);
    spike.position.set(x, -0.01 + h / 2, 0.2);
    bow.add(spike);
  });
  const tiaraGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), mats.bow);
  tiaraGem.position.set(0, 0.03, 0.232);
  bow.add(tiaraGem);
  head.add(bow);

  const anger = angerSprite();
  anger.position.set(0.42, HC + 0.72, 0.3);
  anger.scale.setScalar(0.001);
  head.add(anger);

  return {
    root, body, hips, skirt, torso, head, hairLong, bow, anger, face, mats,
    legL, legR, armL: L.arm, elbowL: L.elbow, armR: R.arm, elbowR: R.elbow,
  };
}

// Bạn thú bông tròn trong tranh: mũ nồi, cổ bèo, ba trái tim trên bụng
export function createCompanion() {
  const mats = {
    white: toon(0xffffff),
    rose: toon(PALETTE.rose, {}, 0.8),
    roseDark: new THREE.MeshBasicMaterial({ color: PALETTE.roseDark }),
    pale: toon(PALETTE.pale, {}, 0.3),
    ink: new THREE.MeshBasicMaterial({ color: PALETTE.ink }),
  };
  const g = new THREE.Group();
  const belly = part(new THREE.SphereGeometry(0.21, 20, 16), mats.white);
  belly.scale.y = 1.12;
  belly.position.y = -0.2;
  const head = part(new THREE.SphereGeometry(0.27, 24, 18), mats.white);
  head.scale.set(1.08, 0.95, 1);
  head.position.y = 0.14;
  g.add(belly, head);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mats.ink);
    eye.position.set(s * 0.1, 0.15, 0.255);
    g.add(eye);
    // vạch mặt cáo từ mũi lên trán
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.085, 0.272),
      new THREE.Vector3(s * 0.05, 0.2, 0.262),
      new THREE.Vector3(s * 0.15, 0.31, 0.19),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.006, 5), mats.ink));
    const paw = part(new THREE.SphereGeometry(0.06, 10, 8), mats.white, 0.01);
    paw.position.set(s * 0.21, -0.12, 0.06);
    g.add(paw);
    const foot = part(new THREE.SphereGeometry(0.065, 10, 8), mats.white, 0.01);
    foot.position.set(s * 0.1, -0.42, 0.05);
    g.add(foot);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mats.ink);
  nose.position.set(0, 0.08, 0.268);
  g.add(nose);

  for (let i = 0; i < 10; i++) { // cổ bèo
    const a = (i / 10) * Math.PI * 2;
    const f = part(new THREE.SphereGeometry(0.055, 8, 8), mats.pale, 0.01);
    f.position.set(Math.sin(a) * 0.17, -0.07, Math.cos(a) * 0.17);
    f.scale.y = 0.6;
    g.add(f);
  }
  const heartGeo = heartGeometry(0.028);
  [[0, -0.14], [-0.035, -0.22], [0.03, -0.3]].forEach(([x, y], i) => {
    const h = new THREE.Mesh(heartGeo, mats.rose);
    const zz = 0.21 * Math.sqrt(Math.max(0, 1 - ((y + 0.2) / 0.235) ** 2)) - 0.004;
    h.position.set(x, y, zz);
    h.rotation.z = (i - 1) * 0.2;
    g.add(h);
  });

  const beret = part(new THREE.SphereGeometry(0.2, 18, 12), mats.pale, 0.012);
  beret.scale.set(1.15, 0.42, 1.05);
  beret.position.set(0.05, 0.39, 0);
  beret.rotation.z = -0.25;
  g.add(beret);
  const hatRose = makeRose(0.06, mats);
  hatRose.position.set(0.08, 0.44, 0.1);
  aim(hatRose, 0.2, 0.8, 0.6);
  g.add(hatRose);
  const pom = part(new THREE.SphereGeometry(0.06, 10, 8), mats.rose, 0.01);
  pom.position.set(-0.27, -0.3, 0);
  g.add(pom);

  return g;
}
