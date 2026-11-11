// Khuôn mặt vẽ bằng canvas 2D rồi dán lên đầu nhân vật.
// Mọi biểu cảm (chớp mắt, cười, khóc, giận...) đều là các tham số số học
// nên có thể chuyển mượt từ biểu cảm này sang biểu cảm khác.
import * as THREE from 'three';

let INK = '#2434b4';
const PAPER = '#f3eedb';
const SIZE = 512;

export const FACE_DEFAULT = {
  eyeOpen: 1,   // 0 = nhắm, 1 = mở
  happy: 0,     // > 0.5: mắt cười ^ ^
  angry: 0,     // mí mắt xếch xuống
  brow: 0,      // -1 buồn ... +1 giận
  mouthOpen: 0, // 0..1
  smile: 0.35,  // -1 mếu ... +1 cười
  blush: 0.5,
  tears: 0,
};

export class Face {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.v = { ...FACE_DEFAULT };
    this._key = '';
    this.sketch = true; // nét bút bi: chỉ mực xanh trên giấy
    this.draw(0);
  }

  // Tiến dần các tham số về phía mục tiêu
  approach(target, k) {
    for (const key in this.v) {
      const t = target[key] ?? FACE_DEFAULT[key];
      this.v[key] += (t - this.v[key]) * k;
    }
  }

  draw(time, blink = 1) {
    const v = this.v;
    const open = v.eyeOpen * blink;
    const key = [open, v.happy, v.angry, v.brow, v.mouthOpen, v.smile, v.blush, v.tears]
      .map((n) => n.toFixed(2)).join('|') + (v.tears > 0.02 ? '|' + Math.floor(time * 30) : '') + (this.sketch ? '|s' + Math.floor(time * 6) : '|c');
    if (key === this._key) return;
    this._key = key;

    const c = this.ctx;
    INK = this.sketch ? '#2434b4' : '#1b2350';
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, SIZE, SIZE);
    // nét tay hơi run: lệch nhẹ mỗi lần vẽ lại
    if (this.sketch) c.setTransform(1, (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.012, 1, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    this._blush(c, v);
    for (const s of [-1, 1]) this._eye(c, 256 + s * 108, 310, s, open, v);
    this._mouth(c, v);
    if (v.tears > 0.02) for (const s of [-1, 1]) this._tears(c, 256 + s * 108, 310, s, v.tears, time);

    this.texture.needsUpdate = true;
  }

  _blush(c, v) {
    if (v.blush < 0.02) return;
    const red = v.angry > 0.5;
    for (const s of [-1, 1]) {
      const x = 256 + s * 158, y = 392;
      if (!this.sketch) {
        const g = c.createRadialGradient(x, y, 2, x, y, 46);
        g.addColorStop(0, red ? `rgba(255,90,90,${0.6 * v.blush})` : `rgba(255,140,170,${0.55 * v.blush})`);
        g.addColorStop(1, 'rgba(255,140,170,0)');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(x, y, 50, 32, 0, 0, Math.PI * 2);
        c.fill();
      }
      // nét gạch má hồng giống trong tranh
      const n = this.sketch ? (red ? 3 : 2) : 1;
      c.strokeStyle = this.sketch ? `rgba(36,52,180,${Math.min(1, 0.9 * v.blush + 0.2)})` : `rgba(230,90,130,${0.75 * v.blush})`;
      c.lineWidth = 3.5;
      for (let i = -n; i <= n; i++) {
        c.beginPath();
        c.moveTo(x + i * 14 + 5, y - 9);
        c.lineTo(x + i * 14 - 5, y + 9);
        c.stroke();
      }
    }
  }

  _eye(c, cx, cy, s, open, v) {
    const rx = 44, ry = 58;
    c.strokeStyle = INK;
    c.fillStyle = INK;

    // Lông mày
    if (Math.abs(v.brow) > 0.05) {
      c.globalAlpha = Math.min(1, Math.abs(v.brow) * 1.5);
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(cx - s * 42, cy - 74 + v.brow * 26);
      c.lineTo(cx + s * 44, cy - 74 - v.brow * 14);
      c.stroke();
      c.globalAlpha = 1;
    }

    if (v.happy > 0.5) { // mắt cười ^ ^
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(cx - 46, cy + 14);
      c.quadraticCurveTo(cx, cy - 50, cx + 46, cy + 14);
      c.stroke();
      return;
    }

    if (open < 0.18) { // mắt nhắm
      const squeeze = v.tears > 0.5 ? 1 : 0; // nhắm chặt khi khóc
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(cx - 46, cy + 8 - squeeze * 6);
      c.quadraticCurveTo(cx, cy + 34 - squeeze * 4, cx + 46, cy + 8 - squeeze * 6);
      c.stroke();
      c.lineWidth = 5; // lông mi
      for (const k of [0.75, 1]) {
        c.beginPath();
        c.moveTo(cx + s * 44 * k, cy + 10 + (1 - k) * 30);
        c.lineTo(cx + s * (44 * k + 12), cy + 20 + (1 - k) * 36);
        c.stroke();
      }
      return;
    }

    const h = ry * open;
    // Mí mắt giận: cạnh trên xếch xuống về phía mũi
    const innerY = cy - h * (1 - 0.8 * v.angry) - (1 - v.angry) * 20;
    const outerY = cy - h * 1.15 - 20;
    const ix = cx - s * 60, ox = cx + s * 60;

    c.save();
    c.beginPath();
    c.moveTo(ix, innerY); c.lineTo(ox, outerY); c.lineTo(ox, cy + 100); c.lineTo(ix, cy + 100);
    c.closePath();
    c.clip();
    c.beginPath();
    c.ellipse(cx, cy, rx, h, 0, 0, Math.PI * 2);
    c.clip();

    c.fillStyle = this.sketch ? PAPER : '#ffffff';
    c.fillRect(cx - 60, cy - 70, 120, 140);
    if (this.sketch) { // mống mắt gạch bút bi
      c.save();
      c.beginPath();
      c.ellipse(cx, cy + 2, rx * 0.86, ry * 0.92, 0, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = 'rgba(36,52,180,0.16)';
      c.fillRect(cx - 60, cy - 70, 120, 140);
      c.strokeStyle = INK;
      c.lineWidth = 2.2;
      for (let x = -48; x <= 48; x += 6.5) {
        c.beginPath();
        c.moveTo(cx + x + 5, cy - 62);
        c.lineTo(cx + x - 5, cy + 62 - Math.abs(x) * 0.5);
        c.stroke();
      }
      c.restore();
    } else {
      const g = c.createLinearGradient(0, cy - ry, 0, cy + ry);
      g.addColorStop(0, '#27304f');
      g.addColorStop(0.45, '#5b74a8');
      g.addColorStop(1, '#bfd2ee');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(cx, cy + 2, rx * 0.86, ry * 0.92, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = this.sketch ? INK : '#141a36';
    c.beginPath();
    c.ellipse(cx, cy, rx * 0.4, ry * 0.46, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = this.sketch ? PAPER : '#ffffff';
    c.beginPath(); c.arc(cx - 15, cy - 24, 13, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 17, cy + 22, 7, 0, Math.PI * 2); c.fill();
    c.restore();

    // Viền mắt + mí trên dày
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(cx, cy, rx, h, 0, 0, Math.PI);
    c.stroke();
    c.lineWidth = 10;
    c.beginPath();
    if (v.angry > 0.3) {
      c.moveTo(cx - s * 48, innerY + (outerY - innerY) * 0.1);
      c.lineTo(cx + s * 50, innerY + (outerY - innerY) * 0.92);
    } else {
      c.ellipse(cx, cy, rx + 2, h + 2, 0, Math.PI * 1.02, Math.PI * 1.98);
    }
    c.stroke();
    // lông mi đuôi mắt
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(cx + s * (rx - 2), cy - h * 0.35);
    c.lineTo(cx + s * (rx + 14), cy - h * 0.62);
    c.stroke();
  }

  _mouth(c, v) {
    const cx = 256, cy = 428;
    const o = v.mouthOpen, sm = v.smile;
    c.strokeStyle = INK;
    if (o < 0.08) {
      const w = 16 + Math.abs(sm) * 14;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(cx - w, cy - sm * 5);
      c.quadraticCurveTo(cx, cy + sm * 18, cx + w, cy - sm * 5);
      c.stroke();
      return;
    }
    const w = 20 + o * 20 + Math.max(0, sm) * 10;
    const h = 8 + o * 44;
    const top = sm < 0 ? -h * 0.9 * -sm : 0;
    const bot = sm > 0 ? h * (0.9 + sm * 0.9) : h * 0.7;
    const y0 = cy - (sm > 0 ? h * 0.3 : -h * 0.25);
    const lips = new Path2D();
    lips.moveTo(cx - w, y0);
    lips.quadraticCurveTo(cx, y0 + top * 2, cx + w, y0);
    lips.quadraticCurveTo(cx, y0 + bot * 2, cx - w, y0);
    lips.closePath();
    c.fillStyle = this.sketch ? 'rgba(36,52,180,0.8)' : '#7a1f3d';
    c.fill(lips);
    c.save();
    c.clip(lips);
    c.fillStyle = this.sketch ? PAPER : '#ff8fa8'; // lưỡi
    c.beginPath();
    c.ellipse(cx, y0 + Math.max(bot, h * 0.6) + 4, w * 0.62, h * 0.5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.lineWidth = 5;
    c.stroke(lips);
  }

  _tears(c, cx, cy, s, amount, time) {
    c.globalAlpha = Math.min(1, amount * 1.2);
    const x0 = cx + s * 6, y0 = cy + 24;
    // dòng nước mắt
    c.lineWidth = this.sketch ? 15 : 17;
    c.strokeStyle = this.sketch ? 'rgba(36,52,180,0.3)' : '#8ec9ff';
    c.beginPath();
    c.moveTo(x0, y0);
    for (let y = y0; y <= 505; y += 12) {
      c.lineTo(x0 + s * (y - y0) * 0.06 + Math.sin(y * 0.06 + time * 9) * 3, y);
    }
    c.stroke();
    c.lineWidth = this.sketch ? 2.5 : 5;
    c.strokeStyle = this.sketch ? INK : '#ffffff';
    c.beginPath();
    c.moveTo(x0 - 3, y0 + 6);
    for (let y = y0 + 6; y <= 505; y += 12) {
      c.lineTo(x0 - 3 + s * (y - y0) * 0.06 + Math.sin(y * 0.06 + time * 9) * 3, y);
    }
    c.stroke();
    // giọt nước mắt to ở đuôi mắt
    const p = (time * 1.3 + (s > 0 ? 0.5 : 0)) % 1;
    const dx = cx + s * (46 + p * 26), dy = cy + 6 + p * p * 120;
    c.fillStyle = this.sketch ? PAPER : '#8ec9ff';
    c.strokeStyle = INK;
    c.lineWidth = this.sketch ? 3.5 : 2.5;
    c.beginPath();
    c.moveTo(dx, dy - 20);
    c.quadraticCurveTo(dx + 15, dy + 4, dx, dy + 12);
    c.quadraticCurveTo(dx - 15, dy + 4, dx, dy - 20);
    c.fill();
    c.stroke();
    c.globalAlpha = 1;
  }
}
