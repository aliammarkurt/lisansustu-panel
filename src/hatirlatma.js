// Dönemlik hatırlatmalar: her sabah çalışır, her hatırlatmayı bir öğrenciye yalnızca bir kez gönderir.
import { PROGRAMS, SONUCLU } from '../public/shared.js';

const GUN = 864e5;
// Türkiye saatiyle bugün
function bugun() {
  const d = new Date(Date.now() + 3 * 36e5);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, g: d.getUTCDate(), hafta: d.getUTCDay(), iso: d.toISOString().slice(0, 10), ms: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) };
}
// Akademik dönem anahtarı: 2026-guz, 2027-bahar
function donemAnahtari(t) {
  if (t.m >= 9) return `${t.y}-guz`;
  if (t.m === 1) return `${t.y - 1}-guz`;
  return `${t.y}-bahar`;
}
const gunFarki = (isoA, ms) => Math.round((Date.UTC(...isoA.slice(0, 10).split('-').map((x, i) => i === 1 ? x - 1 : +x)) - ms) / GUN);
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

function gecti(r, c) {
  if (SONUCLU.includes(c.tur) || r.notu == null) return r.sonuc === 'basarili';
  return r.notu >= 70 && (r.final == null || r.final >= 70);
}

// Tek öğrenci için bugün geçerli hatırlatmalar
function kurallar(s, dersler, sonEtkinlik, t) {
  const L = [];
  const ad = s.ad.split(' ')[0];
  const adim = parse(s.adim, {}), tarih = parse(s.adim_tarih, {}), tez = parse(s.tez, {});
  const kat = PROGRAMS[s.program]?.katalog || [];
  const k = kod => kat.find(c => c.kod === kod) || { tur: 'secmeli', kredi: 0, ad: kod };
  const donem = donemAnahtari(t);
  const aliyor = dersler.filter(r => r.durum === 'aliyor');
  let kredi = 0, ders = 0, seminer = false;
  for (const r of dersler) {
    const c = k(r.kod);
    if (r.durum === 'tamam' && gecti(r, c)) {
      if (c.tur === 'zorunlu' || c.tur === 'secmeli') { kredi += c.kredi; ders++; }
      if (c.tur === 'seminer') seminer = true;
    }
  }

  // 1. Dönem başı: yarıyıl ve ders güncellemesi
  const donemBasi = (t.m === 9 && t.g >= 22) || (t.m === 10 && t.g <= 12) || (t.m === 2 && t.g >= 10 && t.g <= 26);
  if (donemBasi) L.push({ key: `donem-basi-${donem}`, konu: 'Yeni dönem başladı: panelini güncelle',
    metin: `Merhaba ${ad},\n\nYeni dönem hayırlı olsun! Panelde şu an ${s.donem}. yarıyılda görünüyorsun. Yarıyıl bilgin değiştiyse "Kişisel bilgiler"den güncelle, bu dönem aldığın dersleri de "Ders durumu" bölümünden "Alıyorum" ile ekle. Böylece ilerleme çubuğun güncel kalır.` });

  // 2. Dönem sonu: not girişi
  const notDonemi = (t.m === 1 && t.g >= 20) || (t.m === 2 && t.g <= 9) || (t.m === 6 && t.g >= 20) || (t.m === 7 && t.g <= 10);
  if (notDonemi && aliyor.length) L.push({ key: `not-gir-${donem}`, konu: 'Notların açıklandıysa panele gir',
    metin: `Merhaba ${ad},\n\nDönem sonu geldi. Panelde hâlâ "alıyor" görünen ${aliyor.length} dersin var: ${aliyor.map(r => k(r.kod).ad).join(', ')}.\n\nNotların açıklandıysa "Ders durumu" bölümünden "Not gir" ile ekle; dersler yeşile döner ve çubuğun bir adım daha dolar.` });

  // 3. Tez konusu (2. yarıyıldan itibaren, ayda bir)
  if (s.donem >= 2 && !['tamam', 'onay'].includes(adim.konu)) L.push({ key: `tez-konusu-${t.y}-${t.m}`, konu: 'Tez konusu için küçük bir hatırlatma',
    metin: `Merhaba ${ad},\n\nYönetmeliğe göre tez konusunun en geç 2. yarıyıl sonuna kadar belirlenip enstitüye önerilmesi gerekiyor. Aklındaki fikirleri konuşmak için panelden bana not bırakabilir ya da görüşme isteyebilirsin. Belirlediğinde "Tez süreci"nde ilk adımı işaretlemeyi unutma.` });

  // 4. Ders dönemi sonu (normal kayıt, 4. yarıyıl): kredili dersler ve seminer
  if (s.kayit_turu !== 'af' && s.donem >= 4 && (kredi < 21 || ders < 7 || !seminer)) {
    const eksik = [];
    if (kredi < 21 || ders < 7) eksik.push(`kredili dersler (${kredi}/21 kredi, ${ders}/7 ders)`);
    if (!seminer) eksik.push('seminer');
    L.push({ key: `ders-donemi-${donem}`, konu: 'Ders dönemi: tamamlanması gerekenler',
      metin: `Merhaba ${ad},\n\nYönetmeliğe göre 4. yarıyıl sonunda kredili derslerin ve seminerin tamamlanmış olması gerekiyor. Panelde eksik görünenler: ${eksik.join(' ve ')}. Bu derslerin sonuçları girilmediyse panele eklemen yeterli; eksik bir ders varsa birlikte planlayalım.` });
  }

  // 5. Savunma yaklaşıyor
  if (tez.sinavTarih) {
    const kalan = gunFarki(tez.sinavTarih, t.ms);
    if (kalan === 7 || kalan === 1) L.push({ key: `savunma-${kalan}-${tez.sinavTarih}`, konu: kalan === 7 ? 'Savunmana bir hafta kaldı' : 'Savunman yarın',
      metin: `Merhaba ${ad},\n\n${kalan === 7 ? 'Tez savunmana bir hafta kaldı' : 'Tez savunman yarın'}: ${tez.sinavTarih.split('-').reverse().join('.')}${tez.sinavSaat ? ', saat ' + tez.sinavSaat : ''}${tez.sinavYer ? ', ' + tez.sinavYer : ''}.\n\n${kalan === 7 ? 'Sunumunu hazırlarken bir prova yapmak istersen haber ver. ' : ''}Başarılar dilerim!` });
  }

  // 6. Savunma sonrası ciltli teslim (1 ay)
  if (adim.savunma === 'tamam' && adim.ciltli !== 'tamam' && tarih.savunma) {
    const gecen = -gunFarki(tarih.savunma, t.ms);
    if (gecen >= 14) L.push({ key: `ciltli-14-${tarih.savunma.slice(0, 10)}`, konu: 'Ciltli tez teslimi için hatırlatma',
      metin: `Merhaba ${ad},\n\nTekrar tebrikler! Savunmadan sonra tezin ciltlenmiş en az 3 kopyasını 1 ay içinde enstitüye teslim etmen gerekiyor. Teslim ettiğinde panelde "Ciltli tezin teslimi" adımını işaretle. Gerekli formlar "Belgeler" bölümünde hazır.` });
    if (gecen >= 25) L.push({ key: `ciltli-25-${tarih.savunma.slice(0, 10)}`, konu: 'Ciltli teslim için son günler',
      metin: `Merhaba ${ad},\n\nCiltli tez teslim süresinin dolmasına birkaç gün kaldı. Ek süre gerekirse enstitüden bir ay uzatma istenebiliyor; ihtiyacın varsa hemen haber ver.` });
  }

  // 7. Uzun süredir sessizlik (tez konusu belli, 45 gün etkinlik yok)
  if (adim.konu === 'tamam' && sonEtkinlik && adim.savunma !== 'tamam') {
    const gecen = -gunFarki(sonEtkinlik, t.ms);
    if (gecen >= 45) L.push({ key: `sessiz-${sonEtkinlik.slice(0, 10)}`, konu: 'Tez çalışman nasıl gidiyor?',
      metin: `Merhaba ${ad},\n\nBir süredir panelde bir güncelleme görmedim. Tez çalışman nasıl gidiyor? Takıldığın bir yer varsa ya da konuşmak istersen panelden bir not bırak; birlikte bakalım.` });
  }
  return L;
}

