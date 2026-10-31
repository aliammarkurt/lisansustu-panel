// Lisansüstü Panel — arayüz
// © 2026 Dr. Öğr. Üyesi Ali Ammar Kurt. Tüm hakları saklıdır.
import { PROGRAMS, TUR_AD, SONUCLU, ADIMLAR, ADIM, KAYIT_DONEMLERI, TELIF, ayarBirlestir, ayarUygula, danismanAdi } from './shared.js';
import { belgeVerisi, BELGE_SABLON, dosyaAdi, ilgiEki } from './belge-veri.js';

// Danışman panelindeki "Ayarlar"dan gelen değerler (kurallar, adlar)
let AYAR = ayarUygula(ayarBirlestir(null));
const K = () => AYAR.kural;
const dan = () => danismanAdi(AYAR);

/* ======================== DURUM ======================== */
const S = {
  ekran: 'yukleniyor',   // yukleniyor | giris | kurulum | token | unuttum | uygulama
  ben: null, mailVar: false,
  students: [], viewing: null, section: 'genel',
  collapsed: false, mopen: false, modal: null, gecici: null, celebrate: null,
  notEdit: null, ekleKod: null, ekleAcik: false, sonLink: null, token: null, tokenBilgi: null, hata: '',
  mesgul: false,
  zaman: {}, zamanFiltre: 'hepsi', gForm: null, iptalAcik: null, yeniDosya: null, yorumAcik: null, liste: null,
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
  else if (opts.body instanceof Blob) { init.body = opts.body; init.headers['Content-Type'] = opts.body.type; }
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
  delete S.zaman[sid];
}

/* ======================== TEMA ======================== */
const tema = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function temaUygula(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('lp-tema', t); } catch (e) {} }

/* ======================== KURAL MOTORU ======================== */
function yonetmelik(kayit, tur) {
  const sira = d => KAYIT_DONEMLERI.indexOf(d);
  // Yüklenen yönetmeliklerden, öğrencinin kayıt döneminde yürürlükte olan en yenisi
  const uygun = (S.yonetmelikler || []).filter(y => sira(y.ilkDonem) <= sira(kayit)).sort((a, b) => sira(b.ilkDonem) - sira(a.ilkDonem) || b.id - a.id)[0];
  if (tur === 'af') return { ad: 'Af kapsamında dönüş', not: `Dönüş dönemi: ${kayit}. Süreler ve uygulanacak hükümler enstitü kararına göre; panel ders ve tez koşullarını yönetmeliğe göre izler.`, id: uygun?.id };
  if (uygun) return { ad: uygun.ad, not: '', id: uygun.id };
  if (tur !== 'af' && sira(kayit) >= sira(AYAR.yonetmelik.ilkDonem)) return { ad: AYAR.yonetmelik.ad, not: '' };
  if (kayit >= '2026-2027') return { ad: '28/6/2026 tarihli yönetmelik', not: '' };
  if (kayit === '2025-2026 Bahar') return { ad: '14/12/2025 tarihli yönetmelik', not: 'Geçici Madde 1 gereği' };
  return { ad: '24/9/2023 tarihli yönetmelik', not: 'Geçici Madde 1 gereği; kurallar o yönetmeliğe göre doğrulanacak' };
}
function gecti(r, c) {
  if (SONUCLU.includes(c.tur) || r.not == null) return r.sonuc === 'basarili';
  return r.not >= K().gecmeNotu;
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
      if (r.kaynak === 'lisans' && ++lisans > K().lisansDersMax) continue;
      if (r.kaynak === 'dis' && ++dis > K().disDersMax) continue;
      kredi += c.kredi * w; ders += w;
      if (r.not != null) { notT += r.not * c.kredi * w; notK += c.kredi * w; }
    }
    if (c.tur === 'bay') bay = Math.max(bay, w);
    if (c.tur === 'etik') etik = Math.max(etik, w);
    if (c.tur === 'seminer') sem = Math.max(sem, w);
    if (c.tur === 'uad') uad += w;
  }
  const uadHedef = Math.max(1, Math.max(K().normalSure, s.donem) - s.danismanDonem + 1);
  const grupDeger = g => { const it = ADIMLAR.find(x => x.grup === g).items; return it.reduce((a, i) => a + i.w * adimDeger(s, i.k, pw), 0) / it.reduce((a, i) => a + i.w, 0); };
  out.kayit = 1;
  out.dersler = (Math.min(1, kredi / K().krediMin) + Math.min(1, ders / K().dersMin)) / 2;
  out.zorunlu = (bay + etik) / 2;
  out.seminer = sem;
  out.uad = Math.min(1, uad / uadHedef);
  for (const g of ['oneri', 'yazim', 'hazirlik', 'savunma', 'teslim']) out[g] = grupDeger(g);
  return { deg: out, kredi, ders, akts, bay, etik, sem, uad, uadHedef, lisans, dis, gno: notK ? notT / notK : null };
}
const BOLUMLER = [
  { k: 'kayit', ad: 'Başlangıç', w: 5 }, { k: 'dersler', ad: 'Kredili dersler', w: 30 },
  { k: 'zorunlu', ad: 'Yöntem ve etik dersleri', w: 5 }, { k: 'seminer', ad: 'Seminer', w: 5 },
  { k: 'uad', ad: 'Uzmanlık alan dersleri', w: 5 }, { k: 'oneri', ad: 'Tez önerisi', w: 10 },
  { k: 'yazim', ad: 'Tez yazımı', w: 20 }, { k: 'hazirlik', ad: 'Savunmaya hazırlık', w: 8 },
  { k: 'savunma', ad: 'Savunma', w: 8 }, { k: 'teslim', ad: 'Mezuniyet', w: 4 },
];
// Çubuğun altındaki beş ana aşama (bölüm ağırlıklarının toplamıyla hizalı)
const FAZLAR = [
  { ad: 'Dersler', bas: 0, bit: 50, k: ['kayit', 'dersler', 'zorunlu', 'seminer', 'uad'] },
  { ad: 'Tez önerisi', bas: 50, bit: 60, k: ['oneri'] },
  { ad: 'Tez', bas: 60, bit: 80, k: ['yazim'] },
  { ad: 'Savunma', bas: 80, bit: 96, k: ['hazirlik', 'savunma'] },
  { ad: 'Mezuniyet', bas: 96, bit: 100, k: ['teslim'] },
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
  if (a.ders >= K().dersMin && a.kredi >= K().krediMin) return t('Ders şartını tamamladın! Şimdi sıra fikrini teze dönüştürmekte.', `${ad} ders şartını tamamladı; sıra tez önerisinde.`);
  if (s.adim.konu === 'tamam') return t('Tez konun belli. Önerini yazmaya başlayabilirsin.', `${ilgiEki(ad)} tez konusu belli; öneri aşamasında.`);
  const devam = s.dersler.filter(r => r.durum === 'aliyor' && ['zorunlu', 'secmeli'].includes(kat(s, r.kod).tur)).length;
  if (a.ders > 0 || devam) return t(`${K().dersMin} kredili dersin ${Math.floor(a.ders)} tanesi tamam${devam ? `, ${devam} ders devam ediyor` : ''}.`, `${K().dersMin} kredili dersten ${Math.floor(a.ders)} tamam${devam ? `, ${devam} devam ediyor` : ''}.`);
  return t('İlk adım: bu dönem aldığın dersleri "Ders durumu"ndan ekle.', `${ad} henüz ders eklemedi.`);
}
function siradaki(s) {
  const a = hesapla(s, 0);
  if (a.kredi < K().krediMin || a.ders < K().dersMin) {
    const kalanD = Math.max(0, K().dersMin - Math.floor(a.ders)), kalanK = Math.max(0, K().krediMin - a.kredi);
    const alinan = s.dersler.filter(r => r.durum === 'aliyor' && ['zorunlu', 'secmeli'].includes(kat(s, r.kod).tur)).length;
    let t = `Kredili ders şartına ${kalanK} kredi ve ${kalanD} ders kaldı.`;
    if (!s.dersler.length) t = `Bu dönem aldığın dersleri "Ders durumu" bölümünden ekleyerek başla. Kredili ders şartı: en az ${K().krediMin} kredi ve ${K().dersMin} ders.`;
    else if (alinan) t += ` Bu dönem aldığın ${alinan} ders tamamlanınca bu kısım büyük ölçüde dolacak.`;
    if (s.program === 'pdr' && a.ders >= 4 && kalanD > 0) t += ' PDR programında 2 zorunlu derse ek olarak en az 5 seçmeli gerekiyor.';
    return { b: 'Kredili dersler', t, sec: 'dersler' };
  }
  if (a.bay < 1 || a.etik < 1) return { b: 'Yöntem ve etik dersleri', t: 'Bilimsel Araştırma Yöntemleri ve araştırma/yayın etiği dersi zorunlu. Kredi sayısına girmez ama mezuniyet için gerekli.', sec: 'dersler' };
  if (a.sem < 1) return { b: 'Seminer', t: `Seminer dersini tamamladığında ders dönemi bitiyor. ${K().normalSure}. yarıyıl sonuna kadar tamamlanmalı.`, sec: 'dersler' };
  for (const g of ADIMLAR) for (const i of g.items) {
    if (s.adim[i.k] === 'tamam' || s.adim[i.k] === 'onay') continue;
    return { b: i.ad, t: (i.by === 'danisman' ? 'Bu adımı danışmanın işaretleyecek. ' : '') + (i.not || 'Tamamladığında işaretle; danışmanın onaylayınca çubuk dolar.'), sec: 'tez' };
  }
  return { b: 'Onay bekleyen adımlar', t: 'Gönderdiğin adımlar danışmanında. Onaylandıkça çubuk tamamen dolacak.', sec: 'tez' };
}
function kontroller(s) {
  const a = hesapla(s, 0), b = hesapla(s, .5), L = [];
  const st3 = (ok, pend) => ok ? 'tamam' : pend ? 'surec' : 'bekliyor';
  L.push({ ad: `En az ${K().krediMin} kredi`, ref: 'M19/3', val: `${fmt(a.kredi)} / ${K().krediMin}`, d: st3(a.kredi >= K().krediMin, b.kredi > 0) });
  L.push({ ad: `En az ${K().dersMin} kredili ders`, ref: 'M19/3 · yöntem ve etik dersleri sayılmaz', val: `${fmt(a.ders)} / ${K().dersMin}`, d: st3(a.ders >= K().dersMin, b.ders > 0) });
  L.push({ ad: 'Bilimsel Araştırma Yöntemleri', ref: 'M12/5', val: a.bay >= 1 ? 'Tamam' : '—', d: st3(a.bay >= 1, b.bay > 0) });
  L.push({ ad: 'Araştırma ve yayın etiği dersi', ref: 'M12/5', val: a.etik >= 1 ? 'Tamam' : '—', d: st3(a.etik >= 1, b.etik > 0) });
  L.push({ ad: 'Seminer', ref: 'M19/3 · başarılı/başarısız', val: a.sem >= 1 ? 'Tamam' : '—', d: st3(a.sem >= 1, b.sem > 0) });
  L.push({ ad: 'Her yarıyıl UAD', ref: 'M19/3 · danışman atamasından sonra', val: `${fmt(a.uad)} / ${a.uadHedef}`, d: st3(a.uad >= a.uadHedef, b.uad > 0) });
  L.push({ ad: `En az ${K().aktsMin} AKTS`, ref: 'M19/3 · yılda 60 AKTS', val: `${fmt(a.akts)} / ${K().aktsMin}`, d: st3(a.akts >= K().aktsMin, b.akts > 0) });
  L.push({ ad: `Her dersin notu en az ${K().gecmeNotu}`, ref: 'M16/3', val: '', d: s.dersler.some(r => r.durum !== 'aliyor' && !gecti(r, kat(s, r.kod))) ? 'surec' : (s.dersler.length ? 'tamam' : 'bekliyor') });
  L.push({ ad: `En fazla ${K().lisansDersMax} lisans dersi, en fazla ${K().disDersMax} başka üniversite dersi`, ref: 'M19/4', val: `${a.lisans} · ${a.dis}`, d: a.lisans <= K().lisansDersMax && a.dis <= K().disDersMax ? 'tamam' : 'surec' });
  const konu = s.adim.konu === 'tamam';
  L.push({ ad: `Tez konusu en geç ${K().konuSonYariyil}. yarıyıl sonunda`, ref: 'M22/1', val: konu ? 'Tamam' : `${s.donem}. yarıyıl`, d: konu ? 'tamam' : s.adim.konu === 'onay' ? 'surec' : 'bekliyor' });
  L.push({ ad: 'Akademik faaliyet şartı', ref: 'M23/1 · Senato esasları eklenecek', val: '', d: st3(s.adim.faaliyet === 'tamam', s.adim.faaliyet === 'onay') });
  L.push({ ad: 'Tez savunmasında kabul', ref: 'M23/6', val: '', d: st3(s.adim.savunma === 'tamam', false) });
  L.push({ ad: `Genel not ortalaması en az ${K().gnoMin}`, ref: 'M23/10', val: a.gno ? fmt(a.gno) : '—', d: a.gno == null ? 'bekliyor' : a.gno >= K().gnoMin && a.ders >= K().dersMin ? 'tamam' : 'surec' });
  L.push({ ad: `Ciltli tez (en az 3 kopya) ${K().ciltliGun} gün içinde`, ref: 'M23/10', val: '', d: st3(s.adim.ciltli === 'tamam', s.adim.ciltli === 'onay') });
  if (s.kayitTuru === 'af') L.push({ ad: 'Süre', ref: 'Af kapsamında dönüş · süre enstitü kararına göre', val: `${s.donem}. yarıyıl`, d: 'surec' });
  else L.push({ ad: 'Süre', ref: `Normal ${K().normalSure}, en çok ${K().azamiSure} yarıyıl · erken mezuniyet en az 3 yarıyıl (M21)`, val: `${s.donem}. yarıyıl`, d: s.donem <= K().normalSure ? 'tamam' : 'surec' });
  return L;
}
function hatirlatmalar(s) {
  const a = hesapla(s, 0), L = [];
  if (s.donem >= K().konuSonYariyil && s.adim.konu !== 'tamam') L.push(`Tez konusu ${K().konuSonYariyil}. yarıyıl sonuna kadar belirlenmeli.`);
  if (s.kayitTuru !== 'af' && s.donem >= K().normalSure && (a.ders < K().dersMin || a.kredi < K().krediMin || a.sem < 1)) L.push(`${K().normalSure}. yarıyıl sonunda kredili dersler ve seminer tamamlanmış olmalı.`);
  if (s.kayitTuru !== 'af' && s.donem > K().normalSure) L.push(`Azami süre: ${Math.max(0, K().azamiSure - s.donem + 1)} yarıyıl kaldı.`);
  for (const g of (s.gorusmeler || []).filter(g => g.durum === 'planli' && (g.tarih || '').slice(0, 10) >= bugunIso())) L.push(`Görüşme: ${zamanFmt(g.tarih)}${g.bicim === 'cevrimici' ? ' (çevrim içi)' : ''}.`);
  for (const g of acikGorevler(s)) L.push(`${isAdv() ? 'Açık görev' : 'Görevin'}: ${g.gorev}${g.gorevTarih ? ` (hedef ${zamanFmt(g.gorevTarih)}${gecikmisGorev(g) ? ', geçti' : ''})` : ''}.`);
  if (s.program === 'pdr' && a.ders >= K().dersMin - 1 && a.ders < K().dersMin && !s.dersler.some(r => r.durum !== 'tamam' && kat(s, r.kod).tur === 'secmeli')) L.push('7. kredili ders için bir seçmeli daha gerekiyor.');
  return L;
}
function bekleyenler() {
  const L = [];
  for (const s of S.students) {
    if (s.arsiv) continue;
    for (const k in s.adim) if (s.adim[k] === 'onay') L.push({ s, tip: 'adim', k, ad: ADIM[k]?.ad || k, ek: `Tez süreci · gönderim ${tarihFmt(s.adimTarih[k]) || ''}` });
    s.dosyalar.forEach(d => {
      const Y = d.yorumlar || [], dan = Y.some(y => y.kimden === 'danisman');
      if (!dan) L.push({ s, tip: 'dosya', id: d.id, ad: `Yeni tez sürümü v${d.v}`, ek: `${d.ad} · ${tarihFmt(d.tarih)}${d.aciklama ? ' · ' + d.aciklama.slice(0, 90) : ''}` });
      else if (Y[Y.length - 1].kimden === 'ogrenci') L.push({ s, tip: 'dosya', id: d.id, ad: `v${d.v} sürümüne yanıt`, ek: `${Y[Y.length - 1].m.slice(0, 90)} · ${tarihFmt(Y[Y.length - 1].t)}` });
    });
    (s.gorusmeler || []).forEach(g => { if (g.durum === 'talep') L.push({ s, tip: 'gorusme', id: g.id, ad: 'Görüşme talebi', ek: `${g.konu.slice(0, 120)}${g.tercih ? ' · Uygun: ' + g.tercih : ''} · ${tarihFmt(g.olusturma)}` }); });
  }
  return L;
}

