// Bộ đồ nghề dùng chung để dựng nhân vật 3D: vật liệu nét bút bi / tô màu, nét viền,
// và các hàm tạo hình (khối có viền, sợi tóc, hoa hồng, tầng váy...). Mỗi nhân vật có một bộ riêng
// (createKit) để mỗi người trong lớp tự chọn kiểu hiển thị mà không ảnh hưởng người khác.
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

// shared: các tham số chung của cả cảnh { uLight, uPx, uBoil } (đối tượng { value })
export function createKit(shared = {}) {
  const sketch = {
    uSketch: { value: 1 },
    uPaper: { value: new THREE.Color(0xf3eedb) },
    uInkCol: { value: new THREE.Color(0x2434b4) },
    uLight: shared.uLight || { value: new THREE.Vector3(0.4, 0.7, 0.6) },
    uAnchor: { value: new THREE.Vector2() },
    uBoil: shared.uBoil || { value: 0 },
    uPx: shared.uPx || { value: 1 },
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
const toon = (color, extra = {}, ink = -1, ang = 0.8) => {
  const m = new THREE.MeshToonMaterial({ color, ...extra });
  m.userData = { ink, ang };
  m.onBeforeCompile = sketchPatch;
  return m;
};
// Nét viền: vỏ ngược, rung nhẹ như nét tay khi ở chế độ bút bi
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2434b4, side: THREE.BackSide });
outlineMat.onBeforeCompile = (shader) => {
  shader.uniforms.uSketch = sketch.uSketch;
  shader.uniforms.uBoil = sketch.uBoil;
  shader.vertexShader = 'uniform float uSketch; uniform float uBoil;\n' + shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n transformed += normal * (sin(position.x*31.+uBoil*5.)+sin(position.y*27.+uBoil*3.)+sin(position.z*35.+uBoil))*0.0035*uSketch;');
};
function setSketch(on) {
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
function makeRose(r, mats) {
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


  return { THREE, Face, PALETTE, sketch, toon, outlineMat, setSketch, part, aim, checkerTexture, makeRose, heartGeometry, angerSprite, strand, zigzagGeometry, stripeTexture, lathe };
}
