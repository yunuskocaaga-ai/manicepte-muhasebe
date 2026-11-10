import Link from "next/link";
import { getRepository } from "@/lib/db";
import { ensureCurrentPeriodsGenerated } from "@/lib/services/recurring-runner";
import { computeMonthSummary, computeDebtSummary } from "@/lib/services/reports";
import { currentMonthKey } from "@/lib/domain/period";
import { formatKurusAsTl } from "@/lib/domain/money";
import { Card, StatCard, Badge, PageTitle, EmptyState } from "@/components/ui";

export default async function GenelBakisPage() {
  const repo = getRepository();
  await ensureCurrentPeriodsGenerated(repo);

  const month = currentMonthKey();
  const [summary, debtSummary, persons] = await Promise.all([
    computeMonthSummary(repo, month),
    computeDebtSummary(repo),
    repo.persons.list(),
  ]);

  const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? "?";

  return (
    <div>
      <PageTitle title="Genel Bakış" subtitle={`${month} ayı özeti`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Toplam Gider" value={formatKurusAsTl(summary.totalKurus)} />
        <StatCard label="Ödenen" value={formatKurusAsTl(summary.paidKurus)} tone="good" />
        <StatCard label="Bekleyen" value={formatKurusAsTl(summary.pendingKurus)} tone="warn" />
        <StatCard label="Gider Sayısı" value={String(summary.expenseCount)} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Geciken Ödemeler</h2>
          {summary.overdue.length === 0 ? (
            <EmptyState text="Geciken ödeme yok." />
          ) : (
            <ul className="space-y-2">
              {summary.overdue.map((s) => (
                <li key={s.expense.id}>
                  <Link
                    href={`/giderler/${s.expense.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                  >
                    <span className="text-sm text-slate-800">{s.expense.name}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone="bad">Gecikti</Badge>
                      <span className="text-sm text-slate-600">{formatKurusAsTl(s.remainingKurus)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Yaklaşan Ödemeler</h2>
          {summary.upcoming.length === 0 ? (
            <EmptyState text="Yaklaşan ödeme yok." />
          ) : (
            <ul className="space-y-2">
              {summary.upcoming.map((s) => (
                <li key={s.expense.id}>
                  <Link
                    href={`/giderler/${s.expense.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                  >
                    <span className="text-sm text-slate-800">{s.expense.name}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone="warn">{s.dueDate.toLocaleDateString("tr-TR")}</Badge>
                      <span className="text-sm text-slate-600">{formatKurusAsTl(s.remainingKurus)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Kişiler Arası Net Borçlar</h2>
          <Link href="/borclar" className="text-xs text-slate-500 hover:text-slate-900">
            Tüm borçları gör →
          </Link>
        </div>
        {debtSummary.net.length === 0 ? (
          <EmptyState text="Açık borç yok." />
        ) : (
          <ul className="space-y-2">
            {debtSummary.net.map((n, i) => {
              const amount = Math.abs(n.netAmountKurusAtoB);
              const debtor = n.netAmountKurusAtoB > 0 ? n.personA : n.personB;
              const creditor = n.netAmountKurusAtoB > 0 ? n.personB : n.personA;
              return (
                <li key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  <span className="text-sm text-slate-800">
                    {personName(debtor)} → {personName(creditor)}
                  </span>
                  <span className="text-sm font-medium text-slate-900">{formatKurusAsTl(amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/giderler" className="text-sm font-medium text-slate-700 underline">
          Tüm ayları ve giderleri görüntüle
        </Link>
        <Link href="/raporlar" className="text-sm font-medium text-slate-700 underline">
          Detaylı raporlar
        </Link>
      </div>
    </div>
  );
}
