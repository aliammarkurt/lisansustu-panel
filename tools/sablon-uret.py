# Resmî formlardan doldurulabilir şablonlar üretir: noktalı alanlara {etiket} koyar.
import zipfile, re, sys, os, shutil
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
w = lambda t: '{%s}%s' % (W, t)
XMLSPACE = '{http://www.w3.org/XML/1998/namespace}space'
SRC = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)


class Doc:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.parts = {}
        for n in self.z.namelist():
            if re.match(r'word/(document|header\d*|footer\d*)\.xml$', n):
                self.parts[n] = etree.fromstring(self.z.read(n))

    def paras(self, part='word/document.xml'):
        return list(self.parts[part].iter(w('p')))

    def ptext(self, p):
        out = []
        for r in p.iter(w('r')):
            for el in r:
                if el.tag == w('tab'):
                    out.append('\t')
                elif el.tag == w('t'):
                    out.append(el.text or '')
        return ''.join(out)

    def find(self, pattern, part='word/document.xml', nth=0):
        hits = [p for p in self.paras(part) if re.search(pattern, self.ptext(p))]
        if len(hits) <= nth:
            raise SystemExit(f'Bulunamadı: {pattern!r} ({part}, {nth})')
        return hits[nth]

    def findall(self, pattern, part='word/document.xml'):
        return [p for p in self.paras(part) if re.search(pattern, self.ptext(p))]

    @staticmethod
    def sett(t, text):
        t.text = text
        t.set(XMLSPACE, 'preserve')

    def set_para(self, p, text):
        ts = list(p.iter(w('t')))
        self.sett(ts[0], text)
        for t in ts[1:]:
            t.text = ''

    def fill_dots(self, p, tags, clear_rest=True):
        """Noktalı/üç noktalı/boşluklu alan sonuçlarını sırayla etiketlerle değiştir."""
        if isinstance(tags, str):
            tags = [tags]
        ts = [t for t in p.iter(w('t')) if re.fullmatch(r'\s*[.… @ /:0-9]{3,}\s*', t.text or '') and re.search(r'[.… ]', t.text or '')]
        if not ts:
            raise SystemExit(f'Noktalı alan yok: {self.ptext(p)!r}')
        for i, t in enumerate(ts):
            if i < len(tags):
                self.sett(t, tags[i])
            elif clear_rest:
                t.text = ''

    def replace_text(self, old, new, part=None):
        for n, root in self.parts.items():
            if part and n != part:
                continue
            for p in root.iter(w('p')):
                if self.ptext(p).strip() == old.strip():
                    self.set_para(p, new)

    def tables(self):
        return list(self.parts['word/document.xml'].iter(w('tbl')))

    @staticmethod
    def rows(tbl):
        return [r for r in tbl if r.tag == w('tr')]

    @staticmethod
    def cells(row):
        return [c for c in row if c.tag == w('tc')]

    def save(self, path):
        out = zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED)
        for item in self.z.infolist():
            data = self.z.read(item.filename)
            if item.filename in self.parts:
                data = etree.tostring(self.parts[item.filename], xml_declaration=True, encoding='UTF-8', standalone=True)
            out.writestr(item, data)
        out.close()


def src(prefix):
    for f in os.listdir(SRC):
        if f.startswith(prefix):
            return os.path.join(SRC, f)
    raise SystemExit('Kaynak yok: ' + prefix)


# ---------- Form 5: Tez Önerisi Tutanak Formu ----------
d = Doc(src('b59372ce-5'))
d.fill_dots(d.find(r'^Adı Soyadı'), '{ogrenciAd}')
d.fill_dots(d.find(r'Anabilim Dalı\s*:'), '{abd}')
d.fill_dots(d.find(r'^Danışmanı'), '{danisman}')
bas = d.findall(r'^[.]{20,}$')
d.fill_dots(bas[0], '“{tezBaslik}”')
for p in bas[1:3]:
    d.fill_dots(p, '')
d.replace_text('Ünvanı Adı ve Soyadı', '{abdBaskan}')
d.save(os.path.join(OUT, 'form5-oneri-tutanak.docx'))

# ---------- Form 6: Öğretim Elemanı Tez Önerisi Değerlendirme ----------
d = Doc(src('f8fd1d44-6'))
d.fill_dots(d.paras()[0], ['{gun}', '{ay}', '{yil}'])
d.fill_dots(d.find(r'^Ünvanı Adı Soyadı'), '{uyeAd}')
d.fill_dots(d.find(r'^Kurumu'), '{uyeKurum}')
d.fill_dots(d.find(r'^Başlığı'), '{tezBaslik}')
for p in d.findall(r'^\s+[.]{20,}$')[:2]:
    d.fill_dots(p, '')
d.fill_dots(d.find(r'^Ünvanı Adı ve Soyadı'), '{danisman}')
d.fill_dots(d.find(r'^Adı ve Soyadı'), '{ogrenciAd}')
d.fill_dots(d.find(r'^Numarası'), '{ogrenciNo}')
d.fill_dots(d.find(r'^Anabilim Dalı'), '{abd}')
d.replace_text('Ünvanı - Adı ve Soyadı', '{uyeAd}')
d.save(os.path.join(OUT, 'form6-oneri-degerlendirme.docx'))

