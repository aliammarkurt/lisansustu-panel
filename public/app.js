// Lisansüstü Panel — arayüz
import { PROGRAMS, TUR_AD, SONUCLU, ADIMLAR, ADIM, KAYIT_DONEMLERI } from './shared.js';
import { belgeVerisi, BELGE_SABLON, dosyaAdi, ilgiEki } from './belge-veri.js';

const DANISMAN = 'Dr. Öğr. Üyesi Ali Ammar Kurt';

/* ======================== DURUM ======================== */
const S = {
  ekran: 'yukleniyor',   // yukleniyor | giris | kurulum | token | unuttum | uygulama
  ben: null, mailVar: false,
  students: [], viewing: null, section: 'genel',
  collapsed: false, mopen: false, modal: null, gecici: null, celebrate: null,
  notEdit: null, ekleKod: null, ekleAcik: false, sonLink: null, token: null, tokenBilgi: null, hata: '',
  mesgul: false,
};
const isAdv = () => S.ben?.rol === 'danisman';
const st = id => S.students.find(s => s.id === id);
const cur = () => isAdv() ? st(S.viewing) : S.students[0];
const kat = (s, kod) => PROGRAMS[s.program].katalog.find(c => c.kod === kod) || { kod, ad: kod, kredi: 0, akts: 0, tur: 'secmeli' };
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Math.round(n * 10) / 10).toLocaleString('tr-TR');
const tarihFmt = iso => iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const boyutFmt = b => b > 1e6 ? fmt(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
const today = () => new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

/* ======================== API ======================== */
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { 'X-LP': '1' }, credentials: 'same-origin' };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  const r = await fetch('/api' + path, init);
  let data = {};
  try { data = await r.json(); } catch {}
  if (r.status === 401 && !opts.anon) { S.ekran = 'giris'; S.ben = null; render(); throw new Error(data.hata || 'Oturum sona erdi.'); }
  if (!r.ok) throw new Error(data.hata || 'İşlem tamamlanamadı.');
  return data;
}
async function yukleHepsi() {
  const d = await api('/ogrenciler');
  S.students = d.ogrenciler;
}
async function yenile(sid) {
  const d = await api('/ogrenciler/' + sid);
  const i = S.students.findIndex(s => s.id === sid);
  if (i >= 0) S.students[i] = d.ogrenci; else S.students.push(d.ogrenci);
}

/* ======================== TEMA ======================== */
const tema = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function temaUygula(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('lp-tema', t); } catch (e) {} }

/* ======================== KURAL MOTORU ======================== */
function yonetmelik(kayit, tur) {
  if (tur === 'af') return { ad: 'Af kapsamında dönüş', not: `Dönüş dönemi: ${kayit}. Süreler ve uygulanacak hükümler enstitü kararına göre; panel ders ve tez koşullarını yönetmeliğe göre izler.` };
  if (kayit >= '2026-2027') return { ad: '28/6/2026 tarihli yönetmelik', not: '' };
  if (kayit === '2025-2026 Bahar') return { ad: '14/12/2025 tarihli yönetmelik', not: 'Geçici Madde 1 gereği' };
  return { ad: '24/9/2023 tarihli yönetmelik', not: 'Geçici Madde 1 gereği; kurallar o yönetmeliğe göre doğrulanacak' };
}
function gecti(r, c) {
  if (SONUCLU.includes(c.tur) || r.not == null) return r.sonuc === 'basarili';
  return r.not >= 70 && (r.final == null || r.final >= 70);
}
// Alınmakta olan ders yarım sayılır; sonucu girilip geçilen ders tam sayılır.
function agirlik(r, c, pw) {
  if (r.durum === 'aliyor') return pw;
  if (r.durum === 'duzeltme') return 0;
  return gecti(r, c) ? 1 : 0;
}
function adimDeger(s, k, pw) { const d = s.adim[k]; return d === 'tamam' ? 1 : d === 'onay' ? pw : 0; }
function hesapla(s, pw) {
  const out = {};
  let kredi = 0, ders = 0, lisans = 0, dis = 0, akts = 0, bay = 0, etik = 0, sem = 0, uad = 0, notT = 0, notK = 0;
  for (const r of s.dersler) {
    const c = kat(s, r.kod); const w = agirlik(r, c, pw);
    if (w > 0) akts += c.akts * w;
    if ((c.tur === 'zorunlu' || c.tur === 'secmeli') && w > 0) {
      if (r.kaynak === 'lisans' && ++lisans > 2) continue;
      if (r.kaynak === 'dis' && ++dis > 2) continue;
      kredi += c.kredi * w; ders += w;
      if (r.not != null) { notT += r.not * c.kredi * w; notK += c.kredi * w; }
    }
    if (c.tur === 'bay') bay = Math.max(bay, w);
    if (c.tur === 'etik') etik = Math.max(etik, w);
    if (c.tur === 'seminer') sem = Math.max(sem, w);
    if (c.tur === 'uad') uad += w;
  }
  const uadHedef = Math.max(1, Math.max(4, s.donem) - s.danismanDonem + 1);
  const grupDeger = g => { const it = ADIMLAR.find(x => x.grup === g).items; return it.reduce((a, i) => a + i.w * adimDeger(s, i.k, pw), 0) / it.reduce((a, i) => a + i.w, 0); };
  out.kayit = 1;
  out.dersler = (Math.min(1, kredi / 21) + Math.min(1, ders / 7)) / 2;
  out.zorunlu = (bay + etik) / 2;
  out.seminer = sem;
  out.uad = Math.min(1, uad / uadHedef);
  for (const g of ['oneri', 'yazim', 'hazirlik', 'savunma', 'teslim']) out[g] = grupDeger(g);
  return { deg: out, kredi, ders, akts, bay, etik, sem, uad, uadHedef, lisans, dis, gno: notK ? notT / notK : null };
}
const BOLUMLER = [
  { k: 'kayit', ad: 'Başlangıç', w: 5 }, { k: 'dersler', ad: 'Kredili dersler', w: 30 },
  { k: 'zorunlu', ad: 'Yöntem ve etik dersleri', w: 5 }, { k: 'seminer', ad: 'Seminer', w: 5 },
  { k: 'oneri', ad: 'Tez önerisi', w: 10 }, { k: 'uad', ad: 'Uzmanlık alan dersleri', w: 5 },
  { k: 'yazim', ad: 'Tez yazımı', w: 20 }, { k: 'hazirlik', ad: 'Savunmaya hazırlık', w: 8 },
  { k: 'savunma', ad: 'Savunma', w: 8 }, { k: 'teslim', ad: 'Mezuniyet', w: 4 },
];
const BAYRAKLAR = [
  { ad: 'Başlangıç', at: 0, k: ['kayit'] }, { ad: 'Ders dönemi', at: 45, k: ['dersler', 'zorunlu', 'seminer'] },
  { ad: 'Tez önerisi', at: 55, k: ['oneri'] }, { ad: 'Tez', at: 80, k: ['yazim'] },
  { ad: 'Savunma', at: 88, k: ['hazirlik', 'savunma'] }, { ad: 'Mezuniyet', at: 100, k: ['teslim'] },
];
function ilerleme(s) {
  const a = hesapla(s, 0), b = hesapla(s, 0.5);
  let ok = 0, all = 0;
  const seg = BOLUMLER.map(x => { ok += x.w * a.deg[x.k]; all += x.w * b.deg[x.k]; return { ...x, ok: a.deg[x.k], all: b.deg[x.k] }; });
  return { ok, all, pend: all - ok, seg, a, b };
}
// İlerleme mesajları: yüzde aralığına göre bir ana cümle (her gün değişir) + bulunduğu aşamaya özel bir bilgi satırı
const MESAJLAR = [
  [100, ['Tebrikler! Tüm mezuniyet koşulları tamamlandı.', 'Başardın! Bu yolculuğun her adımı burada kayıtlı.']],
  [90, ['Neredeyse bitti, son birkaç adım kaldı.', 'Bitiş çizgisi görünüyor. Son adımlar senin.', 'Çok az kaldı. Bu emeğin karşılığını almak üzeresin.']],
  [80, ['Son düzlüktesin. Savunma artık ufukta.', 'Harika bir noktadasın; geriye bakınca ne kadar yol aldığını gör.', 'Tezin artık neredeyse tamam. Bu tempoyu koru.']],
  [70, ['Yolun büyük kısmı geride kaldı.', 'Emeğin görünür hâle geldi; çubuk bunun kanıtı.', 'İstikrarın işe yarıyor. Devam!']],
  [60, ['Çubuğun yarısından fazlası dolu. Tezin şekilleniyor.', 'Artık bir tez yazarısın. Her bölüm seni bitişe yaklaştırıyor.', 'Güzel ilerliyorsun; küçük adımlar büyük farklar yaratıyor.']],
  [50, ['Yolun yarısını geçtin!', 'Yarı yol tamam. Buradan sonrası seni tezinle buluşturuyor.', 'Yarıyı aştın. Kendine bir teşekkür borçlusun.']],
  [40, ['Sağlam bir temel oluşuyor.', 'İyi gidiyorsun. Her tamamlanan iş, bir sonrakini kolaylaştırıyor.', 'Ritmini buldun gibi görünüyor.']],
  [30, ['İyi gidiyorsun. Ders dönemin tezine zemin hazırlıyor.', 'Adım adım ilerliyorsun ve bu çok değerli.', 'Temeller güçleniyor; tez fikrin de bu sırada olgunlaşıyor.']],
  [20, ['Yol alıyorsun. Attığın her adım burada görünüyor.', 'Başlangıç heyecanı yerini ritme bırakıyor.', 'İlk adımlar en zorlarıdır; sen onları atıyorsun.']],
  [10, ['Temeller atılıyor.', 'Güzel bir başlangıç. Devamı da gelecek.', 'Her yolculuk ilk adımlarla başlar, seninki başladı.']],
  [0, ['Yolculuk başladı. Her adımın bu çubuğu biraz daha dolduracak.', 'Hoş geldin! Bu çubuk seninle birlikte büyüyecek.', 'Buradan bakınca uzun görünebilir; birlikte adım adım ilerleyeceğiz.']],
];
function gununSecimi(L, tohum) {
  const gun = Math.floor((Date.now() + 3 * 36e5) / 864e5);
  return L[(gun + tohum) % L.length];
}
function mesaj(p, s) {
  const band = MESAJLAR.find(([alt]) => p >= alt)[1];
  const tohum = s ? [...s.id].reduce((x, c) => x + c.charCodeAt(0), 0) : 0;
  return gununSecimi(band, tohum);
}
// Aşamaya özel bilgi satırı (öğrenci için "sen", danışman için öğrencinin adıyla)
function asamaBilgisi(s, sen) {
  const a = hesapla(s, 0), ad = s.ad.split(' ')[0];
  const t = (senMetni, oMetni) => sen ? senMetni : oMetni;
  const yazim = ADIMLAR.find(g => g.grup === 'yazim').items, yz = yazim.filter(i => s.adim[i.k] === 'tamam').length;
  if (s.adim.ciltli === 'tamam' && s.adim.cikis === 'tamam') return t('Tüm adımlar tamam. Mezuniyetin kutlu olsun!', `${ad} tüm adımları tamamladı.`);
  if (s.adim.savunma === 'tamam') return t('Savunmayı geçtin! Geriye ciltli teslim ve çıkış işlemleri kaldı.', `${ad} savunmayı geçti; ciltli teslim ve çıkış işlemleri kaldı.`);
  if (s.tez.sinavTarih && s.adim.savunma !== 'tamam') {
    const k = Math.round((new Date(s.tez.sinavTarih + 'T12:00') - Date.now()) / 864e5);
    if (k >= 0) return t(`Savunmana ${k === 0 ? 'bugün' : k + ' gün'} ${k === 0 ? 'çıkıyorsun' : 'kaldı'}. Hazırsın!`, `${ilgiEki(ad)} savunmasına ${k === 0 ? 'bugün' : k + ' gün kaldı'}.`);
  }
  if (yz === yazim.length) return t('Tez yazımı tamam! Savunmaya hazırlık başlıyor.', `${ad} tez yazımını tamamladı.`);
  if (s.adim.oneriKabul === 'tamam') return t(`Tezinin ${yazim.length} aşamasından ${yz} tanesi tamam.`, `Tez yazımında ${yazim.length} aşamadan ${yz} tanesi tamam.`);
  if (a.ders >= 7 && a.kredi >= 21) return t('Ders şartını tamamladın! Şimdi sıra fikrini teze dönüştürmekte.', `${ad} ders şartını tamamladı; sıra tez önerisinde.`);
  if (s.adim.konu === 'tamam') return t('Tez konun belli. Önerini yazmaya başlayabilirsin.', `${ilgiEki(ad)} tez konusu belli; öneri aşamasında.`);
  const devam = s.dersler.filter(r => r.durum === 'aliyor').length;
  if (a.ders > 0 || devam) return t(`7 kredili dersin ${Math.floor(a.ders)} tanesi tamam${devam ? `, ${devam} ders devam ediyor` : ''}.`, `7 kredili dersten ${Math.floor(a.ders)} tamam${devam ? `, ${devam} devam ediyor` : ''}.`);
  return t('İlk adım: bu dönem aldığın dersleri "Ders durumu"ndan ekle.', `${ad} henüz ders eklemedi.`);
}
function siradaki(s) {
  const a = hesapla(s, 0);
  if (a.kredi < 21 || a.ders < 7) {
    const kalanD = Math.max(0, 7 - Math.floor(a.ders)), kalanK = Math.max(0, 21 - a.kredi);
    const alinan = s.dersler.filter(r => r.durum === 'aliyor' && ['zorunlu', 'secmeli'].includes(kat(s, r.kod).tur)).length;
    let t = `Kredili ders şartına ${kalanK} kredi ve ${kalanD} ders kaldı.`;
    if (!s.dersler.length) t = 'Bu dönem aldığın dersleri "Ders durumu" bölümünden ekleyerek başla. Kredili ders şartı: en az 21 kredi ve 7 ders.';
    else if (alinan) t += ` Bu dönem aldığın ${alinan} ders tamamlanınca bu kısım büyük ölçüde dolacak.`;
    if (s.program === 'pdr' && a.ders >= 4 && kalanD > 0) t += ' PDR programında 2 zorunlu derse ek olarak en az 5 seçmeli gerekiyor.';
    return { b: 'Kredili dersler', t, sec: 'dersler' };
  }
  if (a.bay < 1 || a.etik < 1) return { b: 'Yöntem ve etik dersleri', t: 'Bilimsel Araştırma Yöntemleri ve araştırma/yayın etiği dersi zorunlu. Kredi sayısına girmez ama mezuniyet için gerekli.', sec: 'dersler' };
  if (a.sem < 1) return { b: 'Seminer', t: 'Seminer dersini tamamladığında ders dönemi bitiyor. 4. yarıyıl sonuna kadar tamamlanmalı.', sec: 'dersler' };
  for (const g of ADIMLAR) for (const i of g.items) {
    if (s.adim[i.k] === 'tamam' || s.adim[i.k] === 'onay') continue;
    return { b: i.ad, t: (i.by === 'danisman' ? 'Bu adımı danışmanın işaretleyecek. ' : '') + (i.not || 'Tamamladığında işaretle; danışmanın onaylayınca çubuk dolar.'), sec: 'tez' };
  }
  return { b: 'Onay bekleyen adımlar', t: 'Gönderdiğin adımlar danışmanında. Onaylandıkça çubuk tamamen dolacak.', sec: 'tez' };
}
function kontroller(s) {
  const a = hesapla(s, 0), b = hesapla(s, .5), L = [];
  const st3 = (ok, pend) => ok ? 'tamam' : pend ? 'surec' : 'bekliyor';
  L.push({ ad: 'En az 21 kredi', ref: 'M19/3', val: `${fmt(a.kredi)} / 21`, d: st3(a.kredi >= 21, b.kredi > 0) });
  L.push({ ad: 'En az 7 kredili ders', ref: 'M19/3 · yöntem ve etik dersleri sayılmaz', val: `${fmt(a.ders)} / 7`, d: st3(a.ders >= 7, b.ders > 0) });
  L.push({ ad: 'Bilimsel Araştırma Yöntemleri', ref: 'M12/5', val: a.bay >= 1 ? 'Tamam' : '—', d: st3(a.bay >= 1, b.bay > 0) });
  L.push({ ad: 'Araştırma ve yayın etiği dersi', ref: 'M12/5', val: a.etik >= 1 ? 'Tamam' : '—', d: st3(a.etik >= 1, b.etik > 0) });
  L.push({ ad: 'Seminer', ref: 'M19/3 · başarılı/başarısız', val: a.sem >= 1 ? 'Tamam' : '—', d: st3(a.sem >= 1, b.sem > 0) });
  L.push({ ad: 'Her yarıyıl UAD', ref: 'M19/3 · danışman atamasından sonra', val: `${fmt(a.uad)} / ${a.uadHedef}`, d: st3(a.uad >= a.uadHedef, b.uad > 0) });
  L.push({ ad: 'En az 120 AKTS', ref: 'M19/3 · yılda 60 AKTS', val: `${fmt(a.akts)} / 120`, d: st3(a.akts >= 120, b.akts > 0) });
  L.push({ ad: 'Her ders en az 70, yarıyıl sonu/bütünleme notu en az 70', ref: 'M16/3', val: '', d: s.dersler.some(r => r.durum !== 'aliyor' && !gecti(r, kat(s, r.kod))) ? 'surec' : (s.dersler.length ? 'tamam' : 'bekliyor') });
  L.push({ ad: 'En fazla 2 lisans dersi, en fazla 2 başka üniversite dersi', ref: 'M19/4', val: `${a.lisans} · ${a.dis}`, d: a.lisans <= 2 && a.dis <= 2 ? 'tamam' : 'surec' });
  const konu = s.adim.konu === 'tamam';
  L.push({ ad: 'Tez konusu en geç 2. yarıyıl sonunda', ref: 'M22/1', val: konu ? 'Tamam' : `${s.donem}. yarıyıl`, d: konu ? 'tamam' : s.adim.konu === 'onay' ? 'surec' : 'bekliyor' });
  L.push({ ad: 'Akademik faaliyet şartı', ref: 'M23/1 · Senato esasları eklenecek', val: '', d: st3(s.adim.faaliyet === 'tamam', s.adim.faaliyet === 'onay') });
  L.push({ ad: 'Tez savunmasında kabul', ref: 'M23/6', val: '', d: st3(s.adim.savunma === 'tamam', false) });
  L.push({ ad: 'Genel not ortalaması en az 70', ref: 'M23/10', val: a.gno ? fmt(a.gno) : '—', d: a.gno == null ? 'bekliyor' : a.gno >= 70 && a.ders >= 7 ? 'tamam' : 'surec' });
  L.push({ ad: 'Ciltli tez (en az 3 kopya) 1 ay içinde', ref: 'M23/10', val: '', d: st3(s.adim.ciltli === 'tamam', s.adim.ciltli === 'onay') });
  if (s.kayitTuru === 'af') L.push({ ad: 'Süre', ref: 'Af kapsamında dönüş · süre enstitü kararına göre', val: `${s.donem}. yarıyıl`, d: 'surec' });
  else L.push({ ad: 'Süre', ref: 'Normal 4, en çok 6 yarıyıl · erken mezuniyet en az 3 yarıyıl (M21)', val: `${s.donem}. yarıyıl`, d: s.donem <= 4 ? 'tamam' : 'surec' });
  return L;
}
function hatirlatmalar(s) {
  const a = hesapla(s, 0), L = [];
  if (s.donem >= 2 && s.adim.konu !== 'tamam') L.push('Tez konusu 2. yarıyıl sonuna kadar belirlenmeli.');
  if (s.kayitTuru !== 'af' && s.donem >= 4 && (a.ders < 7 || a.kredi < 21 || a.sem < 1)) L.push('4. yarıyıl sonunda kredili dersler ve seminer tamamlanmış olmalı.');
  if (s.kayitTuru !== 'af' && s.donem >= 5) L.push(`Azami süre: ${Math.max(0, 6 - s.donem + 1)} yarıyıl kaldı.`);
  if (s.program === 'pdr' && a.ders >= 6 && a.ders < 7 && !s.dersler.some(r => r.durum !== 'tamam' && kat(s, r.kod).tur === 'secmeli')) L.push('7. kredili ders için bir seçmeli daha gerekiyor.');
  return L;
}
function bekleyenler() {
  const L = [];
  for (const s of S.students) {
    if (s.arsiv) continue;
    for (const k in s.adim) if (s.adim[k] === 'onay') L.push({ s, tip: 'adim', k, ad: ADIM[k]?.ad || k, ek: `Tez süreci · gönderim ${tarihFmt(s.adimTarih[k]) || ''}` });
    s.dosyalar.forEach(d => { if (!d.yorum) L.push({ s, tip: 'dosya', id: d.id, ad: `Yeni tez sürümü v${d.v}`, ek: `${d.ad} · ${tarihFmt(d.tarih)}` }); });
  }
  return L;
}

