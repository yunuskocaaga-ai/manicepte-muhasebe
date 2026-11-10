import type { Repository } from "@/lib/db/repository";
import { computeMonthSummary } from "./reports";
import { currentMonthKey, previousMonthKey } from "@/lib/domain/period";
import { istanbulDateKey, istanbulMidnightUtc, nowInIstanbul } from "@/lib/domain/timezone";

export interface SimulatedEmail {
  to: string;
  subject: string;
  body: string;
}

export interface ReminderSweepResult {
  sent: SimulatedEmail[];
  skippedAlreadySent: number;
  failed: { to: string; subject: string; error: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * NOTIFICATIONS_MODE=resend olduğunda Resend REST API'sine doğrudan fetch
 * ile gönderim yapar (ek bir SDK bağımlılığı eklemeden). simulated modda
 * hiçbir ağ çağrısı yapılmaz. Gönderim başarısız olursa hata fırlatır —
 * sessizce yutup "gönderildi" gibi davranmaz; çağıran taraf notification_log
 * kaydını yalnızca gerçekten gönderim başarılıysa simulated=false yazar.
 */
async function sendRealEmail(email: SimulatedEmail): Promise<void> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("NOTIFICATIONS_MODE=resend için EMAIL_API_KEY ve EMAIL_FROM tanımlı olmalı");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      text: email.body,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend gönderimi başarısız (${res.status}): ${detail}`);
  }
}

/**
 * Ödenmemiş giderler için ödeme tarihinden 1 gün önce ve gecikmede e-posta
 * hatırlatması üretir (simülasyon modunda gerçek gönderim yapılmaz, sadece
 * notification_log'a kaydedilir ve dönen listede gösterilir). Aynı gider +
 * tür + gün için tekrar gönderim notification_log üzerindeki unique kısıt
 * sayesinde önlenir.
 */
export async function runReminderSweep(repo: Repository, now: Date = new Date()): Promise<ReminderSweepResult> {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "yonetici@manicepte.local";
  const isReal = process.env.NOTIFICATIONS_MODE === "resend";
  const localNow = nowInIstanbul(now);
  const todayUtc = istanbulMidnightUtc(localNow);
  const todayKey = istanbulDateKey(now);
  const tomorrowUtc = new Date(todayUtc.getTime() + DAY_MS);

  const months = [previousMonthKey(currentMonthKey(now)), currentMonthKey(now)];
  const sent: SimulatedEmail[] = [];
  const failed: ReminderSweepResult["failed"] = [];
  let skipped = 0;

  for (const month of months) {
    const summary = await computeMonthSummary(repo, month);
    for (const status of [...summary.upcoming, ...summary.overdue]) {
      // dueDate sunucunun yerel saat dilimiyle oluşturulur (Vercel'de UTC);
      // Istanbul gece yarısına denk gelen gerçek UTC anına çevrilmeden
      // tomorrowUtc ile karşılaştırılırsa sunucu Istanbul'da değilken hiçbir
      // zaman eşleşmez ve "yarın ödeme günü" hatırlatması asla tetiklenmez.
      const dueUtc = istanbulMidnightUtc(status.dueDate);
      const isTomorrow = dueUtc.getTime() === tomorrowUtc.getTime();
      const isOverdue = status.isOverdue;
      const type = isOverdue ? "overdue" : isTomorrow ? "before_due" : null;
      if (!type) continue;

      const already = await repo.notifications.hasBeenSent(status.expense.id, type, todayKey);
      if (already) {
        skipped++;
        continue;
      }

      const email: SimulatedEmail =
        type === "before_due"
          ? {
              to: adminEmail,
              subject: `[ManiCepte] Yarın ödeme günü: ${status.expense.name}`,
              body: `${status.expense.name} (${status.expense.month}) giderinin ödeme günü yarın. Kalan: ${(
                status.remainingKurus / 100
              ).toFixed(2)} TL.`,
            }
          : {
              to: adminEmail,
              subject: `[ManiCepte] Gecikmiş ödeme: ${status.expense.name}`,
              body: `${status.expense.name} (${status.expense.month}) giderinin ödeme günü geçti ve hâlâ ${(
                status.remainingKurus / 100
              ).toFixed(2)} TL ödenmedi.`,
            };

      if (isReal) {
        try {
          await sendRealEmail(email);
        } catch (err) {
          // Gönderim başarısızsa notification_log'a yazılmaz; bir sonraki
          // taramada (aynı gün içinde) tekrar denenebilir — sessizce
          // "gönderildi" gibi raporlanmaz.
          failed.push({ to: email.to, subject: email.subject, error: (err as Error).message });
          continue;
        }
      }

      await repo.notifications.record({
        expenseId: status.expense.id,
        type,
        dateKey: todayKey,
        simulated: !isReal,
      });
      sent.push(email);
    }
  }

  return { sent, skippedAlreadySent: skipped, failed };
}
