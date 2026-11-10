import { getRepository, isDemoMode } from "@/lib/db";
import { Card, PageTitle, Badge, buttonPrimary, buttonSecondary } from "@/components/ui";
import { restoreBackupAction, runReminderTestAction } from "./actions";

const ACTION_LABEL: Record<string, string> = {
  create: "Oluşturuldu",
  update: "Güncellendi",
  delete: "Silindi",
  restore: "Geri Yüklendi",
};

export default async function AyarlarPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    restored?: string;
    reminderSent?: string;
    reminderSkipped?: string;
    reminderFailed?: string;
  }>;
}) {
  const params = await searchParams;
  const demo = isDemoMode();
  const repo = getRepository();
  const recentChanges = await repo.auditLog.listRecent(20);
  const notificationsMode = process.env.NOTIFICATIONS_MODE === "resend" ? "resend" : "simulated";

  return (
    <div>
      <PageTitle title="Ayarlar ve Yedekler" />

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Bağlantı Modu</h2>
        <Badge tone={demo ? "warn" : "good"}>{demo ? "Yerel Demo Modu" : "Supabase (Canlı)"}</Badge>
        <p className="mt-2 text-sm text-slate-500">
          {demo
            ? "Supabase ortam değişkenleri tanımlı değil. Tüm veriler bu makinedeki .data/ klasöründe yerel JSON dosyasında saklanıyor."
            : "Uygulama Supabase Postgres veritabanına bağlı."}
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Yedek Al</h2>
        <p className="mb-3 text-sm text-slate-500">
          Tüm finans kayıtlarını, kişi ilişkilerini, değişiklik geçmişini içeren tam bir JSON yedek dosyası indirin.
        </p>
        <a href="/api/yedek/export" className={buttonPrimary}>
          Yedeği İndir
        </a>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Yedekten Geri Yükle</h2>
        <p className="mb-3 text-sm text-amber-700">
          Uyarı: Geri yükleme mevcut tüm verilerin üzerine yazar. Şema sürümü ve bütünlük (checksum) kontrolü
          otomatik yapılır.
        </p>
        <form action={restoreBackupAction} className="flex items-center gap-2">
          <input type="file" name="file" accept="application/json" required className="text-sm" />
          <button type="submit" className={buttonSecondary}>
            Geri Yükle
          </button>
        </form>
        {params.restored && <p className="mt-2 text-sm text-emerald-700">Yedek başarıyla geri yüklendi.</p>}
        {params.error && <p className="mt-2 text-sm text-red-700">{params.error}</p>}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Hatırlatmaları Test Et</h2>
        <p className="mb-3 text-sm text-slate-500">
          {notificationsMode === "resend"
            ? "Ödeme hatırlatma taramasını manuel tetikler ve gerçek e-posta gönderir (Resend). Üretimde bu işlem Vercel Cron ile otomatik çalışır (bkz. vercel.json)."
            : "Simülasyon modunda ödeme hatırlatma taramasını manuel tetikler (gerçek e-posta gönderilmez, sadece kayıt veritabanına eklenir). Üretimde bu işlem Vercel Cron ile otomatik çalışır (bkz. vercel.json)."}
        </p>
        <form action={runReminderTestAction}>
          <button type="submit" className={buttonSecondary}>
            Hatırlatma Taramasını Çalıştır
          </button>
        </form>
        {params.reminderSent !== undefined && (
          <p className="mt-2 text-sm text-slate-600">
            Gönderilen{notificationsMode === "simulated" ? " (simüle)" : ""}: {params.reminderSent} · Zaten
            gönderilmiş (atlanan): {params.reminderSkipped}
            {params.reminderFailed && Number(params.reminderFailed) > 0 && (
              <span className="text-red-700"> · Başarısız: {params.reminderFailed}</span>
            )}
          </p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Son Değişiklikler</h2>
        {recentChanges.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz kayıtlı değişiklik yok.</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-500">
            {recentChanges.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-slate-700">{ACTION_LABEL[a.action] ?? a.action}</span> ·{" "}
                {a.entityType} · {new Date(a.createdAt).toLocaleString("tr-TR")}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
