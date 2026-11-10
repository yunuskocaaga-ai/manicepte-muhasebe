# ManiCepte Muhasebe

Kişiler arası gider ve borç takibi için minimalist, mobil öncelikli, tamamen
Türkçe bir PWA. Tek yönetici modeliyle çalışır — herkese açık kayıt yoktur.

## Teknolojiler

- Next.js (App Router) + TypeScript (strict) + Tailwind CSS
- Zod ile doğrulama
- Vitest (unit/integration) + Playwright (e2e, masaüstü ve mobil)
- Supabase (Postgres + Auth + Storage) — opsiyonel; bağlanmadığında **yerel
  demo modu** otomatik devreye girer
- Tüm para tutarları integer **kuruş** olarak saklanır (float TL kullanılmaz)

## Hızlı Başlangıç (Demo Modu — Supabase gerekmez)

```bash
npm install
cp .env.example .env.local
```

`.env.local` içinde en az şunları doldurun:

```bash
SESSION_SECRET=en-az-32-karakterlik-rastgele-bir-deger
DEMO_ADMIN_EMAIL=yonetici@ornek.com
# Şifre hash'i üretmek için:
npx tsx scripts/hash-password.ts "sifreniz"
# Çıktıyı DEMO_ADMIN_PASSWORD_HASH_B64 olarak yapıştırın
```

> **Önemli:** `DEMO_ADMIN_PASSWORD_HASH_B64` değeri bcrypt hash'in **base64**
> ile kodlanmış hâlidir, düz hash değildir. Sebep: bcrypt hash'leri `$`
> karakteri içerir ve Next.js'in ortam değişkeni genişletmesi (dotenv-expand)
> bunu `$VAR` biçiminde bir değişken referansı sanıp sessizce bozar — hem
> `.env.local` dosyasında hem de process ortamına doğrudan verilen
> değişkenlerde. Base64 kodlama bu sınıf hatayı tamamen ortadan kaldırır.
> `scripts/hash-password.ts` çıktıyı doğrudan doğru biçimde üretir.

Başlangıç kişilerini (Yusuf, Yunus, Burak, İsmail) oluşturmak için:

```bash
npm run seed
```

Geliştirme sunucusunu başlatın:

```bash
npm run dev
```