/* ======================== PROFİL FOTOĞRAFI ======================== */
function basHarf(ad) { return (ad || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toLocaleUpperCase('tr')).join(''); }
function avatar(s, boy = 36) {
  const st = `width:${boy}px;height:${boy}px;font-size:${Math.round(boy * 0.38)}px`;
  return s.foto ? `<img class="av zoom" src="/api/foto/${s.id}?v=${s.foto}" alt="${esc(s.ad)}" title="Büyütmek için tıklayın" data-zoom="1" style="${st}" loading="lazy">` : `<span class="av" style="${st}" aria-hidden="true">${esc(basHarf(s.ad))}</span>`;
}
// Fotoğrafa tıklanınca büyük görünüm (render döngüsünden bağımsız)
function fotoBuyut(img) {
  const kutu = document.createElement('div');
  kutu.className = 'lightbox'; kutu.setAttribute('role', 'dialog'); kutu.setAttribute('aria-modal', 'true'); kutu.setAttribute('aria-label', img.alt || 'Profil fotoğrafı');
  kutu.innerHTML = `<figure><img src="${img.src}" alt="${esc(img.alt)}"><figcaption>${esc(img.alt)}</figcaption></figure><button class="lb-x" aria-label="Kapat">×</button>`;
  const kapat = () => { kutu.remove(); document.removeEventListener('keydown', tus, true); };
  const tus = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); kapat(); } };
  kutu.addEventListener('click', ev => { if (ev.target.tagName !== 'IMG') kapat(); });
  document.addEventListener('keydown', tus, true);
  document.body.appendChild(kutu);
  kutu.querySelector('.lb-x').focus();
}
document.addEventListener('click', e => {
  const img = e.target.closest && e.target.closest('img[data-zoom]');
  if (!img) return;
  e.preventDefault(); e.stopPropagation();
  fotoBuyut(img);
}, true);
// Seçilen görseli ortadan kare kırpıp 400×400 JPEG'e küçültür
async function fotoHazirla(dosya) {
  let img;
  try { img = await createImageBitmap(dosya); } catch { throw new Error('Bu görsel açılamadı. JPEG ya da PNG bir fotoğraf seç.'); }
  const k = Math.min(img.width, img.height), c = document.createElement('canvas');
  c.width = c.height = 400;
  c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, 400, 400);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
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
  gorusmeler: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3"/>',
  gecmis: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ogrenciler: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.4 2.2 4 5"/>',
  onaylar: '<path d="M4 12l5 5L20 6"/>',
  ayarlar: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  hatirlatma: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
  hesap: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cikis: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  gunes: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ay: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
};
const ic = (k, sz = 19) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" aria-hidden="true">${ICON[k]}</svg>`;
const temaBtn = () => `<button class="iconbtn" type="button" data-a="tema" aria-label="${tema() === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}" title="${tema() === 'dark' ? 'Açık tema' : 'Koyu tema'}">${ic(tema() === 'dark' ? 'gunes' : 'ay', 18)}</button>`;
const OGR_MENU = [['genel', 'Genel bakış'], ['kisisel', 'Kişisel bilgiler'], ['dersler', 'Ders durumu'], ['tez', 'Tez süreci'], ['dosyalar', 'Tez dosyaları'], ['gorusmeler', 'Görüşmeler'], ['belgeler', 'Belgeler'], ['mezuniyet', 'Mezuniyet koşulları'], ['notlar', 'Danışmanla yazışma'], ['gecmis', 'Zaman çizelgesi']];

/* ======================== GİRİŞ EKRANLARI ======================== */
const KVKK = `Bu panel, Mersin Üniversitesi Eğitim Bilimleri Enstitüsü'nde Dr. Öğr. Üyesi Ali Ammar Kurt danışmanlığında tezli yüksek lisans yapan öğrencilerin ders ve tez süreçlerini takip etmek için kullanılır.
Panelde yalnızca adın, e-posta adresin, öğrenci numaran, programın, kayıt dönemin, ders sonuçların, tez bilgilerin (başlık, komisyon, jüri, sınav bilgileri), yüklediğin tez dosyaları, isteğe bağlı profil fotoğrafın, danışmanınla yazışmaların, sürümlere yazılan yorumlar, görüşme talepleri ve görüşme notları tutulur. T.C. kimlik numarası ve posta adresi sistemde saklanmaz; gerektiğinde yalnızca formu hazırlarken tarayıcında kullanılır.
Bu bilgileri yalnızca sen ve danışmanın görebilir. Veriler, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, tez danışmanlığı sürecinin yürütülmesi amacıyla ve yalnızca bu süreç boyunca işlenir; Cloudflare altyapısında şifreli bağlantıyla saklanır ve üçüncü kişilerle paylaşılmaz. Bildirim e-postaları bir e-posta gönderim hizmeti aracılığıyla iletilir.
Mezuniyetin ya da programdan ayrılmanın ardından danışmanından verilerinin silinmesini isteyebilirsin. Sorular için: aliammarkurt@mersin.edu.tr`;

