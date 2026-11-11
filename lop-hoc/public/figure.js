// Dựng hình nhân vật từ một ảnh đã tách nền, theo ba kiểu:
//   flat   – "Nét vẽ": tấm cắt giấy phẳng
//   sketch – "3D": hình được bơm phồng thành khối, giữ nét vẽ gốc, tô bóng bằng nét gạch
//   color  – "3D tô màu": khối 3D, các vùng giấy kín được tự tô màu
import * as THREE from 'three';

export const STYLES = ['flat', 'sketch', 'color'];
const PALETTE = ['#ffd3df', '#cde6ff', '#d6f3cb', '#fff0b0', '#e3d6ff', '#ffd9bd', '#c4efea', '#ffc9c9'];
const SKIN = '#ffe6d5';

function toCanvas(src) {
  if (src instanceof HTMLCanvasElement) return src;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth || src.width; c.height = src.naturalHeight || src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// Phân tích ảnh: màu giấy, màu mực chủ đạo, điểm nào là "giấy"
function analyse(cv) {
  const w = cv.width, h = cv.height;
  const px = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const opaque = [];
  for (let p = 0; p < w * h; p += 3) if (px[p * 4 + 3] > 128) opaque.push(p * 4);
  const lum = (i) => px[i] + px[i + 1] + px[i + 2];
  opaque.sort((a, b) => lum(b) - lum(a));
  const bright = opaque.slice(0, Math.max(1, opaque.length >> 1));
  const paper = [0, 1, 2].map((k) => bright.map((i) => px[i + k]).sort((a, b) => a - b)[bright.length >> 1] ?? 245);
  const paperLike = new Uint8Array(w * h);
  const ink = [0, 0, 0];
  let inkN = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (px[i + 3] <= 128) continue;
    const d = Math.abs(px[i] - paper[0]) + Math.abs(px[i + 1] - paper[1]) + Math.abs(px[i + 2] - paper[2]);
    if (d < 70) paperLike[p] = 1;
    else if (d > 150) { ink[0] += px[i]; ink[1] += px[i + 1]; ink[2] += px[i + 2]; inkN++; }
  }
  const inkColor = inkN ? new THREE.Color(ink[0] / inkN / 255, ink[1] / inkN / 255, ink[2] / inkN / 255) : new THREE.Color(0x2434b4);
  inkColor.convertSRGBToLinear();
  return { w, h, px, paper, paperLike, inkColor };
}

// Tự tô màu: mỗi vùng giấy kín trong nét vẽ nhận một màu; vùng lớn ở phần trên coi là da mặt
export function colorize(src, seed = 0) {
  const cv = toCanvas(src), { w, h, px, paper, paperLike } = analyse(cv);
  const lab = new Int32Array(w * h), regions = [], stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!paperLike[s] || lab[s]) continue;
    const id = regions.length + 1;
    let n = 0, sy = 0;
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      n++; sy += y;
      if (x > 0 && paperLike[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && paperLike[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && paperLike[p - w] && !lab[p - w]) { lab[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && paperLike[p + w] && !lab[p + w]) { lab[p + w] = id; stack.push(p + w); }
    }
    regions.push({ id, n, cy: sy / n / h });
  }
  const total = w * h, byArea = [...regions].sort((a, b) => b.n - a.n);
  const skin = byArea.find((r) => r.cy < 0.45 && r.n > total * 0.02);
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const fill = new Map();
  let k = seed;
  for (const r of byArea) {
    if (r === skin) fill.set(r.id, rgb(SKIN));
    else if (r.n < total * 0.0015) fill.set(r.id, [255, 255, 255]);
    else fill.set(r.id, rgb(PALETTE[k++ % PALETTE.length]));
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d'), id = g.createImageData(w, h), o = id.data;
  const pl = (paper[0] + paper[1] + paper[2]) / 3;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    o[i + 3] = px[i + 3];
    if (lab[p]) { // giữ lại chút sắc độ của giấy để màu không bị phẳng lì
      const c = fill.get(lab[p]), s = Math.min(1.05, ((px[i] + px[i + 1] + px[i + 2]) / 3) / pl);
      o[i] = c[0] * s; o[i + 1] = c[1] * s; o[i + 2] = c[2] * s;
    } else { o[i] = px[i]; o[i + 1] = px[i + 1]; o[i + 2] = px[i + 2]; }
  }
  g.putImageData(id, 0, 0);
  return out;
}

