// Lớp Học Nét Vẽ — máy chủ lớp học thời gian thực.
// Mỗi lớp: 1 giáo viên + tối đa 40 học sinh. Học sinh nhập mã lớp + tên + ảnh nhân vật,
// giáo viên duyệt rồi mới vào lớp. Không có chat tự do: chỉ biểu cảm và câu chọn sẵn.
// Dữ liệu chỉ nằm trong bộ nhớ: ai rời lớp thì hình bị xoá, tắt máy chủ là mất hết.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_STUDENTS = 40;
const MAX_CLASSES = 200;
const MAX_IMG = 400 * 1024;          // ảnh nhân vật đã tách nền, PNG
const ROOM_R = 9;                    // bán kính sân lớp (mét)
const EMPTY_TTL = 10 * 60 * 1000;    // lớp trống quá 10 phút thì xoá
const MAX_PER_IP = 100;              // một trường có thể chung một địa chỉ mạng, nên để rộng hơn một lớp
const MAX_SOCKETS = 3000;
const EMOTES = ['wave', 'laugh', 'cry', 'angry', 'jump', 'heart', 'star'];
const STYLES = ['flat', 'sketch', 'color']; // nét vẽ / 3D / 3D tô màu
const PHRASES = 8;                   // số câu chọn sẵn (nội dung nằm ở trình duyệt)
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const classes = new Map(); // mã lớp -> { code, token, teacher, members: Map, pending: Map, emptySince }

const rid = (n = 8) => crypto.randomBytes(n).toString('hex');
function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from(crypto.randomBytes(6), (b) => abc[b % abc.length]).join(''); while (classes.has(code));
  return code;
}
function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s.length ? s : null;
}
function parseImg(v) {
  if (typeof v !== 'string') return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.length > MAX_IMG || !buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return buf;
}
const clampPos = (x, z) => {
  x = Number(x); z = Number(z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const d = Math.hypot(x, z);
  return d > ROOM_R ? { x: (x / d) * ROOM_R, z: (z / d) * ROOM_R } : { x, z };
};
const lookOf = (d) => ({ style: STYLES.includes(d.style) ? d.style : 'flat', seed: Number.isInteger(d.seed) ? ((d.seed % 100) + 100) % 100 : 0 });
const pub = (cls, m) => ({ id: m.id, name: m.name, role: m.role, style: m.style, seed: m.seed, img: m.img ? `/img/${cls.code}/${m.imgKey}.png` : null, x: m.x, z: m.z });
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
function broadcast(cls, msg, except) {
  for (const m of cls.members.values()) if (m !== except) send(m.ws, msg);
  if (cls.teacher !== except) send(cls.teacher.ws, msg);
}
function nameTaken(cls, name) {
  const n = name.toLowerCase();
  if (cls.teacher.name.toLowerCase() === n) return true;
  for (const m of [...cls.members.values(), ...cls.pending.values()]) if (m.name.toLowerCase() === n) return true;
  return false;
}
function welcome(cls, me) {
  const members = [...cls.members.values()].map((m) => pub(cls, m));
  if (cls.teacher.ws) members.push(pub(cls, cls.teacher));
  const msg = { t: 'welcome', you: me.id, role: me.role, code: cls.code, max: MAX_STUDENTS, members };
  if (me.role === 'teacher') { msg.token = cls.token; msg.pending = [...cls.pending.values()].map((m) => pub(cls, m)); }
  send(me.ws, msg);
}
function touchEmpty(cls) {
  const anyone = cls.teacher.ws || cls.members.size || cls.pending.size;
  cls.emptySince = anyone ? 0 : Date.now();
}

// ---------------------------------------------------------------- HTTP
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, '..', 'nhan-vat-3d', 'vendor');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveFile(res, root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }).end(data);
  });
}
const server = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  const im = /^\/img\/([A-Z0-9]{6})\/([0-9a-f]{16})\.png$/.exec(p);
  if (im) {
    const cls = classes.get(im[1]);
    const all = cls ? [cls.teacher, ...cls.members.values(), ...cls.pending.values()] : [];
    const m = all.find((x) => x.img && x.imgKey === im[2]);
    if (!m) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).end(m.img);
    return;
  }
  if (p.startsWith('/vendor/')) return serveFile(res, VENDOR, p.slice(8));
  serveFile(res, PUBLIC, p === '/' ? 'index.html' : p.slice(1));
});

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 640 * 1024 });
const fail = (ws, msg) => send(ws, { t: 'error', msg });

