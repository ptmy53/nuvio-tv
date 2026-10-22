# Nuvio TV — GitHub Pages ile kendi kopyanı yayınlama

Bu klasör, `NuvioMedia/NuvioTVSmart` deposunun klonu + GitHub Pages yapılandırmasıdır.
Amaç: depoyu kendine kopyalamak, düzenlemek ve `https://<kullanıcı>.github.io/<depo>/`
adresinden PC tarayıcısında açmak.

---

## 1. Yerel test (zaten çalışıyor)

```powershell
cd nuvio-tv
npm install
npm run build      # çıktı: dist/
npm run serve      # http://127.0.0.1:4173/
```

`npm run serve` sırasında `nuvio.env.js` dosyası `local.properties` dosyasından
dinamik üretilir. `dist/` içindeki sürüm ise build anındaki değerleri taşır.

Alt dizin testi de yapıldı: `http://127.0.0.1:5055/nuvio-tv/` üzerinden uygulama
sorunsuz açıldı (GitHub Pages proje siteleri tam olarak bu şekilde, alt dizinde çalışır).

---

## 2. GitHub'da depo oluşturma ve ilk push

1. GitHub'da **yeni bir depo** aç: `nuvio-tv` (public olmalı — ücretsiz planla Pages
   yalnızca public depolarda çalışır).
2. Bu klasörde:

```powershell
cd nuvio-tv
git remote rename origin upstream          # orijinal depo "upstream" olarak kalsın
git remote add origin https://github.com/<KULLANICI>/nuvio-tv.git
git add .
git commit -m "add GitHub Pages deployment"
git push -u origin main
```

> Güncelleme takibi: `git fetch upstream && git merge upstream/main`

---

## 3. GitHub Pages'i açma

Depo → **Settings → Pages** → **Build and deployment → Source: GitHub Actions**

Bu kadar. `main` dalına her push'ta `.github/workflows/pages.yml` çalışır:
`npm ci` → `npm run build` → `dist/` yayınlanır.

Adres: `https://<KULLANICI>.github.io/nuvio-tv/`
(İlk yayın 1–3 dakika sürebilir. Actions sekmesinden ilerlemeyi görebilirsin.)

---

## 4. TMDB anahtarı (önerilir)

Uygulama TMDB anahtarı olmadan da açılır (varsayılan Stremio eklentileriyle katalog gelir),
ama film/dizi detayları ve arama büyük ölçüde TMDB'ye bağlıdır.

1. https://www.themoviedb.org/settings/api → ücretsiz **API Key (v3 auth)** al.
2. Depo → **Settings → Secrets and variables → Actions → New repository secret**
   - Ad: `TMDB_API_KEY`
   - Değer: aldığın anahtar
3. Actions → **Build and deploy to GitHub Pages** → **Re-run all jobs**

Aynı yöntemle eklenebilen diğerleri: `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`,
`SIMKL_CLIENT_ID`, `MDBLIST_CLIENT_ID`.

> **Uyarı:** Bu bir istemci tarafı uygulaması. `nuvio.env.js` içindeki anahtarlar
> sayfayı açan herkes tarafından görülebilir. TMDB anahtarını "read-only" kullan,
> Trakt için ayrı bir uygulama kaydı aç. Gizli kalması gereken bir şeyi buraya koyma.

---

## 5. Nerede düzenleme yapılır?

| Ne | Yer |
|---|---|
| Ekranlar / akış | `js/ui/screens/**` |
| Yönlendirme | `js/core/router*`, `js/ui/router*` |
| Stiller / tema | `css/` (`base.css`, `layout.css`, `components-*.css`, `themes.css`) |
| Çeviriler | `js/i18n` / `res/` (build'de 36 dil paketi üretiliyor) |
| Logolar, karolar | `assets/` (`assets/brand/…`) |
| Varsayılan eklentiler | `js/` içindeki addon/bootstrap dosyaları |
| Başlangıç ekranı | `index.html` |
| Derleme | `scripts/build.mjs` |

Düzenleme sonrası: `npm run build` → `dist/` kontrol → commit + push.

---

## 6. Bilinmesi gerekenler

- **Lisans:** GPL-3.0. Değiştirip yayınlarsan kaynak kodun da açık kalmalı ve lisans
  metni korunmalı. Bu depo bunu sağlıyor.
- **Hesap:** Açılışta QR ile giriş isteniyor; **"Hesapsız devam et"** ile de ana ekrana
  geçilebiliyor (test edildi).
- **Torrent/P2P:** Tarayıcı sürümünde yerel eşlik servisi (EngineFS) yok; yalnızca
  doğrudan HTTP/HLS/DASH kaynaklar oynar.
- **Kaynaklar:** Uygulama kendi içerik sağlamaz; kendi eklediğin eklentileri/kaynakları
  kullanır. Kaynakların yasal sorumluluğu kullanıcıya aittir.
- **Derin bağlantı:** GitHub Pages SPA geri dönüşü olmadığı için `404.html` kök dizine
  yönlendirir (workflow üretir). Uygulama içi gezinme bundan etkilenmez.
