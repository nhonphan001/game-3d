// Lớp Học Nét Vẽ — máy chủ lớp học thời gian thực.
// Mỗi lớp: 1 giáo viên + tối đa 40 học sinh. Học sinh nhập mã lớp + tên + ảnh nhân vật,
// giáo viên duyệt rồi mới vào lớp. Có trò chuyện bằng chữ (giáo viên tắt tiếng, xoá tin, tắt chat được),
// hình vẽ gửi lên phải được giáo viên duyệt, rồi nhân vật cầm hình và giáo viên chiếu lên bảng.
// Lớp được lưu xuống đĩa (DATA_DIR/classes): thông tin lớp, danh sách học sinh đã duyệt, 50 tin gần nhất. Hình vẽ gửi lên chỉ ở bộ nhớ.
// Mất kết nối vẫn giữ chỗ GRACE_MIN phút; lớp không ai vào quá CLASS_TTL_DAYS ngày thì bị xoá.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');   // nơi lưu tài khoản (ngoài mã nguồn)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';                        // để trống = tắt trang quản trị
const MAX_STUDENTS = 40;
const MAX_CLASSES = 200;
const MAX_IMG = 400 * 1024;          // ảnh nhân vật đã tách nền, PNG
const ROOM = { hx: 12.5, z0: -9, z1: 9 }; // vùng đi lại: hình chữ nhật rộng 25 m × sâu 18 m (mét), trùng với trình duyệt
const GRACE_MS = Number(process.env.GRACE_MIN || 15) * 60 * 1000;   // mất kết nối vẫn giữ chỗ trong lớp ngần này thời gian
const PENDING_GRACE_MS = 5 * 60 * 1000;                              // học sinh đang chờ duyệt mà mất kết nối: giữ 5 phút
const CLASS_TTL_MS = Number(process.env.CLASS_TTL_DAYS || 30) * 24 * 3600 * 1000; // lớp không ai vào quá ngần này ngày thì bị xoá
const MAX_PER_IP = 100;              // một trường có thể chung một địa chỉ mạng, nên để rộng hơn một lớp
const MAX_SOCKETS = 3000;
const EMOTES = ['wave', 'laugh', 'cry', 'angry', 'jump', 'heart', 'star'];
const STYLES = ['flat', 'sketch', 'color']; // nét vẽ / 3D / 3D tô màu
const PHRASES = 8;
const CHAT_MAX = 120;                // độ dài một tin nhắn
const CHAT_KEEP = 50;                // số tin giữ lại cho người vào sau
const MAX_ART = 400 * 1024;          // hình vẽ gửi lên (PNG hoặc JPEG), đã thu nhỏ ở trình duyệt
const ARTS_PER_MEMBER = 2;           // mỗi người giữ tối đa 2 hình trong lớp, hình mới đẩy hình cũ nhất ra
const ART_BUDGET = 300 * 1024 * 1024; // tổng bộ nhớ dành cho hình vẽ của mọi lớp
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);                   // số câu chọn sẵn (nội dung nằm ở trình duyệt)
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

// Khi chạy sau Cloudflare, kết nối đến từ máy chủ của Cloudflare; địa chỉ thật của người dùng nằm trong
// tiêu đề CF-Connecting-IP. Chỉ tin tiêu đề này khi kết nối thật sự đến từ dải địa chỉ của Cloudflare.
const CLOUDFLARE = new net.BlockList();
for (const c of ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14',
  '172.64.0.0/13', '131.0.72.0/22']) { const [a, n] = c.split('/'); CLOUDFLARE.addSubnet(a, Number(n), 'ipv4'); }
for (const c of ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']) {
  const [a, n] = c.split('/'); CLOUDFLARE.addSubnet(a, Number(n), 'ipv6');
}
function clientIp(req) {
  const raw = req.socket.remoteAddress || '?';
  const peer = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  const viaCf = net.isIP(peer) && CLOUDFLARE.check(peer, net.isIPv6(peer) ? 'ipv6' : 'ipv4');
  const real = req.headers['cf-connecting-ip'];
  return viaCf && typeof real === 'string' && net.isIP(real) ? real : peer;
}

const cleanText = (v) => (typeof v === 'string'
  ? v.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX) : '');