`http://localhost:3000` adresine gidin, `/giris` sayfasından tanımladığınız
e-posta/şifre ile giriş yapın. Demo modunda tüm veriler bu makinedeki
`.data/` klasöründe JSON dosyası olarak saklanır (Git'e eklenmez).

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Production build |
| `npm run start` | Production sunucusu (build sonrası) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript tip kontrolü |
| `npm run test` | Vitest unit/integration testleri |
| `npm run test:watch` | Vitest watch modu |
| `npm run test:e2e` | Playwright e2e testleri (masaüstü + mobil) |
| `npm run seed` | Demo moduna başlangıç kişilerini ekler |
| `npx tsx scripts/hash-password.ts "şifre"` | bcrypt hash (base64) üretir |

## Test Durumu (bu teslimde doğrulanmıştır)

- `npm run lint` → hatasız
- `npm run typecheck` → hatasız
- `npm run test` → **43/43 geçti** (Vitest, bölüştürme/borç motoru/yedek/
  düzenli gider/hatırlatma testleri dahil)
- `npm run test:e2e` → **6/6 geçti** (Desktop Chrome + Mobile Chrome
  viewport'larında giriş, kişi ekleme, gider oluşturma, ödeme kaydetme,
  borçlar sayfası ve yetkisiz erişim yönlendirmesi)
- `npm run build` → başarılı (tüm sayfalar doğru biçimde dinamik render
  olarak işaretli; kimlik doğrulamalı/canlı veri gösteren hiçbir sayfa
  yanlışlıkla statik önbelleğe alınmıyor)

## Supabase'e Bağlanma (Canlı Mod)

1. [supabase.com](https://supabase.com) üzerinde **ayrı, yeni bir proje**
   oluşturun (mevcut ManiCepte/Arilla projelerine dokunmayın).
2. Proje ayarlarından `Project URL`, `anon public key` ve
   `service_role key` değerlerini alın.
3. SQL Editor'den `supabase/migrations/` klasöründeki dosyaları **sırasıyla**
   çalıştırın:
   - `0001_init.sql` — şema + RLS politikaları
   - `0002_functions.sql` — transactional iş kuralı fonksiyonları (ödeme,
     geri ödeme, dönem üretimi)
   - `0003_storage.sql` — `receipts` private storage bucket + politika
   - `0004_backup_restore.sql` — tam yedek geri yükleme fonksiyonu

   (Supabase CLI kuruluysa: `supabase db push` ile de uygulanabilir.)
4. Supabase Auth'tan **tek yönetici kullanıcısını** e-posta/şifre ile
   oluşturun (Authentication → Users → Add user). Herkese açık kayıt akışı
   yoktur, kullanıcı doğrudan panelden oluşturulur.
5. Oluşan kullanıcının `user_id` (UUID) değerini SQL Editor'de şu şekilde
   `admins` tablosuna ekleyin:

   ```sql
   insert into admins (user_id) values ('<auth-user-uuid>');
   ```

6. `.env.local` içine şunları ekleyin:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

   Bu üçü de dolu olduğunda uygulama otomatik olarak Supabase moduna geçer
   (`src/lib/db/index.ts` → `isSupabaseConfigured()`), demo modu devre dışı
   kalır.
7. Dekont/fatura yüklemeleri artık Supabase Storage'daki `receipts` private
   bucket'ına gider; indirme bağlantıları imzalı (signed) URL'dir.

> **Not:** `SupabaseRepository` (`src/lib/db/supabase/repository.ts`) kod
> olarak tamdır ve demo repository ile aynı iş kurallarını izler, ancak bu
> ortamda gerçek bir Supabase projesi bulunmadığı için **canlıya karşı test
> edilmemiştir**. Gerçek bağlantıdan sonra en azından giriş, gider/ödeme
> akışı ve RLS'in beklendiği gibi çalıştığını manuel doğrulamanız önerilir.

## E-posta Hatırlatmaları

İki mod desteklenir (`NOTIFICATIONS_MODE`):

- `simulated` (varsayılan): ödeme tarihinden 1 gün önce ve gecikmede
  "e-posta" üretilir ama gerçekten gönderilmez, sadece `notification_log`
  tablosuna/dosyasına kaydedilir. `/ayarlar` sayfasından manuel tetikleyip
  simüle edilen e-postaları görebilirsiniz.
- `resend`: `src/lib/services/notifications.ts` içindeki `sendRealEmail`,
  Resend'in REST API'sine (`https://api.resend.com/emails`) doğrudan
  `fetch` ile gönderim yapar (ek SDK bağımlılığı yok). `EMAIL_API_KEY`
  (Resend API key) ve `EMAIL_FROM` (Resend'de doğrulanmış gönderici
  adresi) doldurulmalıdır. Gönderim başarısız olursa `notification_log`'a
  yazılmaz (sahte "gönderildi" durumu oluşmaz) — bir sonraki tarama aynı
  gün içinde tekrar deneyebilir.

Aynı gider + tür + gün için tekrar gönderimi `notification_log` üzerindeki
`unique(expense_id, type, date_key)` kısıtı önler.

`vercel.json` içindeki cron tanımı (`/api/cron/hatirlatmalar`, her gün
04:00 UTC = 07:00 Europe/Istanbul — Türkiye 2016'dan beri yaz saati
uygulamadığı için bu fark sabittir) zaten hazırdır; Vercel'e deploy
edildiğinde otomatik çalışır. `CRON_SECRET` ortam değişkeni **zorunludur**;
tanımlı değilse endpoint 500 döner ve güvenli biçimde kapalı kalır
(fail-closed), asla korumasız açık bırakılmaz.

## Mimari Özeti

Ayrıntılı mimari ve iş kuralları için **`CLAUDE.md`** dosyasına bakın.

## PWA / iPhone Ana Ekrana Ekleme

Uygulama `app/manifest.ts` ile PWA manifest'i, `app/icon.tsx` ve
`app/apple-icon.tsx` ile ikonları otomatik üretir. iPhone Safari'de
paylaş menüsünden "Ana Ekrana Ekle" ile kurulabilir. **Hassas finansal veri
bilerek çevrimdışı cache'e alınmaz** — bir service worker/offline veri
önbelleği yoktur; bu, görevin gereksinimine uygun bilinçli bir tasarım
kararıdır.

## Yapılması Gereken Manuel Adımlar (teslim sonrası)

- Gerçek kullanım için `.env.local`'deki `SESSION_SECRET` ve
  `DEMO_ADMIN_PASSWORD_HASH_B64` değerlerini kendi güçlü değerlerinizle
  değiştirin.
- Gerçek Supabase projesi + gerçek e-posta servisi bağlanana kadar
  uygulama demo modunda, e-posta gönderimi simülasyon modunda kalır.
- Vercel'e yayın / GitHub deposu oluşturma bilerek yapılmamıştır (görev
  kapsamı dışında); `vercel.json` ve migration'lar ileride yayın için hazır
  bırakılmıştır.
