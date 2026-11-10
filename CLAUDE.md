# CLAUDE.md — ManiCepte Muhasebe

Bu dosya, bu kod tabanında çalışacak gelecekteki Claude Code oturumları
(veya başka geliştiriciler) için mimari ve iş kurallarını özetler.

## Genel Bakış

Tek yönetici için kişiler arası gider/borç takip uygulaması. Next.js App
Router üzerinde, Server Components + Server Actions ile yazılmıştır
(ayrı bir REST/GraphQL API katmanı yoktur; mutasyonlar doğrudan server
action'lar üzerinden repository'ye gider).

## Katman Mimarisi

```
src/lib/domain/   → saf fonksiyonlar (DB/IO yok), tamamen unit test edilebilir
  money.ts        kuruş <-> TL dönüşümleri
  split.ts        eşit/özel/yüzde bölüştürme + deterministik kuruş dağıtımı
  debt-engine.ts  pay/ödeme bakiyesi, borç türetme, aşım/çakışma koruması, netleştirme
  period.ts       ay anahtarı aritmetiği, gün sabitleme (kısa aylar)
  timezone.ts     Europe/Istanbul yardımcıları
  types.ts        Zod şemaları + domain tipleri (tek doğruluk kaynağı)

src/lib/db/
  repository.ts         Repository arayüzü (tek sözleşme)
  demo/store.ts          JSON dosya tabanlı store + mutex ile transaction
  demo/repository.ts     Repository arayüzünün demo implementasyonu
  supabase/client.ts      Supabase admin client
  supabase/repository.ts Repository arayüzünün Supabase implementasyonu
  index.ts                env'e göre demo/Supabase seçimi (getRepository())

src/lib/services/   → repository + domain'i birleştiren uygulama mantığı
  reports.ts          aylık özet, borç özeti, ay karşılaştırma, tahsilat
  recurring-runner.ts düzenli gider dönem üretimini tetikler (idempotent)
  notifications.ts     hatırlatma taraması (simüle e-posta)

src/lib/auth/        oturum (imzalı cookie) + demo/Supabase login akışı
src/app/(app)/...    kimlik doğrulamalı sayfalar (Server Components + Server Actions)
src/app/giris/        giriş sayfası (public)
src/app/api/...       dosya indirme, yedek export, cron, dinamik ikon
src/proxy.ts          Next.js "proxy" (önceki adıyla middleware) — route koruması
```

Servis katmanı yerine iş kurallarının çoğu bilerek **repository
implementasyonlarının içinde** (`demo/repository.ts`, Supabase için SQL
fonksiyonları) tutulmuştur; çünkü bu kurallar (ödeme→borç türetme, aşım
koruması, idempotent dönem üretimi) veri bütünlüğüyle doğrudan ilgilidir ve
transaction sınırıyla birlikte düşünülmesi gerekir. `services/` katmanı
salt okunur birleştirme/raporlama ve çapraz-repository orkestrasyon
(hatırlatma taraması gibi) içindir.

## Temel İş Kuralları

### Para
Tüm tutarlar **integer kuruş**. Hiçbir yerde float TL taşınmaz. Kullanıcı
girdisi (`"800,00"`, `"1.234,56"`) `parseTlInput` ile kuruşa çevrilir.

### Bölüştürme ve Kuruş Yuvarlama
`split.ts`: taban pay `floor(toplam/n)`, kalan kuruşlar kişi id'sine göre
**alfabetik sırayla deterministik** dağıtılır (aynı girdi her zaman aynı
çıktıyı üretir — bu testlerle garanti edilmiştir).

### Ödeme ≠ Pay
`ExpenseShare` (kimin payı) ile `Payment` (kim gerçekten ödedi, kimin adına)
ayrı kayıtlardır. Bir `Payment`'ta `payerPersonId !== beneficiaryPersonId`
olduğunda otomatik bir `Debt` kaydı oluşur (`beneficiary` borçlu,
`payer` alacaklı). Kendi payını ödeyen kişi için borç oluşmaz. Bir kişi
aynı giderde birden fazla kişinin payını tek tek ödeme çağrısıyla
karşılayabilir (`beneficiaryPersonIds` dizisi).

### Borç Motoru (`debt-engine.ts`)
- `computeShareBalances`: pay başına ödenen/kalan/aşım, canlı olarak
  mevcut `shares` + `payments`'tan hesaplanır (saklanan bir "durum" alanı
  yoktur) — bu sayede gider tutarı/payı sonradan değişse bile geçmiş
  ödemeler silinmeden kalan bakiye doğru yeniden hesaplanır.