/* ======================== İKONLAR ======================== */
const ICON = {
  genel: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  kisisel: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  dersler: '<path d="M4 5h11a3 3 0 013 3v12H7a3 3 0 01-3-3z"/><path d="M4 17a3 3 0 013-3h11"/>',
  tez: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  dosyalar: '<path d="M3 7h6l2 2h10v10H3z"/>',
  belgeler: '<path d="M7 3h10v18H7z"/><path d="M10 8h4M10 12h4M10 16h2"/>',
  mezuniyet: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  notlar: '<path d="M4 5h16v11H9l-5 4z"/>',
  ogrenciler: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.4 2.2 4 5"/>',
  onaylar: '<path d="M4 12l5 5L20 6"/>',
  hatirlatma: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
  hesap: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cikis: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  gunes: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ay: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
};
const ic = (k, sz = 19) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" aria-hidden="true">${ICON[k]}</svg>`;
const temaBtn = () => `<button class="iconbtn" type="button" data-a="tema" aria-label="${tema() === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}" title="${tema() === 'dark' ? 'Açık tema' : 'Koyu tema'}">${ic(tema() === 'dark' ? 'gunes' : 'ay', 18)}</button>`;
const OGR_MENU = [['genel', 'Genel bakış'], ['kisisel', 'Kişisel bilgiler'], ['dersler', 'Ders durumu'], ['tez', 'Tez süreci'], ['dosyalar', 'Tez dosyaları'], ['belgeler', 'Belgeler'], ['mezuniyet', 'Mezuniyet koşulları'], ['notlar', 'Danışmanla yazışma']];

/* ======================== GİRİŞ EKRANLARI ======================== */
const KVKK = `Bu panel, Mersin Üniversitesi Eğitim Bilimleri Enstitüsü'nde Dr. Öğr. Üyesi Ali Ammar Kurt danışmanlığında tezli yüksek lisans yapan öğrencilerin ders ve tez süreçlerini takip etmek için kullanılır.
Panelde yalnızca adın, e-posta adresin, öğrenci numaran, programın, kayıt dönemin, ders sonuçların, tez bilgilerin (başlık, komisyon, jüri, sınav bilgileri), yüklediğin tez dosyaları ve danışmanınla yazışmaların tutulur. T.C. kimlik numarası ve posta adresi sistemde saklanmaz; gerektiğinde yalnızca formu hazırlarken tarayıcında kullanılır.
Bu bilgileri yalnızca sen ve danışmanın görebilir. Veriler, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, tez danışmanlığı sürecinin yürütülmesi amacıyla ve yalnızca bu süreç boyunca işlenir; Cloudflare altyapısında şifreli bağlantıyla saklanır ve üçüncü kişilerle paylaşılmaz. Bildirim e-postaları bir e-posta gönderim hizmeti aracılığıyla iletilir.
Mezuniyetin ya da programdan ayrılmanın ardından danışmanından verilerinin silinmesini isteyebilirsin. Sorular için: aliammarkurt@mersin.edu.tr`;