const handlers = {
  create(ws, d) {
    if (ws.cls) return;
    if (classes.size >= MAX_CLASSES) return fail(ws, 'Máy chủ đang đầy lớp, thử lại sau nhé.');
    const name = cleanName(d.name);
    if (!name) return fail(ws, 'Hãy nhập tên giáo viên.');
    const img = d.img ? parseImg(d.img) : null;
    if (d.img && !img) return fail(ws, 'Ảnh không hợp lệ hoặc quá lớn.');
    const teacher = { id: rid(4), name, role: 'teacher', ws, img, imgKey: rid(), x: 0, z: -3, ...lookOf(d) };
    const cls = { code: newCode(), token: rid(16), teacher, members: new Map(), pending: new Map(), emptySince: 0 };
    classes.set(cls.code, cls);
    ws.cls = cls; ws.me = teacher;
    welcome(cls, teacher);
  },
  rejoin(ws, d) { // giáo viên tải lại trang
    if (ws.cls) return;
    const cls = classes.get(String(d.code || '').toUpperCase());
    if (!cls || typeof d.token !== 'string' || d.token.length !== cls.token.length ||
        !crypto.timingSafeEqual(Buffer.from(d.token), Buffer.from(cls.token))) return send(ws, { t: 'norejoin' });
    const old = cls.teacher.ws;
    cls.teacher.ws = ws;
    ws.cls = cls; ws.me = cls.teacher;
    if (old && old !== ws) { old.cls = null; old.close(); }
    else broadcast(cls, { t: 'joined', m: pub(cls, cls.teacher) }, cls.teacher);
    touchEmpty(cls);
    welcome(cls, cls.teacher);
  },
  join(ws, d) {
    if (ws.cls) return;
    const cls = classes.get(String(d.code || '').toUpperCase().trim());
    if (!cls) return fail(ws, 'Không tìm thấy lớp với mã này.');
    const name = cleanName(d.name);
    if (!name) return fail(ws, 'Hãy nhập tên của em.');
    const img = parseImg(d.img);
    if (!img) return fail(ws, 'Ảnh nhân vật không hợp lệ hoặc quá lớn.');
    if (cls.members.size + cls.pending.size >= MAX_STUDENTS) return fail(ws, `Lớp đã đủ ${MAX_STUDENTS} học sinh.`);
    if (nameTaken(cls, name)) return fail(ws, 'Tên này đã có bạn dùng trong lớp, em chọn tên khác nhé.');
    const me = { id: rid(4), name, role: 'student', ws, img, imgKey: rid(), x: 0, z: 0, ...lookOf(d) };
    cls.pending.set(me.id, me);
    ws.cls = cls; ws.me = me;
    touchEmpty(cls);
    send(ws, { t: 'pending', teacherHere: !!cls.teacher.ws });
    send(cls.teacher.ws, { t: 'request', m: pub(cls, me) });
  },
  approve(ws, d) {
    const cls = ws.cls;
    if (!cls || ws.me !== cls.teacher) return;
    const m = cls.pending.get(d.id);
    if (!m) return;
    cls.pending.delete(m.id);
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
    m.x = Math.sin(a) * r; m.z = Math.cos(a) * r;
    cls.members.set(m.id, m);
    send(ws, { t: 'resolved', id: m.id });
    broadcast(cls, { t: 'joined', m: pub(cls, m) }, m);
    welcome(cls, m);
  },
  reject(ws, d) {
    const cls = ws.cls;
    if (!cls || ws.me !== cls.teacher) return;
    const m = cls.pending.get(d.id);
    if (!m) return;
    cls.pending.delete(m.id);
    send(ws, { t: 'resolved', id: m.id });
    send(m.ws, { t: 'rejected' });
    m.ws.cls = null; m.ws.close();
  },
  kick(ws, d) {
    const cls = ws.cls;
    if (!cls || ws.me !== cls.teacher) return;
    const m = cls.members.get(d.id);
    if (!m) return;
    cls.members.delete(m.id);
    send(m.ws, { t: 'kicked' });
    m.ws.cls = null; m.ws.close();
    broadcast(cls, { t: 'left', id: m.id });
  },
  go(ws, d) {
    const cls = ws.cls, me = ws.me;
    if (!cls || cls.pending.has(me.id)) return;
    const p = clampPos(d.x, d.z);
    if (!p) return;
    me.x = p.x; me.z = p.z;
    broadcast(cls, { t: 'go', id: me.id, x: p.x, z: p.z }, me);
  },
  style(ws, d) { // đổi kiểu hiển thị nhân vật của chính mình
    const cls = ws.cls, me = ws.me;
    if (!cls || cls.pending.has(me.id) || !STYLES.includes(d.style)) return;
    Object.assign(me, lookOf(d));
    broadcast(cls, { t: 'style', id: me.id, style: me.style, seed: me.seed }, me);
  },
  emote(ws, d) {
    const cls = ws.cls;
    if (!cls || cls.pending.has(ws.me.id) || !EMOTES.includes(d.e)) return;
    broadcast(cls, { t: 'emote', id: ws.me.id, e: d.e }, ws.me);
  },
  say(ws, d) {
    const cls = ws.cls;
    if (!cls || cls.pending.has(ws.me.id) || !Number.isInteger(d.i) || d.i < 0 || d.i >= PHRASES) return;
    broadcast(cls, { t: 'say', id: ws.me.id, i: d.i }, ws.me);
  },
};

