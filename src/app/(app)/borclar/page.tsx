import Link from "next/link";
import { getRepository } from "@/lib/db";
import { netBalances } from "@/lib/domain/debt-engine";
import { formatKurusAsTl } from "@/lib/domain/money";
import { Card, PageTitle, Badge, EmptyState, buttonPrimary, inputClass, labelClass } from "@/components/ui";
import { createManualDebtAction, addRepaymentAction, cancelRepaymentAction } from "./actions";

const SOURCE_LABEL: Record<string, string> = {
  expense_payment: "Gider ödemesi",
  manual: "Manuel",
  opening_balance: "Başlangıç bakiyesi",
};

export default async function BorclarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const repo = getRepository();
  const [debts, persons] = await Promise.all([repo.debts.list(), repo.persons.list(false)]);
  const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? "?";

  const debtDetails = await Promise.all(
    debts.map(async (d) => {
      const repayments = await repo.debts.listRepayments(d.id);
      const repaidKurus = repayments.reduce((a, r) => a + r.amountKurus, 0);
      const remainingKurus = Math.max(0, d.amountKurus - repaidKurus);
      return { debt: d, repayments, repaidKurus, remainingKurus };
    }),
  );

  const net = netBalances(
    debtDetails.map((d) => ({
      id: d.debt.id,
      debtorPersonId: d.debt.debtorPersonId,
      creditorPersonId: d.debt.creditorPersonId,
      amountKurus: d.debt.amountKurus,
      remainingKurus: d.remainingKurus,
    })),
  );

  return (
    <div>
      <PageTitle title="Borçlar" subtitle="Kişiler arası borç ve geri ödeme takibi" />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Net Bakiyeler (mahsuplaştırılmış)</h2>
        {net.length === 0 ? (
          <EmptyState text="Açık borç yok." />
        ) : (
          <ul className="space-y-2">
            {net.map((n, i) => {
              const amount = Math.abs(n.netAmountKurusAtoB);
              const debtor = n.netAmountKurusAtoB > 0 ? n.personA : n.personB;
              const creditor = n.netAmountKurusAtoB > 0 ? n.personB : n.personA;
              return (
                <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-sm text-slate-800">
                    {personName(debtor)} → {personName(creditor)}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{formatKurusAsTl(amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Manuel Borç / Başlangıç Bakiyesi Ekle</h2>
        <form action={createManualDebtAction} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>Borçlu</label>
            <select name="debtorPersonId" required className={inputClass}>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Alacaklı</label>
            <select name="creditorPersonId" required className={inputClass}>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Tutar (TL)</label>
            <input name="amount" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Kaynak</label>
            <select name="source" defaultValue="manual" className={inputClass}>
              <option value="manual">Manuel Borç</option>
              <option value="opening_balance">Başlangıç Bakiyesi</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Açıklama (opsiyonel)</label>
            <input name="description" className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className={buttonPrimary}>
              Borcu Ekle
            </button>
          </div>
        </form>
      </Card>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Gider Bazında Tüm Borçlar</h2>
      {debtDetails.length === 0 ? (
        <EmptyState text="Henüz borç kaydı yok." />
      ) : (
        <ul className="space-y-3">
          {debtDetails.map(({ debt, repayments, repaidKurus, remainingKurus }) => (
            <li key={debt.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {personName(debt.debtorPersonId)} → {personName(debt.creditorPersonId)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {SOURCE_LABEL[debt.source]}
                      {debt.sourceExpenseId && (
                        <>
                          {" · "}
                          <Link href={`/giderler/${debt.sourceExpenseId}`} className="underline">
                            {debt.description ?? "gider"}
                          </Link>
                        </>
                      )}
                      {debt.sourceMonth ? ` · ${debt.sourceMonth}` : ""}
                    </p>
                  </div>
                  <Badge tone={remainingKurus === 0 ? "good" : "warn"}>
                    {remainingKurus === 0 ? "Ödendi" : "Ödenmedi"}
                  </Badge>
                </div>

                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span>Toplam: {formatKurusAsTl(debt.amountKurus)}</span>
                  <span>Geri ödenen: {formatKurusAsTl(repaidKurus)}</span>
                  <span>Kalan: {formatKurusAsTl(remainingKurus)}</span>
                </div>

                {repayments.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                    {repayments.map((r) => (
                      <li key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {new Date(r.paidAt).toLocaleDateString("tr-TR")} · {formatKurusAsTl(r.amountKurus)}
                          {r.description ? ` · ${r.description}` : ""}
                        </span>
                        <form action={cancelRepaymentAction}>
                          <input type="hidden" name="repaymentId" value={r.id} />
                          <button type="submit" className="text-red-600 hover:underline">
                            İptal
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                {remainingKurus > 0 && (
                  <form action={addRepaymentAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="debtId" value={debt.id} />
                    <input name="amount" placeholder="Tutar (TL)" required className={`${inputClass} w-32`} />
                    <input type="date" name="paidAt" defaultValue={new Date().toISOString().slice(0, 10)} className={`${inputClass} w-40`} />
                    <input name="description" placeholder="Açıklama" className={`${inputClass} w-40`} />
                    <button type="submit" className={buttonPrimary}>
                      Kısmi Geri Ödeme Ekle
                    </button>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
