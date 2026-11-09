# Öne Çıkan Ürünler (most-seller)

ikas mağazalarının kategori sayfalarına **o kategorinin en çok satan ürünlerini** ekleyen çok mağazalı uygulama.

```
server/   Node.js + Express backend (ikas API, hesaplama, widget, public API) — SQLite (node:sqlite)
admin/    React (Vite) yönetim paneli — build edilince server tarafından sunulur
server/public/widget.js   mağazalara eklenen script
```

## Nasıl çalışır

1. Her mağaza için ikas'ta **Özel Uygulama** oluşturulur (yetkiler: Siparişleri / Ürünleri / Kategorileri okuma).
2. Sunucu belirlenen aralıkla (varsayılan 6 saat) her mağaza için:
   - Son N günün siparişlerini çeker (iptal / iade / taslak hariç, iptal edilen satırlar hariç),
   - Satışları **ürün bazında** toplar (beden / renk varyantları tek ürün),
   - Ürünlerin güncel kategorisini, fiyatını, görselini ve stoğunu alır,
   - Her kategori için en çok satanları (adet ya da ciro) hesaplar; alt kategori satışları üst kategoriye de sayılır,
   - Sonucu veritabanına yazar.
3. Mağazadaki script, sayfa adresinin son parçasını (kategori slug'ı) alır; o kategori için veri varsa bölümü çizer.
   ikas vitrini SPA olduğu için sayfa geçişlerini de izler.
4. Public API **satış adedi ve ciro vermez**; sadece ürün adı, link, görsel ve fiyat döner.

## Lokal çalıştırma

```bash
cp server/.env.example server/.env    # ADMIN_PASSWORD ve APP_SECRET doldurun
npm --prefix server install
npm --prefix admin install

npm run dev:server     # http://localhost:4000
npm run dev:admin      # http://localhost:5173 (API'yi 4000'e yönlendirir)
```

Tek sunucu olarak: `npm run build && npm start` → panel `http://localhost:4000`.

## Railway'e kurulum

1. Repo'yu Railway'e bağlayın (kök klasör). Build ve start komutları `railway.json` içinde tanımlı
   (`npm run install:all && npm run build` → `npm start`), sağlık kontrolü `/health`.
2. **Volume** ekleyin (örn. `/data`) ve değişkenleri girin:
   - `ADMIN_PASSWORD`, `APP_SECRET` (uzun rastgele değer — değişirse kayıtlı Client Secret'lar çözülemez)
   - `DB_PATH=/data/most-seller.db`
   - `PUBLIC_URL=https://<railway-adresiniz>`
3. Node sürümü 22.13+ olmalı (`node:sqlite` için).

## Mağaza ekleme

1. Panel → **Mağaza ekle** → ikas mağaza adı (`xxx.myikas.com` içindeki `xxx`), Client ID, Client Secret.
2. **Bağlantıyı test et** → **Şimdi senkronize et** → **Sonuçlar** sekmesinden kontrol edin.
3. **Kurulum** sekmesindeki satırı ikas'ın Özel Kod / `<head>` alanına ekleyin:
   ```html
   <script src="https://SUNUCU/widget.js" data-store="ms_xxxx" async></script>
   ```
4. Konum için **Ayarlar → Yerleşim**'e CSS seçici girin (masaüstü / mobil ayrı) ya da temaya
   `<div id="ms-bestsellers"></div>` koyun. Sorun ararken sayfa adresine `?ms-debug=1` ekleyin.

## API

| Uç | Açıklama |
|---|---|
| `GET /widget.js` | Mağaza script'i |
| `GET /api/public/:key/bootstrap` | Ayarlar + verisi olan kategori slug'ları |
| `GET /api/public/:key/category/:slug` | Kategori ürünleri |
| `POST /api/admin/login` | Panel girişi |
| `GET/POST/PUT/DELETE /api/admin/stores[/:id]` | Mağaza yönetimi |
| `POST /api/admin/stores/:id/test` | ikas bağlantı testi |
| `POST /api/admin/stores/:id/sync` | Senkronu başlat |
| `GET /api/admin/stores/:id/categories` | Hesaplanan sonuçlar (adet / ciro dahil) |