// Tüm öğrenciler için hesapla; gonder=true ise e-posta at ve kaydet
export async function hatirlatmalar(env, { gonder = false, sendMail } = {}) {
  const t = bugun();
  const ogr = (await env.DB.prepare(`SELECT u.id, u.ad, u.email, st.* FROM users u JOIN students st ON st.user_id = u.id WHERE u.active = 1 AND st.arsiv = 0 AND u.pass_hash IS NOT NULL`).all()).results;
  const gonderilmis = new Set((await env.DB.prepare(`SELECT student_id || '|' || rkey k FROM reminders`).all()).results.map(r => r.k));
  const sonuc = [];
  for (const s of ogr) {
    const [c, son] = await env.DB.batch([
      env.DB.prepare(`SELECT kod, durum, notu, final, sonuc FROM courses WHERE student_id = ?`).bind(s.id),
      env.DB.prepare(`SELECT MAX(x) son FROM (SELECT MAX(created_at) x FROM files WHERE student_id = ?1 UNION ALL SELECT MAX(created_at) FROM messages WHERE student_id = ?1 AND kimden = 'ogrenci' UNION ALL SELECT MAX(updated_at) FROM courses WHERE student_id = ?1)`).bind(s.id),
    ]);
    const tarihler = Object.values(parse(s.adim_tarih, {}));
    const sonEtkinlik = [son.results[0]?.son, ...tarihler].filter(Boolean).sort().pop() || null;
    for (const h of kurallar(s, c.results, sonEtkinlik, t)) {
      if (gonderilmis.has(`${s.id}|${h.key}`)) continue;
      sonuc.push({ ogrenci: s.ad, email: s.email, konu: h.konu, metin: h.metin });
      if (gonder) {
        const ok = await sendMail(env, s.email, h.konu, h.metin);
        if (ok) await env.DB.prepare(`INSERT OR IGNORE INTO reminders (student_id, rkey, sent_at) VALUES (?,?,?)`).bind(s.id, h.key, new Date().toISOString()).run();
      }
    }
  }
  return { tarih: t.iso, pazartesi: t.hafta === 1, liste: sonuc };
}