const perIp = new Map();
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || '?';
  const n = (perIp.get(ip) || 0) + 1;
  perIp.set(ip, n);
  ws.on('close', () => { const k = perIp.get(ip) - 1; if (k > 0) perIp.set(ip, k); else perIp.delete(ip); });
  if (n > MAX_PER_IP || wss.clients.size > MAX_SOCKETS) { ws.close(1013, 'busy'); return; }
  ws.alive = true;
  ws.count = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary || ++ws.count > 40) { ws.close(); return; } // quá 40 tin/giây thì ngắt
    let d;
    try { d = JSON.parse(raw.toString()); } catch { return; }
    if (d && typeof d === 'object' && Object.hasOwn(handlers, d.t)) handlers[d.t](ws, d);
  });
  ws.on('close', () => {
    const cls = ws.cls, me = ws.me;
    if (!cls) return;
    if (me === cls.teacher) {
      if (cls.teacher.ws === ws) { cls.teacher.ws = null; broadcast(cls, { t: 'left', id: me.id }); }
    } else if (cls.pending.delete(me.id)) {
      send(cls.teacher.ws, { t: 'resolved', id: me.id });
    } else if (cls.members.delete(me.id)) {
      broadcast(cls, { t: 'left', id: me.id });
    }
    touchEmpty(cls);
  });
});

setInterval(() => { for (const ws of wss.clients) ws.count = 0; }, 1000);
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  for (const [code, cls] of classes) if (cls.emptySince && Date.now() - cls.emptySince > EMPTY_TTL) classes.delete(code);
}, 30000);

server.listen(PORT, () => console.log(`Lớp Học Nét Vẽ đang chạy tại http://localhost:${PORT}`));