function kartSar(ic2) {
  return `<div class="login"><div class="login-card">
    <div class="row" style="justify-content:space-between"><div class="brand"><span class="mark">LP</span><span>Lisansüstü Panel</span></div>${temaBtn()}</div>
    ${ic2}</div></div>`;
}
function girisHTML() {
  return kartSar(`
    <div><h1>Tez yolculuğun, adım adım.</h1><p class="muted" style="margin:.5em 0 0">Dr. Öğr. Üyesi Ali Ammar Kurt'un tezli yüksek lisans öğrencileri için takip ve iletişim paneli.</p></div>
    <form id="f-giris" style="display:grid;gap:14px">
      <div class="field"><label for="lg-e">E-posta</label><input class="input" id="lg-e" type="email" autocomplete="username" value="${esc(S.girisEmail || '')}" required></div>
      <div class="field"><label for="lg-p">Şifre</label><input class="input" id="lg-p" type="password" autocomplete="current-password" required></div>
      <div class="err" role="alert">${esc(S.hata)}</div>
      <button class="btn primary" type="submit" ${S.mesgul ? 'disabled' : ''}>Giriş yap</button>
    </form>
    <button class="linkbtn" type="button" data-a="ekran" data-k="unuttum">Şifremi unuttum</button>
    <p class="muted" style="font-size:13px;margin:0">Hesabın yoksa danışmanın sana e-postayla davet bağlantısı gönderir.</p>`);
}
function unuttumHTML() {
  return kartSar(`
    <div><h1 style="font-size:26px">Şifreni yenile</h1><p class="muted" style="margin:.5em 0 0">E-posta adresini yaz; kayıtlıysa şifre yenileme bağlantısı gönderilir.</p></div>
    <form id="f-unuttum" style="display:grid;gap:14px">
      <div class="field"><label for="un-e">E-posta</label><input class="input" id="un-e" type="email" autocomplete="username" required></div>
      <div class="err" role="alert">${esc(S.hata)}</div>
      <button class="btn primary" type="submit" ${S.mesgul ? 'disabled' : ''}>Bağlantı gönder</button>
    </form>
    <button class="linkbtn" type="button" data-a="ekran" data-k="giris">← Girişe dön</button>`);
}
function tokenHTML() {
  const t = S.tokenBilgi;
  if (!t) return kartSar(`<h1 style="font-size:24px">Bağlantı geçersiz</h1><p class="muted">${esc(S.hata || 'Bu bağlantının süresi dolmuş ya da daha önce kullanılmış. Danışmanından yeni bağlantı iste.')}</p><button class="btn" data-a="ekran" data-k="giris">Girişe git</button>`);
  const davet = t.tur === 'invite';
  return kartSar(`
    <div><h1 style="font-size:26px">${davet ? `Hoş geldin, ${esc(t.ad.split(' ')[0])}` : 'Yeni şifre belirle'}</h1>
    <p class="muted" style="margin:.5em 0 0">${davet ? 'Panele giriş için kendi şifreni belirle.' : esc(t.email) + ' hesabı için yeni şifreni yaz.'}</p></div>
    <form id="f-token" style="display:grid;gap:14px">
      <input type="email" value="${esc(t.email)}" autocomplete="username" hidden readonly>
      <div class="field"><label for="tk-p">Yeni şifre (en az 8 karakter)</label><input class="input" id="tk-p" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label for="tk-p2">Şifreyi tekrar yaz</label><input class="input" id="tk-p2" type="password" autocomplete="new-password" minlength="8" required></div>
      ${davet && t.rol === 'ogrenci' ? `<div class="field"><span class="eyebrow">Kişisel verilerin işlenmesine ilişkin aydınlatma metni</span><div class="kvkk">${esc(KVKK).replace(/\n/g, '<br><br>')}</div>
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:14px"><input type="checkbox" id="tk-kvkk" required style="margin-top:3px"> Aydınlatma metnini okudum ve anladım.</label></div>` : ''}
      <div class="err" role="alert">${esc(S.hata)}</div>
      <button class="btn primary" type="submit" ${S.mesgul ? 'disabled' : ''}>${davet ? 'Şifremi belirle ve gir' : 'Şifremi güncelle'}</button>
    </form>`);
}
function kurulumHTML() {
  return kartSar(`
    <div><h1 style="font-size:26px">İlk kurulum</h1><p class="muted" style="margin:.5em 0 0">Danışman hesabını oluşturun. Bu ekran yalnızca bir kez, hiç danışman hesabı yokken görünür.</p></div>
    <form id="f-kurulum" style="display:grid;gap:14px">
      <div class="field"><label for="ku-k">Kurulum anahtarı (Cloudflare'de SETUP_KEY)</label><input class="input" id="ku-k" type="password" required></div>
      <div class="field"><label for="ku-a">Ad soyad (unvanla)</label><input class="input" id="ku-a" value="Dr. Öğr. Üyesi Ali Ammar Kurt" required></div>
      <div class="field"><label for="ku-e">E-posta</label><input class="input" id="ku-e" type="email" value="aliammarkurt@mersin.edu.tr" autocomplete="username" required></div>
      <div class="field"><label for="ku-p">Şifre (en az 10 karakter)</label><input class="input" id="ku-p" type="password" autocomplete="new-password" minlength="10" required></div>
      <div class="err" role="alert">${esc(S.hata)}</div>
      <button class="btn primary" type="submit" ${S.mesgul ? 'disabled' : ''}>Hesabı oluştur</button>
    </form>`);
}

/* ======================== UYGULAMA ÇERÇEVESİ ======================== */
function render() {
  const root = document.getElementById('root');
  if (S.ekran === 'yukleniyor') { root.innerHTML = '<div class="loading">Yükleniyor…</div>'; return; }
  if (S.ekran === 'giris') { root.innerHTML = girisHTML(); return; }
  if (S.ekran === 'unuttum') { root.innerHTML = unuttumHTML(); return; }
  if (S.ekran === 'token') { root.innerHTML = tokenHTML(); return; }
  if (S.ekran === 'kurulum') { root.innerHTML = kurulumHTML(); return; }
  const adv = isAdv(), s = cur(), bek = adv ? bekleyenler() : [];
  let nav = '';
  if (adv) {
    nav += `<div class="grp eyebrow">Danışman</div>` + navi('ogrenciler', 'Öğrencilerim') + navi('onaylar', 'Onay bekleyenler', bek.length) + navi('hatirlatma', 'Hatırlatmalar');
    if (s) nav += `<div class="grp eyebrow">${esc(s.ad)}</div>` + OGR_MENU.map(([k, t]) => navi(k, t)).join('');
  } else if (s) {
    const n = Object.values(s.adim).filter(x => x === 'onay').length;
    nav += OGR_MENU.map(([k, t]) => navi(k, t, k === 'tez' ? n : 0)).join('');
  }
  nav += `<div style="margin-top:auto"></div>` + navi('hesap', 'Hesabım') + `<button class="navi" data-a="cikis">${ic('cikis')}<span class="t">Çıkış</span></button>`;
  root.innerHTML = `
  <div class="app">
    <header class="topbar">
      <button class="iconbtn" data-a="toggle" aria-label="Menüyü aç/kapat">${ic('menu', 18)}</button>
      <div class="brand"><span class="mark">LP</span><span>Lisansüstü Panel</span></div>
      <div class="who"><span class="muted name">${esc(S.ben.ad)}</span><span class="pill ${adv ? 'go' : 'ok'}">${adv ? 'Danışman' : 'Öğrenci'}</span>${temaBtn()}</div>
    </header>
    <div class="body ${S.collapsed ? 'collapsed' : ''} ${S.mopen ? 'mopen' : ''}">
      <nav class="side" aria-label="Menü">${nav}</nav>
      <main class="main"><div class="wrap">${anaIcerik()}</div></main>
    </div>
  </div>`;
  renderModal();
}
function navi(k, t, n = 0) {
  return `<button class="navi ${S.section === k ? 'on' : ''}" data-a="nav" data-k="${k}" title="${esc(t)}">${ic(k)}<span class="t">${esc(t)}</span>${n ? `<span class="badge">${n}</span>` : ''}</button>`;
}
function anaIcerik() {
  const adv = isAdv();
  if (S.section === 'hesap') return hesapHTML();
  if (adv && S.section === 'ogrenciler') return ogrencilerHTML();
  if (adv && S.section === 'onaylar') return onaylarHTML();
  if (adv && S.section === 'hatirlatma') return hatirlatmaHTML();
  const s = cur();
  if (!s) return `<section class="panel"><h2>Kayıt bulunamadı</h2><p class="muted">Öğrenci kaydına ulaşılamadı. Danışmanınla iletişime geç.</p></section>`;
  let h = '';
  if (adv) h += `<div class="viewing"><b>${esc(s.ad)}</b> öğrencisinin panelini danışman olarak görüyorsunuz.<button class="btn small" data-a="nav" data-k="ogrenciler" style="margin-left:auto">← Öğrencilerim</button></div>`;
  if (S.celebrate) h += `<div class="celebrate">${esc(S.celebrate)}</div>`;
  h += heroHTML(s);
  const f = { genel: genelHTML, kisisel: kisiselHTML, dersler: derslerHTML, tez: tezHTML, dosyalar: dosyalarHTML, belgeler: belgelerHTML, mezuniyet: mezuniyetHTML, notlar: notlarHTML }[S.section] || genelHTML;
  return h + f(s);
}

/* ======================== ÖĞRENCİ EKRANLARI ======================== */
function segBar(p, cls = 'track') {
  return `<div class="${cls}">${p.seg.map(x => `<div class="seg" style="flex:${x.w}" title="${esc(x.ad)}: %${Math.round(x.all * 100)}"><span class="ok" style="width:${x.ok * 100}%"></span><span class="pend" style="left:${x.ok * 100}%;width:${(x.all - x.ok) * 100}%"></span></div>`).join('')}</div>`;
}
function heroHTML(s) {
  const p = ilerleme(s), pct = Math.round(p.all), nx = siradaki(s);
  const done = k => k.every(x => p.seg.find(y => y.k === x).ok >= .999);
  return `<section class="hero" aria-label="Genel ilerleme">
    <div class="eyebrow">${esc(PROGRAMS[s.program].kisa)} · ${s.donem}. yarıyıl</div>
    <div class="pct" style="font-family:var(--f-display)">%${pct}</div>
    <div style="display:grid;gap:4px"><p class="lead">${esc(isAdv() ? asamaBilgisi(s, false) : mesaj(pct, s))}</p>${isAdv() ? '' : `<p class="muted" style="margin:0;font-size:14.5px">${esc(asamaBilgisi(s, true))}</p>`}</div>
    ${segBar(p)}
    <div class="flags">${BAYRAKLAR.map(b => `<div class="flag ${done(b.k) ? 'done' : ''}" style="left:${b.at}%"><span>${done(b.k) ? '✓ ' : ''}${b.ad}</span></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Tamamlandı</span><span><i style="background:repeating-linear-gradient(-45deg,var(--sun) 0 4px,var(--sun-soft) 4px 7px)"></i>Devam ediyor ya da danışman onayında (yarısı sayılır)</span>${p.pend > 0.05 ? `<span class="mono">%${fmt(p.pend)} yolda</span>` : ''}</div>
    <div class="next"><div class="dot">→</div><div><span class="eyebrow">${isAdv() ? 'Sıradaki adım' : 'Sıradaki adımın'}</span><b>${esc(nx.b)}</b><span class="muted" style="font-size:14px">${esc(nx.t)}</span></div><button class="btn small" data-a="nav" data-k="${nx.sec}">Git</button></div>
  </section>`;
}
function genelHTML(s) {
  const p = ilerleme(s), a = p.a, hat = hatirlatmalar(s), yon = yonetmelik(s.kayit, s.kayitTuru);
  const satir = x => `<div style="display:grid;gap:5px"><div class="row" style="justify-content:space-between"><span>${esc(x.ad)}</span><span class="mono muted">%${Math.round(x.all * 100)}</span></div><div class="meter"><i class="p" style="width:${x.all * 100}%"></i><i style="width:${x.ok * 100}%"></i></div></div>`;
  return `
  <div class="grid3">
    <div class="stat"><span class="eyebrow">Kredi</span><span class="v mono">${fmt(a.kredi)}<small class="muted" style="font-size:15px"> / 21</small></span></div>
    <div class="stat"><span class="eyebrow">Kredili ders</span><span class="v mono">${fmt(a.ders)}<small class="muted" style="font-size:15px"> / 7</small></span></div>
    <div class="stat"><span class="eyebrow">AKTS</span><span class="v mono">${fmt(a.akts)}<small class="muted" style="font-size:15px"> / 120</small></span></div>
  </div>
  <div class="grid2">
    <section class="panel"><h2>Aşamalar</h2>${p.seg.map(satir).join('')}</section>
    <section class="panel"><h2>${isAdv() ? 'Notlar' : 'Bilmen gerekenler'}</h2>
      <div class="checks">
        <div class="chk surec"><span class="ic">i</span><div>Uygulanan yönetmelik: <b>${esc(yon.ad)}</b><div class="ref">${esc(yon.not || 'Kayıt dönemine göre belirlendi')}</div></div><span></span></div>
        ${hat.map(h => `<div class="chk surec"><span class="ic">!</span><div>${esc(h)}</div><span></span></div>`).join('') || `<div class="chk tamam"><span class="ic">✓</span><div>Süreye bağlı hatırlatma yok. Her şey yolunda görünüyor.</div><span></span></div>`}
        <div class="chk bekliyor"><span class="ic">✉</span><div>${isAdv() ? 'Öğrenci bir adımı onaya gönderdiğinde e-posta alırsınız.' : 'Danışmanın bir adımı onayladığında veya yorum yazdığında e-posta bildirimi alırsın.'}</div><span></span></div>
      </div>
      <button class="btn small" data-a="nav" data-k="mezuniyet" style="justify-self:start">Tüm mezuniyet koşulları</button>
    </section>
  </div>`;
}
function kisiselHTML(s) {
  const P = PROGRAMS[s.program], yon = yonetmelik(s.kayit, s.kayitTuru), adv = isAdv();
  const f = (id, lab, val, type = 'text', ro = false) => `<div class="field"><label for="${id}">${lab}</label><input class="input" id="${id}" type="${type}" value="${esc(val)}" ${ro ? 'readonly' : ''}></div>`;
  const sel = (id, lab, opts, val, ro) => `<div class="field"><label for="${id}">${lab}</label><select class="input" id="${id}" ${ro ? 'disabled' : ''}>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  return `<section class="panel"><h2>Kişisel bilgiler</h2>
    <p class="muted" style="margin:0">Bu bilgiler resmî formlara otomatik aktarılır. T.C. kimlik numarası ve posta adresi sistemde tutulmaz; yalnızca ilgili formu hazırlarken tarayıcında girilir.${adv ? '' : ' Yeni döneme geçtiğinde "Şu anki yarıyıl" bilgisini güncellemeyi unutma. E-posta adresin giriş için kullanıldığından onu yalnızca danışmanın değiştirebilir.'}</p>
    <div class="grid2" style="gap:14px">
      ${f('k-ad', 'Ad soyad', s.ad)}${f('k-no', 'Öğrenci numarası', s.no)}
      ${f('k-eposta', 'E-posta (giriş adresi)', s.eposta, 'email', !adv)}
      ${sel('k-tur', 'Kayıt türü', [['normal', 'Normal kayıt'], ['af', 'Af ile dönen öğrenci']], s.kayitTuru)}
      ${sel('k-kayit', s.kayitTuru === 'af' ? 'Dönüş dönemi' : 'Kayıt dönemi', KAYIT_DONEMLERI.map(x => [x, x]), s.kayit)}
      ${sel('k-program', 'Program', Object.entries(PROGRAMS).map(([k, v]) => [k, v.ad]), s.program)}
      ${f('k-abd', 'Anabilim dalı', P.abd, 'text', true)}
      ${sel('k-donem', 'Şu anki yarıyıl', [1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, n + '. yarıyıl']), s.donem)}
      ${sel('k-ddonem', 'Danışmanın atandığı yarıyıl', [1, 2, 3, 4].map(n => [n, n + '. yarıyıl']), s.danismanDonem)}
      ${f('k-statu', 'Statü', s.statu)}${f('k-dan', 'Danışman', DANISMAN, 'text', true)}
    </div>
    ${adv ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="k-arsiv" ${s.arsiv ? 'checked' : ''}> Arşivle (mezun oldu ya da ayrıldı; listede en alta iner, onay kuyruğundan çıkar)</label>` : ''}
    <div class="row"><button class="btn primary" data-a="kaydet-kisisel">Kaydet</button><span class="muted" style="font-size:13px">Uygulanan yönetmelik: ${esc(yon.ad)}</span></div>
  </section>
  ${adv ? `<section class="panel"><h2>Giriş bağlantısı</h2>
    <p class="muted" style="margin:0">${s.davetBekliyor ? 'Öğrenci henüz şifresini belirlemedi. Davet bağlantısının süresi 14 gün; gerekirse yenisini oluşturun.' : 'Öğrenci şifresini unuttuysa 2 saat geçerli bir şifre yenileme bağlantısı oluşturabilirsiniz.'}</p>
    <div class="row"><button class="btn" data-a="baglanti">${s.davetBekliyor ? 'Yeni davet bağlantısı oluştur' : 'Şifre yenileme bağlantısı oluştur'}</button>${s.kvkk ? `<span class="muted" style="font-size:13px">Aydınlatma metni onayı: ${esc(tarihFmt(s.kvkk))}</span>` : ''}</div>
  </section>` : ''}`;
}
function durumPill(r, c) {
  if (r.durum === 'aliyor') return '<span class="pill go">Alıyor</span>';
  if (r.durum === 'duzeltme') return '<span class="pill fix">Düzeltme istendi</span>';
  if (!gecti(r, c)) return '<span class="pill fix">Sayılmıyor</span>';
  return '<span class="pill ok">Tamam</span>';
}
function notForm(c, id) {
  if (SONUCLU.includes(c.tur)) return `<span class="row" style="flex-wrap:nowrap"><button class="btn small primary" data-a="not-kaydet" data-id="${id}" data-sonuc="basarili">Başarılı</button><button class="btn small" data-a="not-kapat">Vazgeç</button></span>`;
  return `<span class="row" style="flex-wrap:nowrap"><input class="input" id="ng-not" type="number" min="0" max="100" placeholder="Not" style="width:74px" aria-label="Başarı notu"><input class="input" id="ng-fin" type="number" min="0" max="100" placeholder="Final" style="width:74px" aria-label="Yarıyıl sonu notu"><button class="btn small primary" data-a="not-kaydet" data-id="${id}">Gönder</button><button class="btn small" data-a="not-kapat">Vazgeç</button></span>`;
}
function derslerHTML(s) {
  const adv = isAdv(), P = PROGRAMS[s.program], a = hesapla(s, 0);
  const terms = [...new Set(s.dersler.map(r => r.donem))].sort((x, y) => x - y);
  const islem = (r, c) => {
    if (S.notEdit === r.id) return notForm(c, r.id);
    const L = [];
    if (r.durum === 'aliyor') L.push(`<button class="btn small primary" data-a="not-ac" data-id="${r.id}">Not gir</button>`);
    else if (r.durum === 'duzeltme') L.push(`<button class="btn small sun" data-a="not-ac" data-id="${r.id}">Düzelt</button>`);
    else L.push(`<button class="btn small" data-a="not-ac" data-id="${r.id}">Değiştir</button>`);
    if (adv && r.durum === 'tamam') L.push(`<button class="btn small" data-a="ders-islem" data-id="${r.id}" data-i="duzeltme">Düzeltme iste</button>`);
    L.push(`<button class="btn small" data-a="ders-sil" data-id="${r.id}" aria-label="Sil">Sil</button>`);
    return `<span class="row" style="flex-wrap:nowrap;gap:6px">${L.join('')}</span>`;
  };
  const tbl = t => `<div class="term-h"><h3>${t}. yarıyıl</h3><span class="muted mono" style="font-size:13px">${s.dersler.filter(r => r.donem === t).reduce((x, r) => x + kat(s, r.kod).akts, 0)} AKTS</span></div>
    <div class="tablewrap"><table><thead><tr><th>Kod</th><th>Ders</th><th>Tür</th><th style="text-align:right">Kredi</th><th style="text-align:right">AKTS</th><th style="text-align:right">Not</th><th style="text-align:right">Final</th><th>Durum</th><th></th></tr></thead><tbody>
    ${s.dersler.filter(r => r.donem === t).map(r => { const c = kat(s, r.kod); return `<tr>
      <td class="mono">${esc(c.kod)}</td><td>${esc(c.ad)}${r.kaynak !== 'program' ? ` <span class="pill off">${r.kaynak === 'lisans' ? 'lisans dersi' : 'başka üniversite'}</span>` : ''}</td><td class="muted">${TUR_AD[c.tur] || ''}</td>
      <td class="num">${c.kredi}</td><td class="num">${c.akts}</td>
      <td class="num">${r.not ?? (r.sonuc === 'basarili' ? 'B' : '—')}</td><td class="num">${r.final ?? '—'}</td>
      <td>${durumPill(r, c)}</td><td>${islem(r, c)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  return `
  <section class="panel">
    <div class="row" style="justify-content:space-between"><h2>Ders durumu</h2><span class="muted" style="font-size:13.5px">Çubuk, müfredat listesine göre değil yönetmelik koşullarına göre ilerler.</span></div>
    <div class="grid3">
      <div class="stat"><span class="eyebrow">Kredi (en az 21)</span><span class="v mono">${fmt(a.kredi)}</span><div class="meter"><i style="width:${Math.min(100, a.kredi / 21 * 100)}%"></i></div></div>
      <div class="stat"><span class="eyebrow">Kredili ders (en az 7)</span><span class="v mono">${fmt(a.ders)}</span><div class="meter"><i style="width:${Math.min(100, a.ders / 7 * 100)}%"></i></div></div>
      <div class="stat"><span class="eyebrow">AKTS (en az 120)</span><span class="v mono">${fmt(a.akts)}</span><div class="meter"><i style="width:${Math.min(100, a.akts / 120 * 100)}%"></i></div></div>
    </div>
    <p class="muted" style="margin:0;font-size:13.5px">Şu an aldığın dersler çubukta yarım sayılır; notunu girdiğinde ders yeşile döner ve tam sayılır. Bilimsel Araştırma Yöntemleri ve Bilimsel Etik zorunludur ama 7 ders sayısına girmez. Seminer ve UAD başarılı/başarısız olarak değerlendirilir. Bir dersin sayılması için başarı notu ve yarıyıl sonu/bütünleme notu en az 70 olmalı.</p>
    ${terms.length ? terms.map(tbl).join('') : '<p class="muted">Henüz ders eklenmedi. Aşağıdaki program dersleri listesinden aldığın derslere tıklayarak başla.</p>'}
  </section>
  ${programDersleriHTML(s, adv)}`;
}
const GRUP_SIRA = [
  [['zorunlu', 'bay', 'etik'], 'Zorunlu dersler'], [['secmeli'], 'Seçmeli dersler'],
  [['seminer'], 'Seminer'], [['uad'], 'Uzmanlık alan dersleri'],
];
function programDersleriHTML(s, adv) {
  const P = PROGRAMS[s.program];
  const kayit = kod => s.dersler.filter(r => r.kod === kod);
  const zk = P.katalog.filter(c => c.tur === 'zorunlu' && c.kredi > 0);
  const minSec = Math.max(0, Math.max(7 - zk.length, Math.ceil((21 - zk.reduce((x, c) => x + c.kredi, 0)) / 3)));
  const satir = c => {
    const L = kayit(c.kod), son = L[L.length - 1];
    const tekrar = son && son.durum !== 'aliyor' && son.durum !== 'duzeltme' && !gecti(son, c) && son.durum !== 'onay';
    let sag;
    if (S.ekleKod === c.kod) {
      const sonuclu = SONUCLU.includes(c.tur);
      sag = `<div class="row" style="gap:8px;justify-content:flex-end">
        <span class="muted" style="font-size:13px">Aldığım yarıyıl</span>
        <select class="input" id="e-donem" aria-label="Yarıyıl" style="width:auto">${[1, 2, 3, 4, 5, 6].map(n => `<option ${n === Math.max(1, s.donem - 1) ? 'selected' : ''} value="${n}">${n}. yarıyıl</option>`).join('')}</select>
        ${sonuclu ? `<span class="pill ok">Başarılı</span>`
          : `<input class="input" id="e-not" type="number" min="0" max="100" placeholder="Not" aria-label="Başarı notu" style="width:76px"><input class="input" id="e-final" type="number" min="0" max="100" placeholder="Final" aria-label="Yarıyıl sonu notu" style="width:76px">`}
        <button class="btn small primary" data-a="ders-ekle" data-kod="${esc(c.kod)}">Kaydet</button><button class="btn small" data-a="ekle-kapat">Vazgeç</button></div>
        ${sonuclu ? '' : '<div class="muted" style="font-size:12.5px;text-align:right">Başarı notunu ve yarıyıl sonu (final ya da bütünleme) notunu gir.</div>'}`;
    } else if (son && !tekrar) {
      sag = `<span class="row" style="gap:8px;justify-content:flex-end"><span class="muted" style="font-size:13px">${son.donem}. yarıyıl</span>${durumPill(son, c)}</span>`;
    } else {
      sag = `<span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap">${tekrar ? '<span class="muted" style="font-size:12.5px">Tekrar al:</span>' : ''}<button class="btn small" data-a="ders-aliyorum" data-kod="${esc(c.kod)}">Alıyorum</button><button class="btn small" data-a="ekle-ac-kod" data-kod="${esc(c.kod)}">Aldım</button></span>`;
    }
    return `<div class="crow ${son && !tekrar ? 'alindi' : ''} ${S.ekleKod === c.kod ? 'acik' : ''}"><span class="mono kod">${esc(c.kod)}</span><div style="min-width:0"><div>${esc(c.ad)}</div><div class="muted" style="font-size:12.5px">${c.kredi} kredi · ${c.akts} AKTS${c.tur === 'bay' || c.tur === 'etik' ? ' · kredisiz, 7 ders sayısına girmez' : ''}</div></div><div class="sag">${sag}</div></div>`;
  };
  const grup = ([tur, baslik]) => {
    const cs = P.katalog.filter(c => tur.includes(c.tur)); if (!cs.length) return '';
    const alinan = cs.filter(c => kayit(c.kod).some(r => r.durum === 'aliyor' || r.durum === 'onay' || r.durum === 'tamam' && gecti(r, c))).length;
    let ozet = `${alinan} / ${cs.length} eklendi`;
    if (tur[0] === 'secmeli' && minSec) ozet = `${alinan} eklendi · en az ${minSec} gerekli`;
    if (tur[0] === 'zorunlu') ozet = `${alinan} / ${cs.length} eklendi · hepsi gerekli`;
    return `<div class="cgrp"><div class="term-h"><span class="eyebrow">${baslik}</span><span class="muted mono" style="font-size:12.5px">${ozet}</span></div>${cs.map(satir).join('')}</div>`;
  };
  return `<section class="panel"><h2>Program dersleri</h2>
    <p class="muted" style="margin:0">${esc(P.ad)} öğretim planındaki dersler. ${adv ? 'Öğrenci adına ders ekleyebilirsiniz.' : 'Bu dönem aldığın ders için "Alıyorum"a, daha önce tamamladığın ders için "Aldım"a tıkla. Alınan dersler çubukta yarım sayılır; notu girince ders yeşile döner.'}</p>
    ${GRUP_SIRA.map(grup).join('')}
    <p class="muted" style="margin:0;font-size:13px">Lisans programından ya da başka bir üniversiteden ders aldıysan danışmanına yaz.</p>
  </section>`;
}
function tezHTML(s) {
  const adv = isAdv();
  const adimRow = i => {
    const d = s.adim[i.k] || '';
    const ck = d === 'tamam' ? '✓' : d === 'onay' ? '…' : '';
    let act = '';
    if (!adv) {
      if (!d && i.by !== 'danisman') act = `<button class="btn small" data-a="adim" data-k="${i.k}" data-i="gonder">Tamamladım</button>`;
      else if (!d) act = `<span class="pill off">Danışman işaretler</span>`;
      else if (d === 'duzeltme') act = `<button class="btn small sun" data-a="adim" data-k="${i.k}" data-i="gonder">Yeniden gönder</button>`;
      else if (d === 'onay') act = `<button class="btn small" data-a="adim" data-k="${i.k}" data-i="geri-cek">Geri çek</button>`;
    } else {
      if (d === 'onay') act = `<button class="btn small primary" data-a="adim" data-k="${i.k}" data-i="onayla">Onayla</button><button class="btn small" data-a="adim" data-k="${i.k}" data-i="duzeltme">Düzeltme iste</button>`;
      else if (d === 'tamam') act = `<button class="btn small" data-a="adim" data-k="${i.k}" data-i="sifirla">Geri al</button>`;
      else act = `<button class="btn small" data-a="adim" data-k="${i.k}" data-i="isaretle">Tamamlandı işaretle</button>`;
    }
    const lbl = d === 'tamam' ? '<span class="pill ok">Tamam</span>' : d === 'onay' ? '<span class="pill wait">Danışman onayında</span>' : d === 'duzeltme' ? '<span class="pill fix">Düzeltme istendi</span>' : '';
    return `<div class="step ${d}"><span class="ck">${ck}</span><div><div class="row" style="gap:8px"><b style="font-weight:600">${esc(i.ad)}</b>${lbl}</div>${i.not ? `<div class="note">${esc(i.not)}</div>` : ''}</div><div class="row">${act}</div></div>`;
  };
  const t = s.tez;
  const inp = (id, lab, val, type = 'text') => `<div class="field"><label for="${id}">${lab}</label><input class="input" id="${id}" data-tez="${id.replace('t-', '')}" type="${type}" value="${esc(val)}"></div>`;
  const juriRow = (j, n) => `<tr><td class="muted">${n < 3 ? `${n + 1}. asil${n === 0 ? ' (danışman)' : ''}` : `${n - 2}. yedek`}</td>
    <td><input class="input" aria-label="Unvan" data-juri="${n}" data-f="u" value="${esc(j.u)}" placeholder="Unvan" ${n === 0 ? 'readonly' : ''}></td>
    <td><input class="input" aria-label="Ad soyad" data-juri="${n}" data-f="a" value="${esc(j.a)}" placeholder="Ad soyad" ${n === 0 ? 'readonly' : ''}></td>
    <td><input class="input" aria-label="Kurum" data-juri="${n}" data-f="k" value="${esc(j.k)}" placeholder="Kurum" ${n === 0 ? 'readonly' : ''}></td></tr>`;
  return `
  <section class="panel"><h2>Tez süreci</h2>
    <p class="muted" style="margin:0">${adv ? 'Öğrencinin gönderdiği adımları onaylayın; danışmana ait adımları doğrudan işaretleyebilirsiniz.' : 'Tamamladığın adımı işaretle; danışmanın onaylayınca adım tamamen dolar. Bazı adımları yalnızca danışmanın işaretleyebilir.'}</p>
    <div class="steps">${ADIMLAR.map(g => `<div class="stepgrp"><div class="eyebrow" style="margin-top:6px">${g.ad}</div>${g.items.map(adimRow).join('')}</div>`).join('')}</div>
  </section>
  <section class="panel"><h2>Tez bilgileri</h2>
    <p class="muted" style="margin:0">Buraya girilen bilgiler Belgeler bölümündeki formlara otomatik aktarılır.</p>
    <div class="grid2" style="gap:12px">
      <div style="grid-column:1/-1">${inp('t-baslikTr', 'Tez başlığı (Türkçe)', t.baslikTr)}</div>
      <div style="grid-column:1/-1">${inp('t-baslikEn', 'Tez başlığı (İngilizce)', t.baslikEn)}</div>
      ${inp('t-oneriTarih', 'Tez önerisi tarihi', t.oneriTarih, 'date')}<div></div>
      ${t.komisyon.map((k, n) => `<div class="field"><label for="km-${n}">Öneri komisyonu ${n + 1}. üye</label><input class="input" id="km-${n}" data-kom="${n}" value="${esc(k)}" placeholder="Unvan Ad Soyad — Kurum"></div>`).join('')}
    </div>
    <h3 style="margin-top:8px">Savunma sınavı ve jüri</h3>
    <div class="grid3">${inp('t-sinavTarih', 'Sınav tarihi', t.sinavTarih, 'date')}${inp('t-sinavSaat', 'Saat', t.sinavSaat, 'time')}${inp('t-sinavYer', 'Yer', t.sinavYer)}</div>
    <p class="muted" style="margin:0;font-size:13.5px">Yüksek lisans jürisi 3 asil ve 2 yedek üyeden oluşur. Asillerden biri danışman, en az biri üniversite dışından; yedeklerden en az biri üniversite dışından olmalı (M23/3).</p>
    <div class="tablewrap"><table><thead><tr><th>Görev</th><th>Unvan</th><th>Ad soyad</th><th>Kurum</th></tr></thead><tbody>${t.juri.map(juriRow).join('')}</tbody></table></div>
    ${juriUyari(t)}
    <div class="row"><button class="btn primary" data-a="kaydet-tez">Kaydet</button></div>
  </section>`;
}
function juriUyari(t) {
  const dolu = t.juri.filter(j => j.a).length;
  if (dolu < 5) return `<p class="muted" style="margin:0;font-size:13.5px">Jüri: ${dolu}/5 üye girildi.</p>`;
  const dis = j => j.k && !/mersin/i.test(j.k);
  const asilDis = t.juri.slice(0, 3).some(dis), yedekDis = t.juri.slice(3).some(dis);
  return `<p style="margin:0;font-size:13.5px">${asilDis ? '✓' : '•'} Asil jüride üniversite dışından üye ${asilDis ? 'var' : 'yok, eklenmeli'} · ${yedekDis ? '✓' : '•'} Yedek jüride üniversite dışından üye ${yedekDis ? 'var' : 'yok, eklenmeli'}</p>`;
}
function dosyalarHTML(s) {
  const adv = isAdv();
  return `<section class="panel"><div class="row" style="justify-content:space-between"><h2>Tez dosyaları</h2><span class="muted" style="font-size:13.5px">Her sürüm saklanır, eskiler silinmez.</span></div>
    <label class="drop" for="f-up"><b>${adv ? 'Öğrenci adına sürüm yükle' : 'Yeni sürüm yükle'}</b><span class="muted" style="font-size:13.5px">Word, PDF, ODT veya RTF · en fazla 25 MB.${adv ? '' : ' Yüklediğinde danışmanına e-posta gider.'}</span><input id="f-up" type="file" accept=".doc,.docx,.pdf,.odt,.rtf" data-a="yukle" style="max-width:100%" ${S.mesgul ? 'disabled' : ''}></label>
    <div>${s.dosyalar.length ? s.dosyalar.map(d => `<div class="ver"><div class="vn">v${d.v}</div><div style="min-width:0"><b style="word-break:break-all">${esc(d.ad)}</b><div class="muted" style="font-size:13px">${esc(tarihFmt(d.tarih))} · ${esc(boyutFmt(d.boyut))}</div>
      ${d.yorum ? `<div class="cm"><span class="eyebrow">Danışman yorumu</span><br>${esc(d.yorum).replace(/\n/g, '<br>')}</div>` : adv ? `<div class="row" style="margin-top:8px"><textarea class="input" id="yorum-${d.id}" rows="2" placeholder="Bu sürüme yorum yaz" style="flex:1 1 200px"></textarea><button class="btn small primary" data-a="yorum" data-id="${d.id}">Gönder</button></div>` : `<div class="cm muted">Danışman henüz yorum yazmadı.</div>`}
      </div><a class="btn small" href="/api/dosyalar/${d.id}">İndir</a></div>`).join('') : `<p class="muted">Henüz dosya yok. İlk sürüm yüklendiğinde burada görünecek.</p>`}</div>
  </section>`;
}
function mezuniyetHTML(s) {
  const L = kontroller(s), n = L.filter(x => x.d === 'tamam').length;
  const icn = { tamam: '✓', surec: '…', bekliyor: '' };
  return `<section class="panel"><div class="row" style="justify-content:space-between"><h2>Mezuniyet koşulları</h2><span class="pill ok">${n} / ${L.length} tamam</span></div>
    <p class="muted" style="margin:0">Mersin Üniversitesi Lisansüstü Eğitim-Öğretim ve Sınav Yönetmeliği'ne göre otomatik hesaplanır. Uygulanan yönetmelik: ${esc(yonetmelik(s.kayit, s.kayitTuru).ad)}.</p>
    <div class="checks">${L.map(x => `<div class="chk ${x.d}"><span class="ic">${icn[x.d]}</span><div>${esc(x.ad)}<div class="ref">${esc(x.ref)}</div></div><span class="val">${esc(x.val)}</span></div>`).join('')}</div>
  </section>`;
}
function notlarHTML(s) {
  const me = isAdv() ? 'danisman' : 'ogrenci';
  return `<section class="panel"><h2>${me === 'ogrenci' ? 'Danışmanla yazışma' : 'Öğrenciyle yazışma'}</h2>
    <div class="thread">${s.mesajlar.map(m => `<div class="msg ${m.kimden === me ? 'me' : ''}"><div class="m">${m.kimden === 'danisman' ? 'Danışman' : esc(s.ad)} · ${esc(tarihFmt(m.t))}</div>${esc(m.m).replace(/\n/g, '<br>')}</div>`).join('') || '<p class="muted">Henüz mesaj yok.</p>'}</div>
    <div class="field"><label for="msg-in">Yeni not</label><textarea class="input" id="msg-in" rows="3" placeholder="${me === 'ogrenci' ? 'Danışmanına bir not bırak' : 'Öğrenciye not yaz'}"></textarea></div>
    <div class="row"><button class="btn primary" data-a="mesaj">Gönder</button><span class="muted" style="font-size:13px">Karşı tarafa e-posta bildirimi gider.</span></div>
  </section>`;
}
function hesapHTML() {
  return `<section class="panel" style="max-width:520px"><h2>Hesabım</h2>
    <p class="muted" style="margin:0">${esc(S.ben.ad)} · ${esc(S.ben.email)}</p>
    <form id="f-sifre" style="display:grid;gap:12px">
      <input type="email" value="${esc(S.ben.email)}" autocomplete="username" hidden readonly>
      <div class="field"><label for="hs-e">Mevcut şifre</label><input class="input" id="hs-e" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="hs-y">Yeni şifre (en az 8 karakter)</label><input class="input" id="hs-y" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn primary" type="submit" style="justify-self:start">Şifreyi değiştir</button>
    </form>
  </section>`;
}

/* ======================== BELGELER ======================== */
const BELGELER = [
  { id: 'kapak', no: 'Form 4', ad: 'Tez önerisi şablonu (kapak dolu)', gerek: ['ad', 'baslikTr'] },
  { id: 'oneriTutanak', no: 'Form 5', ad: 'Tez Önerisi Tutanağı', gerek: ['ad', 'baslikTr'] },
  { id: 'oneriDeg', no: 'Form 6', ad: 'Öğretim Elemanı Tez Önerisi Değerlendirme Formu', gerek: ['ad', 'no', 'baslikTr', 'komisyon'], not: 'Her komisyon üyesi için ayrı' },
  { id: 'juriOneri', no: 'Form YL-12', ad: 'Jüri Öneri Formu', gerek: ['ad', 'no', 'baslikTr', 'sinav', 'juri'] },
  { id: 'savunma', no: 'Form 8', ad: 'Tez Savunma Sınavı Tutanağı', gerek: ['ad', 'baslikTr', 'sinav', 'juri'] },
  { id: 'juriDeg', no: 'Form 9', ad: 'Jüri Üyesi Değerlendirme Formu', gerek: ['ad', 'baslikTr', 'juri'], not: 'Her jüri üyesi için ayrı' },
  { id: 'teslim', no: 'Form 12', ad: 'Tez Teslim ve Kullanım İzni Formu', gerek: ['ad', 'baslikTr'], not: 'T.C. no ve adres yalnızca tarayıcıda' },
  { id: 'cikis', no: 'Çıkış', ad: 'Lisansüstü Çıkış İşlemleri Kontrol Listesi', gerek: ['ad', 'no'] },
];
const GEREK_AD = { ad: 'ad soyad', no: 'öğrenci no', baslikTr: 'tez başlığı', komisyon: 'öneri komisyonu', sinav: 'sınav tarihi, saati ve yeri', juri: 'jüri üyeleri' };
function eksikler(s, b) {
  const t = s.tez, L = [];
  for (const g of b.gerek) {
    if (g === 'ad' && !s.ad) L.push(g);
    if (g === 'no' && !s.no) L.push(g);
    if (g === 'baslikTr' && !t.baslikTr) L.push(g);
    if (g === 'komisyon' && t.komisyon.some(x => !x)) L.push(g);
    if (g === 'sinav' && (!t.sinavTarih || !t.sinavSaat || !t.sinavYer)) L.push(g);
    if (g === 'juri' && t.juri.some(j => !j.a)) L.push(g);
  }
  return L;
}
function belgelerHTML(s) {
  return `<section class="panel"><h2>Belgeler</h2>
    <p class="muted" style="margin:0">Formlar girilen bilgilerle otomatik doldurulur. İmza, karar ve "sayı" alanları komisyon, jüri ve enstitü için boş bırakılır. "Word indir" ile enstitünün resmî formu bu bilgilerle doldurulmuş olarak iner; eksik alanlar boş kalır.</p>
    <div class="docs">${BELGELER.map(b => { const e = eksikler(s, b); return `<div class="doc"><span class="no">${b.no}</span><b>${esc(b.ad)}</b>
      ${b.not ? `<span class="muted" style="font-size:13px">${esc(b.not)}</span>` : ''}
      ${e.length ? `<span class="pill wait" style="justify-self:start">Eksik: ${e.map(x => GEREK_AD[x]).join(', ')}</span>` : `<span class="pill ok" style="justify-self:start">Hazır</span>`}
      <div class="row" style="gap:6px"><button class="btn small ${e.length ? '' : 'primary'}" data-a="${BELGE_SABLON[b.id].kisiler || b.id === 'teslim' ? 'belge' : 'word'}" data-id="${b.id}">Word indir</button><button class="btn small" data-a="belge" data-id="${b.id}">Önizle</button></div></div>`; }).join('')}</div>
  </section>`;
}
const V = (x, w = 30) => x ? `<span class="filled">${esc(x)}</span>` : `<span class="blank">${'.'.repeat(w)}</span>`;
const trTarih = d => d ? new Date(d + 'T12:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const UST = `<h4>T.C.</h4><h4>MERSİN ÜNİVERSİTESİ</h4><h4>EĞİTİM BİLİMLERİ ENSTİTÜSÜ</h4>`;
function belgeKagit(s, id) {
  const P = PROGRAMS[s.program], t = s.tez, J = t.juri;
  const imza = (ad, rol) => `<div class="sig"><div>${V(ad)}<br>${rol}<br><span class="blank">İmza</span></div></div>`;
  const yil = new Date().getFullYear();
  switch (id) {
    case 'kapak': return `<div class="c" style="padding:60px 0"><p><b>${V(s.ad.toLocaleUpperCase('tr'))}</b></p><p style="margin-top:50px;font-size:18px"><b>${V(t.baslikTr.toLocaleUpperCase('tr'))}</b></p><p style="margin-top:50px">YÜKSEK LİSANS TEZ ÖNERİSİ</p><p>${esc(P.abd.toLocaleUpperCase('tr'))}</p><p>EĞİTİM BİLİMLERİ ENSTİTÜSÜ<br>MERSİN ÜNİVERSİTESİ</p><p>${yil}</p></div><p style="font-size:13px;color:#555">Şablonun devamı (Özet, Abstract, Bölüm 1–3, Kaynakça, Ekler) Word dosyasında boş başlıklarla gelecek.</p>`;
    case 'oneriTutanak': return `${UST}<h4 style="margin-top:14px">TEZ ÖNERİSİ TUTANAĞI</h4><p>Sayı: <span class="blank">.............</span><span style="float:right">Tarih: ${V(trTarih(t.oneriTarih), 12)}</span></p>
      <p style="text-indent:2em">Enstitümüz ${esc(P.abd)} yüksek lisans öğrencisi ${V(s.ad)}'nın, danışmanlığını ${esc(DANISMAN)}'nın yürüttüğü “${V(t.baslikTr)}” başlıklı yüksek lisans tez önerisi komisyonumuzca incelenmiş ve <span class="box"></span>oybirliği <span class="box"></span>oyçokluğu ile <span class="box"></span>kabul <span class="box"></span>red edilmiştir.</p>
      ${imza(P.baskan, 'Anabilim Dalı Başkanı')}`;
    case 'oneriDeg': return t.komisyon.map((k, n) => `${UST}<h4 style="margin-top:14px">ÖĞRETİM ELEMANI TEZ ÖNERİSİ DEĞERLENDİRME FORMU</h4>
      <table><tr><th>Tarih</th><td>${V(trTarih(t.oneriTarih))}</td></tr><tr><th>Komisyon üyesi</th><td>${V(k)}</td></tr><tr><th>Tez başlığı</th><td>${V(t.baslikTr)}</td></tr><tr><th>Danışman</th><td>${esc(DANISMAN)}</td></tr><tr><th>Öğrenci</th><td>${V(s.ad)} · ${V(s.no, 12)} · ${esc(P.abd)}</td></tr></table>
      <p style="font-size:13px;color:#555">Değerlendirme soruları (7 evet/hayır maddesi) resmî formdaki gibi boş gelecek. (${n + 1}/${t.komisyon.length})</p>`).join('<hr style="margin:30px 0">');
    case 'juriOneri': return `${UST}<h4 style="margin-top:14px">YÜKSEK LİSANS TEZ SINAVI JÜRİ ÖNERİ FORMU</h4><p>Sayı: <span class="blank">.............</span><span style="float:right">Tarih: ${V(today())}</span></p>
      <table><tr><th>Öğrenci</th><td>${V(s.ad)}</td><th>Numara</th><td>${V(s.no, 12)}</td></tr><tr><th>Anabilim dalı</th><td colspan="3">${esc(P.abd)}</td></tr><tr><th>Danışman</th><td colspan="3">${esc(DANISMAN)}</td></tr><tr><th>Tez başlığı</th><td colspan="3">${V(t.baslikTr)}</td></tr><tr><th>Sınav</th><td colspan="3">${V(trTarih(t.sinavTarih), 10)} · ${V(t.sinavSaat, 6)} · ${V(t.sinavYer)}</td></tr></table>
      <table><tr><th></th><th>Unvan</th><th>Ad soyad</th><th>Kurum</th></tr>${J.map((j, n) => `<tr><td>${n < 3 ? `Asil ${n + 1}` : `Yedek ${n - 2}`}</td><td>${V(j.u, 10)}</td><td>${V(j.a, 16)}</td><td>${V(j.k, 16)}</td></tr>`).join('')}</table>
      ${imza(P.baskan, 'Anabilim Dalı Başkanı')}`;
    case 'savunma': return `${UST}<h4 style="margin-top:14px">YÜKSEK LİSANS TEZ SAVUNMA SINAVI TUTANAĞI</h4><p>Sayı: <span class="blank">.............</span><span style="float:right">Tarih: ${V(trTarih(t.sinavTarih), 12)}</span></p>
      <p style="text-indent:2em">${esc(P.abd)} öğrencisi ${V(s.ad)}'nın hazırladığı “${V(t.baslikTr)}” başlıklı tezi, ${V(trTarih(t.sinavTarih), 10)} tarihinde saat ${V(t.sinavSaat, 6)}'de ${V(t.sinavYer)}'nda yapılan sınavda jürimizce incelenmiş ve <span class="box"></span>kabul <span class="box"></span>düzeltme <span class="box"></span>red kararı verilmiştir.</p>
      <p>Başlık değişikliği önerisi: <span class="blank">..................................................</span></p>
      <table><tr><th>Jüri</th><th>Ad soyad</th><th>Kurum</th><th>İmza</th></tr>${J.slice(0, 3).map((j, n) => `<tr><td>${n === 0 ? 'Başkan / Danışman' : 'Üye'}</td><td>${V((j.u + ' ' + j.a).trim())}</td><td>${V(j.k)}</td><td></td></tr>`).join('')}</table>
      ${imza(P.baskan, 'Anabilim Dalı Başkanı')}`;
    case 'juriDeg': return J.slice(0, 3).map((j, n) => `${UST}<h4 style="margin-top:14px">JÜRİ ÜYESİ DEĞERLENDİRME FORMU</h4>
      <table><tr><th>Öğrenci</th><td>${V(s.ad)}</td></tr><tr><th>Danışman</th><td>${esc(DANISMAN)}</td></tr><tr><th>Jüri üyesi</th><td>${V((j.u + ' ' + j.a).trim())} (${V(j.k, 12)})</td></tr><tr><th>Anabilim dalı</th><td>${esc(P.abd)}</td></tr><tr><th>Tez başlığı</th><td>${V(t.baslikTr)}</td></tr><tr><th>Tarih</th><td>${V(trTarih(t.sinavTarih))}</td></tr></table>
      <p style="font-size:13px;color:#555">Değerlendirme ölçütleri resmî formdaki gibi boş gelecek. (${n + 1}/3)</p>`).join('<hr style="margin:30px 0">');
    case 'teslim': return `${UST}<h4 style="margin-top:14px">TEZ TESLİM VE KULLANIM İZNİ FORMU</h4>
      <table><tr><th>Ad soyad</th><td>${V(s.ad)}</td></tr><tr><th>T.C. Kimlik No</th><td>${V(S.gecici?.tc)}</td></tr><tr><th>E-posta</th><td>${V(s.eposta)}</td></tr><tr><th>Posta adresi</th><td>${V(S.gecici?.adres)}</td></tr><tr><th>Enstitü</th><td>Eğitim Bilimleri Enstitüsü</td></tr><tr><th>Danışman</th><td>${esc(DANISMAN)}</td></tr><tr><th>Tez yılı</th><td>${yil}</td></tr><tr><th>Tez adı</th><td>${V(t.baslikTr)}</td></tr></table>
      <p style="font-size:13px;color:#555">İzin seçenekleri ve beyan metni resmî formdaki gibi gelecek; iki nüsha imzalanır.</p>`;
    case 'cikis': return `${UST}<h4 style="margin-top:14px">LİSANSÜSTÜ ÇIKIŞ İŞLEMLERİ</h4>
      <table><tr><th>Ad soyad</th><td>${V(s.ad)}</td><th>Öğrenci no</th><td>${V(s.no, 12)}</td></tr><tr><th>Anabilim dalı</th><td colspan="3">${esc(P.abd)}</td></tr><tr><th>Program</th><td>${esc(P.ad)}</td><th>Statü</th><td>${V(s.statu, 12)}</td></tr></table>
      <table>${['Tez Teslim ve Kullanım İzni Formu (2 adet, FR-114)', 'tez.yok.gov.tr Tez Veri Giriş Formu', 'İlişik Kesme Formu (FR-348)', 'Mezun İzleme Formu (FR-032)', 'Tezin PDF hâli (2 adet CD)', 'Kimlik kartı'].map(x => `<tr><td style="width:28px"><span class="box"></span></td><td>${x}</td></tr>`).join('')}</table>`;
  }
  return '';
}
function modalHTML() {
  if (!S.modal) return '';
  const s = cur(); if (!s) return '';
  const b = BELGELER.find(x => x.id === S.modal.id);
  const tc = b.id === 'teslim' ? `<div class="panel" style="padding:14px;gap:10px;background:var(--surface-2)"><b>Yalnızca bu formda gerekli bilgiler</b><span class="muted" style="font-size:13.5px">Bu iki bilgi sunucuya gönderilmez ve kaydedilmez; pencereyi kapattığında silinir.</span>
    <div class="grid2" style="gap:10px"><div class="field"><label for="g-tc">T.C. Kimlik No</label><input class="input" id="g-tc" inputmode="numeric" maxlength="11" autocomplete="off" value="${esc(S.gecici?.tc || '')}"></div><div class="field"><label for="g-adres">Posta adresi</label><input class="input" id="g-adres" autocomplete="off" value="${esc(S.gecici?.adres || '')}"></div></div></div>` : '';
  return `<div class="modal" data-a="kapat-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(b.ad)}">
    <div class="head"><div><span class="eyebrow">${b.no}</span><h2 style="font-size:20px">${esc(b.ad)}</h2></div><div class="row">${wordDugmeleri(s, b.id)}<button class="btn" data-a="kapat">Kapat</button></div></div>
    ${tc}
    <p class="muted" style="margin:0;font-size:13.5px">Yeşil alanlar panelde girilen bilgilerden geldi. Word dosyası enstitünün resmî formudur; önizleme yalnızca içeriği gösterir.</p>
    <div class="paper" id="paper">${belgeKagit(s, b.id)}</div>
  </div></div>`;
}
function wordDugmeleri(s, id) {
  const B = BELGE_SABLON[id];
  if (!B.kisiler) return `<button class="btn primary" data-a="word" data-id="${id}">Word olarak indir</button>`;
  const L = B.kisiler(s);
  if (!L.length) return `<span class="muted" style="font-size:13px">Önce ${id === 'oneriDeg' ? 'öneri komisyonunu' : 'jüri üyelerini'} Tez süreci sayfasına gir.</span>`;
  return L.map((k, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-a="word" data-id="${id}" data-k="${i}">Word: ${esc(k.ad)}</button>`).join('');
}
async function wordIndir(id, kisiNo) {
  const s = cur(), B = BELGE_SABLON[id];
  if (!window.PizZip || !window.docxtemplater) throw new Error('Belge aracı yüklenemedi. Sayfayı yenileyip tekrar dene.');
  const kisi = B.kisiler ? B.kisiler(s)[kisiNo || 0] : null;
  const r = await fetch('/sablonlar/' + B.dosya);
  if (!r.ok) throw new Error('Form şablonu bulunamadı.');
  const zip = new window.PizZip(await r.arrayBuffer());
  const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(belgeVerisi(s, {
    ...(kisi ? { uyeAd: kisi.ad, uyeKurum: kisi.kurum } : {}),
    ...(id === 'teslim' ? { tc: S.gecici?.tc || '', adres: S.gecici?.adres || '' } : {}),
  }));
  const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = dosyaAdi(s, id, kisi);
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function renderModal() {
  const host = document.getElementById('modalHost');
  host.innerHTML = S.ekran === 'uygulama' ? modalHTML() : '';
}

/* ======================== DANIŞMAN EKRANLARI ======================== */
function ogrencilerHTML() {
  const bek = bekleyenler();
  const aktif = S.students.filter(s => !s.arsiv), arsiv = S.students.filter(s => s.arsiv);
  const kart = s => { const p = ilerleme(s), h = hatirlatmalar(s), nb = bek.filter(x => x.s === s).length; return `
    <button class="scard" data-a="ac" data-s="${s.id}">
      <div><div class="nm">${esc(s.ad)}</div><div class="muted" style="font-size:13.5px">${esc(PROGRAMS[s.program].kisa)} · ${s.donem}. yarıyıl${s.no ? ' · ' + esc(s.no) : ''}</div>
        ${s.kayitTuru === 'af' ? '<span class="pill off" style="margin-top:4px">Af ile dönen</span>' : ''}${s.davetBekliyor ? '<div class="flagnote">• Davet bekliyor (henüz şifre belirlemedi)</div>' : ''}${s.arsiv ? '' : h.map(x => `<div class="flagnote">• ${esc(x)}</div>`).join('')}</div>
      <div style="display:grid;gap:6px">${segBar(p, 'mini')}<div class="muted" style="font-size:13px">Sıradaki: ${esc(siradaki(s).b)}</div></div>
      <div style="display:grid;justify-items:end;gap:4px"><span class="p">%${Math.round(p.all)}</span>${nb ? `<span class="pill wait">${nb} onay bekliyor</span>` : ''}${s.arsiv ? '<span class="pill off">Arşiv</span>' : ''}</div>
    </button>`; };
  return `
  <div class="row" style="justify-content:space-between"><div><span class="eyebrow">Danışman paneli</span><h1 style="font-size:30px;margin-top:4px">Öğrencilerim</h1></div>
    <button class="btn primary" data-a="ekle-ac">${S.ekleAcik ? 'Formu kapat' : '+ Öğrenci ekle'}</button></div>
  ${S.sonLink ? `<section class="panel" style="border-color:var(--accent)"><b>${esc(S.sonLink.ad)} için bağlantı</b>
    <span class="muted" style="font-size:13.5px">${S.sonLink.mailGitti ? 'Bağlantı öğrenciye e-postayla gönderildi. İsterseniz aşağıdan kopyalayıp ayrıca iletebilirsiniz.' : 'E-posta gönderimi henüz ayarlı olmadığı için bağlantıyı kopyalayıp öğrenciye siz iletin.'}</span>
    <div class="linkbox"><code id="son-link">${esc(S.sonLink.link)}</code><button class="btn small" data-a="kopyala">Kopyala</button></div>
    <button class="linkbtn" data-a="link-kapat">Kapat</button></section>` : ''}
  ${S.ekleAcik ? `<section class="panel"><h2>Yeni öğrenci</h2>
    <p class="muted" style="margin:0">Öğrenciye davet bağlantısı oluşturulur; öğrenci şifresini kendisi belirler.</p>
    <div class="grid2" style="gap:12px">
      <div class="field"><label for="y-ad">Ad soyad</label><input class="input" id="y-ad" required></div>
      <div class="field"><label for="y-email">E-posta</label><input class="input" id="y-email" type="email" required></div>
      <div class="field"><label for="y-no">Öğrenci numarası</label><input class="input" id="y-no"></div>
      <div class="field"><label for="y-program">Program</label><select class="input" id="y-program">${Object.entries(PROGRAMS).map(([k, v]) => `<option value="${k}">${esc(v.ad)}</option>`).join('')}</select></div>
      <div class="field"><label for="y-tur">Kayıt türü</label><select class="input" id="y-tur"><option value="normal">Normal kayıt</option><option value="af">Af ile dönen öğrenci</option></select></div>
      <div class="field"><label for="y-kayit">Kayıt dönemi (af ile dönenlerde dönüş dönemi)</label><select class="input" id="y-kayit">${KAYIT_DONEMLERI.map(x => `<option ${x === '2026-2027 Güz' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label for="y-donem">Şu anki yarıyıl</label><select class="input" id="y-donem">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">${n}. yarıyıl</option>`).join('')}</select></div>
      <div class="field"><label for="y-ddonem">Danışmanın atandığı yarıyıl</label><select class="input" id="y-ddonem">${[1, 2, 3, 4].map(n => `<option value="${n}">${n}. yarıyıl</option>`).join('')}</select></div>
    </div>
    <div class="row"><button class="btn primary" data-a="ogrenci-ekle" ${S.mesgul ? 'disabled' : ''}>Ekle ve davet bağlantısı oluştur</button></div>
  </section>` : ''}
  <div class="grid3">
    <div class="stat"><span class="eyebrow">Aktif öğrenci</span><span class="v mono">${aktif.length}</span></div>
    <div class="stat"><span class="eyebrow">Onayınızı bekleyen</span><span class="v mono">${bek.length}</span></div>
    <div class="stat"><span class="eyebrow">Planlanan savunma</span><span class="v mono">${aktif.filter(s => s.tez.sinavTarih).length}</span></div>
  </div>
  <div class="slist">${aktif.map(kart).join('') || '<section class="panel"><p class="muted" style="margin:0">Henüz öğrenci yok. "Öğrenci ekle" ile ilk öğrencinizi ekleyin.</p></section>'}</div>
  ${arsiv.length ? `<div class="eyebrow">Arşiv</div><div class="slist">${arsiv.map(kart).join('')}</div>` : ''}
  ${aktif.some(s => s.davetBekliyor) || S.students.length ? `<p class="muted" style="font-size:13.5px;margin:0">Bir öğrenciye yeni davet ya da şifre yenileme bağlantısı göndermek için öğrenciyi açıp "Kişisel bilgiler"e gidin.</p>` : ''}`;
}
const KURALLAR = [
  ['Dönem başı', 'Eylül sonu–Ekim başı ve Şubat ortası: yarıyıl bilgisini ve bu dönemin derslerini güncelleme hatırlatması. Dönemde bir kez.'],
  ['Not girişi', 'Ocak sonu ve Haziran sonu: "alıyor" görünen dersi olan öğrenciye notlarını girmesi hatırlatması. Dönemde bir kez.'],
  ['Tez konusu', '2. yarıyıldan itibaren tez konusu belirlenmemişse ayda bir.'],
  ['Ders dönemi sonu', '4. yarıyılda kredili dersler veya seminer eksikse dönemde bir kez (af ile dönenlere gönderilmez).'],
  ['Savunma', 'Savunma tarihinden 7 gün ve 1 gün önce.'],
  ['Ciltli teslim', 'Savunma onaylandıktan 14 ve 25 gün sonra, ciltli teslim işaretlenmemişse.'],
  ['Sessizlik', 'Tez konusu belli olan öğrenciden 45 gündür dosya, not veya ders güncellemesi yoksa "Nasıl gidiyor?" e-postası.'],
  ['Haftalık özet', 'Her pazartesi size: onay bekleyenler, yorum bekleyen sürümler, yaklaşan savunmalar ve giden hatırlatmalar.'],
];
function hatirlatmaHTML() {
  const h = S.hatirlatma;
  if (!h) { hatirlatmaYukle(); return '<div class="loading" style="min-height:30vh">Yükleniyor…</div>'; }
  return `<div><span class="eyebrow">Danışman paneli</span><h1 style="font-size:30px;margin-top:4px">Hatırlatmalar</h1></div>
  <section class="panel"><h2>Bugün gidecekler</h2>
    <p class="muted" style="margin:0">Panel her sabah 09:00'da kontrol eder ve aşağıdakileri öğrencilere e-postayla gönderir. Aynı hatırlatma bir öğrenciye bir kez gider.${h.mailVar ? '' : ' E-posta gönderimi ayarlı olmadığı için şu an hatırlatma gitmiyor.'}</p>
    ${h.liste.length ? h.liste.map((x, i) => `<details class="q" style="display:block"><summary style="cursor:pointer"><b>${esc(x.ogrenci)}</b> · ${esc(x.konu)}</summary><div class="cm" style="white-space:pre-wrap;margin-top:8px">${esc(x.metin)}</div></details>`).join('') : '<p class="muted" style="margin:0">Bugün gönderilecek hatırlatma yok.</p>'}
    ${h.liste.length && h.mailVar ? `<div class="row"><button class="btn" data-a="hatirlatma-gonder">Şimdi gönder</button><span class="muted" style="font-size:13px">Beklemeden hemen göndermek için. Göndermezseniz yarın sabah kendiliğinden gider.</span></div>` : ''}
  </section>
  <section class="panel"><h2>Kurallar</h2>
    <div class="checks">${KURALLAR.map(([a, b]) => `<div class="chk bekliyor"><span class="ic">✉</span><div><b style="font-weight:600">${a}</b><div class="ref">${b}</div></div><span></span></div>`).join('')}</div>
  </section>`;
}
async function hatirlatmaYukle() {
  try { S.hatirlatma = await api('/hatirlatmalar'); } catch (e) { S.hatirlatma = { liste: [], mailVar: false }; toast(e.message); }
  if (S.section === 'hatirlatma') render();
}
function onaylarHTML() {
  const L = bekleyenler();
  return `<div><span class="eyebrow">Danışman paneli</span><h1 style="font-size:30px;margin-top:4px">Onay bekleyenler</h1></div>
  <section class="panel">${L.length ? L.map((x, n) => `<div class="q"><div style="min-width:0"><div class="muted" style="font-size:13px">${esc(x.s.ad)}</div><div class="what">${esc(x.ad)}</div><div class="muted" style="font-size:13px">${esc(x.ek)}</div>
      ${x.tip !== 'dosya' ? `<div class="row" style="margin-top:8px"><input class="input" id="qn-${n}" placeholder="Düzeltme notu (isteğe bağlı)" style="flex:1 1 220px"></div>` : ''}</div>
      <div class="row">${x.tip === 'dosya' ? `<button class="btn small primary" data-a="ac" data-s="${x.s.id}" data-k="dosyalar">Aç ve yorum yaz</button>` :
        x.tip === 'ders' ? `<button class="btn small primary" data-a="ders-islem" data-s="${x.s.id}" data-id="${x.id}" data-i="onayla">Onayla</button><button class="btn small" data-a="ders-islem" data-s="${x.s.id}" data-id="${x.id}" data-i="duzeltme" data-n="${n}">Düzeltme iste</button>` :
        `<button class="btn small primary" data-a="adim" data-s="${x.s.id}" data-k="${x.k}" data-i="onayla">Onayla</button><button class="btn small" data-a="adim" data-s="${x.s.id}" data-k="${x.k}" data-i="duzeltme" data-n="${n}">Düzeltme iste</button>`}</div></div>`).join('')
    : `<p class="muted">Bekleyen onay yok. Öğrencileriniz bir adımı gönderdiğinde burada görünür${S.mailVar ? ' ve e-posta alırsınız' : ''}.</p>`}</section>`;
}

/* ======================== ETKİLEŞİM ======================== */
function toast(t, sub) {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = esc(t) + (sub ? `<small>${esc(sub)}</small>` : '');
  document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), 4200);
}
function konfeti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['var(--accent)', 'var(--sun)', 'var(--info)'];
  for (let i = 0; i < 60; i++) { const c = document.createElement('i'); c.style.left = Math.random() * 100 + '%'; c.style.background = cols[i % 3]; c.style.animationDelay = Math.random() * .5 + 's'; box.appendChild(c); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
}
const tamamlananlar = s => new Set(ilerleme(s).seg.filter(x => x.ok >= .999).map(x => x.k));
function kutla(s, once) {
  const sonra = tamamlananlar(s);
  const yeni = BOLUMLER.filter(b => sonra.has(b.k) && !once.has(b.k));
  if (yeni.length) { konfeti(); S.celebrate = `${isAdv() ? s.ad + ': ' : ''}“${yeni.map(b => b.ad).join(', ')}” aşaması tamamlandı!`; setTimeout(() => { S.celebrate = null; render(); }, 6000); }
}
const val = id => document.getElementById(id)?.value ?? '';
const mailNot = () => S.mailVar ? 'E-posta bildirimi gönderildi.' : '';

async function islemYap(s, fn, mesajlar) {
  const once = tamamlananlar(s);
  await fn();
  await yenile(s.id);
  kutla(cur() || s, once);
  if (mesajlar) toast(mesajlar[0], mesajlar[1]);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a;
  if (a === 'kapat-bg' && e.target !== el) return;
  if (el.tagName === 'INPUT') return;
  const s = el.dataset.s ? st(el.dataset.s) : (S.ekran === 'uygulama' ? cur() : null);
  try {
    switch (a) {
      case 'tema': temaUygula(tema() === 'dark' ? 'light' : 'dark'); break;
      case 'ekran': S.ekran = el.dataset.k; S.hata = ''; history.replaceState(null, '', '/'); break;
      case 'cikis': await api('/cikis', { method: 'POST', body: {} }); S.ben = null; S.students = []; S.ekran = 'giris'; S.modal = null; break;
      case 'toggle': if (innerWidth <= 760) S.mopen = !S.mopen; else S.collapsed = !S.collapsed; break;
      case 'nav': if (el.dataset.k === 'hatirlatma') S.hatirlatma = null; S.section = el.dataset.k; S.mopen = false; S.notEdit = null; S.ekleKod = null; if (isAdv() && ['ogrenciler', 'onaylar'].includes(el.dataset.k)) S.viewing = null; scrollTo(0, 0); break;
      case 'hatirlatma-gonder': { const r = await api('/hatirlatmalar/gonder', { method: 'POST', body: {} }); S.hatirlatma = null; toast(`${r.gonderilen} hatırlatma gönderildi`); break; }
      case 'ac': S.viewing = el.dataset.s; S.section = el.dataset.k || 'genel'; scrollTo(0, 0); break;
      case 'ekle-ac': S.ekleAcik = !S.ekleAcik; break;
      case 'link-kapat': S.sonLink = null; break;
      case 'kopyala': {
        const t = S.sonLink?.link || '';
        try { await navigator.clipboard.writeText(t); toast('Bağlantı kopyalandı'); }
        catch { const r = document.createRange(); r.selectNodeContents(document.getElementById('son-link')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Bağlantı seçildi', 'Kopyalamak için Ctrl/Cmd + C'); }
        return; }
      case 'ogrenci-ekle': {
        const b = { ad: val('y-ad'), email: val('y-email'), no: val('y-no'), program: val('y-program'), kayit: val('y-kayit'), kayitTuru: val('y-tur'), donem: +val('y-donem'), danismanDonem: +val('y-ddonem') };
        S.mesgul = true; render();
        try { const r = await api('/ogrenciler', { method: 'POST', body: b }); S.sonLink = { ad: b.ad, link: r.link, mailGitti: r.mailGitti }; S.ekleAcik = false; await yukleHepsi(); toast('Öğrenci eklendi'); }
        finally { S.mesgul = false; }
        break; }
      case 'baglanti': {
        const r = await api(`/ogrenciler/${s.id}/baglanti`, { method: 'POST', body: {} });
        S.sonLink = { ad: s.ad, link: r.link, mailGitti: r.mailGitti }; S.section = 'ogrenciler'; S.viewing = null; scrollTo(0, 0);
        break; }
      case 'kaydet-kisisel': {
        const b = isAdv()
          ? { ad: val('k-ad'), eposta: val('k-eposta'), no: val('k-no'), program: val('k-program'), kayit: val('k-kayit'), kayitTuru: val('k-tur'), donem: +val('k-donem'), danismanDonem: +val('k-ddonem'), statu: val('k-statu'), arsiv: document.getElementById('k-arsiv')?.checked }
          : { ad: val('k-ad'), no: val('k-no'), program: val('k-program'), kayit: val('k-kayit'), kayitTuru: val('k-tur'), donem: +val('k-donem'), danismanDonem: +val('k-ddonem'), statu: val('k-statu') };
        await api(`/ogrenciler/${s.id}/profil`, { method: 'PUT', body: b }); if (!isAdv()) S.ben.ad = b.ad; await yenile(s.id); toast('Kişisel bilgiler kaydedildi');
        break; }
      case 'kaydet-tez': {
        const t = JSON.parse(JSON.stringify(s.tez));
        document.querySelectorAll('[data-tez]').forEach(i => t[i.dataset.tez] = i.value);
        document.querySelectorAll('[data-kom]').forEach(i => t.komisyon[+i.dataset.kom] = i.value);
        document.querySelectorAll('[data-juri]').forEach(i => t.juri[+i.dataset.juri][i.dataset.f] = i.value);
        await api(`/ogrenciler/${s.id}/tez`, { method: 'PUT', body: t }); await yenile(s.id); toast('Tez bilgileri kaydedildi', 'Belgeler bölümündeki formlar güncellendi.');
        break; }
      case 'ekle-ac-kod': S.ekleKod = el.dataset.kod; break;
      case 'ekle-kapat': S.ekleKod = null; break;
      case 'ders-aliyorum': {
        const kod = el.dataset.kod;
        await islemYap(s, () => api(`/ogrenciler/${s.id}/dersler`, { method: 'POST', body: { kod, donem: s.donem, kaynak: 'program' } }),
          ['Ders eklendi', `${s.donem}. yarıyıl · çubukta yarım sayılıyor. Notun açıklanınca "Not gir" ile gir.`]);
        break; }
      case 'ders-ekle': {
        const kod = el.dataset.kod, c = kat(s, kod), sonuclu = SONUCLU.includes(c.tur);
        const b = { kod, donem: +val('e-donem'), kaynak: 'program', not: sonuclu ? '' : val('e-not'), final: sonuclu ? '' : val('e-final'), sonuc: sonuclu ? 'basarili' : null };
        if (!sonuclu && b.not === '') { toast('Başarı notunu gir', 'Henüz notun yoksa "Alıyorum"u kullan.'); return; }
        await islemYap(s, () => api(`/ogrenciler/${s.id}/dersler`, { method: 'POST', body: b }));
        S.ekleKod = null;
        const r = { not: b.not === '' ? null : +b.not, final: b.final === '' ? null : +b.final, sonuc: b.sonuc };
        if (!gecti(r, c)) toast('Ders eklendi ama sayılmayacak', 'Başarı notu ve yarıyıl sonu notu en az 70 olmalı. Seçmeliyse başka bir seçmeliyle telafi edebilirsin.');
        else toast('Ders tamamlandı olarak eklendi');
        break; }
      case 'not-ac': S.notEdit = +el.dataset.id; break;
      case 'not-kapat': S.notEdit = null; break;
      case 'not-kaydet': {
        const r = s.dersler.find(x => x.id === +el.dataset.id), c = kat(s, r.kod);
        const b = el.dataset.sonuc ? { sonuc: 'basarili', not: null, final: null } : { not: val('ng-not'), final: val('ng-fin') };
        if (!el.dataset.sonuc && b.not === '') { toast('Başarı notunu gir', 'Notu 0–100 arasında yaz.'); return; }
        await islemYap(s, () => api(`/ogrenciler/${s.id}/dersler/${r.id}`, { method: 'PUT', body: { ...b, donem: r.donem, kaynak: r.kaynak } }));
        S.notEdit = null;
        const yeni = cur().dersler.find(x => x.id === r.id);
        if (yeni && !gecti(yeni, c)) toast('Sonuç kaydedildi ama ders sayılmayacak', 'Başarı notu ve yarıyıl sonu notu en az 70 olmalı.');
        else toast('Ders tamamlandı', 'Çubukta artık tam sayılıyor.');
        break; }
      case 'ders-sil': {
        if (el.dataset.onay !== '1') { el.dataset.onay = '1'; el.textContent = 'Emin misin?'; el.classList.add('sun'); setTimeout(() => { if (el.isConnected) { el.dataset.onay = ''; el.textContent = 'Sil'; el.classList.remove('sun'); } }, 3000); return; }
        await api(`/ogrenciler/${s.id}/dersler/${el.dataset.id}`, { method: 'DELETE' }); await yenile(s.id); toast('Ders silindi');
        break; }
      case 'ders-islem': {
        const n = el.dataset.n, not = n != null ? val('qn-' + n).trim() : '';
        await islemYap(s, () => api(`/ogrenciler/${s.id}/dersler/${el.dataset.id}`, { method: 'PUT', body: { islem: el.dataset.i, not } }),
          el.dataset.i === 'duzeltme' ? ['Düzeltme istendi', mailNot()] : ['Güncellendi']);
        break; }
      case 'adim': {
        const n = el.dataset.n, not = n != null ? val('qn-' + n).trim() : '';
        const i = el.dataset.i;
        await islemYap(s, () => api(`/ogrenciler/${s.id}/adim/${el.dataset.k}`, { method: 'POST', body: { islem: i, not } }),
          { gonder: ['Danışman onayına gönderildi', 'Çubuk bu adım için yarım doldu. Onaylanınca tamamlanacak.'], 'geri-cek': ['Adım geri çekildi'], onayla: ['Onaylandı', mailNot()], isaretle: ['Tamamlandı olarak işaretlendi', mailNot()], duzeltme: ['Düzeltme istendi', mailNot()], sifirla: ['Adım geri alındı'] }[i]);
        break; }
      case 'yorum': {
        const v = val('yorum-' + el.dataset.id).trim(); if (!v) return;
        await api(`/dosyalar/${el.dataset.id}/yorum`, { method: 'PUT', body: { yorum: v } }); await yenile(s.id); toast('Yorum gönderildi', mailNot());
        break; }
      case 'mesaj': {
        const v = val('msg-in').trim(); if (!v) return;
        await api(`/ogrenciler/${s.id}/mesajlar`, { method: 'POST', body: { metin: v } }); await yenile(s.id); toast('Not gönderildi', mailNot());
        break; }
      case 'belge': S.modal = { id: el.dataset.id }; S.gecici = {}; renderModal(); return;
      case 'word': await wordIndir(el.dataset.id, +(el.dataset.k || 0)); toast('Word dosyası indirildi', 'İmza, karar ve sayı alanlarını ilgili kişiler dolduracak.'); return;
      case 'kapat': case 'kapat-bg': S.modal = null; S.gecici = null; renderModal(); return;
      default: return;
    }
  } catch (err) { toast(err.message); }
  render();
});

document.addEventListener('change', async e => {
  if (e.target.dataset.a !== 'yukle' || !e.target.files[0]) return;
  const s = cur(), f = e.target.files[0];
  if (f.size > 25 * 1024 * 1024) { toast('Dosya 25 MB\'tan büyük', 'Daha küçük bir dosya seç ya da PDF olarak kaydet.'); e.target.value = ''; return; }
  const fd = new FormData(); fd.append('dosya', f);
  S.mesgul = true; toast('Yükleniyor…', f.name);
  try { const r = await api(`/ogrenciler/${s.id}/dosyalar`, { method: 'POST', body: fd }); await yenile(s.id); toast(`v${r.v} yüklendi`, (isAdv() ? '' : mailNot() + ' ') + 'Önceki sürümler saklanıyor.'); }
  catch (err) { toast(err.message); }
  finally { S.mesgul = false; render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'g-tc' || e.target.id === 'g-adres') {
    S.gecici = { tc: val('g-tc'), adres: val('g-adres') };
    document.getElementById('paper').innerHTML = belgeKagit(cur(), 'teslim');
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modal) { S.modal = null; S.gecici = null; renderModal(); } });

document.addEventListener('submit', async e => {
  e.preventDefault();
  const id = e.target.id;
  S.hata = '';
  try {
    if (id === 'f-giris') {
      const b = { email: val('lg-e'), sifre: val('lg-p') }; S.girisEmail = b.email;
      S.mesgul = true; render();
      await api('/giris', { method: 'POST', body: b, anon: true });
      await baslat(); return;
    }
    if (id === 'f-unuttum') {
      const b = { email: val('un-e') };
      S.mesgul = true; render();
      const r = await api('/sifre-unuttum', { method: 'POST', body: b, anon: true });
      S.ekran = 'giris';
      toast(r.mailVar ? 'E-posta kayıtlıysa bağlantı gönderildi' : 'E-posta gönderimi henüz ayarlı değil', r.mailVar ? 'Gelen kutunu ve gereksiz klasörünü kontrol et.' : 'Danışmanından yeni şifre bağlantısı iste.');
    }
    if (id === 'f-token') {
      if (val('tk-p') !== val('tk-p2')) throw new Error('İki şifre aynı değil.');
      const b = { sifre: val('tk-p'), kvkk: !!document.getElementById('tk-kvkk')?.checked };
      S.mesgul = true; render();
      await api('/token/' + S.token, { method: 'POST', body: b, anon: true });
      history.replaceState(null, '', '/');
      await baslat(); toast('Şifren kaydedildi', 'Hoş geldin!'); return;
    }
    if (id === 'f-kurulum') {
      const b = { anahtar: val('ku-k'), ad: val('ku-a'), email: val('ku-e'), sifre: val('ku-p') };
      S.mesgul = true; render();
      await api('/kurulum', { method: 'POST', body: b, anon: true });
      history.replaceState(null, '', '/');
      await baslat(); return;
    }
    if (id === 'f-sifre') {
      await api('/sifre', { method: 'POST', body: { eski: val('hs-e'), yeni: val('hs-y') } });
      e.target.reset(); toast('Şifren değiştirildi'); return;
    }
  } catch (err) { S.hata = err.message; if (S.ekran === 'uygulama') toast(err.message); }
  finally { S.mesgul = false; }
  render();
});

/* ======================== BAŞLANGIÇ ======================== */
async function baslat() {
  const path = location.pathname;
  const q = new URLSearchParams(location.search);
  S.mesgul = false;
  if ((path === '/davet' || path === '/sifre') && q.get('t')) {
    S.token = q.get('t'); S.ekran = 'token';
    try { S.tokenBilgi = await api('/token/' + S.token, { anon: true }); }
    catch (err) { S.tokenBilgi = null; S.hata = err.message; }
    render(); return;
  }
  if (path === '/kurulum') {
    try { const k = await api('/kurulum', { anon: true }); if (k.gerekli) { S.ekran = 'kurulum'; render(); return; } } catch {}
    history.replaceState(null, '', '/');
  }
  try {
    const me = await api('/ben', { anon: true });
    S.ben = me.kullanici; S.mailVar = me.mailVar;
    await yukleHepsi();
    S.ekran = 'uygulama';
    S.section = isAdv() ? 'ogrenciler' : 'genel';
  } catch {
    S.ekran = 'giris';
  }
  render();
}
baslat();
