import type { Repository } from "@/lib/db/repository";
import { currentMonthKey } from "@/lib/domain/period";

/**
 * Aktif tüm düzenli giderler için güncel ayın dönemini üretir. İdempotenttir
 * (repository.generatePeriod zaten var olan dönemi tekrar oluşturmaz), bu
 * yüzden her sayfa yüklemesinde güvenle çağrılabilir.
 */
export async function ensureCurrentPeriodsGenerated(repo: Repository, now: Date = new Date()): Promise<void> {
  const month = currentMonthKey(now);
  const recurring = await repo.recurringExpenses.list(false);
  for (const r of recurring.filter((x) => x.status === "active")) {
    await repo.recurringExpenses.generatePeriod(r.id, month);
  }
}
