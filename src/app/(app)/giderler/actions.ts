"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/db";
import { parseTlInput } from "@/lib/domain/money";
import type { SplitMode } from "@/lib/domain/types";

function parseParticipantsAndShares(formData: FormData, personIds: string[]) {
  const splitMode = String(formData.get("splitMode") ?? "equal") as SplitMode;
  const participantPersonIds = personIds.filter((id) => formData.get(`participant_${id}`) === "on");

  if (splitMode === "equal") {
    return { splitMode, participantPersonIds, shareValues: undefined };
  }

  const shareValues = participantPersonIds.map((id) => {
    const raw = String(formData.get(`share_${id}`) ?? "0").trim();
    const value = splitMode === "percentage" ? Number(raw.replace(",", ".")) : parseTlInput(raw || "0");
    return { personId: id, value };
  });
  return { splitMode, participantPersonIds, shareValues };
}

export async function createExpenseAction(formData: FormData): Promise<void> {
  const repo = getRepository();
  const persons = await repo.persons.list(false);
  const personIds = persons.map((p) => p.id);

  const name = String(formData.get("name") ?? "").trim();
  const amountKurus = parseTlInput(String(formData.get("amount") ?? "0"));
  const month = String(formData.get("month") ?? "");
  const dueDay = Number(formData.get("dueDay") ?? 1);
  const description = String(formData.get("description") ?? "").trim() || null;
  const { splitMode, participantPersonIds, shareValues } = parseParticipantsAndShares(formData, personIds);

  if (!name || !amountKurus || !month || participantPersonIds.length === 0) {
    redirect("/giderler/yeni?error=" + encodeURIComponent("Lütfen tüm gerekli alanları doldurun."));
  }

  const expense = await repo.expenses.create({
    name,
    amountKurus,
    month,
    dueDay,
    description,
    splitMode,
    participantPersonIds,
    shareValues,
  });

  revalidatePath("/giderler");
  redirect(`/giderler/${expense.id}`);
}
