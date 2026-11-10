import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db";
import { computeShareBalances } from "@/lib/domain/debt-engine";
import { formatKurusAsTl } from "@/lib/domain/money";
import { dueDateForMonth } from "@/lib/domain/period";
import { Card, PageTitle, Badge, buttonPrimary, buttonSecondary, buttonDanger, inputClass, labelClass } from "@/components/ui";
import {
  addPaymentAction,
  cancelPaymentAction,
  updateExpenseAction,
  deleteExpenseAction,
  uploadDocumentAction,
  deleteDocumentAction,
} from "./actions";

export default async function GiderDetayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const repo = getRepository();

  const [expense, persons, shares, payments, documents, auditEntries] = await Promise.all([
    repo.expenses.get(id),
    repo.persons.list(false),
    repo.expenses.getShares(id),
    repo.payments.listByExpense(id),
    repo.documents.listByOwner("expense", id),
    repo.auditLog.listByEntity("expense", id),
  ]);

  if (!expense) notFound();

  const balances = computeShareBalances(shares, payments);
  const personName = (pid: string) => persons.find((p) => p.id === pid)?.name ?? "?";
  const dueDate = dueDateForMonth(expense.month, expense.dueDay);
  const fullyPaid = balances.every((b) => b.status === "paid");

  return (
    <div>
      <PageTitle title={expense.name} subtitle={`${expense.month} · Ödeme günü: ${dueDate.toLocaleDateString("tr-TR")}`} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={fullyPaid ? "good" : "warn"}>{fullyPaid ? "Ödendi" : "Ödenmedi"}</Badge>
        <span className="text-lg font-semibold text-slate-900">{formatKurusAsTl(expense.amountKurus)}</span>
        {expense.recurringExpenseId && <Badge>Düzenli Gider Dönemi</Badge>}
      </div>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Kişi Payları ve Ödeme Durumu</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Kişi</th>
                <th className="py-1">Pay</th>
                <th className="py-1">Ödenen</th>
                <th className="py-1">Kalan</th>
                <th className="py-1">Durum</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.personId} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{personName(b.personId)}</td>
                  <td className="py-2">{formatKurusAsTl(b.shareKurus)}</td>
                  <td className="py-2">{formatKurusAsTl(b.paidKurus)}</td>
                  <td className="py-2">{formatKurusAsTl(b.remainingKurus)}</td>
                  <td className="py-2">
                    <Badge tone={b.status === "paid" ? "good" : "warn"}>
                      {b.status === "paid" ? "Ödendi" : "Ödenmedi"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Ödeme Ekle</h2>
        <form action={addPaymentAction} className="space-y-3">
          <input type="hidden" name="expenseId" value={expense.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="payerPersonId" className={labelClass}>Ödeyen</label>
              <select id="payerPersonId" name="payerPersonId" required className={inputClass}>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="paidAt" className={labelClass}>Ödeme Tarihi</label>
              <input id="paidAt" type="date" name="paidAt" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Kimin Adına Ödeniyor (birden fazla seçilebilir)</label>
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              {balances
                .filter((b) => b.status === "unpaid")
                .map((b) => (
                  <div key={b.personId} className="flex items-center gap-3">
                    <input type="checkbox" id={`beneficiary_${b.personId}`} name={`beneficiary_${b.personId}`} className="h-4 w-4" />
                    <label htmlFor={`beneficiary_${b.personId}`} className="w-28 text-sm text-slate-700">
                      {personName(b.personId)}
                    </label>
                    <input
                      name={`amount_${b.personId}`}
                      placeholder={`Boş = kalan tam tutar (${formatKurusAsTl(b.remainingKurus)})`}
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                ))}
              {balances.every((b) => b.status === "paid") && (
                <p className="text-sm text-slate-500">Tüm paylar ödendi.</p>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>Not (opsiyonel)</label>
            <input name="note" className={inputClass} />
          </div>

          <button type="submit" className={buttonPrimary}>
            Ödemeyi Kaydet
          </button>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Ödeme Geçmişi</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz ödeme kaydedilmedi.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <strong>{personName(p.payerPersonId)}</strong> → {personName(p.beneficiaryPersonId)} ·{" "}
                  {formatKurusAsTl(p.amountKurus)} · {new Date(p.paidAt).toLocaleDateString("tr-TR")}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <form action={cancelPaymentAction}>
                  <input type="hidden" name="expenseId" value={expense.id} />
                  <input type="hidden" name="paymentId" value={p.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    İptal Et
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Dekont / Belgeler</h2>
        <form action={uploadDocumentAction} className="mb-3 flex items-center gap-2">
          <input type="hidden" name="expenseId" value={expense.id} />
          <input type="file" name="file" accept="image/*,application/pdf" required className="text-sm" />
          <button type="submit" className={buttonSecondary}>
            Yükle
          </button>
        </form>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">Belge yok.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between text-sm">
                <a href={`/api/belgeler/${doc.id}`} target="_blank" className="text-slate-700 underline">
                  {doc.fileName}
                </a>
                <form action={deleteDocumentAction}>
                  <input type="hidden" name="expenseId" value={expense.id} />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Sil
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Gideri Düzenle</h2>
        <form action={updateExpenseAction} className="space-y-3">
          <input type="hidden" name="id" value={expense.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={labelClass}>Gider Adı</label>
              <input name="name" defaultValue={expense.name} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tutar (TL)</label>
              <input name="amount" defaultValue={(expense.amountKurus / 100).toFixed(2)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Ödeme Günü</label>
              <input type="number" name="dueDay" min={1} max={31} defaultValue={expense.dueDay} required className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Açıklama</label>
            <textarea name="description" defaultValue={expense.description ?? ""} className={inputClass} rows={2} />
          </div>
          <div>
            <label className={labelClass}>Bölüştürme Modu</label>
            <select name="splitMode" defaultValue="equal" className={inputClass}>
              <option value="equal">Eşit Bölüştür</option>
              <option value="custom_amount">Özel Tutar (TL)</option>
              <option value="percentage">Yüzde (%)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Katılımcılar</label>
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              {persons.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`edit_participant_${p.id}`}
                    name={`participant_${p.id}`}
                    defaultChecked={shares.some((s) => s.personId === p.id)}
                    className="h-4 w-4"
                  />
                  <label htmlFor={`edit_participant_${p.id}`} className="w-28 text-sm text-slate-700">
                    {p.name}
                  </label>
                  <input name={`share_${p.id}`} placeholder="Özel Tutar/Yüzde modunda kullanılır" className={`${inputClass} flex-1`} />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Tutar/pay değişikliği geçmiş ödemeleri silmez; yalnızca paylar ve bekleyen bakiyeler yeniden hesaplanır.
            </p>
          </div>
          <button type="submit" className={buttonPrimary}>
            Değişiklikleri Kaydet
          </button>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Değişiklik Geçmişi</h2>
        {auditEntries.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz kayıtlı değişiklik yok.</p>
        ) : (
          <ul className="space-y-2 text-xs text-slate-500">
            {auditEntries.map((a) => (
              <li key={a.id} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                <span className="font-medium text-slate-700">
                  {{ create: "Oluşturuldu", update: "Güncellendi", delete: "Silindi", restore: "Geri Yüklendi" }[a.action]}
                </span>{" "}
                · {new Date(a.createdAt).toLocaleString("tr-TR")}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form action={deleteExpenseAction}>
        <input type="hidden" name="id" value={expense.id} />
        <button type="submit" className={buttonDanger}>
          Gideri Çöp Kutusuna Taşı
        </button>
      </form>
    </div>
  );
}
