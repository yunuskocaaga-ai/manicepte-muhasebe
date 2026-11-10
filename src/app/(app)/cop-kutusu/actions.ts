"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/db";
import type { TrashEntry } from "@/lib/db/repository";

export async function restoreTrashItemAction(formData: FormData): Promise<void> {
  const entityType = String(formData.get("entityType") ?? "") as TrashEntry["entityType"];
  const entityId = String(formData.get("entityId") ?? "");
  if (!entityType || !entityId) return;
  const repo = getRepository();
  await repo.trash.restore(entityType, entityId);
  revalidatePath("/cop-kutusu");
}
