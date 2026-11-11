// Trang xem thử một gói nhân vật: đủ ba kiểu hiển thị và mọi hành động.
// Dùng để kiểm tra gói trước khi gán cho người dùng (skill tao-nhan-vat chụp ảnh từ trang này).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Rig, loadCharacter } from './rig/rig.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3eedb');
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd6f5, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 9, 6);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(1.1, 1.7, 4.9);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1, 0);
controls.enablePan = false;
const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshBasicMaterial({ color: '#ebe5cd' }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const shared = { uLight: { value: new THREE.Vector3() }, uPx: { value: 1 }, uBoil: { value: 0 } };
const LIGHT = new THREE.Vector3(4, 9, 6).normalize();
const LABEL = { idle: '🧍 Đứng', walk: '🚶 Đi', run: '🏃 Chạy', jump: '🤸 Nhảy', talk: '💬 Nói', laugh: '😆 Cười', wave: '👋 Chào', cry: '😭 Khóc', blink: '😉 Chớp mắt', angry: '😡 Giận' };
const MODE = { flat: '✏️ Nét vẽ', sketch: '🧊 3D', color: '🎨 3D tô màu' };
const q = new URLSearchParams(location.search);
const s = { x: 0, z: 0, y: 0, vy: 0, speed: 0, phase: 0, heading: 0, action: 'idle' };
let rig = null, action = q.get('action') || 'idle';

function setAction(a) {
  if (a === 'blink') { rig?.blink(); return; }
  if (a === 'jump') { if (s.y === 0) s.vy = 5.4; return; }
  action = a;
  for (const b of $('acts').children) b.classList.toggle('active', b.dataset.a === a);
}
function setMode(m) {
  rig.setMode(m);
  for (const b of $('modes').children) b.classList.toggle('active', b.dataset.m === rig.mode);
}

loadCharacter(q.get('id') || 'queen-of-white').then((pkg) => {
  rig = new Rig(pkg, shared);
  scene.add(rig.group);
  $('title').textContent = `${pkg.meta.title} · ${pkg.meta.id}`;
  for (const m of rig.modes) { const b = document.createElement('button'); b.type = 'button'; b.dataset.m = m; b.textContent = MODE[m]; b.onclick = () => setMode(m); $('modes').append(b); }
  for (const a of Object.keys(LABEL)) { const b = document.createElement('button'); b.type = 'button'; b.dataset.a = a; b.textContent = LABEL[a]; b.onclick = () => setAction(a); $('acts').append(b); }
  setMode(q.get('mode') || rig.modes[0]);
  setAction(action);
  window.viewer = { rig, setMode, setAction, ready: true };
}).catch((e) => { $('title').textContent = e.message; window.viewer = { error: e.message }; });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 54 : 40; camera.updateProjectionMatrix(); }
  if (rig) {
    const moving = action === 'walk' || action === 'run';
    const want = action === 'run' ? 3.7 : action === 'walk' ? 1.35 : 0;
    s.speed += (want - s.speed) * (1 - Math.exp(-dt * 8));
    if (moving) s.heading += dt * (want / 2.4); else s.heading = Math.atan2(camera.position.x, camera.position.z) * 0.6; // đứng yên: quay về phía người xem
    s.phase += dt * s.speed * (action === 'run' ? 2.7 : 4.6);
    if (s.y > 0 || s.vy > 0) { s.vy -= 15 * dt; s.y = Math.max(0, s.y + s.vy * dt); if (s.y === 0) s.vy = 0; }
    s.action = s.y > 0 ? 'jump' : moving && s.speed > 2.5 ? 'run' : moving ? 'walk' : action;
    shared.uPx.value = pr;
    shared.uBoil.value = Math.floor(t * 8) * 1.7;
    shared.uLight.value.copy(LIGHT).transformDirection(camera.matrixWorldInverse);
    rig.update(dt, t, s, { camera, width: canvas.width, height: canvas.height });
  }
  controls.update();
  renderer.render(scene, camera);
});
