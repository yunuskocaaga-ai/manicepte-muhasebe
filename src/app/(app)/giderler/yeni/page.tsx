import { getRepository } from "@/lib/db";
import { currentMonthKey } from "@/lib/domain/period";
import { Card, PageTitle, inputClass, labelClass, buttonPrimary } from "@/components/ui";
import { createExpenseAction } from "../actions";

export default async function YeniGiderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const repo = getRepository();
  const persons = await repo.persons.list(false);

  return (
    <div>
      <PageTitle title="Yeni Gider" subtitle="Manuel, tek seferlik veya geçmiş tarihli gider ekleyin" />

      <Card>
        <form action={createExpenseAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelClass}>Gider Adı</label>
              <input id="name" name="name" required className={inputClass} placeholder="örn. ChatGPT" />
            </div>
            <div>
              <label htmlFor="amount" className={labelClass}>Tutar (TL)</label>
              <input id="amount" name="amount" required className={inputClass} placeholder="800,00" />
            </div>
            <div>
              <label htmlFor="month" className={labelClass}>Ait Olduğu Ay</label>
              <input id="month" name="month" required defaultValue={currentMonthKey()} className={inputClass} placeholder="2026-11" />
            </div>
            <div>
              <label htmlFor="dueDay" className={labelClass}>Ödeme Günü</label>
              <input id="dueDay" type="number" name="dueDay" min={1} max={31} defaultValue={15} required className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="description" className={labelClass}>Açıklama (opsiyonel)</label>
            <textarea id="description" name="description" className={inputClass} rows={2} />
          </div>

          <div>
            <label htmlFor="splitMode" className={labelClass}>Bölüştürme Modu</label>
            <select id="splitMode" name="splitMode" className={inputClass} defaultValue="equal">
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
            <p className="mt-1 text-xs text-slate-400">
              Eşit bölüştürmede alt alandaki değerler kullanılmaz. Özel Tutar modunda TL, Yüzde modunda % girin
              (toplamları tutara/100&apos;e eşit olmalı).
            </p>
          </div>

          {params.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}

          <button type="submit" className={buttonPrimary}>
            Gideri Kaydet
          </button>
        </form>
      </Card>
    </div>
  );
}
