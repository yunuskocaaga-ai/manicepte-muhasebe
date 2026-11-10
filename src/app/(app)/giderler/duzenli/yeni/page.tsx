import { getRepository } from "@/lib/db";
import { currentMonthKey } from "@/lib/domain/period";
import { Card, PageTitle, inputClass, labelClass, buttonPrimary } from "@/components/ui";
import { createRecurringAction } from "../actions";

export default async function YeniDuzenliGiderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const repo = getRepository();
  const persons = await repo.persons.list(false);

  return (
    <div>
      <PageTitle title="Yeni Düzenli Gider" subtitle="Her ay otomatik oluşacak gider şablonu" />

      <Card>
        <form action={createRecurringAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Gider Adı</label>
              <input name="name" required className={inputClass} placeholder="örn. Kira" />
            </div>
            <div>
              <label className={labelClass}>Tutar (TL)</label>
              <input name="amount" required className={inputClass} placeholder="10000,00" />
            </div>
            <div>
              <label className={labelClass}>Ödeme Günü (1-31)</label>
              <input type="number" name="dueDay" min={1} max={31} defaultValue={5} required className={inputClass} />
              <p className="mt-1 text-xs text-slate-400">Kısa aylarda otomatik olarak ayın son gününe sabitlenir.</p>
            </div>
            <div>
              <label className={labelClass}>Başlangıç Ayı</label>
              <input name="startMonth" required defaultValue={currentMonthKey()} className={inputClass} placeholder="2026-11" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Bölüştürme Modu</label>
            <select name="splitMode" className={inputClass} defaultValue="equal">
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
                    id={`participant_${p.id}`}
                    name={`participant_${p.id}`}
                    defaultChecked={p.isActive}
                    className="h-4 w-4"
                  />
                  <label htmlFor={`participant_${p.id}`} className="w-28 text-sm text-slate-700">
                    {p.name}
                  </label>
                  <input
                    name={`share_${p.id}`}
                    placeholder="Özel Tutar/Yüzde modunda kullanılır"
                    className={`${inputClass} flex-1`}
                  />
                </div>
              ))}
            </div>
          </div>

          {params.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}

          <button type="submit" className={buttonPrimary}>
            Düzenli Gideri Kaydet
          </button>
        </form>
      </Card>
    </div>
  );
}
