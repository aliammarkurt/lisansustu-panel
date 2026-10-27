// Hem tarayıcıda hem sunucuda (Worker) kullanılan ortak tanımlar: müfredat ve tez adımları.

const C = (kod, ad, kredi, akts, tur) => ({ kod, ad, kredi, akts, tur });

export const PROGRAMS = {
  pdr: {
    kisa: 'PDR Tezli YL',
    ad: 'Rehberlik ve Psikolojik Danışmanlık Tezli Yüksek Lisans',
    abd: 'Eğitim Bilimleri Anabilim Dalı',
    baskan: 'Prof. Dr. Tuğba Yanpar',
    katalog: [
      C('EZ1001', 'Bilimsel Araştırma Yöntemleri', 0, 4, 'bay'),
      C('EZ1002', 'Bilimsel Etik', 0, 4, 'etik'),
      C('RPD-551', 'Psikolojik Danışma Beceri ve Teknikleri', 3, 8, 'zorunlu'),
      C('RPD-545', 'Bireysel Psikolojik Danışma Uygulamaları', 3, 8, 'zorunlu'),
      C('RPD-516', 'Bilişsel Davranışçı Terapi', 3, 8, 'secmeli'),
      C('RPD-524', 'Evlilik ve Aile Danışmanlığında Teknikler', 3, 8, 'secmeli'),
      C('RPD-526', 'Akran Desteği', 3, 8, 'secmeli'),
      C('RPD-530', 'Ergenlikte Güncel Sorunlar', 3, 8, 'secmeli'),
      C('RPD-532', 'Gelişimsel Psikolojik Danışma', 3, 8, 'secmeli'),
      C('RPD-537', 'Duygu Odaklı Psikolojik Danışma', 3, 8, 'secmeli'),
      C('RPD-550', 'Çağdaş Psikolojik Danışma Kuramları', 3, 8, 'secmeli'),
      C('RPD-552', 'Stres Yönetimi', 3, 8, 'secmeli'),
      C('RPD-555', 'İstatistik', 3, 8, 'secmeli'),
      C('RPD-556', 'Aile Danışmanlığının Temelleri', 3, 8, 'secmeli'),
      C('RPD-557', 'Aile Danışmanlığında Kuramsal Yaklaşımlar', 3, 8, 'secmeli'),
      C('RPD-558', 'Grupla Psikolojik Danışma Kuram ve Uygulamaları', 3, 8, 'secmeli'),
      C('710081', 'Psikolojik Danışma Sürecinde Kadın', 3, 8, 'secmeli'),
      C('SMY2001', 'Seminer', 0, 4, 'seminer'),
      C('UZY1001', 'Uzmanlık Alan Dersi I', 0, 4, 'uad'),
      C('UZY2001', 'Uzmanlık Alan Dersi II', 0, 4, 'uad'),
      C('UZY3001', 'Uzmanlık Alan Dersi III', 0, 30, 'uad'),
      C('UZY4001', 'Uzmanlık Alan Dersi IV', 0, 30, 'uad'),
    ],
  },
  aed: {
    kisa: 'Aile Danışmanlığı Tezli YL',
    ad: 'Aile Danışmanlığı Tezli Yüksek Lisans',
    abd: 'Aile Eğitimi ve Danışmanlığı Anabilim Dalı',
    baskan: 'Prof. Dr. Burhan Çapri',
    katalog: [
      C('EZ1001', 'Bilimsel Araştırma Yöntemleri', 0, 4, 'bay'),
      C('EZ1002', 'Bilimsel Etik', 0, 4, 'etik'),
      C('710014', 'İstatistik', 3, 5, 'zorunlu'),
      C('710007', 'Aile Danışmanlığı Uygulaması', 3, 8, 'zorunlu'),
      C('710001', 'Aile Danışmanlığının Temelleri ve Aile Danışmanlığı Kuramları', 3, 8, 'secmeli'),
      C('710002', 'Aile Danışma Süreci ve Temel Psikolojik Danışmanlık Becerileri', 3, 8, 'secmeli'),
      C('710003', 'Ailede Ruh Sağlığı', 3, 8, 'secmeli'),
      C('710004', 'Aile Danışmanlığında Etik ve Yasal Konular', 3, 8, 'secmeli'),
      C('710005', 'Aile Danışmanlığında Kullanılan Teknik ve Yöntemler', 3, 8, 'secmeli'),
      C('710006', 'Ailede Krize Müdahale', 3, 8, 'secmeli'),
      C('710015', 'Yakın İlişkiler Psikolojisi: Çağdaş Teoriler, Dinamikler ve Klinik Uygulamalar', 3, 8, 'secmeli'),
      C('SMY2001', 'Seminer', 0, 2, 'seminer'),
      C('UZY1001', 'Uzmanlık Alan Dersi I', 0, 4, 'uad'),
      C('UZY2001', 'Uzmanlık Alan Dersi II', 0, 8, 'uad'),
      C('UZY3001', 'Uzmanlık Alan Dersi III', 0, 30, 'uad'),
      C('UZY4001', 'Uzmanlık Alan Dersi IV', 0, 30, 'uad'),
    ],
  },
};

