# Lisansüstü Panel

Dr. Öğr. Üyesi Ali Ammar Kurt'un tezli yüksek lisans öğrencileri için ders ve tez süreci takip paneli.
Adres: https://panel.aliammarkurt.com

## Yapı
- `src/index.js` — Cloudflare Worker: API, oturum, e-posta bildirimleri
- `public/` — arayüz (index.html, app.js, shared.js)
- `public/shared.js` — müfredat ve tez adımları (hem arayüz hem sunucu kullanır)
- Veritabanı: Cloudflare D1 (`panel-db`), dosyalar: Cloudflare R2 (`panel-dosyalar`)

## Danışmanlık araçları
- **Görüşmeler** — öğrenci görüşme talep eder; danışman planlar (yüz yüze/çevrim içi) ve görüşmeden sonra konuşulanları, kararları ve sıradaki görevi kaydeder. "Kendime not" alanı yalnızca danışmana görünür.
- **Zaman çizelgesi** — öğrencinin tüm hareketleri (adımlar, dersler, sürümler, yorumlar, görüşmeler, hatırlatmalar) tek akışta.
- **Sürüm yorumları** — öğrenci sürüm yüklerken "neler değişti" notu ekler; yorumlar iki yönlü bir diziye dönüştü ve yorumlu dosya eklenebilir.
- **Öğrencilerim** — PDR ve Aile Danışmanlığı öğrencileri aynı sayfada iki grup hâlinde; risk göstergeleri (azami süre, tez konusu, ders dönemi, sessizlik, gecikmiş görev), filtre ve sıralama.

## Gizli değişkenler (Cloudflare → Worker → Settings → Variables and Secrets)
- `SETUP_KEY` — ilk danışman hesabını oluşturmak için tek seferlik anahtar (`/kurulum`)
- `RESEND_API_KEY` — e-posta bildirimleri (yoksa bildirim gönderilmez, davet bağlantıları elle iletilir)

## Veri ilkeleri
T.C. kimlik numarası ve posta adresi sunucuya gönderilmez ve saklanmaz.

## Word belgeleri
- `public/sablonlar/` — enstitünün resmî formlarından üretilmiş, `{etiket}` alanlı şablonlar
- `public/belge-veri.js` — panel verisinden form alanlarını hazırlar; doldurma tarayıcıda yapılır (docxtemplater)
- `tools/sablon-uret.py` — resmî formlar değişirse şablonları yeniden üretmek için betik
