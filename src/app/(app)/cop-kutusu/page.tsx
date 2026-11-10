import { getRepository } from "@/lib/db";
import { Card, PageTitle, EmptyState, Badge, buttonSecondary } from "@/components/ui";
import { restoreTrashItemAction } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  expense: "Gider",
  recurring_expense: "Düzenli Gider",
  debt: "Borç",
  document: "Belge",
  person: "Kişi",
};

export default async function CopKutusuPage() {
  const repo = getRepository();
  const items = await repo.trash.list();

  return (
    <div>
      <PageTitle title="Çöp Kutusu" subtitle="Silinen kayıtları görüntüle ve geri yükle" />
      {items.length === 0 ? (
        <EmptyState text="Çöp kutusu boş." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.entityType}-${item.entityId}`}>
              <Card className="flex items-center justify-between gap-2">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Badge>{TYPE_LABEL[item.entityType] ?? item.entityType}</Badge>
                    <span className="text-sm font-medium text-slate-900">{item.label}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Silinme: {new Date(item.deletedAt).toLocaleString("tr-TR")}
                  </p>
                </div>
                <form action={restoreTrashItemAction}>
                  <input type="hidden" name="entityType" value={item.entityType} />
                  <input type="hidden" name="entityId" value={item.entityId} />
                  <button type="submit" className={buttonSecondary}>
                    Geri Yükle
                  </button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
