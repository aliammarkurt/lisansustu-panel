// Panel verisinden Word şablonlarına giden alanları hazırlar (tarayıcıda çalışır, sunucuya veri göndermez).
import { PROGRAMS } from './shared.js';

export const DANISMAN = 'Dr. Öğr. Üyesi Ali Ammar Kurt';

const BUYUK = s => (s || '').toLocaleUpperCase('tr');
const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

// Kapak ve formlarda kullanılan anabilim/bilim dalı adları
const DALLAR = {
  pdr: { kapak: 'EĞİTİM BİLİMLERİ', bilimDali: 'REHBERLİK VE PSİKOLOJİK DANIŞMANLIK BİLİM DALI' },
  aed: { kapak: 'AİLE EĞİTİMİ VE DANIŞMANLIĞI', bilimDali: '' },
};

// Türkçe ilgi (tamlayan) eki: Yılmaz → Yılmaz’ın, Kaya → Kaya’nın, Kurt → Kurt’un
export function ilgiEki(ad) {
  const s = (ad || '').trim();
  if (!s) return '';
  const kucuk = s.toLocaleLowerCase('tr');
  const unluler = kucuk.match(/[aeıioöuü]/g);
  const son = unluler ? unluler[unluler.length - 1] : 'e';
  const ek = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' }[son];
  const unluyleBiter = /[aeıioöuü]$/.test(kucuk);
  return `${s}’${unluyleBiter ? 'n' : ''}${ek}n`;
}

// "Elif Yılmaz" → "Elif YILMAZ" (tez önerisi üst bilgisi biçimi)
function ustBilgiAd(ad) {
  const p = (ad || '').trim().split(/\s+/);
  if (p.length < 2) return BUYUK(ad);
  const soy = p.pop();
  return `${p.join(' ')} ${BUYUK(soy)}`;
}
const trTarih = iso => {
  if (!iso) return { tam: '', gun: '', ay: '', yil: '' };
  const [y, m, d] = iso.split('-');
  return { tam: `${d}/${m}/${y}`, gun: d, ay: m, yil: y };
};
const juriMetni = j => j && j.a ? [`${j.u || ''} ${j.a}`.trim(), j.k].filter(Boolean).join(', ') : '';

// Komisyon satırı "Unvan Ad Soyad — Kurum" biçiminde girilir
function komisyonUyesi(metin) {
  const [ad, kurum] = String(metin || '').split(/\s+[—–-]\s+/);
  return { ad: (ad || '').trim(), kurum: (kurum || '').trim() };
}

export function belgeVerisi(s, ek = {}) {
  const P = PROGRAMS[s.program], t = s.tez, bugun = new Date();
  const sinav = trTarih(t.sinavTarih), oneri = trTarih(t.oneriTarih);
  return {
    ogrenciAd: s.ad, ogrenciAdIn: ilgiEki(s.ad), ogrenciAdBuyuk: BUYUK(s.ad), ustBilgiAd: ustBilgiAd(s.ad),
    ogrenciNo: s.no || '', ogrenciEposta: s.eposta || '', statu: s.statu || '',
    abd: P.abd, program: P.ad, abdBaskan: P.baskan,
    abdKapak: DALLAR[s.program].kapak, bdKapak: DALLAR[s.program].bilimDali,
    danisman: DANISMAN, danismanBuyuk: BUYUK(DANISMAN),
    tezBaslik: t.baslikTr || '', tezBaslikBuyuk: BUYUK(t.baslikTr), tezBaslikEnBuyuk: (t.baslikEn || '').toUpperCase(),
    sinavTarih: sinav.tam, sinavSaat: t.sinavSaat || '', sinavYer: t.sinavYer || '',
    sgun: sinav.gun, say: sinav.ay, syil: sinav.yil,
    gun: oneri.gun, ay: oneri.ay,
    bgun: String(bugun.getDate()).padStart(2, '0'), bay: String(bugun.getMonth() + 1).padStart(2, '0'), byil: String(bugun.getFullYear()),
    yil: String(bugun.getFullYear()), ayYilBuyuk: `${AYLAR[bugun.getMonth()]}-${bugun.getFullYear()}`,
    asil1: juriMetni(t.juri[0]), asil2: juriMetni(t.juri[1]), asil3: juriMetni(t.juri[2]),
    yedek1: juriMetni(t.juri[3]), yedek2: juriMetni(t.juri[4]),
    tc: '', adres: '',
    ...ek,
  };
}

// Her belge: şablon dosyası, gerekli alanlar ve (varsa) kişi başına ayrı kopya
export const BELGE_SABLON = {
  kapak: { dosya: 'form4-tez-onerisi-sablonu.docx', ad: 'Tez Önerisi' },
  oneriTutanak: { dosya: 'form5-oneri-tutanak.docx', ad: 'Tez Önerisi Tutanak Formu' },
  oneriDeg: { dosya: 'form6-oneri-degerlendirme.docx', ad: 'Tez Önerisi Değerlendirme Formu', kisiler: s => s.tez.komisyon.map(k => komisyonUyesi(k)).filter(k => k.ad) },
  juriOneri: { dosya: 'yl12-juri-oneri.docx', ad: 'Jüri Öneri Formu' },
  savunma: { dosya: 'form8-savunma-tutanak.docx', ad: 'Tez Savunma Sınavı Tutanağı' },
  juriDeg: { dosya: 'form9-juri-degerlendirme.docx', ad: 'Jüri Üyesi Değerlendirme Formu', kisiler: s => s.tez.juri.slice(0, 3).filter(j => j.a).map(j => ({ ad: `${j.u || ''} ${j.a}`.trim(), kurum: j.k || '' })) },
  teslim: { dosya: 'form12-tez-teslim.docx', ad: 'Tez Teslim ve Kullanım İzni Formu' },
  cikis: { dosya: 'cikis-islemleri.docx', ad: 'Lisansüstü Çıkış İşlemleri' },
};

export function dosyaAdi(s, id, kisi) {
  const TR = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  const temiz = x => String(x || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, c => TR[c]).normalize('NFKD').replace(/[^\w .-]/g, '').trim().replace(/\s+/g, '_');
  return `${temiz(BELGE_SABLON[id].ad)}_${temiz(s.ad)}${kisi ? '_' + temiz(kisi.ad) : ''}.docx`;
}
