# Lisansüstü Panel

Dr. Öğr. Üyesi Ali Ammar Kurt'un tezli yüksek lisans öğrencileri için ders ve tez süreci takip paneli.
Adres: https://panel.aliammarkurt.com

## Yapı
- `src/index.js` — Cloudflare Worker: API, oturum, e-posta bildirimleri
- `public/` — arayüz (index.html, app.js, shared.js)
- `public/shared.js` — müfredat ve tez adımları (hem arayüz hem sunucu kullanır)
- Veritabanı: Cloudflare D1 (`panel-db`), dosyalar: Cloudflare R2 (`panel-dosyalar`)

## Gizli değişkenler (Cloudflare → Worker → Settings → Variables and Secrets)
- `SETUP_KEY` — ilk danışman hesabını oluşturmak için tek seferlik anahtar (`/kurulum`)
- `RESEND_API_KEY` — e-posta bildirimleri (yoksa bildirim gönderilmez, davet bağlantıları elle iletilir)

## Veri ilkeleri
T.C. kimlik numarası ve posta adresi sunucuya gönderilmez ve saklanmaz.

## Word belgeleri
- `public/sablonlar/` — enstitünün resmî formlarından üretilmiş, `{etiket}` alanlı şablonlar
- `public/belge-veri.js` — panel verisinden form alanlarını hazırlar; doldurma tarayıcıda yapılır (docxtemplater)
- `tools/sablon-uret.py` — resmî formlar değişirse şablonları yeniden üretmek için betik
