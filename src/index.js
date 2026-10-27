// Lisansüstü Panel — Cloudflare Worker
// API (/api/*) burada; arayüz dosyaları public/ klasöründen sunulur.

import { PROGRAMS, ADIM, SONUCLU, KAYIT_DONEMLERI, bosTez } from '../public/shared.js';
import { hatirlatmalar, haftalikOzet } from './hatirlatma.js';

const SESSION_DAYS = 30;
const INVITE_DAYS = 14;
const RESET_HOURS = 2;
const MAX_FILE = 25 * 1024 * 1024;

/* ---------------- Veritabanı şeması ---------------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, ad TEXT NOT NULL, role TEXT NOT NULL, pass_hash TEXT, pass_salt TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS students (user_id TEXT PRIMARY KEY, no TEXT, program TEXT NOT NULL, kayit TEXT NOT NULL, donem INTEGER NOT NULL DEFAULT 1, danisman_donem INTEGER NOT NULL DEFAULT 1, statu TEXT DEFAULT 'Normal öğretim', tez TEXT, adim TEXT, adim_tarih TEXT, kvkk_at TEXT, arsiv INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, kod TEXT NOT NULL, donem INTEGER NOT NULL, durum TEXT NOT NULL, notu INTEGER, final INTEGER, sonuc TEXT, kaynak TEXT NOT NULL DEFAULT 'program', updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, v INTEGER NOT NULL, ad TEXT NOT NULL, boyut INTEGER NOT NULL, tur TEXT, r2_key TEXT NOT NULL, created_at TEXT NOT NULL, yorum TEXT, yorum_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, kimden TEXT NOT NULL, metin TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attempts (email TEXT NOT NULL, at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reminders (student_id TEXT NOT NULL, rkey TEXT NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY (student_id, rkey))`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, actor TEXT, action TEXT, detail TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_courses_s ON courses(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_files_s ON files(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_s ON messages(student_id)`,
  // Dersler artık not girilince doğrudan tamamlanıyor; eski 'onay' kayıtlarını dönüştür
  `UPDATE courses SET durum = 'tamam' WHERE durum = 'onay'`,
];
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  // Sonradan eklenen sütunlar (varsa hata verir, yok sayılır)
  for (const sql of [`ALTER TABLE students ADD COLUMN kayit_turu TEXT NOT NULL DEFAULT 'normal'`, `ALTER TABLE students ADD COLUMN profil_tamam INTEGER NOT NULL DEFAULT 1`]) {
    try { await env.DB.prepare(sql).run(); } catch {}
  }
  schemaReady = true;
}

/* ---------------- Yardımcılar ---------------- */
const enc = new TextEncoder();
const now = () => new Date().toISOString();
const plus = ms => new Date(Date.now() + ms).toISOString();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const randToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const uid = () => crypto.randomUUID();
async function sha256(s) { return b64(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function hashPw(pw, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const normEmail = e => String(e || '').trim().toLocaleLowerCase('tr').replace(/ı/g, 'i');
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

function cookie(token, maxAge) {
  return `lp_s=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
async function body(req) {
  try { return await req.json(); } catch { fail(400, 'İstek okunamadı.'); }
}
const appUrl = env => (env.APP_URL || 'https://panel.aliammarkurt.com').replace(/\/$/, '');

/* ---------------- E-posta (Resend) ---------------- */
async function sendMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Lisansüstü Panel <panel@aliammarkurt.com>',
        to: [to], subject,
        text: `${text}\n\nPanele git: ${appUrl(env)}\n\n— Lisansüstü Panel`,
      }),
    });
    return r.ok;
  } catch { return false; }
}
async function advisorEmail(env) {
  const r = await env.DB.prepare(`SELECT email FROM users WHERE role='danisman' AND active=1 LIMIT 1`).first();
  return r?.email;
}
function notify(ctx, env, toPromise, subject, text) {
  ctx.waitUntil((async () => sendMail(env, await toPromise, subject, text))());
}
async function log(env, sid, actor, action, detail = '') {
  await env.DB.prepare(`INSERT INTO events (student_id, actor, action, detail, created_at) VALUES (?,?,?,?,?)`).bind(sid, actor, action, detail, now()).run();
}

/* ---------------- Oturum ---------------- */
async function currentUser(req, env) {
  const t = readCookie(req, 'lp_s');
  if (!t) return null;
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.ad, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).bind(await sha256(t), now()).first();
  return row || null;
}
async function startSession(env, userId) {
  const t = randToken();
  await env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)`).bind(await sha256(t), userId, plus(SESSION_DAYS * 864e5)).run();
  return cookie(t, SESSION_DAYS * 86400);
}
async function makeToken(env, userId, type) {
  const t = randToken();
  await env.DB.prepare(`DELETE FROM tokens WHERE user_id = ?`).bind(userId).run();
  const ms = type === 'reset' ? RESET_HOURS * 36e5 : INVITE_DAYS * 864e5;
  await env.DB.prepare(`INSERT INTO tokens (token_hash, user_id, type, expires_at) VALUES (?,?,?,?)`).bind(await sha256(t), userId, type, plus(ms)).run();
  return `${appUrl(env)}/${type === 'reset' ? 'sifre' : 'davet'}?t=${t}`;
}

/* ---------------- Öğrenci verisi ---------------- */
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
async function loadStudent(env, id) {
  const s = await env.DB.prepare(`SELECT u.id, u.email, u.ad, u.pass_hash, st.* FROM users u JOIN students st ON st.user_id = u.id WHERE u.id = ?`).bind(id).first();
  if (!s) return null;
  const [c, f, m] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM courses WHERE student_id = ? ORDER BY donem, id`).bind(id),
    env.DB.prepare(`SELECT id, v, ad, boyut, tur, created_at, yorum, yorum_at FROM files WHERE student_id = ? ORDER BY v DESC`).bind(id),
    env.DB.prepare(`SELECT kimden, metin, created_at FROM messages WHERE student_id = ? ORDER BY id`).bind(id),
  ]);
  return {
    id: s.id, ad: s.ad, eposta: s.email, no: s.no || '', program: s.program, kayit: s.kayit,
    donem: s.donem, danismanDonem: s.danisman_donem, statu: s.statu || '', arsiv: !!s.arsiv, kayitTuru: s.kayit_turu || 'normal', profilTamam: s.profil_tamam !== 0,
    davetBekliyor: !s.pass_hash, kvkk: s.kvkk_at,
    tez: { ...bosTez(), ...parse(s.tez, {}) },
    adim: parse(s.adim, {}), adimTarih: parse(s.adim_tarih, {}),
    dersler: c.results.map(r => ({ id: r.id, kod: r.kod, donem: r.donem, durum: r.durum, not: r.notu, final: r.final, sonuc: r.sonuc, kaynak: r.kaynak })),
    dosyalar: f.results.map(r => ({ id: r.id, v: r.v, ad: r.ad, boyut: r.boyut, tarih: r.created_at, yorum: r.yorum || '' })),
    mesajlar: m.results.map(r => ({ kimden: r.kimden, m: r.metin, t: r.created_at })),
  };
}
function canSee(user, sid) { return user.role === 'danisman' || user.id === sid; }
async function studentOr404(env, user, sid) {
  if (!canSee(user, sid)) fail(403, 'Bu öğrencinin bilgilerine erişim yetkin yok.');
  const s = await env.DB.prepare(`SELECT st.*, u.ad, u.email FROM students st JOIN users u ON u.id = st.user_id WHERE st.user_id = ?`).bind(sid).first();
  if (!s) fail(404, 'Öğrenci bulunamadı.');
  return s;
}
const intIn = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const grade = v => (v === null || v === undefined || v === '') ? null : intIn(v, 0, 100) ?? fail(400, 'Not 0 ile 100 arasında olmalı.');
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const kayitTuru = v => v === 'af' ? 'af' : 'normal';

/* ---------------- Yönlendirme ---------------- */
async function gunlukCalisma(env) {
  await ensureSchema(env);
  if (!env.RESEND_API_KEY) return { atlandi: 'E-posta ayarlı değil' };
  const r = await hatirlatmalar(env, { gonder: true, sendMail });
  if (r.pazartesi) {
    const ozet = await haftalikOzet(env);
    if (ozet) await sendMail(env, await advisorEmail(env), 'Lisansüstü Panel: haftalık özet', ozet);
  }
  return r;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(gunlukCalisma(env));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) {
      // Davet ve şifre sayfaları da arayüzün kendisidir
      return env.ASSETS.fetch(req);
    }
    try {
      await ensureSchema(env);
      if (req.method !== 'GET') {
        const origin = req.headers.get('Origin');
        if (origin && origin !== url.origin && origin !== new URL(appUrl(env)).origin) fail(403, 'Geçersiz istek kaynağı.');
        if (req.headers.get('X-LP') !== '1') fail(403, 'Geçersiz istek.');
      }
      return await route(req, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ hata: e.message }, e.status);
      console.error(e);
      return json({ hata: 'Beklenmeyen bir hata oluştu. Lütfen tekrar dene.' }, 500);
    }
  },
};

async function route(req, env, ctx, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const M = req.method;
  let m;

  /* ---- Herkese açık uçlar ---- */
  if (p === '/api/kurulum' && M === 'GET') {
    const r = await env.DB.prepare(`SELECT COUNT(*) n FROM users WHERE role='danisman'`).first();
    return json({ gerekli: r.n === 0, anahtarVar: !!env.SETUP_KEY });
  }
  if (p === '/api/kurulum' && M === 'POST') {
    const b = await body(req);
    const r = await env.DB.prepare(`SELECT COUNT(*) n FROM users WHERE role='danisman'`).first();
    if (r.n > 0) fail(400, 'Danışman hesabı zaten oluşturulmuş.');
    if (!env.SETUP_KEY || !safeEq(String(b.anahtar || ''), env.SETUP_KEY)) fail(403, 'Kurulum anahtarı hatalı.');
    const email = normEmail(b.email), ad = str(b.ad, 120);
    if (!validEmail(email) || !ad) fail(400, 'Ad ve geçerli bir e-posta gir.');
    if (String(b.sifre || '').length < 10) fail(400, 'Şifre en az 10 karakter olmalı.');
    const id = uid(), h = await hashPw(String(b.sifre));
    await env.DB.prepare(`INSERT INTO users (id, email, ad, role, pass_hash, pass_salt, created_at) VALUES (?,?,?,?,?,?,?)`).bind(id, email, ad, 'danisman', h.hash, h.salt, now()).run();
    return json({ ok: true }, 200, { 'Set-Cookie': await startSession(env, id) });
  }
  if (p === '/api/giris' && M === 'POST') {
    const b = await body(req);
    const email = normEmail(b.email);
    const since = new Date(Date.now() - 15 * 6e4).toISOString();
    const att = await env.DB.prepare(`SELECT COUNT(*) n FROM attempts WHERE email = ? AND at > ?`).bind(email, since).first();
    if (att.n >= 8) fail(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.');
    const u = await env.DB.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).bind(email).first();
    const ok = u && u.pass_hash && safeEq((await hashPw(String(b.sifre || ''), u.pass_salt)).hash, u.pass_hash);
    if (!ok) {
      await env.DB.prepare(`INSERT INTO attempts (email, at) VALUES (?,?)`).bind(email, now()).run();
      fail(401, 'E-posta veya şifre hatalı.');
    }
    await env.DB.prepare(`DELETE FROM attempts WHERE email = ?`).bind(email).run();
    return json({ ok: true }, 200, { 'Set-Cookie': await startSession(env, u.id) });
  }
  if (p === '/api/cikis' && M === 'POST') {
    const t = readCookie(req, 'lp_s');
    if (t) await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(t)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (p === '/api/sifre-unuttum' && M === 'POST') {
    const b = await body(req);
    const u = await env.DB.prepare(`SELECT id, ad, email FROM users WHERE email = ? AND active = 1 AND pass_hash IS NOT NULL`).bind(normEmail(b.email)).first();
    const mailVar = !!env.RESEND_API_KEY;
    if (u && mailVar) {
      const link = await makeToken(env, u.id, 'reset');
      ctx.waitUntil(sendMail(env, u.email, 'Şifre yenileme bağlantın', `Merhaba ${u.ad},\n\nŞifreni yenilemek için aşağıdaki bağlantıyı kullan. Bağlantı ${RESET_HOURS} saat geçerlidir:\n${link}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`));
    }
    return json({ ok: true, mailVar });
  }
  if ((m = p.match(/^\/api\/token\/([\w-]{20,})$/))) {
    const row = await env.DB.prepare(`SELECT t.type, t.user_id, u.ad, u.email, u.role FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.expires_at > ?`).bind(await sha256(m[1]), now()).first();
    if (!row) fail(404, 'Bu bağlantının süresi dolmuş ya da daha önce kullanılmış. Danışmanından yeni bağlantı iste.');
    if (M === 'GET') return json({ tur: row.type, ad: row.ad, email: row.email, rol: row.role });
    if (M === 'POST') {
      const b = await body(req);
      if (String(b.sifre || '').length < 8) fail(400, 'Şifre en az 8 karakter olmalı.');
      if (row.type === 'invite' && row.role === 'ogrenci' && !b.kvkk) fail(400, 'Devam etmek için aydınlatma metnini onaylaman gerekiyor.');
      const h = await hashPw(String(b.sifre));
      const st = [
        env.DB.prepare(`UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?`).bind(h.hash, h.salt, row.user_id),
        env.DB.prepare(`DELETE FROM tokens WHERE user_id = ?`).bind(row.user_id),
        env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(row.user_id),
      ];
      if (row.type === 'invite' && row.role === 'ogrenci') st.push(env.DB.prepare(`UPDATE students SET kvkk_at = ? WHERE user_id = ?`).bind(now(), row.user_id));
      await env.DB.batch(st);
      return json({ ok: true }, 200, { 'Set-Cookie': await startSession(env, row.user_id) });
    }
  }

  /* ---- Oturum gerektiren uçlar ---- */
  const user = await currentUser(req, env);
  if (!user) fail(401, 'Oturumun sona ermiş. Lütfen tekrar giriş yap.');
  const isAdv = user.role === 'danisman';

  if (p === '/api/ben' && M === 'GET') {
    return json({ kullanici: { id: user.id, ad: user.ad, email: user.email, rol: user.role }, mailVar: !!env.RESEND_API_KEY });
  }
  if (p === '/api/sifre' && M === 'POST') {
    const b = await body(req);
    const u = await env.DB.prepare(`SELECT pass_hash, pass_salt FROM users WHERE id = ?`).bind(user.id).first();
    if (!safeEq((await hashPw(String(b.eski || ''), u.pass_salt)).hash, u.pass_hash)) fail(400, 'Mevcut şifre hatalı.');
    if (String(b.yeni || '').length < 8) fail(400, 'Yeni şifre en az 8 karakter olmalı.');
    const h = await hashPw(String(b.yeni));
    await env.DB.prepare(`UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?`).bind(h.hash, h.salt, user.id).run();
    return json({ ok: true });
  }

  if (p === '/api/hatirlatmalar' && M === 'GET') {
    if (!isAdv) fail(403, 'Yetkin yok.');
    const r = await hatirlatmalar(env, { gonder: false });
    return json({ ...r, mailVar: !!env.RESEND_API_KEY });
  }
  if (p === '/api/hatirlatmalar/gonder' && M === 'POST') {
    if (!isAdv) fail(403, 'Yetkin yok.');
    if (!env.RESEND_API_KEY) fail(400, 'E-posta gönderimi ayarlı değil.');
    const r = await hatirlatmalar(env, { gonder: true, sendMail });
    return json({ ok: true, gonderilen: r.liste.length });
  }
  if (p === '/api/ogrenciler' && M === 'GET') {
    const ids = isAdv
      ? (await env.DB.prepare(`SELECT user_id FROM students ORDER BY arsiv, user_id`).all()).results.map(r => r.user_id)
      : [user.id];
    const list = [];
    for (const id of ids) { const s = await loadStudent(env, id); if (s) list.push(s); }
    return json({ ogrenciler: list });
  }
  if (p === '/api/ogrenciler' && M === 'POST') {
    if (!isAdv) fail(403, 'Yalnızca danışman öğrenci ekleyebilir.');
    const b = await body(req);
    const email = normEmail(b.email), ad = str(b.ad, 120);
    if (!ad || !validEmail(email)) fail(400, 'Öğrencinin adını ve geçerli e-postasını gir.');
    if (!PROGRAMS[b.program]) fail(400, 'Program seç.');
    if (!KAYIT_DONEMLERI.includes(b.kayit)) fail(400, 'Kayıt dönemi seç.');
    const exists = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    if (exists) fail(409, 'Bu e-posta ile kayıtlı bir hesap zaten var.');
    const id = uid();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, ad, role, created_at) VALUES (?,?,?,?,?)`).bind(id, email, ad, 'ogrenci', now()),
      env.DB.prepare(`INSERT INTO students (user_id, no, program, kayit, donem, danisman_donem, statu, tez, adim, adim_tarih, kayit_turu) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, str(b.no, 30), b.program, b.kayit, intIn(b.donem, 1, 12) || 1, intIn(b.danismanDonem, 1, 12) || 1, str(b.statu, 60) || 'Normal öğretim', JSON.stringify(bosTez()), '{}', '{}', kayitTuru(b.kayitTuru)),
    ]);
    const link = await makeToken(env, id, 'invite');
    const gitti = await sendMail(env, email, 'Lisansüstü Panel davetin', `Merhaba ${ad},\n\nDanışmanın ${user.ad} seni Lisansüstü Panel'e davet etti. Bu panelde ders ve tez sürecini takip edebilir, dosyalarını yükleyebilir ve danışmanınla yazışabilirsin.\n\nŞifreni belirlemek için bağlantı (${INVITE_DAYS} gün geçerli):\n${link}`);
    await log(env, id, user.id, 'ogrenci-eklendi', ad);
    return json({ ok: true, id, link, mailGitti: gitti });
  }

  if (p === '/api/ogrenciler/toplu' && M === 'POST') {
    if (!isAdv) fail(403, 'Yalnızca danışman öğrenci ekleyebilir.');
    const b = await body(req);
    const satirlar = Array.isArray(b.satirlar) ? b.satirlar.slice(0, 60) : [];
    const kayit = KAYIT_DONEMLERI.includes(b.kayit) ? b.kayit : '2026-2027 Güz';
    const sonuc = [];
    for (const sat of satirlar) {
      const email = normEmail(sat.email);
      const program = PROGRAMS[sat.program] ? sat.program : 'pdr';
      if (!validEmail(email)) { sonuc.push({ email: sat.email, durum: 'hata', mesaj: 'Geçersiz e-posta' }); continue; }
      if (await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first()) { sonuc.push({ email, durum: 'atlandi', mesaj: 'Zaten kayıtlı' }); continue; }
      const id = uid(), ad = email.split('@')[0];
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id, email, ad, role, created_at) VALUES (?,?,?,?,?)`).bind(id, email, ad, 'ogrenci', now()),
        env.DB.prepare(`INSERT INTO students (user_id, no, program, kayit, donem, danisman_donem, statu, tez, adim, adim_tarih, kayit_turu, profil_tamam) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`)
          .bind(id, '', program, kayit, 1, 1, 'Normal öğretim', JSON.stringify(bosTez()), '{}', '{}', 'normal'),
      ]);
      const link = await makeToken(env, id, 'invite');
      const gitti = await sendMail(env, email, 'Lisansüstü Panel davetin', `Merhaba,\n\nDanışmanın ${user.ad} seni Lisansüstü Panel'e davet etti. Bu panelde ders ve tez sürecini takip edebilir, dosyalarını yükleyebilir ve danışmanınla yazışabilirsin.\n\nŞifreni belirlemek için bağlantı (${INVITE_DAYS} gün geçerli):\n${link}\n\nİlk girişte kişisel bilgilerini (ad soyad, öğrenci numarası, program, kayıt dönemi, yarıyıl) tamamlaman istenecek.`);
      await log(env, id, user.id, 'ogrenci-eklendi', email);
      sonuc.push({ email, durum: 'eklendi', link, mailGitti: gitti });
      await new Promise(r => setTimeout(r, 600)); // e-posta hizmetinin saniyedeki gönderim sınırı için
    }
    return json({ ok: true, sonuc });
  }

  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)$/))) {
    const sid = m[1];
    if (M === 'GET') { await studentOr404(env, user, sid); return json({ ogrenci: await loadStudent(env, sid) }); }
    if (M === 'DELETE') {
      if (!isAdv) fail(403, 'Öğrenciyi yalnızca danışman silebilir.');
      const st = await studentOr404(env, user, sid);
      // Önce dosya deposundaki tez dosyaları
      const keys = (await env.DB.prepare(`SELECT r2_key FROM files WHERE student_id = ?`).bind(sid).all()).results.map(r => r.r2_key);
      if (keys.length && env.FILES) { for (let i = 0; i < keys.length; i += 500) await env.FILES.delete(keys.slice(i, i + 500)); }
      await env.DB.batch([
        'courses', 'files', 'messages', 'reminders',
      ].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE student_id = ?`).bind(sid)).concat([
        env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(sid),
        env.DB.prepare(`DELETE FROM tokens WHERE user_id = ?`).bind(sid),
        env.DB.prepare(`DELETE FROM students WHERE user_id = ?`).bind(sid),
        env.DB.prepare(`DELETE FROM users WHERE id = ? AND role = 'ogrenci'`).bind(sid),
        env.DB.prepare(`UPDATE events SET student_id = NULL, detail = 'silindi' WHERE student_id = ?`).bind(sid),
      ]));
      await log(env, null, user.id, 'ogrenci-silindi', st.email);
      return json({ ok: true });
    }
  }

  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/baglanti$/)) && M === 'POST') {
    if (!isAdv) fail(403, 'Yetkin yok.');
    const s = await studentOr404(env, user, m[1]);
    const u = await env.DB.prepare(`SELECT pass_hash FROM users WHERE id = ?`).bind(m[1]).first();
    const tur = u.pass_hash ? 'reset' : 'invite';
    const link = await makeToken(env, m[1], tur);
    const gitti = await sendMail(env, s.email, tur === 'reset' ? 'Şifre yenileme bağlantın' : 'Lisansüstü Panel davetin',
      `Merhaba ${s.ad},\n\n${tur === 'reset' ? 'Danışmanın senin için şifre yenileme bağlantısı oluşturdu' : 'Lisansüstü Panel davet bağlantın'}:\n${link}`);
    return json({ ok: true, link, mailGitti: gitti });
  }

  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/profil$/)) && M === 'PUT') {
    const sid = m[1]; await studentOr404(env, user, sid);
    const b = await body(req);
    if (isAdv) {
      const email = normEmail(b.eposta), ad = str(b.ad, 120);
      if (!ad || !validEmail(email)) fail(400, 'Ad ve geçerli e-posta gerekli.');
      const clash = await env.DB.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).bind(email, sid).first();
      if (clash) fail(409, 'Bu e-posta başka bir hesapta kullanılıyor.');
      if (!PROGRAMS[b.program] || !KAYIT_DONEMLERI.includes(b.kayit)) fail(400, 'Program ve kayıt dönemi geçersiz.');
      await env.DB.batch([
        env.DB.prepare(`UPDATE users SET ad = ?, email = ? WHERE id = ?`).bind(ad, email, sid),
        env.DB.prepare(`UPDATE students SET no = ?, program = ?, kayit = ?, donem = ?, danisman_donem = ?, statu = ?, arsiv = ?, kayit_turu = ? WHERE user_id = ?`)
          .bind(str(b.no, 30), b.program, b.kayit, intIn(b.donem, 1, 12) || 1, intIn(b.danismanDonem, 1, 12) || 1, str(b.statu, 60), b.arsiv ? 1 : 0, kayitTuru(b.kayitTuru), sid),
      ]);
    } else {
      // Öğrenci e-posta (giriş adresi) ve arşiv dışındaki her şeyi güncelleyebilir
      const ad = str(b.ad, 120);
      if (!ad) fail(400, 'Ad soyad boş olamaz.');
      if (!PROGRAMS[b.program] || !KAYIT_DONEMLERI.includes(b.kayit)) fail(400, 'Program ve kayıt dönemi geçersiz.');
      await env.DB.batch([
        env.DB.prepare(`UPDATE users SET ad = ? WHERE id = ?`).bind(ad, sid),
        env.DB.prepare(`UPDATE students SET no = ?, program = ?, kayit = ?, donem = ?, danisman_donem = ?, statu = ?, kayit_turu = ?, profil_tamam = 1 WHERE user_id = ?`)
          .bind(str(b.no, 30), b.program, b.kayit, intIn(b.donem, 1, 12) || 1, intIn(b.danismanDonem, 1, 12) || 1, str(b.statu, 60), kayitTuru(b.kayitTuru), sid),
      ]);
    }
    return json({ ok: true });
  }

  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/tez$/)) && M === 'PUT') {
    const sid = m[1]; const s = await studentOr404(env, user, sid);
    const b = await body(req), eski = { ...bosTez(), ...parse(s.tez, {}) };
    const t = {
      baslikTr: str(b.baslikTr, 400), baslikEn: str(b.baslikEn, 400),
      oneriTarih: /^\d{4}-\d{2}-\d{2}$/.test(b.oneriTarih || '') ? b.oneriTarih : '',
      komisyon: [0, 1, 2].map(i => str(b.komisyon?.[i], 200)),
      sinavTarih: /^\d{4}-\d{2}-\d{2}$/.test(b.sinavTarih || '') ? b.sinavTarih : '',
      sinavSaat: /^\d{2}:\d{2}$/.test(b.sinavSaat || '') ? b.sinavSaat : '',
      sinavYer: str(b.sinavYer, 200),
      juri: [0, 1, 2, 3, 4].map(i => i === 0 ? eski.juri[0] : { u: str(b.juri?.[i]?.u, 40), a: str(b.juri?.[i]?.a, 120), k: str(b.juri?.[i]?.k, 160) }),
    };
    await env.DB.prepare(`UPDATE students SET tez = ? WHERE user_id = ?`).bind(JSON.stringify(t), sid).run();
    return json({ ok: true });
  }

  /* ---- Dersler ---- */
  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/dersler$/)) && M === 'POST') {
    const sid = m[1]; const s = await studentOr404(env, user, sid);
    const b = await body(req);
    const c = PROGRAMS[s.program].katalog.find(x => x.kod === b.kod);
    if (!c) fail(400, 'Bu ders programın ders listesinde yok.');
    const donem = intIn(b.donem, 1, 12) || fail(400, 'Yarıyıl seç.');
    const kaynak = ['program', 'lisans', 'dis'].includes(b.kaynak) ? b.kaynak : 'program';
    const notu = grade(b.not), final = grade(b.final);
    const sonuc = SONUCLU.includes(c.tur) && b.sonuc === 'basarili' ? 'basarili' : null;
    const sonucVar = notu !== null || sonuc;
    const durum = sonucVar ? 'tamam' : 'aliyor';
    await env.DB.prepare(`INSERT INTO courses (student_id, kod, donem, durum, notu, final, sonuc, kaynak, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(sid, c.kod, donem, durum, notu, final, sonuc, kaynak, now()).run();
    if (!isAdv && sonucVar) notify(ctx, env, advisorEmail(env), `${s.ad}: ders sonucu girildi`, `${s.ad}, ${c.kod} ${c.ad} dersinin sonucunu girdi${notu !== null ? ` (not: ${notu}${final !== null ? ', final: ' + final : ''})` : ' (başarılı)'}.`);
    return json({ ok: true });
  }
  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/dersler\/(\d+)$/))) {
    const sid = m[1], cid = +m[2]; const s = await studentOr404(env, user, sid);
    const r = await env.DB.prepare(`SELECT * FROM courses WHERE id = ? AND student_id = ?`).bind(cid, sid).first();
    if (!r) fail(404, 'Ders kaydı bulunamadı.');
    const c = PROGRAMS[s.program].katalog.find(x => x.kod === r.kod) || { kod: r.kod, ad: r.kod, tur: 'secmeli' };
    if (M === 'DELETE') {
      await env.DB.prepare(`DELETE FROM courses WHERE id = ?`).bind(cid).run();
      return json({ ok: true });
    }
    if (M === 'PUT') {
      const b = await body(req);
      if (isAdv && b.islem) {
        if (b.islem === 'onayla') {
          await env.DB.prepare(`UPDATE courses SET durum='tamam', updated_at=? WHERE id=?`).bind(now(), cid).run();
          notify(ctx, env, s.email, `Dersin onaylandı: ${c.ad}`, `Merhaba ${s.ad},\n\n${c.kod} ${c.ad} dersin danışmanın tarafından onaylandı. İlerleme çubuğun güncellendi.`);
        } else if (b.islem === 'duzeltme') {
          const not = str(b.not, 1000);
          await env.DB.batch([
            env.DB.prepare(`UPDATE courses SET durum='duzeltme', updated_at=? WHERE id=?`).bind(now(), cid),
            env.DB.prepare(`INSERT INTO messages (student_id, kimden, metin, created_at) VALUES (?,?,?,?)`).bind(sid, 'danisman', `Düzeltme istendi: ${c.kod} ${c.ad}${not ? ' — ' + not : ''}`, now()),
          ]);
          notify(ctx, env, s.email, `Düzeltme istendi: ${c.ad}`, `Merhaba ${s.ad},\n\n${c.kod} ${c.ad} dersi için danışmanın düzeltme istedi.${not ? '\n\nNot: ' + not : ''}`);
        } else if (b.islem === 'geri') {
          await env.DB.prepare(`UPDATE courses SET durum = CASE WHEN notu IS NULL AND sonuc IS NULL THEN 'aliyor' ELSE 'onay' END, updated_at=? WHERE id=?`).bind(now(), cid).run();
        } else fail(400, 'Bilinmeyen işlem.');
        return json({ ok: true });
      }
      // Sonuç girme / düzeltme
      const notu = grade(b.not), final = grade(b.final);
      const sonuc = SONUCLU.includes(c.tur) && b.sonuc === 'basarili' ? 'basarili' : null;
      const donem = intIn(b.donem, 1, 12) || r.donem;
      const kaynak = ['program', 'lisans', 'dis'].includes(b.kaynak) ? b.kaynak : r.kaynak;
      const sonucVar = notu !== null || sonuc;
      const durum = sonucVar ? 'tamam' : 'aliyor';
      await env.DB.prepare(`UPDATE courses SET notu=?, final=?, sonuc=?, donem=?, kaynak=?, durum=?, updated_at=? WHERE id=?`).bind(notu, final, sonuc, donem, kaynak, durum, now(), cid).run();
      if (!isAdv && sonucVar) notify(ctx, env, advisorEmail(env), `${s.ad}: ders sonucu girildi`, `${s.ad}, ${c.kod} ${c.ad} dersinin sonucunu girdi${notu !== null ? ` (not: ${notu}${final !== null ? ', final: ' + final : ''})` : ' (başarılı)'}.`);
      return json({ ok: true });
    }
  }

  /* ---- Tez adımları ---- */
  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/adim\/(\w+)$/)) && M === 'POST') {
    const sid = m[1], k = m[2]; const s = await studentOr404(env, user, sid);
    const A = ADIM[k]; if (!A) fail(404, 'Böyle bir adım yok.');
    const b = await body(req);
    const adim = parse(s.adim, {}), tarih = parse(s.adim_tarih, {});
    const d = adim[k];
    let mesaj = null;
    if (!isAdv) {
      if (b.islem === 'gonder') {
        if (A.by === 'danisman') fail(403, 'Bu adımı danışmanın işaretler.');
        if (d && d !== 'duzeltme') fail(400, 'Bu adım zaten gönderilmiş.');
        adim[k] = 'onay'; tarih[k] = now();
        notify(ctx, env, advisorEmail(env), `${s.ad}: onay bekleyen adım`, `${s.ad}, “${A.ad}” adımını tamamladığını bildirdi ve onayına gönderdi.`);
      } else if (b.islem === 'geri-cek') {
        if (d !== 'onay') fail(400, 'Yalnızca onay bekleyen adım geri çekilebilir.');
        delete adim[k];
      } else fail(400, 'Bilinmeyen işlem.');
    } else {
      if (b.islem === 'onayla' || b.islem === 'isaretle') {
        adim[k] = 'tamam'; tarih[k] = now();
        notify(ctx, env, s.email, `Tez sürecinde ilerleme: ${A.ad}`, `Merhaba ${s.ad},\n\n“${A.ad}” adımın danışmanın tarafından ${b.islem === 'onayla' ? 'onaylandı' : 'tamamlandı olarak işaretlendi'}. İlerleme çubuğun güncellendi.`);
      } else if (b.islem === 'duzeltme') {
        adim[k] = 'duzeltme';
        const not = str(b.not, 1000);
        mesaj = `Düzeltme istendi: ${A.ad}${not ? ' — ' + not : ''}`;
        notify(ctx, env, s.email, `Düzeltme istendi: ${A.ad}`, `Merhaba ${s.ad},\n\n“${A.ad}” adımı için danışmanın düzeltme istedi.${not ? '\n\nNot: ' + not : ''}`);
      } else if (b.islem === 'sifirla') {
        delete adim[k]; delete tarih[k];
      } else fail(400, 'Bilinmeyen işlem.');
    }
    const st = [env.DB.prepare(`UPDATE students SET adim = ?, adim_tarih = ? WHERE user_id = ?`).bind(JSON.stringify(adim), JSON.stringify(tarih), sid)];
    if (mesaj) st.push(env.DB.prepare(`INSERT INTO messages (student_id, kimden, metin, created_at) VALUES (?,?,?,?)`).bind(sid, 'danisman', mesaj, now()));
    await env.DB.batch(st);
    await log(env, sid, user.id, 'adim-' + b.islem, k);
    return json({ ok: true });
  }

  /* ---- Mesajlar ---- */
  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/mesajlar$/)) && M === 'POST') {
    const sid = m[1]; const s = await studentOr404(env, user, sid);
    const b = await body(req); const metin = str(b.metin, 4000);
    if (!metin) fail(400, 'Boş not gönderilemez.');
    await env.DB.prepare(`INSERT INTO messages (student_id, kimden, metin, created_at) VALUES (?,?,?,?)`).bind(sid, isAdv ? 'danisman' : 'ogrenci', metin, now()).run();
    if (isAdv) notify(ctx, env, s.email, 'Danışmanından yeni not', `Merhaba ${s.ad},\n\nDanışmanın panelde sana bir not yazdı:\n\n${metin}`);
    else notify(ctx, env, advisorEmail(env), `${s.ad}: yeni not`, `${s.ad} panelde bir not bıraktı:\n\n${metin}`);
    return json({ ok: true });
  }

  /* ---- Tez dosyaları ---- */
  if ((m = p.match(/^\/api\/ogrenciler\/([\w-]+)\/dosyalar$/)) && M === 'POST') {
    const sid = m[1]; const s = await studentOr404(env, user, sid);
    if (!env.FILES) fail(503, 'Dosya depolama henüz bağlanmadı.');
    const form = await req.formData();
    const f = form.get('dosya');
    if (!f || typeof f === 'string') fail(400, 'Dosya seçilmedi.');
    if (f.size > MAX_FILE) fail(413, 'Dosya 25 MB\'tan büyük olamaz.');
    const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    if (!['doc', 'docx', 'pdf', 'odt', 'rtf'].includes(ext)) fail(400, 'Yalnızca Word, PDF, ODT veya RTF yükleyebilirsin.');
    const last = await env.DB.prepare(`SELECT MAX(v) v FROM files WHERE student_id = ?`).bind(sid).first();
    const v = (last?.v || 0) + 1;
    const ad = f.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 150);
    const key = `ogrenci/${sid}/v${v}-${uid()}.${ext}`;
    await env.FILES.put(key, f.stream(), { httpMetadata: { contentType: f.type || 'application/octet-stream' } });
    await env.DB.prepare(`INSERT INTO files (student_id, v, ad, boyut, tur, r2_key, created_at) VALUES (?,?,?,?,?,?,?)`).bind(sid, v, ad, f.size, f.type || '', key, now()).run();
    if (!isAdv) notify(ctx, env, advisorEmail(env), `${s.ad}: yeni tez sürümü (v${v})`, `${s.ad} panele yeni bir tez dosyası yükledi: ${ad} (v${v}).`);
    return json({ ok: true, v });
  }
  if ((m = p.match(/^\/api\/dosyalar\/(\d+)$/)) && M === 'GET') {
    const f = await env.DB.prepare(`SELECT * FROM files WHERE id = ?`).bind(+m[1]).first();
    if (!f || !canSee(user, f.student_id)) fail(404, 'Dosya bulunamadı.');
    const o = await env.FILES.get(f.r2_key);
    if (!o) fail(404, 'Dosya depoda bulunamadı.');
    return new Response(o.body, { headers: {
      'Content-Type': f.tur || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.ad)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  }
  if ((m = p.match(/^\/api\/dosyalar\/(\d+)\/yorum$/)) && M === 'PUT') {
    if (!isAdv) fail(403, 'Yorumu yalnızca danışman yazabilir.');
    const f = await env.DB.prepare(`SELECT f.*, u.email, u.ad sad FROM files f JOIN users u ON u.id = f.student_id WHERE f.id = ?`).bind(+m[1]).first();
    if (!f) fail(404, 'Dosya bulunamadı.');
    const b = await body(req); const yorum = str(b.yorum, 4000);
    if (!yorum) fail(400, 'Yorum boş olamaz.');
    await env.DB.prepare(`UPDATE files SET yorum = ?, yorum_at = ? WHERE id = ?`).bind(yorum, now(), f.id).run();
    notify(ctx, env, f.email, `Tez sürümüne yorum (v${f.v})`, `Merhaba ${f.sad},\n\nDanışmanın v${f.v} sürümüne yorum yazdı:\n\n${yorum}`);
    return json({ ok: true });
  }

  fail(404, 'Bulunamadı.');
}
