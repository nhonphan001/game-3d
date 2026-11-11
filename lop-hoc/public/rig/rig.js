// Bộ xương + chuyển động dùng chung cho mọi "gói nhân vật" (thư mục characters/<id>/).
// Một Rig giữ cả ba kiểu hiển thị của một nhân vật:
//   flat   – con rối giấy từ nét vẽ gốc (doll.js)
//   sketch – mô hình 3D nét bút bi        color – mô hình 3D tô màu
// và các hành động: idle, walk, run, jump, talk, laugh, wave, cry, angry (+ tự chớp mắt).
import * as THREE from 'three';
import { createKit } from './kit.js';
import { createDoll } from './doll.js';

export const ACTIONS = ['idle', 'walk', 'run', 'jump', 'talk', 'laugh', 'wave', 'cry', 'angry'];
let curVy = 0; // vận tốc nhảy của nhân vật đang được tính tư thế

const REST = {
  hipY: 0, hipRX: 0, hipRZ: 0, torsoRX: 0, torsoRY: 0, torsoRZ: 0,
  headRX: 0, headRY: 0, headRZ: 0,
  aLX: 0, aLZ: 0.24, eLX: -0.12, eLZ: 0,
  aRX: 0, aRZ: -0.24, eRX: -0.12, eRZ: 0,
  lLX: 0, lRX: 0,
};

// Tư thế mục tiêu cho từng hành động (tính theo thời gian t và pha bước chân p)
function targetPose(action, t, p) {
  const P = { ...REST };
  const s = Math.sin, abs = Math.abs;
  switch (action) {
    case 'idle':
      P.hipY = s(t * 2) * 0.006;
      P.headRZ = s(t * 0.8) * 0.04;
      P.headRY = s(t * 0.5) * 0.08;
      P.aLZ += s(t * 2) * 0.02; P.aRZ -= s(t * 2) * 0.02;
      break;
    case 'walk':
      P.lLX = -s(p) * 0.55; P.lRX = s(p) * 0.55;
      P.aLX = s(p) * 0.5; P.aRX = -s(p) * 0.5;
      P.eLX = -0.25; P.eRX = -0.25;
      P.hipY = abs(Math.cos(p)) * 0.03;
      P.hipRZ = s(p) * 0.04; P.headRZ = -s(p) * 0.03;
      P.torsoRX = 0.04; P.torsoRY = s(p) * 0.08;
      break;
    case 'run':
      P.lLX = -s(p) * 1.0; P.lRX = s(p) * 1.0;
      P.aLX = s(p) * 1.0; P.aRX = -s(p) * 1.0;
      P.aLZ = 0.35; P.aRZ = -0.35;
      P.eLX = -1.5; P.eRX = -1.5;
      P.hipY = abs(Math.cos(p)) * 0.08;
      P.hipRX = 0.12; P.torsoRX = 0.18; P.headRX = -0.15;
      P.torsoRY = s(p) * 0.14;
      break;
    case 'jump': {
      const up = curVy > 0;
      P.aLZ = up ? 2.7 : 1.7; P.aRZ = up ? -2.7 : -1.7;
      P.eLX = -0.2; P.eRX = -0.2;
      P.lLX = up ? -0.7 : -0.15; P.lRX = up ? 0.35 : 0.15;
      P.headRX = up ? -0.25 : 0.1;
      P.torsoRX = up ? -0.08 : 0.08;
      break;
    }
    case 'talk':
      P.headRX = s(t * 5) * 0.05; P.headRZ = s(t * 2.3) * 0.07;
      P.aRX = -0.75; P.aRZ = -0.3; P.eRX = -1.3 + s(t * 4.5) * 0.3; P.eRZ = s(t * 3) * 0.2;
      P.aLX = -0.2 + s(t * 3.1) * 0.1; P.eLX = -0.6;
      P.torsoRY = s(t * 1.7) * 0.06;
      break;
    case 'laugh':
      P.hipY = abs(s(t * 11)) * 0.035;
      P.torsoRX = -0.14 + s(t * 11) * 0.03; P.headRX = -0.22; P.headRZ = s(t * 3) * 0.08;
      P.aRX = -1.15; P.aRZ = 0.3; P.eRX = -2.1;
      P.aLX = -0.45; P.aLZ = -0.2; P.eLX = -1.5;
      break;
    case 'wave':
      P.aRZ = -2.0; P.aRX = 0; P.eRX = 0; P.eRZ = -0.5 + s(t * 10) * 0.45;
      P.aLZ = 0.5; P.eLX = -0.2; P.eLZ = -0.9;
      P.headRZ = -0.14; P.torsoRZ = -0.06;
      P.hipY = abs(s(t * 5)) * 0.015;
      break;
    case 'cry':
      P.headRX = 0.3; P.torsoRX = 0.12; P.hipY = s(t * 17) * 0.008;
      P.torsoRZ = s(t * 2.2) * 0.03;
      P.aLX = -1.25; P.aLZ = -0.3; P.eLX = -2.15 + s(t * 6) * 0.08;
      P.aRX = -1.25; P.aRZ = 0.3; P.eRX = -2.15 - s(t * 6) * 0.08;
      P.lLX = 0.05; P.lRX = 0.05;
      break;
    case 'angry': {
      const stomp = Math.max(0, s(t * 9));
      P.aLZ = 0.55; P.aRZ = -0.55; P.aLX = 0.3; P.aRX = 0.3; P.eLX = 0; P.eRX = 0;
      P.torsoRX = 0.14; P.headRX = 0.1; P.headRZ = s(t * 30) * 0.02;
      P.lRX = -stomp * 0.7;
      P.hipY = -0.01 + stomp * 0.012;
      P.hipRZ = s(t * 30) * 0.012;
      break;
    }
  }
  return P;
}

