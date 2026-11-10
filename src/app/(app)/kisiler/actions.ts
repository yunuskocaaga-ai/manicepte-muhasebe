"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/db";

export async function createPersonAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const repo = getRepository();
  await repo.persons.create({ name });
  revalidatePath("/kisiler");
}

export async function renamePersonAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const repo = getRepository();
  await repo.persons.update(id, { name });
  revalidatePath("/kisiler");
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const nextActive = String(formData.get("nextActive")) === "true";
  if (!id) return;
  const repo = getRepository();
  await repo.persons.update(id, { isActive: nextActive });
  revalidatePath("/kisiler");
}