const telifSatiri = () => `<footer class="telif"><span class="telif-mark">LP</span><span>Lisansüstü Panel · Tasarım ve geliştirme: <a href="${TELIF.site}" target="_blank" rel="noopener">${esc(TELIF.gelistiren)}</a></span><span>© ${TELIF.yil} Tüm hakları saklıdır.</span></footer>`;
function kartSar(ic2) {
  return `<div class="login"><div class="login-card">
    <div class="row" style="justify-content:space-between"><div class="brand"><span class="mark">LP</span><span>Lisansüstü Panel</span></div>${temaBtn()}</div>
    ${ic2}</div>${telifSatiri()}</div>`;
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
    nav += `<div class="grp eyebrow">Danışman</div>` + navi('ogrenciler', 'Öğrencilerim') + navi('onaylar', 'Onay bekleyenler', bek.length) + navi('hatirlatma', 'Hatırlatmalar') + navi('ayarlar', 'Ayarlar');
    if (s) nav += `<div class="grp eyebrow">${esc(s.ad)}</div>` + OGR_MENU.map(([k, t]) => navi(k, t, k === 'gorusmeler' ? s.gorusmeler.filter(g => g.durum === 'talep').length : 0)).join('');
  } else if (s) {
    const n = Object.values(s.adim).filter(x => x === 'onay').length;
    const g = acikGorevler(s).length + s.gorusmeler.filter(x => x.durum === 'planli' && (x.tarih || '').slice(0, 10) >= bugunIso()).length;
    nav += OGR_MENU.map(([k, t]) => navi(k, t, k === 'tez' ? n : k === 'gorusmeler' ? g : 0)).join('');
  }
  nav += `<div style="margin-top:auto"></div>` + navi('hesap', 'Hesabım') + `<button class="navi" data-a="cikis">${ic('cikis')}<span class="t">Çıkış</span></button><div class="side-telif t">© ${TELIF.yil} ${esc(TELIF.gelistiren)}<br>Tüm hakları saklıdır.</div>`;
  root.innerHTML = `
  <div class="app">
    <header class="topbar">
      <button class="iconbtn" data-a="toggle" aria-label="Menüyü aç/kapat">${ic('menu', 18)}</button>
      <div class="brand"><span class="mark">LP</span><span>Lisansüstü Panel</span></div>
      <div class="who">${!adv && s ? avatar(s, 30) : ''}<span class="muted name">${esc(S.ben.ad)}</span><span class="pill ${adv ? 'go' : 'ok'}">${adv ? 'Danışman' : 'Öğrenci'}</span>${temaBtn()}</div>
    </header>
    <div class="body ${S.collapsed ? 'collapsed' : ''} ${S.mopen ? 'mopen' : ''}">
      <nav class="side" aria-label="Menü">${nav}</nav>
      <main class="main"><div class="wrap">${anaIcerik()}${telifSatiri()}</div></main>
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
  if (adv && S.section === 'ayarlar') return ayarlarHTML();
  const s = cur();
  if (!s) return `<section class="panel"><h2>Kayıt bulunamadı</h2><p class="muted">Öğrenci kaydına ulaşılamadı. Danışmanınla iletişime geç.</p></section>`;
  let h = '';
  if (adv) h += `<div class="viewing">${avatar(s, 28)}<b>${esc(s.ad)}</b> öğrencisinin panelini danışman olarak görüyorsunuz.<button class="btn small" data-a="nav" data-k="ogrenciler" style="margin-left:auto">← Öğrencilerim</button></div>`;
  if (S.celebrate) h += `<div class="celebrate">${esc(S.celebrate)}</div>`;
  h += heroHTML(s);
  const f = { genel: genelHTML, kisisel: kisiselHTML, dersler: derslerHTML, tez: tezHTML, dosyalar: dosyalarHTML, gorusmeler: gorusmelerHTML, belgeler: belgelerHTML, mezuniyet: mezuniyetHTML, notlar: notlarHTML, gecmis: gecmisHTML }[S.section] || genelHTML;
  return h + f(s);
}

/* ======================== ÖĞRENCİ EKRANLARI ======================== */
// Tek parça ilerleme çubuğu: tamamlanan kısım düz, devam eden kısım hemen ardından çizgili
function segBar(p, cls = 'track') {
  const ok = Math.min(100, p.ok), all = Math.min(100, p.all);
  const ipucu = p.seg.map(x => `${x.ad}: %${Math.round(x.all * 100)}`).join(' · ');
  return `<div class="${cls}" title="${esc(ipucu)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(all)}"><span class="ok" style="width:${ok}%"></span><span class="pend" style="left:${ok}%;width:${all - ok}%"></span></div>`;
}
function heroHTML(s) {
  const p = ilerleme(s), pct = Math.round(p.all), nx = siradaki(s);
  const done = k => k.every(x => p.seg.find(y => y.k === x).ok >= .999);
  return `<section class="hero" aria-label="Genel ilerleme">
    <div class="eyebrow">${esc(PROGRAMS[s.program].kisa)} · ${s.donem}. yarıyıl</div>
    <div class="pct" style="font-family:var(--f-display)">%${pct}</div>
    <div style="display:grid;gap:4px"><p class="lead">${esc(isAdv() ? asamaBilgisi(s, false) : mesaj(pct, s))}</p>${isAdv() ? '' : `<p class="muted" style="margin:0;font-size:14.5px">${esc(asamaBilgisi(s, true))}</p>`}</div>
    ${segBar(p)}
    <div class="flags">${(() => { const aktif = FAZLAR.find(f => !done(f.k)); return FAZLAR.map((f, i) => `${i ? `<i class="sinir" style="left:${f.bas}%"></i>` : ''}<div class="flag ${done(f.k) ? 'done' : ''} ${f === aktif ? 'aktif' : ''} ${i === FAZLAR.length - 1 ? 'son' : ''}" style="left:${i === FAZLAR.length - 1 ? 100 : (f.bas + f.bit) / 2}%"><span>${done(f.k) ? '✓ ' : ''}${f.ad}</span></div>`).join(''); })()}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Tamamlandı</span><span><i style="background:repeating-linear-gradient(-45deg,var(--sun) 0 4px,var(--sun-soft) 4px 7px)"></i>Devam ediyor ya da danışman onayında (yarısı sayılır)</span>${p.pend > 0.05 ? `<span class="mono">%${fmt(p.pend)} yolda</span>` : ''}</div>
    <div class="next"><div class="dot">→</div><div><span class="eyebrow">${isAdv() ? 'Sıradaki adım' : 'Sıradaki adımın'}</span><b>${esc(nx.b)}</b><span class="muted" style="font-size:14px">${esc(nx.t)}</span></div><button class="btn small" data-a="nav" data-k="${nx.sec}">Git</button></div>
  </section>`;
}
const yonLink = y => y.id ? ` <a class="linkbtn" href="/api/yonetmelikler/${y.id}" target="_blank" rel="noopener">PDF'i aç ↗</a>` : '';
function genelHTML(s) {
  const p = ilerleme(s), a = p.a, hat = hatirlatmalar(s), yon = yonetmelik(s.kayit, s.kayitTuru);
  const satir = x => `<div style="display:grid;gap:5px"><div class="row" style="justify-content:space-between"><span>${esc(x.ad)}</span><span class="mono muted">%${Math.round(x.all * 100)}</span></div><div class="meter"><i class="p" style="width:${x.all * 100}%"></i><i style="width:${x.ok * 100}%"></i></div></div>`;
  return `
  <div class="grid3">
    <div class="stat"><span class="eyebrow">Kredi</span><span class="v mono">${fmt(a.kredi)}<small class="muted" style="font-size:15px"> / ${K().krediMin}</small></span></div>
    <div class="stat"><span class="eyebrow">Kredili ders</span><span class="v mono">${fmt(a.ders)}<small class="muted" style="font-size:15px"> / ${K().dersMin}</small></span></div>
    <div class="stat"><span class="eyebrow">AKTS</span><span class="v mono">${fmt(a.akts)}<small class="muted" style="font-size:15px"> / ${K().aktsMin}</small></span></div>
  </div>
  <div class="grid2">
    <section class="panel"><h2>Aşamalar</h2>${p.seg.map(satir).join('')}</section>
    <section class="panel"><h2>${isAdv() ? 'Notlar' : 'Bilmen gerekenler'}</h2>
      <div class="checks">
        <div class="chk surec"><span class="ic">i</span><div>Uygulanan yönetmelik: <b>${esc(yon.ad)}</b>${yonLink(yon)}<div class="ref">${esc(yon.not || 'Kayıt dönemine göre belirlendi')}</div></div><span></span></div>
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
  const ilk = !adv && !s.profilTamam;
  return `${ilk ? `<section class="celebrate" style="text-align:left">Hoş geldin! Başlamadan önce kişisel bilgilerini tamamla: ad soyad, öğrenci numarası, program, kayıt dönemi ve şu anki yarıyıl. Bu bilgiler ilerleme hesabında ve resmî formlarda kullanılacak.</section>` : ''}<section class="panel"><h2>Kişisel bilgiler</h2>
    <div class="row" style="gap:16px">${avatar(s, 84)}<div style="display:grid;gap:6px"><b style="font-weight:600">Profil fotoğrafı</b><span class="muted" style="font-size:13px">İsteğe bağlı. Fotoğraf kare olarak kırpılır; yalnızca ${adv ? 'öğrenci ve siz' : 'sen ve danışmanın'} görebilir.</span>
      <div class="row" style="gap:8px"><label class="btn small" for="foto-up">${s.foto ? 'Değiştir' : 'Fotoğraf yükle'}</label><input id="foto-up" type="file" accept="image/jpeg,image/png,image/webp" data-a="foto" hidden>${s.foto ? '<button class="btn small" data-a="foto-sil">Kaldır</button>' : ''}</div></div></div>
    <p class="muted" style="margin:0">Bu bilgiler resmî formlara otomatik aktarılır. T.C. kimlik numarası ve posta adresi sistemde tutulmaz; yalnızca ilgili formu hazırlarken tarayıcında girilir.${adv ? '' : ' Yeni döneme geçtiğinde "Şu anki yarıyıl" bilgisini güncellemeyi unutma. E-posta adresin giriş için kullanıldığından onu yalnızca danışmanın değiştirebilir.'}</p>
    <div class="grid2" style="gap:14px">
      ${f('k-ad', 'Ad soyad', ilk && s.ad === s.eposta.split('@')[0] ? '' : s.ad)}${f('k-no', 'Öğrenci numarası', s.no)}
      ${f('k-eposta', 'E-posta (giriş adresi)', s.eposta, 'email', !adv)}
      ${sel('k-tur', 'Kayıt türü', [['normal', 'Normal kayıt'], ['af', 'Af ile dönen öğrenci']], s.kayitTuru)}
      ${sel('k-kayit', s.kayitTuru === 'af' ? 'Dönüş dönemi' : 'Kayıt dönemi', KAYIT_DONEMLERI.map(x => [x, x]), s.kayit)}
      ${sel('k-program', 'Program', Object.entries(PROGRAMS).map(([k, v]) => [k, v.ad]), s.program)}
      ${f('k-abd', 'Anabilim dalı', P.abd, 'text', true)}
      ${sel('k-donem', 'Şu anki yarıyıl', [1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, n + '. yarıyıl']), s.donem)}
      ${sel('k-ddonem', 'Danışmanın atandığı yarıyıl', [1, 2, 3, 4].map(n => [n, n + '. yarıyıl']), s.danismanDonem)}
      ${f('k-statu', 'Statü', s.statu)}${f('k-dan', 'Danışman', dan(), 'text', true)}
    </div>
    ${adv ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="k-arsiv" ${s.arsiv ? 'checked' : ''}> Arşivle (mezun oldu ya da ayrıldı; listede en alta iner, onay kuyruğundan çıkar)</label>` : ''}
    <div class="row"><button class="btn primary" data-a="kaydet-kisisel">Kaydet</button><span class="muted" style="font-size:13px">Uygulanan yönetmelik: ${esc(yon.ad)}</span></div>
  </section>
  ${adv ? `<section class="panel"><h2>Giriş bağlantısı</h2>
    <p class="muted" style="margin:0">${s.davetBekliyor ? 'Öğrenci henüz şifresini belirlemedi. Davet bağlantısının süresi 14 gün; gerekirse yenisini oluşturun.' : 'Öğrenci şifresini unuttuysa 2 saat geçerli bir şifre yenileme bağlantısı oluşturabilirsiniz.'}</p>
    <div class="row"><button class="btn" data-a="baglanti">${s.davetBekliyor ? 'Yeni davet bağlantısı oluştur' : 'Şifre yenileme bağlantısı oluştur'}</button>${s.kvkk ? `<span class="muted" style="font-size:13px">Aydınlatma metni onayı: ${esc(tarihFmt(s.kvkk))}</span>` : ''}</div>
  </section>
  <section class="panel" style="border-color:var(--sun)"><h2>Öğrenciyi sil</h2>
    <p class="muted" style="margin:0">Öğrencinin hesabı, dersleri, tez adımları, yüklediği tüm dosyalar ve yazışmalar <b>kalıcı olarak</b> silinir; geri alınamaz. Mezun olan ya da ayrılan öğrencinin kaydını saklamak istiyorsanız silmek yerine yukarıdan arşivleyin.</p>
    ${S.silOnay === s.id ? `<div class="field"><label for="sil-onay">Onaylamak için öğrencinin e-posta adresini yazın: <b>${esc(s.eposta)}</b></label><input class="input" id="sil-onay" autocomplete="off"></div>
      <div class="row"><button class="btn sun" data-a="ogrenci-sil">Kalıcı olarak sil</button><button class="btn" data-a="sil-vazgec">Vazgeç</button></div>`
      : `<div class="row"><button class="btn" data-a="sil-ac">Öğrenciyi sil…</button></div>`}
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
  return `<span class="row" style="flex-wrap:nowrap"><input class="input" id="ng-not" type="number" min="0" max="100" placeholder="Not" style="width:80px" aria-label="Ders notu"><button class="btn small primary" data-a="not-kaydet" data-id="${id}">Gönder</button><button class="btn small" data-a="not-kapat">Vazgeç</button></span>`;
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
    <div class="tablewrap"><table><thead><tr><th>Kod</th><th>Ders</th><th>Tür</th><th style="text-align:right">Kredi</th><th style="text-align:right">AKTS</th><th style="text-align:right">Not</th><th>Durum</th><th></th></tr></thead><tbody>
    ${s.dersler.filter(r => r.donem === t).map(r => { const c = kat(s, r.kod); return `<tr>
      <td class="mono">${esc(c.kod)}</td><td>${esc(c.ad)}${r.kaynak !== 'program' ? ` <span class="pill off">${r.kaynak === 'lisans' ? 'lisans dersi' : 'başka üniversite'}</span>` : ''}</td><td class="muted">${TUR_AD[c.tur] || ''}</td>
      <td class="num">${c.kredi}</td><td class="num">${c.akts}</td>
      <td class="num">${r.not ?? (r.sonuc === 'basarili' ? 'B' : '—')}</td>
      <td>${durumPill(r, c)}</td><td>${islem(r, c)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  return `
  <section class="panel">
    <div class="row" style="justify-content:space-between"><h2>Ders durumu</h2><span class="muted" style="font-size:13.5px">Çubuk, müfredat listesine göre değil yönetmelik koşullarına göre ilerler.</span></div>
    <div class="grid3">
      <div class="stat"><span class="eyebrow">Kredi (en az ${K().krediMin})</span><span class="v mono">${fmt(a.kredi)}</span><div class="meter"><i style="width:${Math.min(100, a.kredi / K().krediMin * 100)}%"></i></div></div>
      <div class="stat"><span class="eyebrow">Kredili ders (en az ${K().dersMin})</span><span class="v mono">${fmt(a.ders)}</span><div class="meter"><i style="width:${Math.min(100, a.ders / K().dersMin * 100)}%"></i></div></div>
      <div class="stat"><span class="eyebrow">AKTS (en az ${K().aktsMin})</span><span class="v mono">${fmt(a.akts)}</span><div class="meter"><i style="width:${Math.min(100, a.akts / K().aktsMin * 100)}%"></i></div></div>
    </div>
    <p class="muted" style="margin:0;font-size:13.5px">Şu an aldığın dersler çubukta yarım sayılır; notunu girdiğinde ders yeşile döner ve tam sayılır. Bilimsel Araştırma Yöntemleri ve Bilimsel Etik zorunludur ama ${K().dersMin} ders sayısına girmez. Seminer ve UAD başarılı/başarısız olarak değerlendirilir. Bir dersin sayılması için notunun en az ${K().gecmeNotu} olması gerekir.</p>
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
  const minSec = Math.max(0, Math.max(K().dersMin - zk.length, Math.ceil((K().krediMin - zk.reduce((x, c) => x + c.kredi, 0)) / 3)));
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
          : `<input class="input" id="e-not" type="number" min="0" max="100" placeholder="Not" aria-label="Ders notu" style="width:80px">`}
        <button class="btn small primary" data-a="ders-ekle" data-kod="${esc(c.kod)}">Kaydet</button><button class="btn small" data-a="ekle-kapat">Vazgeç</button></div>
`;
    } else if (son && !tekrar) {
      sag = `<span class="row" style="gap:8px;justify-content:flex-end"><span class="muted" style="font-size:13px">${son.donem}. yarıyıl</span>${durumPill(son, c)}</span>`;
    } else {
      sag = `<span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap">${tekrar ? '<span class="muted" style="font-size:12.5px">Tekrar al:</span>' : ''}<button class="btn small" data-a="ders-aliyorum" data-kod="${esc(c.kod)}">Alıyorum</button><button class="btn small" data-a="ekle-ac-kod" data-kod="${esc(c.kod)}">Aldım</button></span>`;
    }
    return `<div class="crow ${son && !tekrar ? 'alindi' : ''} ${S.ekleKod === c.kod ? 'acik' : ''}"><span class="mono kod">${esc(c.kod)}</span><div style="min-width:0"><div>${esc(c.ad)}</div><div class="muted" style="font-size:12.5px">${c.kredi} kredi · ${c.akts} AKTS${c.tur === 'bay' || c.tur === 'etik' ? ` · kredisiz, ${K().dersMin} ders sayısına girmez` : ''}</div></div><div class="sag">${sag}</div></div>`;
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
  const adv = isAdv(), Y = S.yeniDosya;
  const yorumHTML = (d, y) => `<div class="ycm ${y.kimden === 'danisman' ? 'dan' : ''}"><div class="m">${y.kimden === 'danisman' ? 'Danışman' : (adv ? esc(s.ad) : 'Sen')} · ${esc(tarihFmt(y.t))}</div>${satirlar(y.m)}${y.ek ? `<div><a class="ek" href="/api/yorum-ek/${y.id}">📎 ${esc(y.ek.ad)} <span class="muted">(${esc(boyutFmt(y.ek.boyut))})</span></a></div>` : ''}</div>`;
  const yanitForm = d => `<div class="yform"><textarea class="input" id="yorum-${d.id}" rows="2" placeholder="${adv ? 'Bu sürüme yorum yaz' : 'Yorumlara yanıt yaz'}"></textarea>
      <div class="row" style="gap:8px"><label class="btn small" style="cursor:pointer">📎 ${adv ? 'Yorumlu dosya ekle' : 'Dosya ekle'}<input type="file" id="yek-${d.id}" accept=".doc,.docx,.pdf,.odt,.rtf" data-a="yek" data-id="${d.id}" hidden></label><span class="muted" id="yek-ad-${d.id}" style="font-size:12.5px"></span>
      <button class="btn small primary" data-a="yorum" data-id="${d.id}" style="margin-left:auto" ${S.mesgul ? 'disabled' : ''}>Gönder</button></div></div>`;
  const surum = (d, i) => {
    const Y2 = d.yorumlar, bekliyor = !Y2.some(y => y.kimden === 'danisman') || Y2[Y2.length - 1].kimden === 'ogrenci';
    const acik = i === 0 || S.yorumAcik === d.id;
    return `<div class="ver"><div class="vn">v${d.v}</div><div style="min-width:0;display:grid;gap:8px">
      <div><b style="word-break:break-all">${esc(d.ad)}</b><div class="muted" style="font-size:13px">${esc(tarihFmt(d.tarih))} · ${esc(boyutFmt(d.boyut))}${adv && bekliyor ? ' · <span class="pill wait">Yanıtınızı bekliyor</span>' : ''}</div></div>
      ${d.aciklama ? `<div class="degisen"><span class="eyebrow">Bu sürümde değişenler</span><div>${satirlar(d.aciklama)}</div></div>` : ''}
      ${Y2.length ? `<div class="ythread">${Y2.map(y => yorumHTML(d, y)).join('')}</div>` : (adv ? '' : '<div class="cm muted">Danışman henüz yorum yazmadı.</div>')}
      ${acik ? (adv || Y2.length ? yanitForm(d) : '') : (adv || Y2.length ? `<button class="linkbtn" data-a="yorum-ac" data-id="${d.id}" style="font-size:13.5px;justify-self:start">${adv ? 'Yorum yaz' : 'Yanıt yaz'}</button>` : '')}
      </div><a class="btn small" href="/api/dosyalar/${d.id}">İndir</a></div>`;
  };
  return `<section class="panel"><div class="row" style="justify-content:space-between"><h2>Tez dosyaları</h2><span class="muted" style="font-size:13.5px">Her sürüm saklanır, eskiler silinmez.</span></div>
    ${Y ? `<div class="drop" style="cursor:default"><b>${esc(Y.name)}</b><span class="muted" style="font-size:13px">${esc(boyutFmt(Y.size))} · v${(s.dosyalar[0]?.v || 0) + 1} olarak yüklenecek</span>
      <div class="field" style="width:100%;text-align:left"><label for="f-aciklama">Bu sürümde neler değişti? <span class="muted" style="font-weight:400">(isteğe bağlı ama ${adv ? 'öğrenci için' : 'danışmanın için'} çok yararlı)</span></label><textarea class="input" id="f-aciklama" rows="3" placeholder="ör. Yöntem bölümüne örneklem gücü analizi eklendi; 2. bölümdeki yorumlara göre kuramsal çerçeve kısaltıldı."></textarea></div>
      <div class="row"><button class="btn primary" data-a="dosya-yukle" ${S.mesgul ? 'disabled' : ''}>${S.mesgul ? 'Yükleniyor…' : 'Yükle'}</button><button class="btn" data-a="dosya-vazgec">Vazgeç</button></div></div>`
    : `<label class="drop" for="f-up"><b>${adv ? 'Öğrenci adına sürüm yükle' : 'Yeni sürüm yükle'}</b><span class="muted" style="font-size:13.5px">Word, PDF, ODT veya RTF · en fazla 25 MB.${adv ? '' : ' Yüklediğinde danışmanına e-posta gider.'}</span><input id="f-up" type="file" accept=".doc,.docx,.pdf,.odt,.rtf" data-a="yukle" style="max-width:100%" ${S.mesgul ? 'disabled' : ''}></label>`}
    <div>${s.dosyalar.length ? s.dosyalar.map(surum).join('') : `<p class="muted">Henüz dosya yok. İlk sürüm yüklendiğinde burada görünecek.</p>`}</div>
  </section>`;
}
function mezuniyetHTML(s) {
  const L = kontroller(s), n = L.filter(x => x.d === 'tamam').length;
  const icn = { tamam: '✓', surec: '…', bekliyor: '' };
  return `<section class="panel"><div class="row" style="justify-content:space-between"><h2>Mezuniyet koşulları</h2><span class="pill ok">${n} / ${L.length} tamam</span></div>
    <p class="muted" style="margin:0">Mersin Üniversitesi Lisansüstü Eğitim-Öğretim ve Sınav Yönetmeliği'ne göre otomatik hesaplanır. Uygulanan yönetmelik: ${esc(yonetmelik(s.kayit, s.kayitTuru).ad)}.${yonLink(yonetmelik(s.kayit, s.kayitTuru))}</p>
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
      <p style="text-indent:2em">Enstitümüz ${esc(P.abd)} yüksek lisans öğrencisi ${V(s.ad)}'nın, danışmanlığını ${esc(dan())}'nın yürüttüğü “${V(t.baslikTr)}” başlıklı yüksek lisans tez önerisi komisyonumuzca incelenmiş ve <span class="box"></span>oybirliği <span class="box"></span>oyçokluğu ile <span class="box"></span>kabul <span class="box"></span>red edilmiştir.</p>
      ${imza(P.baskan, 'Anabilim Dalı Başkanı')}`;
    case 'oneriDeg': return t.komisyon.map((k, n) => `${UST}<h4 style="margin-top:14px">ÖĞRETİM ELEMANI TEZ ÖNERİSİ DEĞERLENDİRME FORMU</h4>
      <table><tr><th>Tarih</th><td>${V(trTarih(t.oneriTarih))}</td></tr><tr><th>Komisyon üyesi</th><td>${V(k)}</td></tr><tr><th>Tez başlığı</th><td>${V(t.baslikTr)}</td></tr><tr><th>Danışman</th><td>${esc(dan())}</td></tr><tr><th>Öğrenci</th><td>${V(s.ad)} · ${V(s.no, 12)} · ${esc(P.abd)}</td></tr></table>
      <p style="font-size:13px;color:#555">Değerlendirme soruları (7 evet/hayır maddesi) resmî formdaki gibi boş gelecek. (${n + 1}/${t.komisyon.length})</p>`).join('<hr style="margin:30px 0">');
    case 'juriOneri': return `${UST}<h4 style="margin-top:14px">YÜKSEK LİSANS TEZ SINAVI JÜRİ ÖNERİ FORMU</h4><p>Sayı: <span class="blank">.............</span><span style="float:right">Tarih: ${V(today())}</span></p>
      <table><tr><th>Öğrenci</th><td>${V(s.ad)}</td><th>Numara</th><td>${V(s.no, 12)}</td></tr><tr><th>Anabilim dalı</th><td colspan="3">${esc(P.abd)}</td></tr><tr><th>Danışman</th><td colspan="3">${esc(dan())}</td></tr><tr><th>Tez başlığı</th><td colspan="3">${V(t.baslikTr)}</td></tr><tr><th>Sınav</th><td colspan="3">${V(trTarih(t.sinavTarih), 10)} · ${V(t.sinavSaat, 6)} · ${V(t.sinavYer)}</td></tr></table>
      <table><tr><th></th><th>Unvan</th><th>Ad soyad</th><th>Kurum</th></tr>${J.map((j, n) => `<tr><td>${n < 3 ? `Asil ${n + 1}` : `Yedek ${n - 2}`}</td><td>${V(j.u, 10)}</td><td>${V(j.a, 16)}</td><td>${V(j.k, 16)}</td></tr>`).join('')}</table>
      ${imza(P.baskan, 'Anabilim Dalı Başkanı')}`;
    case 'savunma': return `${UST}<h4 style="margin-top:14px">YÜKSEK LİSANS TEZ SAVUNMA SINAVI TUTANAĞI</h4><p>Sayı: <span class="blank">.............</span><span style="float:right">Tarih: ${V(trTarih(t.sinavTarih), 12)}</span></p>
      <p style="text-indent:2em">${esc(P.abd)} öğrencisi ${V(s.ad)}'nın hazırladığı “${V(t.baslikTr)}” başlıklı tezi, ${V(trTarih(t.sinavTarih), 10)} tarihinde saat ${V(t.sinavSaat, 6)}'de ${V(t.sinavYer)}'nda yapılan sınavda jürimizce incelenmiş ve <span class="box"></span>kabul <span class="box"></span>düzeltme <span class="box"></span>red kararı verilmiştir.</p>
      <p>Başlık değişikliği önerisi: <span class="blank">..................................................</span></p>
      <table><tr><th>Jüri</th><th>Ad soyad</th><th>Kurum</th><th>İmza</th></tr>${J.slice(0, 3).map((j, n) => `<tr><td>${n === 0 ? 'Başkan / Danışman' : 'Üye'}</td><td>${V((j.u + ' ' + j.a).trim())}</td><td>${V(j.k)}</td><td></td></tr>`).join('')}</table>
      ${imza(P.baskan, 'Anabilim Dalı Başkanı')}`;
    case 'juriDeg': return J.slice(0, 3).map((j, n) => `${UST}<h4 style="margin-top:14px">JÜRİ ÜYESİ DEĞERLENDİRME FORMU</h4>
      <table><tr><th>Öğrenci</th><td>${V(s.ad)}</td></tr><tr><th>Danışman</th><td>${esc(dan())}</td></tr><tr><th>Jüri üyesi</th><td>${V((j.u + ' ' + j.a).trim())} (${V(j.k, 12)})</td></tr><tr><th>Anabilim dalı</th><td>${esc(P.abd)}</td></tr><tr><th>Tez başlığı</th><td>${V(t.baslikTr)}</td></tr><tr><th>Tarih</th><td>${V(trTarih(t.sinavTarih))}</td></tr></table>
      <p style="font-size:13px;color:#555">Değerlendirme ölçütleri resmî formdaki gibi boş gelecek. (${n + 1}/3)</p>`).join('<hr style="margin:30px 0">');
    case 'teslim': return `${UST}<h4 style="margin-top:14px">TEZ TESLİM VE KULLANIM İZNİ FORMU</h4>
      <table><tr><th>Ad soyad</th><td>${V(s.ad)}</td></tr><tr><th>T.C. Kimlik No</th><td>${V(S.gecici?.tc)}</td></tr><tr><th>E-posta</th><td>${V(s.eposta)}</td></tr><tr><th>Posta adresi</th><td>${V(S.gecici?.adres)}</td></tr><tr><th>Enstitü</th><td>Eğitim Bilimleri Enstitüsü</td></tr><tr><th>Danışman</th><td>${esc(dan())}</td></tr><tr><th>Tez yılı</th><td>${yil}</td></tr><tr><th>Tez adı</th><td>${V(t.baslikTr)}</td></tr></table>
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
    danisman: dan(), danismanBuyuk: dan().toLocaleUpperCase('tr'),
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
  const LA = listeAyar();
  const kart = s => { const p = ilerleme(s), R = riskler(s), nb = bek.filter(x => x.s === s).length, son = gunOnce(s.sonEtkinlik); return `
    <button class="scard prg-${esc(s.program)}" data-a="ac" data-s="${s.id}">
      <div style="display:flex;gap:12px;align-items:flex-start;min-width:0">${avatar(s, 48)}<div style="min-width:0"><div class="nm">${esc(s.ad)}</div><div class="muted" style="font-size:13.5px">${s.donem}. yarıyıl${s.no ? ' · ' + esc(s.no) : ''}${s.arsiv ? ' · ' + esc(PROGRAMS[s.program].kisa) : ''}</div>
        ${s.kayitTuru === 'af' ? '<span class="pill off" style="margin-top:4px">Af ile dönen</span>' : ''}
        ${R.some(r => r.lv) ? `<div class="risks">${R.filter(r => r.lv).sort((a, b) => b.lv - a.lv).map(r => `<span class="pill ${r.lv === 2 ? 'risk' : 'wait'}">${esc(r.t)}</span>`).join('')}</div>` : ''}
        ${R.filter(r => !r.lv).map(r => `<div class="flagnote muted">• ${esc(r.t)}</div>`).join('')}</div></div>
      <div style="display:grid;gap:6px">${segBar(p, 'mini')}<div class="muted" style="font-size:13px">Sıradaki: ${esc(siradaki(s).b)}${son != null && !s.arsiv ? ` · son hareket ${gunOnceFmt(son)}` : ''}</div></div>
      <div style="display:grid;justify-items:end;gap:4px"><span class="p">%${Math.round(p.all)}</span>${nb ? `<span class="pill wait">${nb} onay bekliyor</span>` : ''}${s.arsiv ? '<span class="pill off">Arşiv</span>' : ''}</div>
    </button>`; };
  const uygun = {
    tumu: () => true, risk: s => riskler(s).some(r => r.lv), onay: s => bek.some(x => x.s === s),
    savunma: s => s.tez.sinavTarih && s.adim.savunma !== 'tamam', davet: s => s.davetBekliyor || !s.profilTamam,
  }[LA.filtre] || (() => true);
  const gorunen = listeSirala(aktif.filter(uygun), LA.sira);
  const dikkat = aktif.filter(s => riskler(s).some(r => r.lv)).length;
  const sayi = k => aktif.filter(s => s.program === k).length;
  const gruplar = Object.keys(PROGRAMS).map(k => ({ k, L: gorunen.filter(s => s.program === k) })).filter(g => g.L.length);
  const davetli = aktif.filter(s => s.davetBekliyor);
  const davetHTML = !davetli.length && !S.davetSonuc ? '' : `<section class="panel davetp">
    ${S.davetSonuc ? `<div class="checks">${S.davetSonuc.map(r => `<div class="chk ${r.mailGitti ? 'tamam' : 'bekliyor'}"><span class="ic">${r.mailGitti ? '✓' : '!'}</span><div>${esc(r.email)}<div class="ref">${r.mailGitti ? 'Hatırlatma ve yeni bağlantı e-postayla gönderildi' : 'E-posta gitmedi; bağlantıyı elle iletin'}</div></div><span></span></div>`).join('')}</div>
      ${S.davetSonuc.some(r => !r.mailGitti) ? `<div class="linkbox"><code id="son-link" style="white-space:pre-wrap">${esc(S.davetSonuc.filter(r => !r.mailGitti).map(r => r.email + ' : ' + r.link).join('\n'))}</code><button class="btn small" data-a="kopyala-toplu">Kopyala</button></div>` : ''}
      <button class="linkbtn" data-a="davet-sonuc-kapat">Kapat</button>` : `
    <div class="row" style="justify-content:space-between"><div><b>${davetli.length} öğrenci panele henüz giriş yapmadı</b><div class="muted" style="font-size:13.5px">Davet bağlantılarını açıp şifrelerini belirlemediler.</div></div>
      <button class="btn small ${S.davetAcik ? '' : 'primary'}" data-a="davet-ac">${S.davetAcik ? 'Kapat' : 'Hatırlatma gönder'}</button></div>
    ${S.davetAcik ? `<div class="checks">${davetli.map(s => { const d = s.davet || {}, g = gunOnce(d.son); return `<label class="chk bekliyor" style="cursor:pointer"><input type="checkbox" class="davet-sec" value="${s.id}" checked style="margin:3px 0 0"><div>${esc(s.profilTamam ? s.ad : s.eposta)}${s.profilTamam ? `<span class="muted"> · ${esc(s.eposta)}</span>` : ''}<div class="ref">${esc(PROGRAMS[s.program].kisa)}${d.sayi ? ` · ${d.sayi === 1 ? 'yalnızca ilk davet gönderildi' : `${d.sayi} kez davet edildi`}` : ''}${g != null ? `, son ${gunOnceFmt(g)}` : ''}${g != null && g >= 14 ? ' · bağlantının süresi dolmuş' : ''}</div></div><span></span></label>`; }).join('')}</div>
      <p class="muted" style="margin:0;font-size:13px">Her öğrenciye ${S.mailVar ? 'kısa bir hatırlatma e-postasıyla ' : ''}yeni bir davet bağlantısı (14 gün geçerli) oluşturulur; eski bağlantılar çalışmaz hâle gelir.${S.mailVar ? '' : ' E-posta gönderimi ayarlı olmadığı için bağlantıları kopyalayıp sizin iletmeniz gerekecek.'}</p>
      <div class="row"><button class="btn primary" data-a="davet-gonder" ${S.mesgul ? 'disabled' : ''}>${S.mesgul ? 'Gönderiliyor…' : 'Seçilenlere gönder'}</button><span class="muted" style="font-size:13px">Her öğrenci için yaklaşık 1 saniye sürer.</span></div>` : ''}`}
  </section>`;
  const listeHTML = gruplar.map(g => `<div class="pgrup prg-${g.k}"><span class="pdot"></span><span>${esc(PROGRAMS[g.k].kisa)}</span><span class="pn">${g.L.length}${g.L.length !== sayi(g.k) ? ' / ' + sayi(g.k) : ''}</span><span class="phr"></span></div><div class="slist">${g.L.map(kart).join('')}</div>`).join('');
  return `
  <div class="row" style="justify-content:space-between"><div><span class="eyebrow">Danışman paneli</span><h1 style="font-size:30px;margin-top:4px">Öğrencilerim</h1></div>
    <div class="row"><button class="btn" data-a="toplu-ac">${S.topluAcik ? 'Toplu eklemeyi kapat' : 'Toplu ekle'}</button><button class="btn primary" data-a="ekle-ac">${S.ekleAcik ? 'Formu kapat' : '+ Öğrenci ekle'}</button></div></div>
  ${S.topluSonuc ? `<section class="panel" style="border-color:var(--accent)"><h2>Toplu ekleme sonucu</h2>
    <div class="checks">${S.topluSonuc.map(r => `<div class="chk ${r.durum === 'eklendi' ? 'tamam' : 'bekliyor'}"><span class="ic">${r.durum === 'eklendi' ? '✓' : '!'}</span><div>${esc(r.email)}<div class="ref">${r.durum === 'eklendi' ? (r.mailGitti ? 'Eklendi, davet e-postası gönderildi' : 'Eklendi; e-posta gitmedi, bağlantıyı elle iletin') : esc(r.mesaj)}</div></div><span></span></div>`).join('')}</div>
    ${S.topluSonuc.some(r => r.durum === 'eklendi' && !r.mailGitti) ? `<div class="linkbox"><code id="son-link" style="white-space:pre-wrap">${esc(S.topluSonuc.filter(r => r.link && !r.mailGitti).map(r => r.email + ' : ' + r.link).join('\n'))}</code><button class="btn small" data-a="kopyala-toplu">Kopyala</button></div>` : ''}
    <button class="linkbtn" data-a="toplu-kapat">Kapat</button></section>` : ''}
  ${S.topluAcik ? `<section class="panel"><h2>Toplu öğrenci ekle</h2>
    <p class="muted" style="margin:0">Her satıra bir e-posta adresi yazın. Program varsayılandan farklıysa adresin yanına virgülle <b>pdr</b> ya da <b>aed</b> ekleyin. Öğrenciler ilk girişte ad, numara, kayıt dönemi ve yarıyıl bilgilerini kendileri dolduracak.</p>
    <div class="field"><label for="t-liste">E-posta adresleri</label><textarea class="input" id="t-liste" rows="8" placeholder="ogrenci1@ornek.edu.tr&#10;ogrenci2@ornek.edu.tr, aed&#10;ogrenci3@gmail.com"></textarea></div>
    <div class="grid2" style="gap:12px">
      <div class="field"><label for="t-program">Varsayılan program</label><select class="input" id="t-program">${Object.entries(PROGRAMS).map(([k, v]) => `<option value="${k}">${esc(v.ad)}</option>`).join('')}</select></div>
      <div class="field"><label for="t-kayit">Varsayılan kayıt dönemi (öğrenci değiştirebilir)</label><select class="input" id="t-kayit">${KAYIT_DONEMLERI.map(x => `<option ${x === '2026-2027 Güz' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="row"><button class="btn primary" data-a="toplu-ekle" ${S.mesgul ? 'disabled' : ''}>${S.mesgul ? 'Ekleniyor…' : 'Hepsini ekle ve davet gönder'}</button><span class="muted" style="font-size:13px">Her öğrenci için yaklaşık 1 saniye sürer.</span></div>
  </section>` : ''}
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
  <div class="grid4">
    <div class="stat"><span class="eyebrow">Aktif öğrenci</span><span class="v mono">${aktif.length}</span><span class="muted" style="font-size:12.5px">${Object.keys(PROGRAMS).map(k => `${esc(k === 'pdr' ? 'PDR' : 'Aile D.')} ${sayi(k)}`).join(' · ')}</span></div>
    <div class="stat"><span class="eyebrow">Onayınızı bekleyen</span><span class="v mono">${bek.length}</span></div>
    <button class="stat stat-btn ${dikkat ? 'uyar' : ''}" data-a="liste-filtre" data-k="${LA.filtre === 'risk' ? 'tumu' : 'risk'}"><span class="eyebrow">Dikkat gerektiren</span><span class="v mono">${dikkat}</span></button>
    <div class="stat"><span class="eyebrow">Planlanan savunma</span><span class="v mono">${aktif.filter(s => s.tez.sinavTarih && s.adim.savunma !== 'tamam').length}</span></div>
  </div>
  ${davetHTML}
  ${aktif.length ? `<div class="lbar"><div class="chips">${LISTE_FILTRE.map(([k, t]) => `<button class="chip ${LA.filtre === k ? 'on' : ''}" data-a="liste-filtre" data-k="${k}">${t}</button>`).join('')}</div>
    <label class="row" style="gap:8px;flex-wrap:nowrap"><span class="muted" style="font-size:13px;white-space:nowrap">Sırala</span><select class="input" data-a="liste-sira" style="width:auto;padding:6px 10px;font-size:13.5px">${LISTE_SIRA.map(([k, t]) => `<option value="${k}" ${LA.sira === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>` : ''}
  ${listeHTML || (aktif.length ? '<section class="panel"><p class="muted" style="margin:0">Bu filtreye uyan öğrenci yok.</p></section>' : '<section class="panel"><p class="muted" style="margin:0">Henüz öğrenci yok. "Öğrenci ekle" ile ilk öğrencinizi ekleyin.</p></section>')}
  ${arsiv.length ? `<details class="arsiv"><summary class="eyebrow">Arşiv (${arsiv.length})</summary><div class="slist" style="margin-top:12px">${listeSirala(arsiv, 'ad').map(kart).join('')}</div></details>` : ''}
  ${aktif.some(s => s.davetBekliyor) || S.students.length ? `<p class="muted" style="font-size:13.5px;margin:0">Bir öğrenciye yeni davet ya da şifre yenileme bağlantısı göndermek için öğrenciyi açıp "Kişisel bilgiler"e gidin.</p>` : ''}`;
}
const KURALLAR = [
  ['Dönem başı', 'Eylül sonu–Ekim başı ve Şubat ortası: yarıyıl bilgisini ve bu dönemin derslerini güncelleme hatırlatması. Dönemde bir kez.'],
  ['Not girişi', 'Ocak sonu ve Haziran sonu: "alıyor" görünen dersi olan öğrenciye notlarını girmesi hatırlatması. Dönemde bir kez.'],
  ['Tez konusu', '2. yarıyıldan itibaren tez konusu belirlenmemişse ayda bir.'],
  ['Ders dönemi sonu', '4. yarıyılda kredili dersler veya seminer eksikse dönemde bir kez (af ile dönenlere gönderilmez).'],
  ['Savunma', 'Savunma tarihinden 7 gün ve 1 gün önce.'],
  ['Ciltli teslim', 'Savunma onaylandıktan 14 gün sonra ve teslim süresinin bitmesine 5 gün kala, ciltli teslim işaretlenmemişse.'],
  ['Sessizlik', 'Tez konusu belli olan öğrenciden 45 gündür dosya, not veya ders güncellemesi yoksa "Nasıl gidiyor?" e-postası.'],
  ['Haftalık özet', 'Her pazartesi size: onay bekleyenler, yorum bekleyen sürümler, yaklaşan savunmalar ve giden hatırlatmalar.'],
];
/* ---------- Ayarlar (yalnızca danışman) ---------- */
const KURAL_ETIKET = [
  ['krediMin', 'En az kredi', 'M19/3'], ['dersMin', 'En az kredili ders sayısı', 'M19/3'], ['aktsMin', 'En az AKTS', 'M19/3'],
  ['gecmeNotu', 'Ders geçme notu (100 üzerinden)', 'M16/3'], ['gnoMin', 'En az genel not ortalaması', 'M23/10'],
  ['normalSure', 'Normal süre (yarıyıl)', 'M21'], ['azamiSure', 'Azami süre (yarıyıl)', 'M21'],
  ['konuSonYariyil', 'Tez konusu en geç kaçıncı yarıyıl sonunda', 'M22'], ['ciltliGun', 'Savunmadan sonra ciltli teslim süresi (gün)', 'M23/10'],
  ['lisansDersMax', 'En fazla lisans dersi', 'M19/4'], ['disDersMax', 'En fazla başka üniversite dersi', 'M19/4'],
];
function ayarlarHTML() {
  const a = AYAR, V = S.varsayilan;
  const inp = (yol, etiket, deger, ipucu = '', tip = 'text') => `<div class="field"><label for="ay-${yol}">${etiket}</label><input class="input" id="ay-${yol}" data-ayar="${yol}" type="${tip}" value="${esc(deger)}" ${tip === 'number' ? 'min="0" step="1"' : ''}>${ipucu ? `<span class="muted" style="font-size:12px">${ipucu}</span>` : ''}</div>`;
  const prog = (k, baslik) => `<div class="panel" style="padding:16px;background:var(--surface-2)"><h3>${baslik}</h3><div class="grid2" style="gap:12px">
      ${inp(`programlar.${k}.abd`, 'Anabilim dalı', a.programlar[k].abd)}${inp(`programlar.${k}.baskan`, 'Anabilim dalı başkanı (unvanıyla)', a.programlar[k].baskan, 'Formlardaki imza alanına yazılır.')}
      ${inp(`programlar.${k}.ad`, 'Program adı', a.programlar[k].ad)}${inp(`programlar.${k}.kisa`, 'Kısa ad', a.programlar[k].kisa)}</div></div>`;
  return `<div><span class="eyebrow">Danışman paneli</span><h1 style="font-size:30px;margin-top:4px">Ayarlar</h1>
    <p class="muted" style="margin:6px 0 0">Burada değiştirdiğiniz bilgiler tüm öğrencilerin ilerleme hesabına, mezuniyet koşullarına, hatırlatmalara ve Word formlarına hemen yansır. Bu sayfayı yalnızca siz görürsünüz.</p></div>
  <section class="panel"><h2>Anabilim dalları</h2>${prog('pdr', 'Rehberlik ve Psikolojik Danışmanlık')}${prog('aed', 'Aile Danışmanlığı')}</section>
  <section class="panel"><h2>Danışman ve enstitü</h2><div class="grid3">
      ${inp('danisman.unvan', 'Danışman unvanı', a.danisman.unvan)}${inp('danisman.adSoyad', 'Danışman adı soyadı', a.danisman.adSoyad)}${inp('danisman.kurum', 'Kurum', a.danisman.kurum)}</div>
    <div class="grid2" style="gap:12px">${inp('enstitu.ad', 'Enstitü adı', a.enstitu.ad)}${inp('enstitu.mudur', 'Enstitü müdürü (unvanıyla)', a.enstitu.mudur, 'Gelecekte müdür imzalı formlar eklenirse kullanılacak.')}</div></section>
  <section class="panel"><h2>Yönetmelikler</h2>
    <p class="muted" style="margin:0">Yeni yönetmelik çıktığında PDF'ini buraya yükleyin. Her öğrenciye kayıt döneminde yürürlükte olan yönetmelik otomatik bağlanır ve öğrenci kendi panelinden açıp okuyabilir. Eski yönetmelikler arşivde kalır.</p>
    ${(S.yonetmelikler || []).length ? `<div class="tablewrap"><table><thead><tr><th>Yönetmelik</th><th>Geçerli olduğu ilk kayıt dönemi</th><th>Yüklenme</th><th></th></tr></thead><tbody>
      ${S.yonetmelikler.map(y => `<tr><td>${esc(y.ad)}</td><td class="mono" style="white-space:nowrap">${esc(y.ilkDonem)}</td><td class="muted" style="white-space:nowrap">${esc(tarihFmt(y.tarih))}</td>
        <td><span class="row" style="flex-wrap:nowrap;gap:6px"><a class="btn small" href="/api/yonetmelikler/${y.id}" target="_blank" rel="noopener">Aç</a><button class="btn small" data-a="yonetmelik-sil" data-id="${y.id}">Sil</button></span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted" style="margin:0">Henüz yönetmelik yüklenmedi. Yükleyene kadar öğrencilerde yönetmeliğin yalnızca adı görünür.</p>'}
    <div class="panel" style="padding:16px;background:var(--surface-2)"><h3>Yeni yönetmelik yükle</h3>
      <div class="grid2" style="gap:12px">
        <div class="field" style="grid-column:1/-1"><label for="yy-dosya">PDF dosyası</label><input class="input" id="yy-dosya" type="file" accept="application/pdf,.pdf"></div>
        <div class="field"><label for="yy-ad">Yönetmeliğin adı</label><input class="input" id="yy-ad" placeholder="ör. 28/6/2026 tarihli Lisansüstü Eğitim-Öğretim ve Sınav Yönetmeliği"></div>
        <div class="field"><label for="yy-donem">Hangi kayıt döneminden itibaren uygulanıyor</label><select class="input" id="yy-donem">${KAYIT_DONEMLERI.map(d => `<option ${d === a.yonetmelik.ilkDonem ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      </div>
      <div class="row"><button class="btn primary" data-a="yonetmelik-yukle" ${S.mesgul ? 'disabled' : ''}>Yükle</button><span class="muted" style="font-size:13px">Geçiş hükümlerine dikkat: yeni yönetmelik genellikle yalnızca belirli bir dönemden sonra kayıt olanlara uygulanır.</span></div>
    </div>
  </section>
  <section class="panel"><h2>Mezuniyet ve süre koşulları</h2>
    ${S.kuralUyari ? `<div class="celebrate" style="text-align:left;background:var(--sun-soft);color:var(--ink)">Yeni yönetmelik yüklendi. Aşağıdaki sayısal koşulları yeni yönetmelikle karşılaştırın; değişen varsa güncelleyip "Ayarları kaydet"e basın.</div>` : ''}
    <div class="grid3">${KURAL_ETIKET.map(([k, e, m]) => inp(`kural.${k}`, e, a.kural[k], `${m}${V && V.kural[k] !== a.kural[k] ? ` · varsayılan: ${V.kural[k]}` : ''}`, 'number')).join('')}</div></section>
  <section class="panel"><h2>Açıklama metinleri</h2>
    <div class="field"><label for="ay-metin.faaliyet">Akademik faaliyet şartı (Senato esasları)</label><textarea class="input" id="ay-metin.faaliyet" data-ayar="metin.faaliyet" rows="3">${esc(a.metin.faaliyet)}</textarea><span class="muted" style="font-size:12px">Öğrencilerin "Tez süreci"nde "Akademik faaliyet şartı" adımının altında görünür.</span></div></section>
  <div class="row kaydet-bar"><button class="btn primary" data-a="ayar-kaydet">Ayarları kaydet</button><span class="muted" style="font-size:13px">Müfredattaki ders listesinde değişiklik olursa bana iletin; dersler bu sayfadan değil, programın ders listesinden güncellenir.</span></div>`;
}
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
  <section class="panel">${L.length ? L.map((x, n) => `<div class="q"><div style="min-width:0"><div class="muted" style="font-size:13px;display:flex;gap:8px;align-items:center">${avatar(x.s, 22)}${esc(x.s.ad)}</div><div class="what">${esc(x.ad)}</div><div class="muted" style="font-size:13px">${esc(x.ek)}</div>
      ${x.tip !== 'dosya' && x.tip !== 'gorusme' ? `<div class="row" style="margin-top:8px"><input class="input" id="qn-${n}" placeholder="Düzeltme notu (isteğe bağlı)" style="flex:1 1 220px"></div>` : ''}</div>
      <div class="row">${x.tip === 'dosya' ? `<button class="btn small primary" data-a="ac" data-s="${x.s.id}" data-k="dosyalar" data-y="${x.id}">Aç ve yorum yaz</button>` :
        x.tip === 'gorusme' ? `<button class="btn small primary" data-a="ac" data-s="${x.s.id}" data-k="gorusmeler" data-g="${x.id}">Aç ve planla</button>` :
        x.tip === 'ders' ? `<button class="btn small primary" data-a="ders-islem" data-s="${x.s.id}" data-id="${x.id}" data-i="onayla">Onayla</button><button class="btn small" data-a="ders-islem" data-s="${x.s.id}" data-id="${x.id}" data-i="duzeltme" data-n="${n}">Düzeltme iste</button>` :
        `<button class="btn small primary" data-a="adim" data-s="${x.s.id}" data-k="${x.k}" data-i="onayla">Onayla</button><button class="btn small" data-a="adim" data-s="${x.s.id}" data-k="${x.k}" data-i="duzeltme" data-n="${n}">Düzeltme iste</button>`}</div></div>`).join('')
    : `<p class="muted">Bekleyen onay yok. Öğrencileriniz bir adımı gönderdiğinde burada görünür${S.mailVar ? ' ve e-posta alırsınız' : ''}.</p>`}</section>`;
}

/* ======================== GÖRÜŞMELER ======================== */
const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
// "2026-11-04T14:30" → "4 Kasım 2026, 14:30" (saat dilimine dokunmadan, girildiği gibi)
const zamanFmt = v => { if (!v) return ''; const [d, t] = v.split('T'); const [y, a, g] = d.split('-'); return `${+g} ${AY_ADLARI[+a - 1]} ${y}${t ? ', ' + t.slice(0, 5) : ''}`; };
const bugunIso = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
const simdiIso = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 16);
const gunOnce = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null;
const gunOnceFmt = n => n == null ? '' : n <= 0 ? 'bugün' : n === 1 ? 'dün' : `${n} gün önce`;
const satirlar = t => esc(t).replace(/\n/g, '<br>');
const acikGorevler = s => (s.gorusmeler || []).filter(g => g.durum === 'yapildi' && g.gorev && !g.gorevTamam);
const gecikmisGorev = g => g.gorevTarih && g.gorevTarih < bugunIso();

function gorusmeFormHTML(mod, g = {}) {
  // mod: plan (yeni plan) | planla (talebi planla) | not (görüşme notu; yeni ya da var olana)
  const id = g.id || 'yeni';
  const plan = mod === 'plan' || mod === 'planla', not = mod === 'not';
  const deger = (k, d = '') => esc(g[k] || d);
  return `<div class="gform" data-gform="${id}">
    ${mod === 'plan' || (not && !g.id) ? `<div class="field"><label for="gf-konu-${id}">Konu</label><input class="input" id="gf-konu-${id}" value="${deger('konu')}" placeholder="ör. Yöntem bölümü taslağı"></div>` : ''}
    <div class="grid2" style="gap:12px">
      <div class="field"><label for="gf-tarih-${id}">${not ? 'Görüşme tarihi' : 'Tarih ve saat'}</label><input class="input" id="gf-tarih-${id}" type="datetime-local" value="${deger('tarih', not ? simdiIso() : '')}"></div>
      ${plan ? `<div class="field"><label for="gf-bicim-${id}">Biçim</label><select class="input" id="gf-bicim-${id}"><option value="yuz" ${g.bicim !== 'cevrimici' ? 'selected' : ''}>Yüz yüze</option><option value="cevrimici" ${g.bicim === 'cevrimici' ? 'selected' : ''}>Çevrim içi</option></select></div>
      <div class="field" style="grid-column:1/-1"><label for="gf-yer-${id}">Yer ya da toplantı bağlantısı</label><input class="input" id="gf-yer-${id}" value="${deger('yer')}" placeholder="ör. Eğitim Fakültesi, oda 214 · ya da Zoom/Meet bağlantısı"></div>` : ''}
    </div>
    ${not ? `<div class="field"><label for="gf-konusulanlar-${id}">Konuşulanlar</label><textarea class="input" id="gf-konusulanlar-${id}" rows="4">${deger('konusulanlar')}</textarea></div>
    <div class="field"><label for="gf-kararlar-${id}">Kararlar</label><textarea class="input" id="gf-kararlar-${id}" rows="3">${deger('kararlar')}</textarea></div>
    <div class="grid2" style="gap:12px">
      <div class="field"><label for="gf-gorev-${id}">Sıradaki görev</label><input class="input" id="gf-gorev-${id}" value="${deger('gorev')}" placeholder="ör. Kuramsal temeli ölçek bölümüyle genişletmek"></div>
      <div class="field"><label for="gf-gorevTarih-${id}">Görevin hedef tarihi</label><input class="input" id="gf-gorevTarih-${id}" type="date" value="${deger('gorevTarih')}"></div>
    </div>
    <div class="field"><label for="gf-ozel-${id}">Kendime not <span class="muted" style="font-weight:400">(öğrenci görmez)</span></label><textarea class="input" id="gf-ozel-${id}" rows="2">${deger('ozel')}</textarea></div>` : ''}
    <div class="row"><button class="btn primary small" data-a="gorusme-kaydet" data-mod="${mod}" data-id="${g.id || ''}">${not ? 'Notu kaydet' : 'Planla ve bildir'}</button><button class="btn small" data-a="gform-kapat">Vazgeç</button>
      <span class="muted" style="font-size:12.5px">${not ? 'Öğrenci kararları ve görevi görür; e-posta bildirimi gider.' : 'Öğrenciye tarih ve yer e-postayla gider.'}</span></div>
  </div>`;
}
function gorusmeKart(s, g) {
  const adv = isAdv(), F = S.gForm;
  const formAcik = F && F.id === g.id;
  const bicim = g.bicim === 'cevrimici' ? 'Çevrim içi' : 'Yüz yüze';
  const link = /^https?:\/\//i.test(g.yer) ? `<a href="${esc(g.yer)}" target="_blank" rel="noopener">${esc(g.yer)}</a>` : esc(g.yer);
  const ust = { talep: '<span class="pill wait">Talep</span>', planli: '<span class="pill go">Planlandı</span>', yapildi: '<span class="pill ok">Yapıldı</span>', iptal: '<span class="pill off">İptal</span>' }[g.durum];
  const gecmisPlan = g.durum === 'planli' && g.tarih && g.tarih.slice(0, 10) < bugunIso();
  let ic2 = '';
  if (g.durum === 'talep') ic2 = `<div><b>${esc(g.konu)}</b>${g.tercih ? `<div class="muted" style="font-size:13.5px">Uygun zamanlar: ${esc(g.tercih)}</div>` : ''}<div class="muted" style="font-size:12.5px">Talep: ${esc(tarihFmt(g.olusturma))}</div></div>`;
  else if (g.durum === 'planli') ic2 = `<div><b>${esc(zamanFmt(g.tarih))}</b> · ${bicim}${g.yer ? ` · ${link}` : ''}${g.konu ? `<div class="muted" style="font-size:13.5px">${esc(g.konu)}</div>` : ''}${gecmisPlan && adv ? '<div class="flagnote">• Görüşme tarihi geçti; notu girilmedi</div>' : ''}</div>`;
  else if (g.durum === 'iptal') ic2 = `<div class="muted">${g.tarih ? esc(zamanFmt(g.tarih)) + ' · ' : ''}${esc(g.konu || 'Görüşme')}${g.iptalNotu ? ` — ${esc(g.iptalNotu)}` : ''}</div>`;
  else ic2 = `<div style="display:grid;gap:8px"><div><b>${esc(zamanFmt(g.tarih))}</b>${g.konu ? ` · ${esc(g.konu)}` : ''}</div>
      ${g.konusulanlar ? `<div><span class="eyebrow">Konuşulanlar</span><div class="gmetin">${satirlar(g.konusulanlar)}</div></div>` : ''}
      ${g.kararlar ? `<div><span class="eyebrow">Kararlar</span><div class="gmetin">${satirlar(g.kararlar)}</div></div>` : ''}
      ${g.gorev ? `<div class="gorev ${g.gorevTamam ? 'bitti' : gecikmisGorev(g) ? 'gec' : ''}"><label class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start">${adv ? `<span class="kutu">${g.gorevTamam ? '✓' : ''}</span>` : `<input type="checkbox" data-a="gorev-tamam" data-id="${g.id}" ${g.gorevTamam ? 'checked' : ''}>`}<span><b>Sıradaki görev:</b> ${esc(g.gorev)}${g.gorevTarih ? `<span class="muted"> · hedef ${esc(zamanFmt(g.gorevTarih))}</span>` : ''}${g.gorevTamam ? ' <span class="pill ok">Tamamlandı</span>' : gecikmisGorev(g) ? ' <span class="pill risk">Hedef tarih geçti</span>' : ''}</span></label></div>` : ''}
      ${adv && g.ozel ? `<div class="cm"><span class="eyebrow">Kendime not</span><br>${satirlar(g.ozel)}</div>` : ''}</div>`;
  let dug = '';
  const iptalAcik = adv && S.iptalAcik === g.id;
  if (adv && !formAcik && !iptalAcik) {
    if (g.durum === 'talep') dug = `<button class="btn small primary" data-a="gform" data-mod="planla" data-id="${g.id}">Planla</button><button class="btn small" data-a="iptal-ac" data-id="${g.id}">Planlanamadı</button>`;
    else if (g.durum === 'planli') dug = `<button class="btn small primary" data-a="gform" data-mod="not" data-id="${g.id}">Not ekle</button><button class="btn small" data-a="gform" data-mod="planla" data-id="${g.id}">Değiştir</button><button class="btn small" data-a="iptal-ac" data-id="${g.id}">İptal</button>`;
    else if (g.durum === 'yapildi') dug = `<button class="btn small" data-a="gform" data-mod="not" data-id="${g.id}">Düzenle</button><button class="btn small" data-a="gorusme-sil" data-id="${g.id}">Sil</button>`;
    else dug = `<button class="btn small" data-a="gorusme-sil" data-id="${g.id}">Sil</button>`;
  } else if (!adv && g.durum === 'talep') dug = `<button class="btn small" data-a="gorusme-geri" data-id="${g.id}">Geri çek</button>`;
  return `<div class="gkart ${g.durum}"><div class="gust">${ust}${dug ? `<span class="row" style="gap:6px">${dug}</span>` : ''}</div>${ic2}
    ${iptalAcik ? `<div class="row"><input class="input" id="gi-${g.id}" placeholder="Öğrenciye not (isteğe bağlı)" style="flex:1 1 220px;width:auto"><button class="btn small sun" data-a="gorusme-iptal" data-id="${g.id}">${g.durum === 'talep' ? 'Planlanamadı olarak bildir' : 'Görüşmeyi iptal et'}</button><button class="btn small" data-a="iptal-kapat">Vazgeç</button></div>` : ''}
    ${formAcik ? gorusmeFormHTML(F.mod, g) : ''}</div>`;
}
function gorusmelerHTML(s) {
  const adv = isAdv(), G = s.gorusmeler || [];
  const talep = G.filter(g => g.durum === 'talep'), planli = G.filter(g => g.durum === 'planli').sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));
  const yapildi = G.filter(g => g.durum === 'yapildi'), iptal = G.filter(g => g.durum === 'iptal');
  const gorev = acikGorevler(s);
  const F = S.gForm;
  const blok = (baslik, L, bos = '') => L.length || bos ? `<section class="panel"><h2>${baslik}</h2>${L.length ? `<div class="glist">${L.map(g => gorusmeKart(s, g)).join('')}</div>` : `<p class="muted" style="margin:0">${bos}</p>`}</section>` : '';
  let ust = '';
  if (adv) ust = `<section class="panel"><div class="row" style="justify-content:space-between"><h2>Görüşmeler</h2><span class="row" style="gap:8px">
      <button class="btn small" data-a="gform" data-mod="plan">Görüşme planla</button><button class="btn small primary" data-a="gform" data-mod="not">Görüşme notu ekle</button></span></div>
      <p class="muted" style="margin:0;font-size:13.5px">Notlar tez danışmanlığı geçmişi olarak birikir. Öğrenci konuşulanları, kararları ve görevi görür; "Kendime not" alanını yalnızca siz görürsünüz.</p>
      ${F && !F.id ? gorusmeFormHTML(F.mod) : ''}</section>`;
  else ust = `<section class="panel"><h2>Görüşme talep et</h2>
      <p class="muted" style="margin:0;font-size:13.5px">Danışmanına konuyu ve sana uyan zamanları yaz; planladığında e-posta alırsın.</p>
      <div class="field"><label for="gt-konu">Ne konuşmak istiyorsun?</label><textarea class="input" id="gt-konu" rows="3" placeholder="ör. Örneklem büyüklüğü ve ölçek seçimi hakkında görüş almak istiyorum."></textarea></div>
      <div class="field"><label for="gt-tercih">Uygun zamanların (isteğe bağlı)</label><input class="input" id="gt-tercih" placeholder="ör. Salı öğleden sonra, Perşembe 10:00–12:00"></div>
      <div class="row"><button class="btn primary" data-a="gorusme-talep" ${S.mesgul ? 'disabled' : ''}>Talep gönder</button></div></section>`;
  const gorevBlok = gorev.length && !adv ? `<section class="panel"><h2>Açık görevlerin</h2><div class="checks">${gorev.map(g => `<label class="chk ${gecikmisGorev(g) ? 'surec' : 'bekliyor'}" style="cursor:pointer"><input type="checkbox" data-a="gorev-tamam" data-id="${g.id}" style="margin:3px 0 0"><div>${esc(g.gorev)}<div class="ref">${esc(zamanFmt(g.tarih))} tarihli görüşmeden${g.gorevTarih ? ` · hedef ${esc(zamanFmt(g.gorevTarih))}` : ''}</div></div><span class="val">${gecikmisGorev(g) ? 'gecikti' : ''}</span></label>`).join('')}</div></section>` : '';
  return ust + gorevBlok
    + blok(adv ? 'Yanıt bekleyen talepler' : 'Gönderdiğin talepler', talep)
    + blok('Planlanan görüşmeler', planli)
    + blok('Görüşme notları', yapildi, adv ? 'Henüz görüşme notu yok.' : 'Henüz görüşme notu yok. Danışmanınla görüştükten sonra kararlar ve görevler burada görünür.')
    + (iptal.length ? `<details class="panel"><summary style="cursor:pointer"><b>İptal edilenler</b> <span class="muted">(${iptal.length})</span></summary><div class="glist" style="margin-top:10px">${iptal.map(g => gorusmeKart(s, g)).join('')}</div></details>` : '');
}

/* ======================== ZAMAN ÇİZELGESİ ======================== */
const ZAMAN_TUR = { tamam: ['✓', 'ok'], uyari: ['!', 'uy'], adim: ['→', 'go'], ders: ['D', 'go'], bilgi: ['i', 'off'], dosya: ['v', 'ok'], yorum: ['“', 'go'], mesaj: ['✉', 'off'], gorusme: ['G', 'go'], hatirlatma: ['⏰', 'off'] };
const ZAMAN_FILTRE = [['hepsi', 'Tümü'], ['tez', 'Tez süreci', ['tamam', 'uyari', 'adim', 'bilgi']], ['ders', 'Dersler', ['ders']], ['dosya', 'Dosyalar', ['dosya', 'yorum']], ['gorusme', 'Görüşmeler', ['gorusme']], ['mesaj', 'Yazışma', ['mesaj']], ['hatirlatma', 'Hatırlatmalar', ['hatirlatma']]];
async function zamanYukle(sid) {
  try { const d = await api(`/ogrenciler/${sid}/zaman`); S.zaman[sid] = d.liste; }
  catch (e) { S.zaman[sid] = []; toast(e.message); }
  if (S.section === 'gecmis' && cur()?.id === sid) render();
}
function gecmisHTML(s) {
  const L0 = S.zaman[s.id];
  if (!L0) { zamanYukle(s.id); return '<section class="panel"><h2>Zaman çizelgesi</h2><div class="loading" style="min-height:20vh">Yükleniyor…</div></section>'; }
  const f = ZAMAN_FILTRE.find(x => x[0] === S.zamanFiltre) || ZAMAN_FILTRE[0];
  const L = f[2] ? L0.filter(x => f[2].includes(x.tur)) : L0;
  const kim = x => x.kim === 'danisman' ? 'Danışman' : x.kim === 'ogrenci' ? (isAdv() ? s.ad.split(' ')[0] : 'Sen') : x.kim === 'sistem' ? 'Panel' : '';
  let ay = '', h = '';
  for (const x of L) {
    const d = new Date(x.t), a = `${AY_ADLARI[d.getMonth()]} ${d.getFullYear()}`;
    if (a !== ay) { ay = a; h += `<div class="zay eyebrow">${a}</div>`; }
    const [sim, cls] = ZAMAN_TUR[x.tur] || ['•', 'off'];
    h += `<div class="zsat"><span class="zic ${cls}" aria-hidden="true">${sim}</span><div style="min-width:0"><div>${esc(x.baslik)}</div>${x.detay ? `<div class="muted zdet">${esc(x.detay)}</div>` : ''}</div><div class="zne muted">${esc(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))} · ${esc(d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))}${kim(x) ? `<br>${esc(kim(x))}` : ''}</div></div>`;
  }
  return `<section class="panel"><div class="row" style="justify-content:space-between"><h2>Zaman çizelgesi</h2><span class="muted" style="font-size:13px">${L0.length} kayıt</span></div>
    <div class="chips">${ZAMAN_FILTRE.map(([k, t]) => `<button class="chip ${f[0] === k ? 'on' : ''}" data-a="zaman-filtre" data-k="${k}">${t}</button>`).join('')}</div>
    <div class="zlist">${h || '<p class="muted" style="margin:0">Bu türde kayıt yok.</p>'}</div>
    <p class="muted" style="margin:0;font-size:12.5px">Ders ve görüşme hareketleri bu özellik eklendikten sonra kaydedilmeye başladı; dosyalar, yorumlar ve yazışmalar baştan beri görünür.</p></section>`;
}

/* ======================== RİSK GÖSTERGELERİ ======================== */
// lv 2: acil, lv 1: dikkat, lv 0: bilgi (sayılmaz)
function riskler(s) {
  if (s.arsiv) return [];
  const R = [], k = K(), a = hesapla(s, 0);
  if (s.davetBekliyor) R.push({ lv: 0, t: 'Davet bekliyor (henüz şifre belirlemedi)' });
  else if (!s.profilTamam) R.push({ lv: 0, t: 'Kişisel bilgilerini henüz tamamlamadı' });
  if (s.kayitTuru !== 'af') {
    const kalan = k.azamiSure - s.donem + 1;
    if (kalan <= 1) R.push({ lv: 2, t: kalan === 1 ? 'Azami sürenin son yarıyılı' : 'Azami süre aşıldı' });
    else if (s.donem > k.normalSure) R.push({ lv: 1, t: `Normal süre aşıldı · azami süreye ${kalan} yarıyıl` });
  }
  if (!['tamam', 'onay'].includes(s.adim.konu)) {
    if (s.donem > k.konuSonYariyil) R.push({ lv: 2, t: 'Tez konusu gecikti' });
    else if (s.donem === k.konuSonYariyil) R.push({ lv: 1, t: 'Tez konusu bu yarıyıl belirlenmeli' });
  }
  if (s.kayitTuru !== 'af' && s.donem >= k.normalSure && (a.ders < k.dersMin || a.kredi < k.krediMin || a.sem < 1)) R.push({ lv: s.donem > k.normalSure ? 2 : 1, t: 'Ders dönemi tamamlanmadı' });
  if (s.adim.savunma === 'tamam' && s.adim.ciltli !== 'tamam' && s.adimTarih.savunma) {
    const g = gunOnce(s.adimTarih.savunma);
    if (g >= k.ciltliGun - 5) R.push({ lv: 2, t: g > k.ciltliGun ? 'Ciltli teslim süresi doldu' : 'Ciltli teslim süresi doluyor' });
  }
  if (!s.davetBekliyor && s.adim.savunma !== 'tamam') {
    const g = gunOnce(s.sonEtkinlik);
    if (g == null) { if (s.profilTamam) R.push({ lv: 0, t: 'Panelde henüz etkinlik yok' }); }
    else if (g >= 90) R.push({ lv: 2, t: `${g} gündür hareket yok` });
    else if (g >= 45) R.push({ lv: 1, t: `${g} gündür hareket yok` });
  }
  const gec = acikGorevler(s).filter(gecikmisGorev).length;
  if (gec) R.push({ lv: 1, t: gec === 1 ? 'Görev hedef tarihi geçti' : `${gec} görevin hedef tarihi geçti` });
  return R;
}
const riskPuani = s => riskler(s).reduce((t, r) => t + (r.lv === 2 ? 3 : r.lv), 0);
const LISTE_FILTRE = [['tumu', 'Tümü'], ['risk', 'Dikkat gerektiren'], ['onay', 'Onay bekleyen'], ['savunma', 'Savunması planlı'], ['davet', 'Davet / bilgi eksik']];
const LISTE_SIRA = [['risk', 'Önce dikkat gerektirenler'], ['son', 'Önce en uzun süredir sessiz olanlar'], ['ilerleme-az', 'İlerleme (azdan çoğa)'], ['ilerleme-cok', 'İlerleme (çoktan aza)'], ['donem', 'Yarıyıl (büyükten küçüğe)'], ['ad', 'Ada göre']];
function listeAyar() {
  if (!S.liste) { let v = null; try { v = JSON.parse(localStorage.getItem('lp-liste') || 'null'); } catch (e) {} S.liste = { filtre: 'tumu', sira: 'risk', ...(v || {}) }; }
  return S.liste;
}
function listeKaydet() { try { localStorage.setItem('lp-liste', JSON.stringify(S.liste)); } catch (e) {} }
function listeSirala(L, sira) {
  const by = {
    risk: (a, b) => riskPuani(b) - riskPuani(a) || ilerleme(a).all - ilerleme(b).all,
    son: (a, b) => (a.sonEtkinlik || '').localeCompare(b.sonEtkinlik || ''),
    'ilerleme-az': (a, b) => ilerleme(a).all - ilerleme(b).all,
    'ilerleme-cok': (a, b) => ilerleme(b).all - ilerleme(a).all,
    donem: (a, b) => b.donem - a.donem,
    ad: () => 0,
  }[sira] || (() => 0);
  return [...L].sort((a, b) => by(a, b) || a.ad.localeCompare(b.ad, 'tr'));
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
      case 'nav': if (el.dataset.k === 'hatirlatma') S.hatirlatma = null; S.section = el.dataset.k; S.mopen = false; S.notEdit = null; S.ekleKod = null; S.gForm = null; S.iptalAcik = null; S.yeniDosya = null; S.yorumAcik = null; if (isAdv() && ['ogrenciler', 'onaylar'].includes(el.dataset.k)) S.viewing = null; scrollTo(0, 0); break;
      case 'yonetmelik-yukle': {
        const f = document.getElementById('yy-dosya').files[0], ad = val('yy-ad').trim(), donem = val('yy-donem');
        if (!f) { toast('PDF dosyası seçin'); return; }
        if (!ad) { toast('Yönetmeliğin adını yazın'); return; }
        const fd = new FormData(); fd.append('dosya', f); fd.append('ad', ad); fd.append('ilkDonem', donem);
        S.mesgul = true; render();
        try { await api('/yonetmelikler', { method: 'POST', body: fd }); await ayarYukle(); S.kuralUyari = true; toast('Yönetmelik yüklendi', 'Mezuniyet koşullarını kontrol etmeyi unutmayın.'); }
        finally { S.mesgul = false; }
        break; }
      case 'yonetmelik-sil': {
        if (el.dataset.onay !== '1') { el.dataset.onay = '1'; el.textContent = 'Emin misiniz?'; el.classList.add('sun'); setTimeout(() => { if (el.isConnected) { el.dataset.onay = ''; el.textContent = 'Sil'; el.classList.remove('sun'); } }, 3000); return; }
        await api(`/yonetmelikler/${el.dataset.id}`, { method: 'DELETE' }); await ayarYukle(); toast('Yönetmelik silindi');
        break; }
      case 'ayar-kaydet': {
        const yeni = JSON.parse(JSON.stringify(AYAR));
        document.querySelectorAll('[data-ayar]').forEach(i => {
          const yol = i.dataset.ayar.split('.'); let o = yeni;
          for (const k of yol.slice(0, -1)) o = o[k];
          o[yol[yol.length - 1]] = i.type === 'number' ? Number(i.value) : i.value;
        });
        const r = await api('/ayarlar', { method: 'PUT', body: yeni });
        AYAR = ayarUygula(ayarBirlestir(r.ayar)); S.kuralUyari = false; await yukleHepsi();
        toast('Ayarlar kaydedildi', 'Tüm öğrencilerin hesapları ve formları güncellendi.');
        break; }
      case 'hatirlatma-gonder': { const r = await api('/hatirlatmalar/gonder', { method: 'POST', body: {} }); S.hatirlatma = null; toast(`${r.gonderilen} hatırlatma gönderildi`); break; }
      case 'ac': S.viewing = el.dataset.s; S.section = el.dataset.k || 'genel'; S.yorumAcik = el.dataset.y ? +el.dataset.y : null; S.gForm = el.dataset.g ? { mod: 'planla', id: +el.dataset.g } : null; S.iptalAcik = null; S.yeniDosya = null; scrollTo(0, 0); break;
      case 'liste-filtre': listeAyar().filtre = el.dataset.k; listeKaydet(); break;
      case 'davet-ac': S.davetAcik = !S.davetAcik; break;
      case 'davet-sonuc-kapat': S.davetSonuc = null; break;
      case 'davet-gonder': {
        const ids = [...document.querySelectorAll('.davet-sec:checked')].map(x => x.value);
        if (!ids.length) { toast('Öğrenci seçin'); return; }
        S.mesgul = true; render();
        try { const r = await api('/ogrenciler/davet-hatirlat', { method: 'POST', body: { ids } }); S.davetSonuc = r.sonuc; S.davetAcik = false; await yukleHepsi();
          const n = r.sonuc.filter(x => x.mailGitti).length; toast(n ? `${n} öğrenciye hatırlatma gönderildi` : 'Yeni bağlantılar oluşturuldu', n < r.sonuc.length ? 'E-posta gitmeyenlerin bağlantılarını kopyalayıp iletin.' : ''); }
        finally { S.mesgul = false; }
        break; }
      case 'zaman-filtre': S.zamanFiltre = el.dataset.k; break;
      case 'yorum-ac': S.yorumAcik = +el.dataset.id; break;
      case 'dosya-vazgec': S.yeniDosya = null; break;
      case 'dosya-yukle': {
        const f = S.yeniDosya; if (!f) return;
        const fd = new FormData(); fd.append('dosya', f); fd.append('aciklama', val('f-aciklama').trim());
        S.mesgul = true; render();
        try { const r = await api(`/ogrenciler/${s.id}/dosyalar`, { method: 'POST', body: fd }); S.yeniDosya = null; await yenile(s.id); toast(`v${r.v} yüklendi`, (isAdv() ? '' : mailNot() + ' ') + 'Önceki sürümler saklanıyor.'); }
        finally { S.mesgul = false; }
        break; }
      case 'gform': S.gForm = { mod: el.dataset.mod, id: el.dataset.id ? +el.dataset.id : null }; S.iptalAcik = null; break;
      case 'gform-kapat': S.gForm = null; break;
      case 'iptal-ac': S.iptalAcik = +el.dataset.id; S.gForm = null; break;
      case 'iptal-kapat': S.iptalAcik = null; break;
      case 'gorusme-talep': {
        const b = { konu: val('gt-konu').trim(), tercih: val('gt-tercih').trim() };
        if (!b.konu) { toast('Konuyu yaz', 'Ne konuşmak istediğini kısaca belirt.'); return; }
        await api(`/ogrenciler/${s.id}/gorusmeler`, { method: 'POST', body: b }); await yenile(s.id); toast('Görüşme talebin gönderildi', mailNot());
        break; }
      case 'gorusme-kaydet': {
        const mod = el.dataset.mod, gid = el.dataset.id, x = gid || 'yeni', f = k => val(`gf-${k}-${x}`).trim();
        const b = { konu: f('konu'), tarih: f('tarih'), bicim: f('bicim'), yer: f('yer'), konusulanlar: f('konusulanlar'), kararlar: f('kararlar'), gorev: f('gorev'), gorevTarih: f('gorevTarih'), ozel: f('ozel') };
        if (mod !== 'not' && !b.tarih) { toast('Tarih ve saati seçin'); return; }
        if (mod === 'not' && !b.konusulanlar && !b.kararlar && !b.gorev) { toast('Görüşme notunu yazın', 'Konuşulanlar, kararlar ya da görevden en az biri gerekli.'); return; }
        if (gid) await api(`/gorusmeler/${gid}`, { method: 'PUT', body: { ...b, islem: mod === 'not' ? 'not' : 'planla' } });
        else await api(`/ogrenciler/${s.id}/gorusmeler`, { method: 'POST', body: { ...b, durum: mod === 'not' ? 'yapildi' : 'planli' } });
        S.gForm = null; await yenile(s.id); toast(mod === 'not' ? 'Görüşme notu kaydedildi' : 'Görüşme planlandı', mailNot());
        break; }
      case 'gorusme-iptal': {
        await api(`/gorusmeler/${el.dataset.id}`, { method: 'PUT', body: { islem: 'iptal', not: val('gi-' + el.dataset.id).trim() } });
        S.iptalAcik = null; await yenile(s.id); toast('Öğrenciye bildirildi', mailNot());
        break; }
      case 'gorusme-geri': await api(`/gorusmeler/${el.dataset.id}`, { method: 'PUT', body: { islem: 'geri-cek' } }); await yenile(s.id); toast('Talep geri çekildi'); break;
      case 'gorusme-sil': {
        if (el.dataset.onay !== '1') { el.dataset.onay = '1'; el.textContent = 'Emin misiniz?'; el.classList.add('sun'); setTimeout(() => { if (el.isConnected) { el.dataset.onay = ''; el.textContent = 'Sil'; el.classList.remove('sun'); } }, 3000); return; }
        await api(`/gorusmeler/${el.dataset.id}`, { method: 'DELETE' }); await yenile(s.id); toast('Görüşme kaydı silindi');
        break; }
      case 'ekle-ac': S.ekleAcik = !S.ekleAcik; S.topluAcik = false; break;
      case 'foto-sil': await api(`/ogrenciler/${s.id}/foto`, { method: 'DELETE' }); await yenile(s.id); toast('Profil fotoğrafı kaldırıldı'); break;
      case 'sil-ac': S.silOnay = s.id; break;
      case 'sil-vazgec': S.silOnay = null; break;
      case 'ogrenci-sil': {
        if (val('sil-onay').trim().toLowerCase() !== s.eposta.toLowerCase()) { toast('E-posta adresi eşleşmiyor', 'Silmek için öğrencinin e-posta adresini aynen yazın.'); return; }
        await api(`/ogrenciler/${s.id}`, { method: 'DELETE' });
        S.students = S.students.filter(x => x.id !== s.id); S.silOnay = null; S.viewing = null; S.section = 'ogrenciler';
        toast(`${s.ad} silindi`); scrollTo(0, 0);
        break; }
      case 'toplu-ac': S.topluAcik = !S.topluAcik; S.ekleAcik = false; break;
      case 'toplu-kapat': S.topluSonuc = null; break;
      case 'kopyala-toplu': {
        const t = document.getElementById('son-link').textContent;
        try { await navigator.clipboard.writeText(t); toast('Bağlantılar kopyalandı'); } catch { toast('Kopyalanamadı', 'Metni seçip Ctrl/Cmd + C ile kopyalayın.'); }
        return; }
      case 'toplu-ekle': {
        const prog = val('t-program'), kayit = val('t-kayit');
        const satirlar = val('t-liste').split(/[\n;]+/).map(x => x.trim()).filter(Boolean).map(x => {
          const [email, p] = x.split(/[,\s]+/);
          const k = (p || '').toLowerCase();
          return { email, program: k === 'aed' || k === 'pdr' ? k : prog };
        });
        if (!satirlar.length) { toast('Liste boş', 'Her satıra bir e-posta adresi yazın.'); return; }
        S.mesgul = true; render();
        try { const r = await api('/ogrenciler/toplu', { method: 'POST', body: { satirlar, kayit } }); S.topluSonuc = r.sonuc; S.topluAcik = false; await yukleHepsi();
          toast(`${r.sonuc.filter(x => x.durum === 'eklendi').length} öğrenci eklendi`); }
        finally { S.mesgul = false; }
        break; }
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
        await api(`/ogrenciler/${s.id}/profil`, { method: 'PUT', body: b }); if (!isAdv()) S.ben.ad = b.ad; const ilkKayit = !isAdv() && !s.profilTamam; await yenile(s.id); toast('Kişisel bilgiler kaydedildi', ilkKayit ? 'Şimdi derslerini ekleyebilirsin.' : ''); if (ilkKayit) S.section = 'dersler';
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
        const b = { kod, donem: +val('e-donem'), kaynak: 'program', not: sonuclu ? '' : val('e-not'), final: '', sonuc: sonuclu ? 'basarili' : null };
        if (!sonuclu && b.not === '') { toast('Notunu gir', 'Henüz notun yoksa "Alıyorum"u kullan.'); return; }
        await islemYap(s, () => api(`/ogrenciler/${s.id}/dersler`, { method: 'POST', body: b }));
        S.ekleKod = null;
        const r = { not: b.not === '' ? null : +b.not, sonuc: b.sonuc };
        if (!gecti(r, c)) toast('Ders eklendi ama sayılmayacak', `Dersin sayılması için notun en az ${K().gecmeNotu} olmalı. Seçmeliyse başka bir seçmeliyle telafi edebilirsin.`);
        else toast('Ders tamamlandı olarak eklendi');
        break; }
      case 'not-ac': S.notEdit = +el.dataset.id; break;
      case 'not-kapat': S.notEdit = null; break;
      case 'not-kaydet': {
        const r = s.dersler.find(x => x.id === +el.dataset.id), c = kat(s, r.kod);
        const b = el.dataset.sonuc ? { sonuc: 'basarili', not: null, final: null } : { not: val('ng-not'), final: null };
        if (!el.dataset.sonuc && b.not === '') { toast('Notunu gir', 'Notu 0–100 arasında yaz.'); return; }
        await islemYap(s, () => api(`/ogrenciler/${s.id}/dersler/${r.id}`, { method: 'PUT', body: { ...b, donem: r.donem, kaynak: r.kaynak } }));
        S.notEdit = null;
        const yeni = cur().dersler.find(x => x.id === r.id);
        if (yeni && !gecti(yeni, c)) toast('Not kaydedildi ama ders sayılmayacak', `Dersin sayılması için notun en az ${K().gecmeNotu} olmalı.`);
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
        const id = el.dataset.id, v = val('yorum-' + id).trim(), ek = document.getElementById('yek-' + id)?.files[0];
        if (!v && !ek) { toast('Yorum boş', 'Bir şey yazın ya da dosya ekleyin.'); return; }
        if (ek && ek.size > 25 * 1024 * 1024) { toast('Ek dosya 25 MB\'tan büyük'); return; }
        const fd = new FormData(); fd.append('metin', v); if (ek) fd.append('ek', ek);
        S.mesgul = true; render();
        try { await api(`/dosyalar/${id}/yorumlar`, { method: 'POST', body: fd }); S.yorumAcik = null; await yenile(s.id); toast(isAdv() ? 'Yorum gönderildi' : 'Yanıtın gönderildi', mailNot()); }
        finally { S.mesgul = false; }
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
  if (e.target.dataset.a === 'foto' && e.target.files[0]) {
    const s = cur();
    try {
      const blob = await fotoHazirla(e.target.files[0]);
      await api(`/ogrenciler/${s.id}/foto`, { method: 'POST', body: blob });
      await yenile(s.id); toast('Profil fotoğrafı güncellendi');
    } catch (err) { toast(err.message); }
    e.target.value = ''; render(); return;
  }
  const A = e.target.dataset.a;
  if (A === 'liste-sira') { listeAyar().sira = e.target.value; listeKaydet(); render(); return; }
  if (A === 'yek') { const f = e.target.files[0], el = document.getElementById('yek-ad-' + e.target.dataset.id); if (el) el.textContent = f ? f.name : ''; return; }
  if (A === 'gorev-tamam') {
    const s = cur();
    try { await api(`/gorusmeler/${e.target.dataset.id}`, { method: 'PUT', body: { islem: 'gorev', tamam: e.target.checked } }); await yenile(s.id); toast(e.target.checked ? 'Görev tamamlandı' : 'Görev yeniden açıldı', e.target.checked ? mailNot() : ''); }
    catch (err) { toast(err.message); }
    render(); return;
  }
  if (A !== 'yukle' || !e.target.files[0]) return;
  const f = e.target.files[0];
  if (f.size > 25 * 1024 * 1024) { toast('Dosya 25 MB\'tan büyük', 'Daha küçük bir dosya seç ya da PDF olarak kaydet.'); e.target.value = ''; return; }
  S.yeniDosya = f; render();
  document.getElementById('f-aciklama')?.focus();
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
async function ayarYukle() {
  try { const a = await api('/ayarlar'); AYAR = ayarUygula(ayarBirlestir(a.ayar)); S.varsayilan = a.varsayilan; S.yonetmelikler = a.yonetmelikler || []; } catch {}
}
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
    await ayarYukle();
    await yukleHepsi();
    S.ekran = 'uygulama';
    S.section = isAdv() ? 'ogrenciler' : (S.students[0] && !S.students[0].profilTamam ? 'kisisel' : 'genel');
  } catch {
    S.ekran = 'giris';
  }
  render();
}
baslat();