# ---------- YL-12: Jüri Öneri Formu ----------
d = Doc(src('664c839e-yl12'))
for n in list(d.parts):
    for p in d.parts[n].iter(w('p')):
        for t in p.iter(w('t')):
            if t.text and '-ENSTİTÜ ADI-' in t.text:
                Doc.sett(t, t.text.replace('-ENSTİTÜ ADI-', 'EĞİTİM BİLİMLERİ'))
d.replace_text('Unvanı Adı ve Soyadı', '{abdBaskan}')
d.fill_dots(d.find(r'^ADI ve SOYADI'), '{ogrenciAd}')
d.fill_dots(d.find(r'^ÖĞRENCİ NO'), '{ogrenciNo}')
d.fill_dots(d.paras()[[i for i, p in enumerate(d.paras()) if d.ptext(p).startswith('ÖĞRENCİ NO')][0] + 1], '{abd}')
d.fill_dots(d.find(r'^ÜNVANI ADI VE SOYADI'), '{danisman}')
d.fill_dots(d.find(r'^TEZ BAŞLIĞI'), '{tezBaslik}')
for p in d.findall(r'^\s+[.]{20,}$')[:2]:
    d.fill_dots(p, '')
# Sayı satırındaki tarih
p0 = d.find(r'^Sayı')
ts = [t for t in p0.iter(w('t')) if re.search(r'[.]{3}', t.text or '')]
Doc.sett(ts[0], '')  # sayı boş
for t, v in zip(ts[1:], ['{bgun}', '{bay}', '{byil}']):
    Doc.sett(t, v)
t0, t1 = d.tables()[:2]
r = Doc.rows(t0)
d.fill_dots(Doc.cells(r[1])[1].find('.//' + w('p')), '{sinavTarih}')
d.fill_dots(Doc.cells(r[2])[1].find('.//' + w('p')), '{sinavSaat}')
d.fill_dots(Doc.cells(r[3])[1].find('.//' + w('p')), '{sinavYer}')
rows = Doc.rows(t1)
# 5 asil satırından 3'ü kalır (YL jürisi 3 asil)
for rr in rows[4:6]:
    t1.remove(rr)
rows = Doc.rows(t1)
for rr, tag in zip([rows[1], rows[2], rows[3], rows[5], rows[6]], ['{asil1}', '{asil2}', '{asil3}', '{yedek1}', '{yedek2}']):
    c = Doc.cells(rr)[1]
    ts = list(c.iter(w('t')))
    Doc.sett(ts[0], tag)
    for t in ts[1:]:
        t.text = ''
d.save(os.path.join(OUT, 'yl12-juri-oneri.docx'))

# ---------- Form 8: Tez Savunma Sınavı Tutanağı ----------
d = Doc(src('646a74be-8'))
for t in d.parts['word/header1.xml'].iter(w('t')) if 'word/header1.xml' in d.parts else []:
    pass
for n, root in d.parts.items():
    if n.startswith('word/header'):
        for p in root.iter(w('p')):
            if d.ptext(p).strip().startswith('EĞİTİM BİLİMLERİ ENSTİTÜSÜ ENSTİTÜSÜ'):
                d.set_para(p, 'EĞİTİM BİLİMLERİ ENSTİTÜSÜ')
d.fill_dots(d.find(r'Programı öğrencisi'), '{ogrenciAdIn}')
d.fill_dots(d.find(r'^[.]{20,}\s*tez savunma'), '')
d.replace_text('Ünvanı Adı ve Soyadı', '{abdBaskan}')
t0, t1 = d.tables()[:2]
p0 = Doc.cells(Doc.rows(t0)[0])[0].find('.//' + w('p'))
d.fill_dots(p0, '')
p1 = Doc.cells(Doc.rows(t0)[0])[1].find('.//' + w('p'))
d.fill_dots(p1, ['{sgun}', '{say}', '{syil}'])
rows = Doc.rows(t1)
for rr, tag in zip(rows[1:4], ['{asil1}', '{asil2}', '{asil3}']):
    c = Doc.cells(rr)[1]
    ts = list(c.iter(w('t')))
    Doc.sett(ts[0], tag)
    for t in ts[1:]:
        t.text = ''
c = Doc.cells(rows[4])[0]
ps = list(c.iter(w('p')))
def cp(rx):
    return [p for p in ps if re.search(rx, d.ptext(p))]
d.fill_dots(cp(r'^Tez Başlığı')[0], '{tezBaslik}')
tb_i = ps.index(cp(r'^Tez Başlığı')[0])
for p in ps[tb_i + 1: tb_i + 3]:
    d.fill_dots(p, '')
d.fill_dots(cp(r'Sınavın Tarihi')[0], '{sinavTarih}')
d.fill_dots(cp(r'Saati')[0], '{sinavSaat}')
d.fill_dots(cp(r'Yeri')[0], '{sinavYer}')
d.save(os.path.join(OUT, 'form8-savunma-tutanak.docx'))