function parseArt(v) {
  if (typeof v !== 'string') return null;
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  const magic = m[1] === 'png' ? PNG_MAGIC : JPEG_MAGIC;
  if (buf.length < 100 || buf.length > MAX_ART || !buf.subarray(0, magic.length).equals(magic)) return null;
  return { buf, type: `image/${m[1]}` };
}
const artBytes = () => { let n = 0; for (const c of classes.values()) { for (const a of c.arts.values()) n += a.buf.length; for (const a of c.pendingArts.values()) n += a.buf.length; } return n; };
const artPub = (cls, a) => ({ id: a.id, owner: a.owner, name: a.name, url: `/art/${cls.code}/${a.key}` });
const findPerson = (cls, id) => (cls.teacher.id === id ? cls.teacher : cls.members.get(id));
const notice = (ws, msg) => send(ws, { t: 'notice', msg });
const everyone = (cls) => [cls.teacher, ...cls.members.values()];

// ---------------------------------------------------------------- Lưu lớp học vào đĩa
// Lưu: thông tin lớp, mã giáo viên (dạng băm), hình giáo viên, danh sách học sinh đã được duyệt (tên + hình nhân vật
// + dấu nhận máy), 50 tin nhắn gần nhất. KHÔNG lưu: hình vẽ gửi lên, bảng, ai đang trong lớp.
const CLASS_DIR = path.join(DATA_DIR, 'classes');
const classFile = (code) => path.join(CLASS_DIR, `${code}.json`);
const imgDir = (code) => path.join(CLASS_DIR, code);
const KEY_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normKey = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const today = () => new Date().toISOString().slice(0, 10);
function writeImg(code, key, buf) {
  try {
    fs.mkdirSync(imgDir(code), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(imgDir(code), `${key}.png`), buf, { mode: 0o600 });
  } catch (e) { console.error('Không ghi được hình:', e.message); }
}
const saveTimers = new Map();
function saveClass(cls) { // gộp nhiều thay đổi liên tiếp thành một lần ghi
  if (saveTimers.has(cls.code)) return;
  saveTimers.set(cls.code, setTimeout(() => { saveTimers.delete(cls.code); saveClassNow(cls); }, 1500));
}
function saveClassNow(cls) {
  if (classes.get(cls.code) !== cls) return;
  const t = cls.teacher;
  const data = {
    v: 1, code: cls.code, title: cls.title, created: cls.created, lastActive: cls.lastActive, keySalt: cls.keySalt, keyHash: cls.keyHash,
    chatOff: cls.chatOff, autoArt: cls.autoArt, nextMsg: cls.nextMsg, msgs: cls.msgs,
    teacher: { name: t.name, char: t.char, imgKey: t.img ? t.imgKey : null, style: t.style, seed: t.seed },
    roster: [...cls.roster.values()].map((r) => ({ name: r.name, nameKey: r.nameKey, imgKey: r.img ? r.imgKey : null, char: r.char, style: r.style, seed: r.seed, devSalt: r.devSalt, devHash: r.devHash, added: r.added })),
  };
  try {
    fs.mkdirSync(CLASS_DIR, { recursive: true, mode: 0o700 });
    const tmpFile = `${classFile(cls.code)}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmpFile, classFile(cls.code));
  } catch (e) { console.error('Không lưu được lớp:', e.message); }
}
const readImg = (code, key) => { try { return key ? fs.readFileSync(path.join(imgDir(code), `${key}.png`)) : null; } catch { return null; } };
function loadClasses() {
  let files = [];
  try { files = fs.readdirSync(CLASS_DIR).filter((f) => /^[A-Z0-9]{6}\.json$/.test(f)); } catch { return; }
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(CLASS_DIR, f), 'utf8'));
      const t = d.teacher || {};
      const teacher = { id: rid(4), name: t.name, role: 'teacher', ws: null, img: readImg(d.code, t.imgKey), imgKey: t.imgKey || rid(), char: t.char || null, x: 0, z: -3, style: t.style, seed: t.seed, resume: rid(16), offlineAt: Date.now(), goneSent: true };
      const roster = new Map();
      for (const r of d.roster || []) roster.set(r.nameKey, { ...r, img: readImg(d.code, r.imgKey), imgKey: r.imgKey || rid() });
      classes.set(d.code, { code: d.code, title: d.title || '', created: d.created, lastActive: d.lastActive || Date.now(), keySalt: d.keySalt, keyHash: d.keyHash, teacher,
        members: new Map(), pending: new Map(), roster, msgs: d.msgs || [], nextMsg: d.nextMsg || 1, chatOff: !!d.chatOff, autoArt: !!d.autoArt,
        arts: new Map(), pendingArts: new Map(), board: null, video: null });
    } catch (e) { console.error(`Bỏ qua tệp lớp hỏng ${f}:`, e.message); }
  }
  console.log(`Đã nạp ${classes.size} lớp đã lưu.`);
}
function destroyClass(cls) { // xoá hẳn một lớp và mọi dữ liệu của nó
  for (const p of [cls.teacher, ...cls.members.values(), ...cls.pending.values()]) {
    if (p.ws) { send(p.ws, { t: 'classgone' }); p.ws.cls = null; p.ws.close(); }
  }
  classes.delete(cls.code);
  const tm = saveTimers.get(cls.code);
  if (tm) { clearTimeout(tm); saveTimers.delete(cls.code); }
  fs.rmSync(classFile(cls.code), { force: true });
  fs.rmSync(imgDir(cls.code), { recursive: true, force: true });
}

// ---------------------------------------------------------------- Video YouTube trên bảng
// Chỉ nhận đường dẫn YouTube đúng dạng và chỉ giữ lại mã video 11 ký tự (+ giây bắt đầu): máy chủ và học sinh
// không bao giờ nhận một địa chỉ tuỳ ý để nhúng.
function parseStart(v) {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Math.min(Number(v), 86400);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  return m ? Math.min((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0), 86400) : 0;
}
function parseYouTube(input) {
  if (typeof input !== 'string' || input.length > 300) return null;
  const raw = input.trim();
  let u;
  try { u = new URL(raw.includes('://') ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
    id = u.pathname === '/watch' ? u.searchParams.get('v') : (m ? m[1] : null);
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return { id, start: parseStart(u.searchParams.get('t') || u.searchParams.get('start')) };
}
const videoPub = (cls) => (cls.video
  ? { id: cls.video.id, state: cls.video.state, pos: cls.video.state === 'playing' ? cls.video.pos + (Date.now() - cls.video.at) / 1000 : cls.video.pos }
  : null);

const classes = new Map(); // mã lớp -> lớp (xem create); được lưu vào DATA_DIR/classes

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
  return { x: Math.max(-ROOM.hx, Math.min(ROOM.hx, x)), z: Math.max(ROOM.z0, Math.min(ROOM.z1, z)) };
};
const lookOf = (d) => ({ style: STYLES.includes(d.style) ? d.style : 'flat', seed: Number.isInteger(d.seed) ? ((d.seed % 100) + 100) % 100 : 0 });
const heldUrl = (cls, m) => { const a = m.held && cls.arts.get(m.held); return a ? `/art/${cls.code}/${a.key}` : null; };
const boardPub = (cls) => { const a = cls.board && cls.arts.get(cls.board); return a ? artPub(cls, a) : null; };
const pub = (cls, m) => ({ id: m.id, name: m.name, role: m.role, style: m.style, seed: m.seed, char: m.char || null, muted: !!m.muted, away: !m.ws, held: heldUrl(cls, m), img: m.img ? `/img/${cls.code}/${m.imgKey}.png` : null, x: m.x, z: m.z });
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
function welcome(cls, me, extra = {}) {
  const members = [...cls.members.values()].map((m) => pub(cls, m));
  const t = cls.teacher;
  if (t.ws || !t.goneSent) members.push(pub(cls, t)); // giáo viên vắng quá lâu thì không hiện trong lớp
  const msg = { t: 'welcome', you: me.id, role: me.role, code: cls.code, title: cls.title, max: MAX_STUDENTS, members, resume: me.resume,
    chat: cls.msgs, chatOff: cls.chatOff, board: boardPub(cls), video: videoPub(cls), ...extra };
  if (me.role === 'teacher') {
    msg.pending = [...cls.pending.values()].map((m) => pub(cls, m));
    msg.arts = [...cls.arts.values()].map((a) => artPub(cls, a));
    msg.pendingArts = [...cls.pendingArts.values()].map((a) => artPub(cls, a));
    msg.autoArt = cls.autoArt;
    msg.roster = [...cls.roster.values()].map((r) => rosterPub(cls, r));
  }
  send(me.ws, msg);
}
const rosterPub = (cls, e) => ({ key: e.nameKey, name: e.name, img: e.img ? `/img/${cls.code}/${e.imgKey}.png` : null });
function touchEmpty(cls) { // ghi nhận lớp còn hoạt động
  cls.lastActive = Date.now();
  saveClass(cls);
}

// ---------------------------------------------------------------- HTTP
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, '..', 'nhan-vat-3d', 'vendor');
const MIME = { '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
// Tệp giao diện luôn phải hỏi lại máy chủ (ETag) và Cloudflare không được giữ: nếu không, người dùng
// sẽ nhận bản cũ của app.js / style.css sau khi cập nhật. Thư viện three.js đổi rất hiếm nên cho giữ lâu.
const verCache = { at: 0, map: {} };
function assetVersions() { // /app.js -> mã phiên bản theo nội dung tệp
  const now = Date.now();
  if (now - verCache.at < 2000) return verCache.map;
  const map = {};
  const walk = (dir, rel) => {
    let list;
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      if (d.isDirectory()) walk(path.join(dir, d.name), `${rel}${d.name}/`);
      else if (/\.(js|css)$/.test(d.name)) {
        try { const st = fs.statSync(path.join(dir, d.name)); map[`/${rel}${d.name}`] = `${st.size.toString(36)}${Math.floor(st.mtimeMs / 1000).toString(36)}`; } catch { /* tệp vừa bị xoá */ }
      }
    }
  };
  walk(PUBLIC, '');
  verCache.at = now; verCache.map = map;
  return map;
}
function renderHtml(raw) { // gắn mã phiên bản vào mọi tệp .js/.css để chúng đổi địa chỉ mỗi khi nội dung đổi
  const ver = assetVersions();
  let html = raw.replace(/<script type="importmap">([\s\S]*?)<\/script>/, (m, body) => {
    let map;
    try { map = JSON.parse(body); } catch { return m; }
    map.imports = map.imports || {};
    for (const [u, v] of Object.entries(ver)) if (u.endsWith('.js')) map.imports[u] = `${u}?v=${v}`;
    return `<script type="importmap">${JSON.stringify(map)}</script>`;
  });
  html = html.replace(/\b(href|src)="([^":?#]+\.(?:js|css))"/g, (m, attr, p) => { const u = p.startsWith('/') ? p : `/${p}`; return ver[u] ? `${attr}="${u}?v=${ver[u]}"` : m; });
  return html;
}
function serveFile(req, res, root, rel, longCache) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    const ext = path.extname(file);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': longCache ? 'public, max-age=604800' : 'no-cache', ...(longCache ? {} : { 'Cloudflare-CDN-Cache-Control': 'no-store' }) };
    fs.readFile(file, (e2, data) => {
      if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      if (ext === '.html') data = Buffer.from(renderHtml(data.toString('utf8')));
      headers.ETag = `W/"${crypto.createHash('sha1').update(data).digest('hex').slice(0, 16)}"`;
      if (req.headers['if-none-match'] === headers.ETag) { res.writeHead(304, headers).end(); return; }
      res.writeHead(200, headers).end(data);
    });
  });
}
const json = (res, code, body) => res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
// API quản trị: gán nhân vật + tên + mã bảo mật. Cần "Authorization: Bearer <ADMIN_TOKEN>".
function adminApi(req, res, url) {
  const ip = clientIp(req);
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
    const all = cls ? [cls.teacher, ...cls.members.values(), ...cls.pending.values(), ...cls.roster.values()] : [];
    const m = all.find((x) => x.img && x.imgKey === im[2]);
    if (!m) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).end(m.img);
    return;
  }
  const art = /^\/art\/([A-Z0-9]{6})\/([0-9a-f]{16})$/.exec(p);
  if (art) {
    const cls = classes.get(art[1]);
    const a = cls && [...cls.arts.values(), ...cls.pendingArts.values()].find((x) => x.key === art[2]);
    if (!a) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': a.type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" }).end(a.buf);
    return;
  }
  if (p.startsWith('/vendor/')) return serveFile(req, res, VENDOR, p.slice(8), true);
  serveFile(req, res, PUBLIC, p === '/' ? 'index.html' : p.slice(1), false);
});

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 760 * 1024 });
const fail = (ws, msg) => send(ws, { t: 'error', msg });

function admit(cls, m) { // cho một học sinh vào lớp
  m.x = (Math.random() * 2 - 1) * 8; m.z = -1 + Math.random() * 6; // xuất hiện rải rác ở giữa sân
  cls.members.set(m.id, m);
  broadcast(cls, { t: 'joined', m: pub(cls, m) }, m);
  welcome(cls, m);
}

function removeArt(cls, id) {
  const a = cls.arts.get(id);
  if (!a) return;
  cls.arts.delete(id);
  const owner = findPerson(cls, a.owner);
  let held = null;
  if (owner) {
    if (owner.held === id) { const mine = [...cls.arts.values()].filter((x) => x.owner === owner.id); owner.held = mine.length ? mine[mine.length - 1].id : null; }
    held = heldUrl(cls, owner);
  }
  const left = [...cls.arts.values()].filter((x) => x.owner === a.owner).length;
  broadcast(cls, { t: 'artdel', id, owner: a.owner, held, left });
  if (cls.board === id) { cls.board = null; broadcast(cls, { t: 'board', board: null }); }
}
function acceptArt(cls, a) {
  cls.arts.set(a.id, a);
  const owner = findPerson(cls, a.owner);
  const mine = [...cls.arts.values()].filter((x) => x.owner === a.owner);
  while (mine.length > ARTS_PER_MEMBER) removeArt(cls, mine.shift().id);
  if (owner) owner.held = a.id;
  broadcast(cls, { t: 'artadd', a: artPub(cls, a) });
}
function dropArts(cls, ownerId) { // người rời lớp: xoá mọi hình của họ
  for (const a of [...cls.arts.values()]) if (a.owner === ownerId) removeArt(cls, a.id);
  for (const a of [...cls.pendingArts.values()]) if (a.owner === ownerId) { cls.pendingArts.delete(a.id); send(cls.teacher.ws, { t: 'artres', id: a.id }); }
}
const isTeacher = (ws) => ws.cls && ws.me === ws.cls.teacher;
function attach(cls, person, ws) { // gắn một kết nối mới vào người đã có trong lớp (nối lại, hoặc giáo viên mở lại lớp)
  const old = person.ws;
  person.ws = ws; ws.cls = cls; ws.me = person;
  if (old && old !== ws) { old.cls = null; old.close(); }
  person.offlineAt = 0;
  touchEmpty(cls);
  if (cls.pending.has(person.id)) { send(ws, { t: 'pending', teacherHere: !!cls.teacher.ws, code: cls.code, id: person.id, resume: person.resume }); return; }
  if (person === cls.teacher && person.goneSent) { person.goneSent = false; broadcast(cls, { t: 'joined', m: pub(cls, person) }, person); }
  else broadcast(cls, { t: 'away', id: person.id, on: false }, person);
  welcome(cls, person);
}
function removeMember(cls, m) {
  if (cls.pending.delete(m.id)) send(cls.teacher.ws, { t: 'resolved', id: m.id });
  else if (cls.members.delete(m.id)) { dropArts(cls, m.id); broadcast(cls, { t: 'left', id: m.id }); }
}
function rosterAdd(cls, m) {
  const nameKey = m.name.toLowerCase(), devSalt = rid(8);
  const e = { name: m.name, nameKey, img: m.img, imgKey: m.imgKey, char: null, style: m.style, seed: m.seed, devSalt, devHash: m.dev ? hashCode(m.dev, devSalt) : '', added: today() };
  cls.roster.set(nameKey, e);
  if (e.img) writeImg(cls.code, e.imgKey, e.img);
  saveClass(cls);
  send(cls.teacher.ws, { t: 'rosteradd', r: rosterPub(cls, e) });
}
function rosterDel(cls, key) {
  const e = cls.roster.get(key);
  if (!e) return;
  cls.roster.delete(key);
  fs.rmSync(path.join(imgDir(cls.code), `${e.imgKey}.png`), { force: true });
  saveClass(cls);
  send(cls.teacher.ws, { t: 'rosterdel', key });
}

const handlers = {
  ping(ws) { send(ws, { t: 'pong' }); },
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
    const teacher = { id: rid(4), name, role: 'teacher', ws, img, imgKey: rid(), char, x: 0, z: -3, resume: rid(16), ...lookOf(d) };
    const key = Array.from(crypto.randomBytes(10), (b) => KEY_ABC[b % KEY_ABC.length]).join('');
    const keySalt = rid(8);
    const cls = { code: newCode(), title: cleanText(d.title).slice(0, 30), created: today(), lastActive: Date.now(), keySalt, keyHash: hashCode(key, keySalt),
      teacher, members: new Map(), pending: new Map(), roster: new Map(),
      msgs: [], nextMsg: 1, chatOff: false, arts: new Map(), pendingArts: new Map(), board: null, video: null, autoArt: false };
    classes.set(cls.code, cls);
    if (img) writeImg(cls.code, teacher.imgKey, img);
    saveClassNow(cls);
    ws.cls = cls; ws.me = teacher;
    welcome(cls, teacher, { key: `${key.slice(0, 5)}-${key.slice(5)}` }); // mã giáo viên chỉ hiện đúng một lần
  },
  open(ws, d) { // giáo viên mở lại lớp đã lưu bằng mã lớp + mã giáo viên
    if (ws.cls) return;
    const code = String(d.code || '').toUpperCase().trim();
    const cls = classes.get(code);
    const keys = [`k:${code}`, `i:${ws.ip}`];
    if (keys.some(blocked)) return fail(ws, 'Nhập sai quá nhiều lần. Hãy thử lại sau 5 phút.');
    const key = normKey(d.key);
    if (!cls || key.length < 6 || key.length > 32 || !sameText(hashCode(key, cls.keySalt), cls.keyHash)) {
      failed(keys[0], 5); failed(keys[1], 20);
      return fail(ws, 'Mã lớp hoặc mã giáo viên không đúng.');
    }
    fails.delete(keys[0]);
    attach(cls, cls.teacher, ws);
  },
  resume(ws, d) { // nối lại phiên cũ sau khi mất kết nối hoặc tải lại trang
    if (ws.cls) return;
    const cls = classes.get(String(d.code || '').toUpperCase());
    const p = cls && (findPerson(cls, d.id) || cls.pending.get(d.id));
    if (!p || typeof d.token !== 'string' || !sameText(d.token, p.resume)) { failed(`i:${ws.ip}`, 40); return send(ws, { t: 'noresume' }); }
    attach(cls, p, ws);
  },
  bye(ws) { // bấm "Rời lớp": rời hẳn, không giữ chỗ
    const cls = ws.cls, me = ws.me;
    if (!cls || me.ws !== ws) return;
    ws.cls = null; me.ws = null;
    if (me === cls.teacher) { me.offlineAt = Date.now(); me.goneSent = true; broadcast(cls, { t: 'left', id: me.id }); } else removeMember(cls, me);
    touchEmpty(cls);
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
    const nameKey = name.toLowerCase();
    const dev = typeof d.dev === 'string' && /^[A-Za-z0-9]{16,64}$/.test(d.dev) ? d.dev : '';
    const entry = !char && cls.roster.get(nameKey);
    if (entry) { // đã được duyệt vào lớp này trước đây: quay lại bằng đúng điện thoại cũ thì vào thẳng
      if (!dev || !sameText(hashCode(dev, entry.devSalt), entry.devHash)) {
        failed(`i:${ws.ip}`, 40);
        return fail(ws, 'Tên này đã có bạn dùng trong lớp này. Nếu là em, hãy dùng điện thoại đã vào lớp trước đó, hoặc nhờ cô giáo xoá tên cũ.');
      }
      const ex = [...cls.members.values()].find((m) => m.name.toLowerCase() === nameKey);
      if (ex) return attach(cls, ex, ws); // phiên cũ còn giữ chỗ: nối lại
      if (cls.members.size + cls.pending.size >= MAX_STUDENTS) return fail(ws, `Lớp đã đủ ${MAX_STUDENTS} học sinh.`);
      const me = { id: rid(4), name: entry.name, role: 'student', ws, img: entry.img, imgKey: entry.imgKey, char: null, x: 0, z: 0, resume: rid(16),
        ...(d.style ? lookOf(d) : { style: entry.style, seed: entry.seed }) };
      ws.cls = cls; ws.me = me; touchEmpty(cls); admit(cls, me);
      return;
    }
    const img = char ? null : parseImg(d.img);
    if (!char && !img) return fail(ws, 'Ảnh nhân vật không hợp lệ hoặc quá lớn.');
    if (cls.members.size + cls.pending.size >= MAX_STUDENTS) return fail(ws, `Lớp đã đủ ${MAX_STUDENTS} học sinh.`);
    if (nameTaken(cls, name)) return fail(ws, char ? 'Tên này đang ở trong lớp rồi.' : 'Tên này đã có bạn dùng trong lớp, em chọn tên khác nhé.');
    const me = { id: rid(4), name, role: 'student', ws, img, imgKey: rid(), char, x: 0, z: 0, resume: rid(16), dev, ...lookOf(d) };
    if (char) { ws.cls = cls; ws.me = me; touchEmpty(cls); admit(cls, me); return; }
    cls.pending.set(me.id, me);
    ws.cls = cls; ws.me = me;
    touchEmpty(cls);
    send(ws, { t: 'pending', teacherHere: !!cls.teacher.ws, code: cls.code, id: me.id, resume: me.resume });
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
    if (!m.char) rosterAdd(cls, m); // nhớ bạn này: lần sau vào lại không cần duyệt
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
    dropArts(cls, m.id);
    rosterDel(cls, m.name.toLowerCase()); // mời ra là quên luôn: muốn vào lại phải được duyệt lại
    if (m.ws) { send(m.ws, { t: 'kicked' }); m.ws.cls = null; m.ws.close(); }
    broadcast(cls, { t: 'left', id: m.id });
  },
  unroster(ws, d) { // xoá một bạn đang vắng khỏi danh sách lớp
    if (!isTeacher(ws) || typeof d.key !== 'string') return;
    const cls = ws.cls;
    if ([...cls.members.values()].some((m) => m.name.toLowerCase() === d.key)) return;
    rosterDel(cls, d.key);
  },
  deleteclass(ws, d) { // xoá lớp và mọi dữ liệu đã lưu
    if (!isTeacher(ws) || d.confirm !== ws.cls.code) return;
    destroyClass(ws.cls);
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
    const re = !me.char && me.role === 'student' && cls.roster.get(me.name.toLowerCase());
    if (re) { re.style = me.style; re.seed = me.seed; saveClass(cls); }
    broadcast(cls, { t: 'style', id: me.id, style: me.style, seed: me.seed }, me);
  },
  chat(ws, d) {
    const cls = ws.cls, me = ws.me;
    if (!cls || cls.pending.has(me.id)) return;
    if (me.role !== 'teacher') {
      if (cls.chatOff) return notice(ws, 'Cô giáo đang tắt trò chuyện.');
      if (me.muted) return notice(ws, 'Cô giáo đã tắt tiếng của em.');
    }
    const text = cleanText(d.text);
    if (!text) return;
    const now = Date.now();
    me.chatAt = (me.chatAt || []).filter((t) => now - t < 20000);
    if (me.chatAt.length >= 8 || (me.chatAt.length && now - me.chatAt[me.chatAt.length - 1] < 700)) return notice(ws, 'Em nhắn nhanh quá, chờ một chút nhé.');
    me.chatAt.push(now);
    const m = { id: cls.nextMsg++, from: me.id, name: me.name, role: me.role, text, ts: now };
    cls.msgs.push(m);
    if (cls.msgs.length > CHAT_KEEP) cls.msgs.shift();
    saveClass(cls);
    broadcast(cls, { t: 'chat', m });
  },
  delmsg(ws, d) {
    if (!isTeacher(ws)) return;
    const cls = ws.cls, i = cls.msgs.findIndex((m) => m.id === d.id);
    if (i < 0) return;
    cls.msgs.splice(i, 1);
    saveClass(cls);
    broadcast(cls, { t: 'chatdel', id: d.id });
  },
  mute(ws, d) {
    if (!isTeacher(ws)) return;
    const m = ws.cls.members.get(d.id);
    if (!m) return;
    m.muted = !!d.on;
    broadcast(ws.cls, { t: 'muted', id: m.id, on: m.muted });
    if (m.muted) notice(m.ws, 'Cô giáo đã tắt tiếng của em.'); else notice(m.ws, 'Em có thể nhắn tin lại rồi.');
  },
  chatoff(ws, d) {
    if (!isTeacher(ws)) return;
    ws.cls.chatOff = !!d.on;
    saveClass(ws.cls);
    broadcast(ws.cls, { t: 'chatoff', on: ws.cls.chatOff });
  },
  autoart(ws, d) {
    if (!isTeacher(ws)) return;
    ws.cls.autoArt = !!d.on;
    saveClass(ws.cls);
    send(ws, { t: 'autoart', on: ws.cls.autoArt });
  },
  art(ws, d) { // gửi hình vẽ: chờ giáo viên duyệt (giáo viên gửi thì hiện luôn)
    const cls = ws.cls, me = ws.me;
    if (!cls || cls.pending.has(me.id)) return;
    const p = parseArt(d.img);
    if (!p) return notice(ws, 'Hình không hợp lệ hoặc quá lớn.');
    const now = Date.now();
    if (me.artAt && now - me.artAt < 3000) return notice(ws, 'Gửi hình chậm lại một chút nhé.');
    if (artBytes() + p.buf.length > ART_BUDGET) return notice(ws, 'Máy chủ đang đầy hình, thử lại sau nhé.');
    const a = { id: rid(4), owner: me.id, name: me.name, key: rid(), ...p };
    me.artAt = now;
    if (me.role === 'teacher' || cls.autoArt) { acceptArt(cls, a); return notice(ws, 'Nhân vật của em đang cầm hình rồi.'); }
    if ([...cls.pendingArts.values()].some((x) => x.owner === me.id)) return notice(ws, 'Hình trước của em đang chờ cô duyệt.');
    if (cls.pendingArts.size >= 60) return notice(ws, 'Đang có quá nhiều hình chờ duyệt.');
    cls.pendingArts.set(a.id, a);
    notice(ws, 'Đã gửi hình cho cô duyệt.');
    send(cls.teacher.ws, { t: 'artreq', a: artPub(cls, a) });
  },
  artok(ws, d) {
    if (!isTeacher(ws)) return;
    const cls = ws.cls, a = cls.pendingArts.get(d.id);
    if (!a) return;
    cls.pendingArts.delete(a.id);
    send(ws, { t: 'artres', id: a.id });
    if (findPerson(cls, a.owner)) acceptArt(cls, a);
  },
  artno(ws, d) {
    if (!isTeacher(ws)) return;
    const cls = ws.cls, a = cls.pendingArts.get(d.id);
    if (!a) return;
    cls.pendingArts.delete(a.id);
    send(ws, { t: 'artres', id: a.id });
    notice(findPerson(cls, a.owner)?.ws, 'Cô chưa duyệt hình này. Em thử gửi hình khác nhé.');
  },
  artdel(ws, d) { if (isTeacher(ws)) removeArt(ws.cls, d.id); },
  board(ws, d) { // giáo viên chọn hình hiện trên bảng (art = null: gỡ xuống)
    if (!isTeacher(ws)) return;
    const cls = ws.cls;
    if (d.art !== null && !cls.arts.has(d.art)) return;
    cls.board = d.art;
    broadcast(cls, { t: 'board', board: boardPub(cls) });
  },
  video(ws, d) { // giáo viên dán đường dẫn YouTube để chiếu lên bảng
    if (!isTeacher(ws)) return;
    const p = parseYouTube(d.url);
    if (!p) return notice(ws, 'Đường dẫn chưa đúng. Hãy dán đường dẫn video YouTube (youtube.com hoặc youtu.be).');
    const cls = ws.cls;
    cls.video = { id: p.id, state: 'playing', pos: p.start, at: Date.now() };
    broadcast(cls, { t: 'video', v: videoPub(cls) });
  },
  videostate(ws, d) { // giáo viên bấm phát / dừng / tua: báo cho cả lớp theo kịp
    if (!isTeacher(ws) || !ws.cls.video) return;
    if (!['playing', 'paused'].includes(d.state) || !Number.isFinite(d.pos) || d.pos < 0 || d.pos > 86400) return;
    const v = ws.cls.video;
    v.state = d.state; v.pos = d.pos; v.at = Date.now();
    broadcast(ws.cls, { t: 'video', v: videoPub(ws.cls) }, ws.me); // trừ chính giáo viên vừa báo
  },
  videostop(ws) {
    if (!isTeacher(ws) || !ws.cls.video) return;
    ws.cls.video = null;
    broadcast(ws.cls, { t: 'video', v: null });
  },
  hold(ws, d) { // cầm lại / cất hình của mình
    const cls = ws.cls, me = ws.me;
    if (!cls || cls.pending.has(me.id)) return;
    if (d.on) {
      const mine = [...cls.arts.values()].filter((x) => x.owner === me.id);
      if (!mine.length) return notice(ws, 'Em chưa có hình nào được duyệt.');
      me.held = mine[mine.length - 1].id;
    } else me.held = null;
    broadcast(cls, { t: 'held', id: me.id, url: heldUrl(cls, me) });
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
  const ip = clientIp(req);
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
    if (!cls || me.ws !== ws) return; // đã rời hẳn, hoặc đã có kết nối mới thay thế
    me.ws = null; me.offlineAt = Date.now(); // mất kết nối: vẫn giữ chỗ một lúc để nối lại
    if (!cls.pending.has(me.id)) broadcast(cls, { t: 'away', id: me.id, on: true });
    touchEmpty(cls);
  });
});

setInterval(() => { for (const ws of wss.clients) ws.count = 0; }, 1000);
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  const now = Date.now();
  for (const cls of classes.values()) { // người mất kết nối quá lâu thì rời lớp
    for (const m of [...cls.members.values()]) if (!m.ws && now - m.offlineAt > GRACE_MS) removeMember(cls, m);
    for (const m of [...cls.pending.values()]) if (!m.ws && now - m.offlineAt > PENDING_GRACE_MS) removeMember(cls, m);
    const t = cls.teacher;
    if (!t.ws && t.offlineAt && !t.goneSent && now - t.offlineAt > GRACE_MS) { t.goneSent = true; broadcast(cls, { t: 'left', id: t.id }); }
  }
}, 15000);
setInterval(() => { // mỗi 10 phút: ghi nhận lớp đang hoạt động, xoá lớp quá hạn
  const now = Date.now();
  for (const cls of [...classes.values()]) {
    if (cls.teacher.ws || cls.members.size || cls.pending.size) { cls.lastActive = now; saveClass(cls); }
    else if (now - cls.lastActive > CLASS_TTL_MS) destroyClass(cls);
  }
}, 10 * 60 * 1000);
process.on('SIGTERM', () => { for (const cls of classes.values()) saveClassNow(cls); process.exit(0); });
loadClasses();

server.listen(PORT, () => console.log(`Lớp Học Nét Vẽ đang chạy tại http://localhost:${PORT}`));
