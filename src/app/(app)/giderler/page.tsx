import Link from "next/link";
import { getRepository } from "@/lib/db";
import { computeExpenseStatus } from "@/lib/services/reports";
import { ensureCurrentPeriodsGenerated } from "@/lib/services/recurring-runner";
import { formatKurusAsTl } from "@/lib/domain/money";
import { currentMonthKey } from "@/lib/domain/period";
import { Card, PageTitle, Badge, EmptyState, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

interface SearchParams {
  ay?: string;
  q?: string;
  durum?: string;
  odeyen?: string;
}

export default async function GiderlerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const repo = getRepository();
  await ensureCurrentPeriodsGenerated(repo);

  const [persons, expenses] = await Promise.all([
    repo.persons.list(),
    repo.expenses.list({
      month: params.ay || undefined,
      query: params.q || undefined,
      paymentStatus: params.durum === "odendi" ? "paid" : params.durum === "odenmedi" ? "unpaid" : undefined,
      payerPersonId: params.odeyen || undefined,
    }),
  ]);

  const statuses = await Promise.all(expenses.map((e) => computeExpenseStatus(repo, e)));

  return (
    <div>
      <PageTitle title="Giderler" subtitle="Tüm giderleri görüntüle, filtrele ve yeni gider ekle" />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/giderler/yeni" className={buttonPrimary}>
          + Yeni Gider
        </Link>
        <Link href="/giderler/duzenli" className={buttonSecondary}>
          Düzenli Giderler
        </Link>
      </div>

      <Card className="mb-4">
        <form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <input name="ay" defaultValue={params.ay} placeholder="YYYY-MM" className={inputClass} />
          <input name="q" defaultValue={params.q} placeholder="Gider adı ara" className={inputClass} />
          <select name="durum" defaultValue={params.durum ?? ""} className={inputClass}>
            <option value="">Tüm durumlar</option>
            <option value="odendi">Ödendi</option>
            <option value="odenmedi">Ödenmedi</option>
          </select>
          <select name="odeyen" defaultValue={params.odeyen ?? ""} className={inputClass}>
            <option value="">Tüm ödeyenler</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonSecondary}>
            Filtrele
          </button>
        </form>
      </Card>

      {statuses.length === 0 ? (
        <EmptyState text="Bu filtrelerle eşleşen gider bulunamadı." />
      ) : (
        <ul className="space-y-2">
          {statuses.map((s) => (
            <li key={s.expense.id}>
              <Link href={`/giderler/${s.expense.id}`} className="block">
                <Card className="flex items-center justify-between gap-3 hover:ring-slate-300">
                  <div>
                    <p className="font-medium text-slate-900">{s.expense.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.expense.month} · Ödeme günü: {s.expense.dueDay}
                      {s.expense.recurringExpenseId ? " · Düzenli" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <Badge tone={s.fullyPaid ? "good" : s.isOverdue ? "bad" : "warn"}>
                      {s.fullyPaid ? "Ödendi" : s.isOverdue ? "Gecikti" : "Ödenmedi"}
                    </Badge>
                    <span className="text-sm font-medium text-slate-900">{formatKurusAsTl(s.totalKurus)}</span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-400">Güncel ay: {currentMonthKey()}</p>
    </div>
  );
}