# ---------- Form 9: Jüri Üyesi Değerlendirme ----------
d = Doc(src('9239d672-9'))
d.fill_dots(d.find(r'^Öğrencinin Adı'), '{ogrenciAd}')
d.fill_dots(d.find(r'^Danışmanının'), '{danisman}')
d.fill_dots(d.find(r'^Jüri Üyesinin'), '{uyeAd} ({uyeKurum})')
d.fill_dots(d.find(r'Dalı\t'), '{abd}')
d.fill_dots(d.find(r'^Tezin Başlığı'), '{tezBaslik}')
for p in d.findall(r'^\t+\s*[.]{20,}$')[:3]:
    d.fill_dots(p, '')
t0 = d.tables()[0]
d.fill_dots(Doc.cells(Doc.rows(t0)[0])[2].find('.//' + w('p')), ['{sgun}', '{say}', '{syil}'])
d.replace_text('-Ünvanı - Adı ve Soyadı-', '{uyeAd}')
d.save(os.path.join(OUT, 'form9-juri-degerlendirme.docx'))

# ---------- Form 12: Tez Teslim ve Kullanım İzni ----------
d = Doc(src('fc0acfb2-12'))
d.fill_dots(d.find(r'^Adı ve Soyadı\t\t:'), '{ogrenciAd}')
d.fill_dots(d.find(r'^TC Kimlik'), '{tc}')
d.fill_dots(d.find(r'^E-posta'), '{ogrenciEposta}')
d.fill_dots(d.find(r'^Posta Adresi'), '{adres}')
d.fill_dots(d.find(r'^Enstitü'), 'Eğitim Bilimleri Enstitüsü')
d.fill_dots(d.find(r'^Danışman'), '{danisman}')
d.fill_dots(d.find(r'^Tez Yılı'), '{yil}')
d.fill_dots(d.find(r'^Tez Adı'), '{tezBaslik}')
for p in d.findall(r'^\s+[.]{20,}$')[:2]:
    d.fill_dots(p, '')
d.replace_text('Öğrencinin Adı ve Soyadı', '{ogrenciAd}')
d.save(os.path.join(OUT, 'form12-tez-teslim.docx'))

# ---------- Çıkış İşlemleri ----------
d = Doc(src('349222ab'))
for tbl in d.tables()[:2]:
    for rr, tag in zip(Doc.rows(tbl)[:4], ['{ogrenciAd}', '{ogrenciNo}', '{abd}', '{program}']):
        c = Doc.cells(rr)[1]
        p = c.find('.//' + w('p'))
        r = etree.SubElement(p, w('r'))
        t = etree.SubElement(r, w('t'))
        Doc.sett(t, tag)
    # Statü: Yüksek Lisans kutusunu işaretle
    c = Doc.cells(Doc.rows(tbl)[4])[1]
    cb = c.find('.//' + w('checkBox'))
    if cb is not None:
        dflt = cb.find(w('default'))
        if dflt is None:
            dflt = etree.SubElement(cb, w('default'))
        dflt.set(w('val'), '1')
d.save(os.path.join(OUT, 'cikis-islemleri.docx'))

# ---------- Form 4: Tez Önerisi Şablonu (kapak ve üst bilgi) ----------
d = Doc(src('c41c088e-4'))
D = 'word/document.xml'
for p in d.paras(D):
    t = d.ptext(p).strip()
    if t == 'TEZİN BAŞLIĞI':
        d.set_para(p, '{tezBaslikBuyuk}')
    elif t == 'ÖĞRENCİ ADI VE SOYADI':
        d.set_para(p, '{ogrenciAdBuyuk}')
    elif t == '…':
        d.set_para(p, '{abdKapak}')
    elif t == '… ANABİLİM DALI':
        d.set_para(p, '{abdKapak} ANABİLİM DALI')
    elif t == '… BİLİM DALI':
        d.set_para(p, '{bdKapak}')
    elif t == 'DR. ÖĞR. ÜYESİ / DOÇ. DR. / PROF. DR. ADI VE SOYADI':
        d.set_para(p, '{danismanBuyuk}')
    elif t == 'OCAK-2023':
        d.set_para(p, '{ayYilBuyuk}')
    elif t.startswith('TEZİN TÜRKÇE BAŞLIĞI'):
        d.set_para(p, '{tezBaslikBuyuk}')
    elif t == 'TITLE OF THESIS':
        d.set_para(p, '{tezBaslikEnBuyuk}')
for n, root in d.parts.items():
    if n.startswith('word/header'):
        for p in root.iter(w('p')):
            if d.ptext(p).startswith('Adı SOYADI, Yüksek Lisans'):
                d.set_para(p, '{ustBilgiAd}, Yüksek Lisans Tez Önerisi, Eğitim Bilimleri Enstitüsü, Mersin Üniversitesi, {yil}')
d.save(os.path.join(OUT, 'form4-tez-onerisi-sablonu.docx'))
print('Tamam:', sorted(os.listdir(OUT)))