function targetFace(action, t) {
  const s = Math.sin;
  switch (action) {
    case 'run': return { mouthOpen: 0.3, smile: 0.7 };
    case 'jump': return { mouthOpen: 0.6, smile: 0.9, blush: 0.7 };
    case 'talk': return { mouthOpen: 0.12 + 0.6 * Math.abs(s(t * 11)) * (0.6 + 0.4 * s(t * 3.7)), smile: 0.3 };
    case 'laugh': return { happy: 1, mouthOpen: 0.8 + 0.2 * s(t * 14), smile: 1, blush: 1 };
    case 'wave': return { mouthOpen: 0.4, smile: 0.9, blush: 0.8 };
    case 'cry': return { eyeOpen: 0, brow: -1, tears: 1, mouthOpen: 0.5 + 0.2 * s(t * 7), smile: -1, blush: 0.9 };
    case 'angry': return { angry: 1, brow: 1, mouthOpen: s(t * 3) > 0.2 ? 0.55 : 0.0, smile: -1, blush: 0.9 };
    default: return {};
  }
}


const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

// Nạp một gói nhân vật: character.json + model.js (nếu có)
export async function loadCharacter(id, root = new URL('../characters/', import.meta.url).href) {
  const base = `${root}${id}/`;
  const res = await fetch(`${base}character.json`);
  if (!res.ok) throw new Error(`Không tìm thấy nhân vật ${id}`);
  const meta = await res.json();
  const mod = meta.model ? await import(`${base}${meta.model}`) : null;
  return { meta, mod, base };
}

export class Rig {
  // shared: { uLight, uPx, uBoil } dùng chung cả cảnh
  constructor({ meta, mod, base }, shared = {}) {
    this.meta = meta;
    this.height = meta.height || 1.8;
    this.group = new THREE.Group(); // đặt ở gốc toạ độ thế giới; các phần tự định vị
    this.kit = createKit(shared);
    this.pose = { ...REST };
    this.heading = 0; this.flipTo = 1; this.landT = 1; this.wasAir = false;
    this.blinkT = -1; this.blinks = 0; this.nextBlink = 1 + Math.random() * 3;
    if (mod?.createCharacter) {
      this.ch = mod.createCharacter(this.kit);
      this.group.add(this.ch.root);
      this.face = this.ch.face;
      if (mod.createCompanion) { this.pal = mod.createCompanion(this.kit); this.group.add(this.pal); }
    }
    if (!this.face) this.face = new this.kit.Face(); // không có mô hình 3D: vẫn dùng bộ tham số biểu cảm
    if (meta.doll) {
      this.doll = createDoll(meta, base);
      this.group.add(this.doll.root);
      if (this.doll.companion) this.group.add(this.doll.companion);
      this.dollAnger = this.kit.angerSprite();
      this.dollAnger.renderOrder = 5;
      this.doll.anger.add(this.dollAnger);
    }
    this.palPos = new THREE.Vector3(0.9, 1.3, -0.5);
    this.modes = [this.doll && 'flat', this.ch && 'sketch', this.ch && 'color'].filter(Boolean);
    this.setMode(this.modes[0]);
  }

