"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/db";
import { parseTlInput } from "@/lib/domain/money";
import type { RecurringStatus, SplitMode } from "@/lib/domain/types";

export async function createRecurringAction(formData: FormData): Promise<void> {
  const repo = getRepository();
  const persons = await repo.persons.list(false);

  const name = String(formData.get("name") ?? "").trim();
  const amountKurus = parseTlInput(String(formData.get("amount") ?? "0"));
  const dueDay = Number(formData.get("dueDay") ?? 1);
  const startMonth = String(formData.get("startMonth") ?? "");
  const splitMode = String(formData.get("splitMode") ?? "equal") as SplitMode;
  const participantPersonIds = persons.filter((p) => formData.get(`participant_${p.id}`) === "on").map((p) => p.id);

  if (!name || !amountKurus || !startMonth || participantPersonIds.length === 0) {
    redirect("/giderler/duzenli/yeni?error=" + encodeURIComponent("Lütfen tüm alanları doldurun."));
  }

  const shareValues =
    splitMode === "equal"
      ? undefined
      : participantPersonIds.map((id) => {
          const raw = String(formData.get(`share_${id}`) ?? "0").trim();
          const value = splitMode === "percentage" ? Number(raw.replace(",", ".")) : parseTlInput(raw || "0");
          return { personId: id, value };
        });

  const recurring = await repo.recurringExpenses.create({
    name,
    amountKurus,
    dueDay,
    splitMode,
    participantPersonIds,
    shareValues,
    startMonth,
  });
  await repo.recurringExpenses.generatePeriod(recurring.id, startMonth);

  revalidatePath("/giderler/duzenli");
  redirect("/giderler/duzenli");
}

export async function updateRecurringStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as RecurringStatus;
  if (!id || !status) return;
  const repo = getRepository();
  await repo.recurringExpenses.update(id, { status });
  revalidatePath("/giderler/duzenli");
}

export async function updateRecurringAmountAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "").trim();
  if (!id || !amount) return;
  const repo = getRepository();
  await repo.recurringExpenses.update(id, { amountKurus: parseTlInput(amount) });
  revalidatePath("/giderler/duzenli");
}
