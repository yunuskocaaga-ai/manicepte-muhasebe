import Link from "next/link";
import { getRepository } from "@/lib/db";
import { formatKurusAsTl } from "@/lib/domain/money";
import { Card, PageTitle, Badge, EmptyState, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";
import { updateRecurringStatusAction, updateRecurringAmountAction } from "./actions";

const STATUS_LABEL: Record<string, string> = { active: "Aktif", paused: "Duraklatıldı", ended: "Sonlandı" };
const STATUS_TONE: Record<string, "good" | "warn" | "default"> = { active: "good", paused: "warn", ended: "default" };

export default async function DuzenliGiderlerPage() {
  const repo = getRepository();
  const [recurring, persons] = await Promise.all([repo.recurringExpenses.list(), repo.persons.list()]);
  const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? "?";

  return (
    <div>
      <PageTitle title="Düzenli Giderler" subtitle="Her ay otomatik oluşan gider şablonları" />

      <div className="mb-4">
        <Link href="/giderler/duzenli/yeni" className={buttonPrimary}>
          + Yeni Düzenli Gider
        </Link>
      </div>

      {recurring.length === 0 ? (
        <EmptyState text="Henüz düzenli gider tanımlanmadı." />
      ) : (
        <ul className="space-y-3">
          {recurring.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      Ödeme günü: {r.dueDay} · {r.splitConfig.map((s) => personName(s.personId)).join(", ")}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={updateRecurringAmountAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="amount"
                      defaultValue={(r.amountKurus / 100).toFixed(2)}
                      className={`${inputClass} w-28`}
                    />
                    <button type="submit" className={buttonSecondary}>
                      Tutarı Güncelle
                    </button>
                  </form>
                  <p className="text-xs text-slate-400">(sadece gelecek dönemleri etkiler)</p>
                </div>

                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Güncel tutar: {formatKurusAsTl(r.amountKurus)}</span>
                  <div className="ml-auto flex gap-1">
                    {r.status !== "active" && (
                      <form action={updateRecurringStatusAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="active" />
                        <button type="submit" className={buttonSecondary}>
                          Etkinleştir
                        </button>
                      </form>
                    )}
                    {r.status === "active" && (
                      <form action={updateRecurringStatusAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="paused" />
                        <button type="submit" className={buttonSecondary}>
                          Duraklat
                        </button>
                      </form>
                    )}
                    {r.status !== "ended" && (
                      <form action={updateRecurringStatusAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="ended" />
                        <button type="submit" className={buttonSecondary}>
                          Sonlandır
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