  setMode(mode) {
    if (!this.modes.includes(mode)) mode = this.modes[0];
    this.mode = mode;
    const is3d = mode !== 'flat';
    if (this.ch) this.ch.root.visible = is3d;
    if (this.pal) this.pal.visible = is3d;
    if (this.doll) { this.doll.root.visible = !is3d; if (this.doll.companion) this.doll.companion.visible = !is3d; }
    this.kit.setSketch(mode !== 'color');
    this.face.sketch = mode !== 'color';
  }

  blink() { this.blinkT = 0; this.blinks = 2; }

  // s: { x, z, y, vy, speed, phase, heading, action }; view: { camera, width, height } (kích thước canvas theo điểm ảnh thật)
  update(dt, t, s, view) {
    const { camera } = view, action = s.action, pose = this.pose, sn = Math.sin;
    const air = s.y > 0 ? s.vy : 0;
    if (s.y > 0) this.wasAir = true; else if (this.wasAir) { this.wasAir = false; this.landT = 0; }
    this.landT += dt;
    this.heading = lerpAngle(this.heading, s.heading, 1 - Math.exp(-dt * 12));

    curVy = s.vy;
    const target = targetPose(action, t, s.phase), k = 1 - Math.exp(-dt * 16);
    for (const key in pose) pose[key] += (target[key] - pose[key]) * k;
    const squash = s.y > 0 ? THREE.MathUtils.clamp(s.vy * 0.02, -0.06, 0.1) : Math.exp(-this.landT * 9) * sn(this.landT * 22) * -0.16;
    const shake = action === 'angry' ? sn(t * 45) * 0.012 : 0;

    // chớp mắt + biểu cảm
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blinkT = 0; this.blinks = Math.random() < 0.2 ? 2 : 1; this.nextBlink = 2 + Math.random() * 3.5; }
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const BL = 0.16;
      lid = Math.abs(Math.cos((Math.min(this.blinkT, BL) / BL) * Math.PI));
      if (this.blinkT >= BL) { this.blinks -= 1; this.blinkT = this.blinks > 0 ? 0 : -1; }
    }
    const face = this.face;
    face.approach(targetFace(action, t), 1 - Math.exp(-dt * 14));

    const ch = this.ch;
    if (ch && this.mode !== 'flat') {
      face.draw(t, lid);
      ch.root.position.set(s.x + shake, s.y, s.z);
      ch.root.rotation.y = this.heading;
      ch.body.position.y = pose.hipY;
      ch.body.scale.set(1 - squash * 0.6, 1 + squash, 1 - squash * 0.6);
      ch.hips.rotation.set(pose.hipRX, 0, pose.hipRZ);
      ch.torso.rotation.set(pose.torsoRX, pose.torsoRY, pose.torsoRZ);
      ch.head.rotation.set(pose.headRX, pose.headRY, pose.headRZ);
      ch.armL.rotation.set(pose.aLX, 0, pose.aLZ);
      ch.armR.rotation.set(pose.aRX, 0, pose.aRZ);
      ch.elbowL.rotation.set(pose.eLX, 0, pose.eLZ);
      ch.elbowR.rotation.set(pose.eRX, 0, pose.eRZ);
      ch.legL.rotation.x = pose.lLX;
      ch.legR.rotation.x = pose.lRX;
      const mv = Math.min(1, s.speed);
      if (ch.skirt) { // váy, tóc, nơ đung đưa theo chuyển động (các phần này là tuỳ chọn)
        ch.skirt.rotation.x = -s.speed * 0.035 + sn(s.phase * 2) * 0.02 * mv;
        ch.skirt.scale.set(1 - air * 0.02, 1 + air * 0.015, 1 - air * 0.02);
      }
      if (ch.hairLong) {
        ch.hairLong.rotation.x = -pose.headRX * 0.7 - pose.torsoRX * 0.6 + s.speed * 0.07 - air * 0.04 + sn(t * 1.6) * 0.015;
        ch.hairLong.rotation.z = -pose.headRZ * 0.6 + sn(s.phase) * 0.03 * mv;
      }
      if (ch.bow) { ch.bow.rotation.x = -air * 0.03 + sn(s.phase * 2) * 0.03 * mv; ch.bow.scale.y = 1 + sn(t * 2) * 0.02; }
      if (ch.anger) ch.anger.scale.setScalar(Math.max(0.001, face.v.angry * (0.26 + sn(t * 12) * 0.04)));
      // điểm neo nét gạch bám theo nhân vật trên màn hình
      tmp.set(s.x, 0.9, s.z).project(camera);
      this.kit.sketch.uAnchor.value.set((tmp.x * 0.5 + 0.5) * view.width, (tmp.y * 0.5 + 0.5) * view.height);
    }

    // bạn đồng hành bay theo sau
    const off = tmp.set(0.85, 0, -0.55).applyAxisAngle(UP, this.heading);
    const bob = action === 'laugh' ? Math.abs(sn(t * 11)) * 0.15 : sn(t * 2.2) * 0.07;
    const pk = 1 - Math.exp(-dt * 3.5), pp = this.palPos;
    if (!this.palInit) { pp.set(s.x + off.x, 1.25, s.z + off.z); this.palInit = true; }
    pp.x += (s.x + off.x - pp.x) * pk;
    pp.z += (s.z + off.z - pp.z) * pk;
    pp.y += (1.25 + s.y * 0.6 + bob - pp.y) * (1 - Math.exp(-dt * 6));
    if (this.pal && this.mode !== 'flat') {
      this.pal.position.copy(pp);
      this.pal.rotation.y = lerpAngle(this.pal.rotation.y, this.heading - 0.35, pk);
      this.pal.rotation.z = sn(t * 1.7) * 0.08 + (action === 'angry' ? sn(t * 30) * 0.04 : 0);
      this.pal.rotation.x = action === 'cry' ? 0.3 : 0;
    }

    const doll = this.doll;
    if (doll && this.mode === 'flat') { // con rối giấy: luôn quay mặt về camera, lật theo hướng đi
      const moving = Math.min(1, s.speed / 1.35), run = action === 'run' ? 1 : 0;
      const billboard = Math.atan2(camera.position.x - s.x, camera.position.z - s.z);
      doll.root.position.set(s.x + shake, s.y + pose.hipY * 1.5, s.z);
      doll.root.rotation.y = billboard;
      if (s.speed > 0.2) {
        camera.getWorldDirection(fwd);
        const side = sn(s.heading) * -fwd.z + Math.cos(s.heading) * fwd.x;
        if (Math.abs(side) > 0.25) this.flipTo = side > 0 ? 1 : -1;
      }
      doll.flip.scale.x += (this.flipTo - doll.flip.scale.x) * (1 - Math.exp(-dt * 14));
      let bz = sn(s.phase) * 0.07 * moving - run * 0.1 + sn(t * 1.6) * 0.012, hz = sn(s.phase - 0.7) * 0.08 * moving + sn(t * 0.9) * 0.03;
      if (action === 'jump') { bz = s.vy * 0.012; hz = -s.vy * 0.02; }
      if (action === 'talk') hz = sn(t * 5) * 0.06;
      if (action === 'laugh') { bz = sn(t * 11) * 0.03; hz = -0.12 + sn(t * 11) * 0.05; }
      if (action === 'wave') { bz = -0.06 + sn(t * 5) * 0.03; hz = 0.12; }
      if (action === 'cry') { bz = sn(t * 17) * 0.012; hz = 0.14 + sn(t * 8) * 0.02; }
      if (action === 'angry') { bz = sn(t * 40) * 0.02; hz = -0.06 + sn(t * 30) * 0.02; }
      const dk = 1 - Math.exp(-dt * 14);
      doll.body.rotation.z += (bz - doll.body.rotation.z) * dk;
      if (doll.head) doll.head.rotation.z += (hz - doll.head.rotation.z) * dk;
      doll.body.scale.set(1 - squash * 0.6, (1 + squash) * (1 + sn(t * 2) * 0.012), 1);
      doll.hand.visible = action === 'wave';
      doll.hand.rotation.z = -0.5 + sn(t * 10) * 0.45;
      const f = face.v;
      doll.drawFace({ closed: lid < 0.5 || f.eyeOpen < 0.4 ? 1 : 0, happy: f.happy, angry: f.angry, mouth: f.mouthOpen, tears: f.tears }, t);
      this.dollAnger.scale.setScalar(Math.max(0.001, f.angry * (0.3 + sn(t * 12) * 0.04)));
      if (doll.companion) {
        doll.companion.position.copy(pp);
        doll.companion.position.y += 0.1;
        doll.companion.rotation.y = billboard;
        doll.companion.rotation.z = sn(t * 1.7) * 0.1 + (action === 'angry' ? sn(t * 30) * 0.04 : 0);
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (m) { for (const x of Array.isArray(m) ? m : [m]) { x.map?.dispose(); x.dispose(); } }
    });
    this.group.removeFromParent();
  }
}
