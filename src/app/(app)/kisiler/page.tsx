import { getRepository } from "@/lib/db";
import { Card, PageTitle, Badge, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui";
import { createPersonAction, renamePersonAction, toggleActiveAction } from "./actions";

export default async function KisilerPage() {
  const repo = getRepository();
  const persons = await repo.persons.list();

  return (
    <div>
      <PageTitle title="Kişiler" subtitle="Gider ve borç takibindeki kişiler" />

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Yeni Kişi Ekle</h2>
        <form action={createPersonAction} className="flex gap-2">
          <input name="name" required placeholder="Ad Soyad" className={inputClass} />
          <button type="submit" className={buttonPrimary}>
            Ekle
          </button>
        </form>
      </Card>

      <Card>
        <ul className="divide-y divide-slate-100">
          {persons.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{p.name}</span>
                <Badge tone={p.isActive ? "good" : "default"}>{p.isActive ? "Aktif" : "Pasif"}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <form action={renamePersonAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={p.id} />
                  <input name="name" defaultValue={p.name} className={`${inputClass} w-36`} />
                  <button type="submit" className={buttonSecondary}>
                    Kaydet
                  </button>
                </form>
                <form action={toggleActiveAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="nextActive" value={String(!p.isActive)} />
                  <button type="submit" className={buttonSecondary}>
                    {p.isActive ? "Pasifleştir" : "Aktifleştir"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className={`${labelClass} mt-3 text-xs text-slate-400`}>
        Kişiler silinmez, yalnızca pasifleştirilir — geçmiş gider ve borç ilişkileri korunur.
      </p>
    </div>
  );
}