- `validateNewPayment`: bir payın kalanını aşan ödemeyi güvenle reddeder
  (aşım/çakışma koruması).
- `Debt` kayıtları ise **tarihsel gerçek** olarak kalıcıdır: bir ödeme
  anında gerçekten para transferi olduğunu temsil eder, sonradan gider
  payı değişse de o borç kaydı silinmez/değişmez (yalnızca geri ödeme veya
  ödeme iptaliyle kapanır). Bu bilinçli bir tasarım kararıdır: "payları
  yeniden hesapla" gereksinimi *gelecekteki* ödeme doğrulamasını ve
  bakiye görünümünü etkiler, geçmiş borç kaydını geçmişe dönük silmez.
- `netBalances`: iki kişi arasındaki karşılıklı borçları **görünüm
  seviyesinde** mahsuplaştırır (kaynak kayıtları değiştirmez, böylece
  "kaynak gider ve ay bilgisi korunsun" gereksinimi karşılanır).

### Düzenli Giderler
- Şablon (`RecurringExpense`) `splitConfig` içinde kişi listesini ve
  (varsa) özel pay/yüzde değerlerini taşır.
- `generatePeriod(recurringExpenseId, month)` **idempotent**tir: aynı ay
  için ikinci çağrı var olan kaydı döner, yeni kayıt açmaz (demo modda
  bellek içi kontrol, Supabase modda `uq_expenses_recurring_month` unique
  index + `fn_generate_recurring_period` fonksiyonu).
- Şablon tutarı/payı değiştiğinde yalnızca `recurring_expenses` satırı
  güncellenir; önceden üretilmiş `Expense` kayıtları kendi share
  snapshot'larını korur — yani geçmiş dönemler değişmez, yalnızca
  `generatePeriod`'un bundan sonra üreteceği dönemler yeni değeri kullanır.
- Ödeme günü `clampDueDay` ile kısa aylarda (Şubat, Nisan, Haziran, Eylül,
  Kasım) güvenle ayın son gününe sabitlenir.
- `services/recurring-runner.ts` → `ensureCurrentPeriodsGenerated` her
  (app) sayfası yüklemesinde çağrılır (idempotent olduğu için güvenlidir),
  böylece "yeni ay otomatik oluşsun" gereksinimi cron'a bağımlı olmadan
  karşılanır.

### Transaction Güvenliği
- **Demo mod**: `demo/store.ts` içindeki `DemoStore.transaction()` —
  mutasyon öncesi derin kopya alır, hata olursa bellekteki veriyi geri
  alır, yalnızca başarılı olursa diske yazar. Node'un tek iş parçacıklı
  event loop'u + `AsyncMutex` ile eşzamanlı çağrılar sıraya alınır.
- **Supabase mod**: Para hareketi içeren işlemler (`fn_create_payment`,
  `fn_cancel_payment`, `fn_add_debt_repayment`, `fn_cancel_debt_repayment`,
  `fn_generate_recurring_period`, `fn_restore_backup`) birer Postgres
  fonksiyonu olarak yazılmıştır (`supabase/migrations/0002_functions.sql`,
  `0004_backup_restore.sql`); her fonksiyon çağrısı doğal olarak tek bir
  veritabanı transaction'ıdır.

### Yetkilendirme / RLS
- Tek admin modeli: `admins` tablosu admin kullanıcının `auth.uid()`'ini
  tutar, `is_admin()` fonksiyonu tüm RLS politikalarında kullanılır.
- Tüm tablolarda `for all using (is_admin()) with check (is_admin())` —
  admin olmayan hiçbir Supabase Auth kullanıcısı (teorik olarak var
  olsaydı) hiçbir satırı okuyamaz/yazamaz.
- Uygulama seviyesinde `src/proxy.ts` (Next.js'in "middleware" yerine gelen
  güncel adlandırması) tüm `(app)` sayfalarını ve `/api/*` uçlarını
  (ikon/manifest/auth/cron hariç) imzalı oturum çerezi olmadan 401/redirect
  ile korur.

