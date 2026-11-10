import { getRepository } from "@/lib/db";
import { computeMonthSummary, compareMonths, computeCollectionsForMonth } from "@/lib/services/reports";
import { currentMonthKey, previousMonthKey } from "@/lib/domain/period";
import { formatKurusAsTl } from "@/lib/domain/money";
import { Card, PageTitle, StatCard, Badge, inputClass, buttonSecondary } from "@/components/ui";

function lastMonths(n: number, from = currentMonthKey()): string[] {
  const months = [from];
  for (let i = 1; i < n; i++) months.unshift(previousMonthKey(months[0]));
  return months;
}

export default async function RaporlarPage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const { ay } = await searchParams;
  const month = ay || currentMonthKey();
  const repo = getRepository();
  const persons = await repo.persons.list(false);
  const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? "?";

  const [summary, comparison, collections] = await Promise.all([
    computeMonthSummary(repo, month),
    compareMonths(repo, lastMonths(6, month)),
    computeCollectionsForMonth(repo, month),
  ]);

  return (
    <div>
      <PageTitle title="Raporlar" subtitle="Aylık gider, borç ve tahsilat raporları" />

      <Card className="mb-4">
        <form method="get" className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ay</label>
            <input name="ay" defaultValue={month} placeholder="YYYY-MM" className={inputClass} />
          </div>
          <button type="submit" className={buttonSecondary}>
            Raporu Getir
          </button>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Toplam Gider" value={formatKurusAsTl(summary.totalKurus)} />
        <StatCard label="Ödenen" value={formatKurusAsTl(summary.paidKurus)} tone="good" />
        <StatCard label="Bekleyen" value={formatKurusAsTl(summary.pendingKurus)} tone="warn" />
        <StatCard label="Gider Sayısı" value={String(summary.expenseCount)} />
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Tahsilat ({month})</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Yapılan Ödemeler" value={formatKurusAsTl(collections.paymentsTotalKurus)} />
          <StatCard label="Borç Geri Ödemeleri" value={formatKurusAsTl(collections.repaymentsTotalKurus)} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Gider Detayı</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Gider</th>
                <th className="py-1">Tutar</th>
                <th className="py-1">Ödenen</th>
                <th className="py-1">Kalan</th>
                <th className="py-1">Durum</th>
              </tr>
            </thead>
            <tbody>
              {summary.statuses.map((s) => (
                <tr key={s.expense.id} className="border-t border-slate-100">
                  <td className="py-2">{s.expense.name}</td>
                  <td className="py-2">{formatKurusAsTl(s.totalKurus)}</td>
                  <td className="py-2">{formatKurusAsTl(s.paidKurus)}</td>
                  <td className="py-2">{formatKurusAsTl(s.remainingKurus)}</td>
                  <td className="py-2">
                    <Badge tone={s.fullyPaid ? "good" : s.isOverdue ? "bad" : "warn"}>
                      {s.fullyPaid ? "Ödendi" : s.isOverdue ? "Gecikti" : "Bekliyor"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Son 6 Ay Karşılaştırması</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Ay</th>
                <th className="py-1">Toplam</th>
                <th className="py-1">Ödenen</th>
                <th className="py-1">Bekleyen</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.month} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{row.month}</td>
                  <td className="py-2">{formatKurusAsTl(row.totalKurus)}</td>
                  <td className="py-2">{formatKurusAsTl(row.paidKurus)}</td>
                  <td className="py-2">{formatKurusAsTl(row.pendingKurus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Kişi bazlı kırılım için <strong>Borçlar</strong> sayfasındaki net bakiyeleri inceleyebilirsiniz.
        {persons.length === 0 ? "" : ` Kişiler: ${persons.map((p) => personName(p.id)).join(", ")}`}
      </p>
    </div>
  );
}
