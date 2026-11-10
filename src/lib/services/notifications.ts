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
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ödenmemiş giderler için ödeme tarihinden 1 gün önce ve gecikmede e-posta
 * hatırlatması üretir (simülasyon modunda gerçek gönderim yapılmaz, sadece
 * notification_log'a kaydedilir ve dönen listede gösterilir). Aynı gider +
 * tür + gün için tekrar gönderim notification_log üzerindeki unique kısıt
 * sayesinde önlenir.
 */
export async function runReminderSweep(repo: Repository, now: Date = new Date()): Promise<ReminderSweepResult> {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "yonetici@manicepte.local";
  const localNow = nowInIstanbul(now);
  const todayUtc = istanbulMidnightUtc(localNow);
  const todayKey = istanbulDateKey(now);
  const tomorrowUtc = new Date(todayUtc.getTime() + DAY_MS);

  const months = [previousMonthKey(currentMonthKey(now)), currentMonthKey(now)];
  const sent: SimulatedEmail[] = [];
  let skipped = 0;

  for (const month of months) {
    const summary = await computeMonthSummary(repo, month);
    for (const status of [...summary.upcoming, ...summary.overdue]) {
      const dueUtc = new Date(status.dueDate.getFullYear(), status.dueDate.getMonth(), status.dueDate.getDate());
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

      await repo.notifications.record({
        expenseId: status.expense.id,
        type,
        dateKey: todayKey,
        simulated: true,
      });
      sent.push(email);
    }
  }

  return { sent, skippedAlreadySent: skipped };
}