export const TUR_AD = { zorunlu: 'Zorunlu', secmeli: 'Seçmeli', bay: 'Zorunlu (kredisiz)', etik: 'Zorunlu (kredisiz)', seminer: 'Seminer', uad: 'UAD', tez: 'Tez' };
export const SONUCLU = ['seminer', 'uad', 'tez']; // başarılı/başarısız değerlendirilenler

export const ADIMLAR = [
  { grup: 'oneri', ad: 'Tez önerisi', items: [
    { k: 'konu', ad: 'Tez konusunun belirlenmesi', w: 3, not: 'En geç 2. yarıyıl sonuna kadar enstitüye önerilir, EYK onayıyla kesinleşir (M22).' },
    { k: 'oneriYaz', ad: 'Tez önerisinin yazılması', w: 3, not: 'Enstitünün tez önerisi şablonuna göre.' },
    { k: 'oneriKabul', ad: 'Tez önerisinin kabulü', w: 4, not: 'Tez Önerisi Tutanağı ile.' },
  ] },
  { grup: 'yazim', ad: 'Tez yazımı', items: [
    { k: 'giris', ad: 'Giriş bölümü', w: 3 },
    { k: 'kuram', ad: 'Kuramsal temel', w: 3 },
    { k: 'yontem', ad: 'Yöntem bölümü', w: 3 },
    { k: 'etik', ad: 'Etik kurul izni', w: 3 },
    { k: 'veri', ad: 'Veri toplama', w: 3 },
    { k: 'bulgular', ad: 'Bulgular', w: 2.5 },
    { k: 'tartisma', ad: 'Tartışma, sonuç ve öneriler', w: 2.5 },
  ] },
  { grup: 'hazirlik', ad: 'Savunmaya hazırlık', items: [
    { k: 'faaliyet', ad: 'Akademik faaliyet şartı', w: 2, not: 'Senato tarafından kabul edilen akademik faaliyetler (M23/1). Ayrıntılar daha sonra eklenecek.' },
    { k: 'savunulabilir', ad: 'Danışmanın “savunulabilir” görüşü', w: 2, by: 'danisman', not: "Danışman tezi görüşüyle birlikte ABD'ye teslim eder (M23/2)." },
    { k: 'intihal', ad: 'İntihal raporu', w: 2, by: 'danisman', not: 'Enstitü raporu danışmana ve jüriye gönderir (M23/4).' },
    { k: 'juri', ad: 'Jüri önerisi ve EYK onayı', w: 2, by: 'danisman', not: '3 asil (danışman + en az 1 dış üye), 2 yedek (en az 1 dış üye).' },
  ] },
  { grup: 'savunma', ad: 'Savunma', items: [
    { k: 'savunma', ad: 'Tez savunma sınavı', w: 8, by: 'danisman', not: 'Kabul, düzeltme veya ret. Düzeltmede en geç 3 ay içinde aynı jüriye yeniden savunma (M23/8).' },
  ] },
  { grup: 'teslim', ad: 'Mezuniyet', items: [
    { k: 'ciltli', ad: 'Ciltli tezin teslimi', w: 2, not: 'En az 3 kopya, savunmadan itibaren 1 ay içinde (M23/10).' },
    { k: 'cikis', ad: 'Çıkış işlemleri', w: 2, not: 'Tez teslim formları, YÖK tez veri girişi, ilişik kesme, mezun izleme formu.' },
  ] },
];

export const ADIM = {};
ADIMLAR.forEach(g => g.items.forEach(i => { ADIM[i.k] = { ...i, grup: g.grup }; }));

export const KAYIT_DONEMLERI = ['2023-2024 Güz', '2023-2024 Bahar', '2024-2025 Güz', '2024-2025 Bahar', '2025-2026 Güz', '2025-2026 Bahar', '2026-2027 Güz', '2026-2027 Bahar', '2027-2028 Güz', '2027-2028 Bahar'];

export function bosTez() {
  return {
    baslikTr: '', baslikEn: '', oneriTarih: '', komisyon: ['', '', ''],
    sinavTarih: '', sinavSaat: '', sinavYer: '',
    juri: [{ u: 'Dr. Öğr. Üyesi', a: 'Ali Ammar Kurt', k: 'Mersin Üniversitesi' }, { u: '', a: '', k: '' }, { u: '', a: '', k: '' }, { u: '', a: '', k: '' }, { u: '', a: '', k: '' }],
  };
}