// Bơm phồng hình cắt thành khối: càng xa mép càng dày, bo tròn như quả bóng
function inflate(cv, W, H) {
  const LONG = 96, a = cv.width / cv.height;
  const gw = Math.max(8, Math.round(a >= 1 ? LONG : LONG * a)), gh = Math.max(8, Math.round(a >= 1 ? LONG / a : LONG));
  const nw = gw + 2, nh = gh + 2; // thêm một ô đệm quanh hình
  const small = document.createElement('canvas');
  small.width = nw; small.height = nh;
  const sg = small.getContext('2d', { willReadFrequently: true });
  sg.drawImage(cv, 1, 1, gw, gh);
  const al = sg.getImageData(0, 0, nw, nh).data;
  const d = new Float32Array(nw * nh), INF = 1e6;
  for (let p = 0; p < nw * nh; p++) d[p] = al[p * 4 + 3] > 100 ? INF : 0;
  const relax = (p, q, c) => { if (d[q] + c < d[p]) d[p] = d[q] + c; };
  for (let y = 1; y < nh - 1; y++) for (let x = 1; x < nw - 1; x++) {
    const p = y * nw + x;
    if (d[p]) { relax(p, p - 1, 1); relax(p, p - nw, 1); relax(p, p - nw - 1, 1.414); relax(p, p - nw + 1, 1.414); }
  }
  let maxD = 0;
  for (let y = nh - 2; y > 0; y--) for (let x = nw - 2; x > 0; x--) {
    const p = y * nw + x;
    if (d[p]) { relax(p, p + 1, 1); relax(p, p + nw, 1); relax(p, p + nw + 1, 1.414); relax(p, p + nw - 1, 1.414); if (d[p] > maxD) maxD = d[p]; }
  }
  const R = Math.max(2.5, maxD * 0.6);
  let hgt = new Float32Array(nw * nh);
  for (let p = 0; p < nw * nh; p++) { const t = Math.min(d[p] / R, 1); hgt[p] = Math.sqrt(1 - (1 - t) * (1 - t)); }
  for (let pass = 0; pass < 2; pass++) { // làm mịn
    const nx = new Float32Array(nw * nh);
    for (let y = 1; y < nh - 1; y++) for (let x = 1; x < nw - 1; x++) {
      const p = y * nw + x;
      if (d[p]) nx[p] = (hgt[p] * 4 + hgt[p - 1] + hgt[p + 1] + hgt[p - nw] + hgt[p + nw]) / 8;
    }
    hgt = nx;
  }
  const cell = W / gw, T = Math.min(R * cell * 0.85, W * 0.3);
  const pos = [], uv = [], idx = [], N = nw * nh;
  for (const side of [1, -1]) for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const u = (x - 0.5) / gw, v = 1 - (y - 0.5) / gh;
    pos.push((u - 0.5) * W, v * H, side * hgt[y * nw + x] * T);
    uv.push(u, v);
  }
  for (let y = 0; y < nh - 1; y++) for (let x = 0; x < nw - 1; x++) {
    const p = y * nw + x, q = p + 1, r = p + nw, s = r + 1;
    if (!(d[p] || d[q] || d[r] || d[s])) continue;
    idx.push(p, r, q, q, r, s);                         // mặt trước
    idx.push(N + p, N + q, N + r, N + q, N + s, N + r); // mặt sau
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const VERT = `
varying vec2 vUv; varying vec3 vN;
void main() { vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
uniform sampler2D map; uniform vec3 uLight; uniform vec3 uInk; uniform float uMode; uniform float uPx;
varying vec2 vUv; varying vec3 vN;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float hatch(vec2 p, float ang, float sp) {
  vec2 d = vec2(cos(ang), sin(ang));
  float t = dot(p, vec2(-d.y, d.x)) + sin(dot(p, d) * 0.07 + ang * 9.) * 1.3 + (noise(p * 0.08) - 0.5) * 2.5;
  float f = abs(fract(t / sp) - 0.5) * sp;
  return 1. - smoothstep(0.55, 1.45, f);
}
void main() {
  if (vUv.x < 0. || vUv.x > 1. || vUv.y < 0. || vUv.y > 1.) discard;
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.35) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndl = dot(n, uLight);
  vec3 col = t.rgb;
  if (uMode < 0.5) { // nét gạch bút ở chỗ khuất sáng
    float dark = 1. - smoothstep(-0.25, 0.55, ndl);
    vec2 p = gl_FragCoord.xy / uPx;
    float a = hatch(p, 0.8, 6.) * smoothstep(0.3, 0.5, dark);
    a = max(a, hatch(p, 2.0, 7.) * smoothstep(0.72, 0.9, dark));
    col = mix(col, uInk, a * 0.7);
  } else {           // tô bóng hai mức kiểu hoạt hình
    col *= mix(0.74, 1.0, smoothstep(0.0, 0.08, ndl));
    col += 0.05 * smoothstep(0.85, 0.97, ndl);
  }
  col = mix(col, uInk, smoothstep(0.78, 0.93, 1. - abs(n.z)) * 0.8); // viền ở rìa khối
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
}`;

// shared: { uLight: {value: Vector3 (hướng sáng trong hệ camera)}, uPx: {value: tỉ lệ điểm ảnh} }
export function makeFigure(src, style, seed, shared, maxH = 1.5, maxW = 2.1) {
  const cv = toCanvas(src), a = cv.width / cv.height;
  const W = Math.min(maxW, maxH * a), H = W / a;
  const img = style === 'color' ? colorize(cv, seed) : cv;
  const tex = new THREE.CanvasTexture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let mesh;
  if (style === 'flat') {
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide }));
    mesh.position.y = H / 2;
  } else {
    mesh = new THREE.Mesh(inflate(cv, W, H), new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: { map: { value: tex }, uInk: { value: analyse(cv).inkColor }, uMode: { value: style === 'color' ? 1 : 0 }, uLight: shared.uLight, uPx: shared.uPx },
    }));
  }
  return { mesh, width: W, height: H, flat: style === 'flat', dispose() { mesh.geometry.dispose(); mesh.material.dispose(); tex.dispose(); } };
}