### Demo Modunda Önemli Bir Tuzak: bcrypt hash + `$`
`DEMO_ADMIN_PASSWORD_HASH` gibi düz bir ortam değişkeni bcrypt hash'i
saklarsa, Next.js'in dahili env yükleyicisi (`@next/env`, dotenv-expand
kullanır) `$2b$10$...` içindeki `$` işaretlerini değişken referansı sanıp
**sessizce** değeri bozar (önekleri siler). Bu yüzden hash
`DEMO_ADMIN_PASSWORD_HASH_B64` olarak **base64 kodlanmış** saklanır ve
`src/lib/auth/index.ts` içinde çözülür. Bu davranış `.env.local`
dosyasından yüklenen değerlerde VE doğrudan process ortamına (örn.
Playwright `webServer.env`, CI secrets) verilen değerlerde de aynı şekilde
gözlenmiştir — yani dosya kaynaklı değil, Next.js'in env-merge adımına
özgüdür. Yeni bir ortam değişkeni eklerken `$` karakteri içeren değerler
için bu tuzağı akılda tutun.

### Belgeler / Çöp Kutusu / Yedek
- Belgeler (`Document`) demo modda yerel diske (`.data/documents/`),
  Supabase modda `receipts` private bucket'ına yazılır. İndirme
  `/api/belgeler/[id]` route'u üzerinden (demo: dosya stream, Supabase:
  imzalı URL'e redirect) yapılır.
- Çöp kutusu ayrı bir tablo değildir; silinebilir her varlıkta
  (`expenses`, `recurring_expenses`, `debts`, `documents`, `persons`)
  `deletedAt` alanı vardır. `repository.trash.list()` bunları tarar.
- Yedek (`Backup`) tüm tabloların JSON anlık görüntüsüdür; `schemaVersion`
  (`SCHEMA_VERSION` sabiti) ve SHA-256 `checksum` içerir. Geri yükleme önce
  şema sürümünü ve checksum'ı doğrular, sonra veriyi tek seferde değiştirir.

### Hatırlatmalar
- `services/notifications.ts` → `runReminderSweep`: Europe/Istanbul saat
  diliminde "bugün" hesaplar, ödeme tarihi yarın olan ve hâlâ ödenmemiş
  giderler için `before_due`, tarihi geçmiş ve hâlâ ödenmemiş giderler için
  `overdue` tipinde simüle e-posta üretir.
- Tekrar gönderimi `notification_log` tablosundaki
  `unique(expense_id, type, date_key)` kısıtı önler.
- Bildirim kişi bazlı değil **gider bazlıdır** çünkü sistemde tek
  oturum açan kullanıcı (admin) vardır; kişiler (Yusuf, Yunus, …) birer
  giriş hesabı değildir, e-posta adresleri yoktur.

## Sayfa → Dosya Haritası

| Sayfa | Dosya |
|---|---|
| Giriş | `src/app/giris/page.tsx` |
| Genel Bakış | `src/app/(app)/genel-bakis/page.tsx` |
| Giderler | `src/app/(app)/giderler/page.tsx`, `giderler/yeni`, `giderler/duzenli` |
| Gider Detayı | `src/app/(app)/giderler/[id]/page.tsx` |
| Borçlar | `src/app/(app)/borclar/page.tsx` |
| Kişiler | `src/app/(app)/kisiler/page.tsx` |
| Raporlar | `src/app/(app)/raporlar/page.tsx` |
| Çöp Kutusu | `src/app/(app)/cop-kutusu/page.tsx` |
| Ayarlar/Yedekler | `src/app/(app)/ayarlar/page.tsx` |

## Neden Cache Components/PPR Kapalı?

`next.config.ts` içinde `cacheComponents`/`partialPrefetching` bilerek
**kapatılmıştır**. Bu uygulamanın tüm sayfaları kimlik doğrulamalı ve
kişiye özel canlı finansal veri gösterir; statik prerender'dan fayda
görecek genel/public bir sayfa yoktur. `(app)/layout.tsx` içindeki
`export const dynamic = "force-dynamic"` tüm alt sayfaları build-time
statik snapshot almaktan korur (bu olmadan `next build` bazı sayfaları
sessizce statik işaretler ve kullanıcılar build anındaki eski veriyi
görür — bu proje sırasında tespit edilip düzeltilmiş gerçek bir hatadır).

## Test Stratejisi

- `tests/unit/*.test.ts` (Vitest): saf domain fonksiyonları + `DemoRepository`
  entegrasyon testleri (gerçek dosya sistemine, izole temp dizinlerde yazar).
- `tests/e2e/*.spec.ts` (Playwright): gerçek tarayıcıda (Desktop Chrome +
  Mobile Chrome viewport) giriş → kişi → gider → ödeme → borçlar akışı.
  `playwright.config.ts` her çalıştırmada izole bir `DEMO_DATA_DIR` temp
  klasörü kullanır.