const KONULAR = [['donem-basi', 'dönem başı güncellemesi'], ['not-gir', 'not girişi'], ['tez-konusu', 'tez konusu'], ['ders-donemi', 'ders dönemi sonu'], ['savunma', 'savunma yaklaşıyor'], ['ciltli', 'ciltli teslim'], ['sessiz', 'uzun süredir güncelleme yok']];
const KONU_ADI = k => (KONULAR.find(([p]) => k.startsWith(p)) || [, k])[1];

// Danışmana haftalık özet (pazartesi)
export async function haftalikOzet(env) {
  const gonderilen = (await env.DB.prepare(`SELECT u.ad ogrenci, r.rkey FROM reminders r JOIN users u ON u.id = r.student_id WHERE r.sent_at > ?`).bind(new Date(Date.now() - 7 * GUN).toISOString()).all()).results;
  const ogr = (await env.DB.prepare(`SELECT u.id, u.ad, st.adim, st.tez FROM users u JOIN students st ON st.user_id = u.id WHERE u.active = 1 AND st.arsiv = 0`).all()).results;
  const bekleyen = [], savunma = [];
  const t = bugun();
  for (const s of ogr) {
    const adim = parse(s.adim, {}), tez = parse(s.tez, {});
    const n = Object.values(adim).filter(x => x === 'onay').length;
    if (n) bekleyen.push(`${s.ad}: ${n} tez adımı onayınızı bekliyor`);
    if (tez.sinavTarih) { const k = gunFarki(tez.sinavTarih, t.ms); if (k >= 0 && k <= 30) savunma.push(`${s.ad}: ${tez.sinavTarih.split('-').reverse().join('.')} (${k} gün sonra)`); }
  }
  const yorumsuz = (await env.DB.prepare(`SELECT u.ad, f.v FROM files f JOIN users u ON u.id = f.student_id JOIN students st ON st.user_id = u.id WHERE (f.yorum IS NULL OR f.yorum = '') AND st.arsiv = 0`).all()).results;
  if (!bekleyen.length && !savunma.length && !yorumsuz.length && !gonderilen.length) return null;
  const blok = (b, L) => L.length ? `${b}\n${L.map(x => '• ' + x).join('\n')}\n\n` : '';
  return 'Günaydın Hocam,\n\nLisansüstü Panel haftalık özeti:\n\n'
    + blok('Onay bekleyenler', bekleyen)
    + blok('Yorum bekleyen tez sürümleri', yorumsuz.map(f => `${f.ad}: v${f.v}`))
    + blok('Önümüzdeki 30 gündeki savunmalar', savunma)
    + blok('Son bir haftada öğrencilere giden hatırlatmalar', gonderilen.map(h => `${h.ogrenci}: ${KONU_ADI(h.rkey)}`));
}
