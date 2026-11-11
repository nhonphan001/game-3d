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
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');   // nơi lưu tài khoản (ngoài mã nguồn)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';                        // để trống = tắt trang quản trị
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

// ---------------------------------------------------------------- Nhân vật đóng gói + tài khoản được gán sẵn
// Gói nhân vật nằm trong public/characters/<id>/character.json (đẩy lên bằng git).
// Tài khoản = tên + mã bảo mật + nhân vật, do quản trị viên gán; mã chỉ lưu dạng băm.
const CHAR_DIR = path.join(__dirname, 'public', 'characters');
function listCharacters() {
  let dirs = [];
  try { dirs = fs.readdirSync(CHAR_DIR, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory() || !/^[a-z0-9-]{1,40}$/.test(d.name)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(CHAR_DIR, d.name, 'character.json'), 'utf8'));
      out.push({ id: d.name, title: String(meta.title || d.name).slice(0, 60) });
    } catch { /* gói hỏng thì bỏ qua */ }
  }
  return out;
}
const ACC_FILE = path.join(DATA_DIR, 'accounts.json');
const accounts = new Map(); // khoá = tên viết thường
try { for (const a of JSON.parse(fs.readFileSync(ACC_FILE, 'utf8'))) accounts.set(a.name.toLowerCase(), a); } catch { /* chưa có tài khoản nào */ }
function saveAccounts() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = `${ACC_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify([...accounts.values()], null, 1), { mode: 0o600 });
  fs.renameSync(tmpFile, ACC_FILE);
}
const hashCode = (code, salt) => crypto.scryptSync(String(code), salt, 32).toString('hex');
const sameText = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fails = new Map(); // chống dò mã: khoá theo tên và theo địa chỉ
function blocked(key) { const f = fails.get(key); return f && f.until > Date.now(); }
function failed(key, max) {
  const f = fails.get(key) || { n: 0, until: 0 };
  if (++f.n >= max) { f.n = 0; f.until = Date.now() + 5 * 60 * 1000; }
  fails.set(key, f);
}
// Trả về { acc } nếu đúng tên + mã, { err } nếu sai
function login(name, pin, ip) {
  const acc = accounts.get(name.toLowerCase());
  const keys = [`n:${name.toLowerCase()}`, `i:${ip}`];
  if (keys.some(blocked)) return { err: 'Nhập sai quá nhiều lần. Hãy thử lại sau 5 phút.' };
  if (!acc || typeof pin !== 'string' || pin.length > 64 || !sameText(hashCode(pin, acc.salt), acc.hash)) {
    failed(keys[0], 5); failed(keys[1], 20);
    return { err: 'Tên hoặc mã bảo mật không đúng.' };
  }
  fails.delete(keys[0]);
  if (!listCharacters().some((c) => c.id === acc.char)) return { err: 'Nhân vật của tài khoản này chưa có trên máy chủ.' };
  return { acc };
}

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
const pub = (cls, m) => ({ id: m.id, name: m.name, role: m.role, style: m.style, seed: m.seed, char: m.char || null, img: m.img ? `/img/${cls.code}/${m.imgKey}.png` : null, x: m.x, z: m.z });
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
const MIME = { '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveFile(res, root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }).end(data);
  });
}
const json = (res, code, body) => res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
// API quản trị: gán nhân vật + tên + mã bảo mật. Cần "Authorization: Bearer <ADMIN_TOKEN>".
function adminApi(req, res, url) {
  const ip = req.socket.remoteAddress || '?';
  if (!ADMIN_TOKEN) return json(res, 503, { error: 'Trang quản trị chưa được bật trên máy chủ (thiếu ADMIN_TOKEN).' });
  if (blocked(`a:${ip}`)) return json(res, 429, { error: 'Sai mã quản trị quá nhiều lần. Thử lại sau 5 phút.' });
  const given = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!sameText(crypto.createHash('sha256').update(given).digest('hex'), crypto.createHash('sha256').update(ADMIN_TOKEN).digest('hex'))) {
    failed(`a:${ip}`, 8);
    return json(res, 401, { error: 'Mã quản trị không đúng.' });
  }
  const state = () => ({ characters: listCharacters(), accounts: [...accounts.values()].map((a) => ({ name: a.name, char: a.char, created: a.created })) });
  if (req.method === 'GET' && url.pathname === '/api/admin/state') return json(res, 200, state());
  if (req.method === 'DELETE' && url.pathname === '/api/admin/accounts') {
    accounts.delete(String(url.searchParams.get('name') || '').toLowerCase());
    saveAccounts();
    return json(res, 200, state());
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/accounts') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      let d;
      try { d = JSON.parse(raw); } catch { return json(res, 400, { error: 'Dữ liệu không hợp lệ.' }); }
      const name = cleanName(d.name);
      if (!name) return json(res, 400, { error: 'Hãy nhập tên.' });
      if (!listCharacters().some((c) => c.id === d.char)) return json(res, 400, { error: 'Không có nhân vật này.' });
      let code = typeof d.code === 'string' ? d.code.trim() : '';
      if (code && (code.length < 4 || code.length > 32)) return json(res, 400, { error: 'Mã bảo mật dài từ 4 đến 32 ký tự.' });
      if (!code) code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      const salt = rid(8);
      accounts.set(name.toLowerCase(), { name, char: d.char, salt, hash: hashCode(code, salt), created: new Date().toISOString().slice(0, 10) });
      saveAccounts();
      fails.delete(`n:${name.toLowerCase()}`);
      json(res, 200, { ...state(), issued: { name, char: d.char, code } }); // mã chỉ hiện đúng một lần này
    });
    return;
  }
  json(res, 404, { error: 'Không có chức năng này.' });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400).end(); return; }
  if (url.pathname.startsWith('/api/admin/')) return adminApi(req, res, url);
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
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

function admit(cls, m) { // cho một học sinh vào lớp
  const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
  m.x = Math.sin(a) * r; m.z = Math.cos(a) * r;
  cls.members.set(m.id, m);
  broadcast(cls, { t: 'joined', m: pub(cls, m) }, m);
  welcome(cls, m);
}

const handlers = {
  create(ws, d) {
    if (ws.cls) return;
    if (classes.size >= MAX_CLASSES) return fail(ws, 'Máy chủ đang đầy lớp, thử lại sau nhé.');
    let name = cleanName(d.name);
    if (!name) return fail(ws, 'Hãy nhập tên giáo viên.');
    let char = null;
    if (d.pin) { // giáo viên có nhân vật được gán sẵn
      const r = login(name, d.pin, ws.ip);
      if (r.err) return fail(ws, r.err);
      char = r.acc.char; name = r.acc.name; // dùng đúng cách viết tên đã gán
    } else if (accounts.has(name.toLowerCase())) return fail(ws, 'Tên này đã được dành riêng. Hãy nhập mã bảo mật hoặc chọn tên khác.');
    const img = !char && d.img ? parseImg(d.img) : null;
    if (!char && d.img && !img) return fail(ws, 'Ảnh không hợp lệ hoặc quá lớn.');
    const teacher = { id: rid(4), name, role: 'teacher', ws, img, imgKey: rid(), char, x: 0, z: -3, ...lookOf(d) };
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
    let name = cleanName(d.name);
    if (!name) return fail(ws, 'Hãy nhập tên của em.');
    let char = null;
    if (d.pin) { // tài khoản được gán sẵn nhân vật: đúng tên + mã bảo mật là vào thẳng lớp
      const r = login(name, d.pin, ws.ip);
      if (r.err) return fail(ws, r.err);
      char = r.acc.char; name = r.acc.name; // dùng đúng cách viết tên đã gán
    } else if (accounts.has(name.toLowerCase())) return fail(ws, 'Tên này đã được dành riêng. Em nhập mã bảo mật hoặc chọn tên khác nhé.');
    const img = char ? null : parseImg(d.img);
    if (!char && !img) return fail(ws, 'Ảnh nhân vật không hợp lệ hoặc quá lớn.');
    if (cls.members.size + cls.pending.size >= MAX_STUDENTS) return fail(ws, `Lớp đã đủ ${MAX_STUDENTS} học sinh.`);
    if (nameTaken(cls, name)) return fail(ws, char ? 'Tên này đang ở trong lớp rồi.' : 'Tên này đã có bạn dùng trong lớp, em chọn tên khác nhé.');
    const me = { id: rid(4), name, role: 'student', ws, img, imgKey: rid(), char, x: 0, z: 0, ...lookOf(d) };
    if (char) { ws.cls = cls; ws.me = me; touchEmpty(cls); admit(cls, me); return; }
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
    send(ws, { t: 'resolved', id: m.id });
    admit(cls, m);
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
  ws.ip = ip;
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
