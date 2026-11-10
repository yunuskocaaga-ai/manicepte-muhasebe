"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/db";
import { parseTlInput } from "@/lib/domain/money";
import type { DebtSource } from "@/lib/domain/types";

export async function createManualDebtAction(formData: FormData): Promise<void> {
  const debtorPersonId = String(formData.get("debtorPersonId") ?? "");
  const creditorPersonId = String(formData.get("creditorPersonId") ?? "");
  const amountKurus = parseTlInput(String(formData.get("amount") ?? "0"));
  const source = String(formData.get("source") ?? "manual") as DebtSource;
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!debtorPersonId || !creditorPersonId || debtorPersonId === creditorPersonId || !amountKurus) {
    redirect("/borclar?error=" + encodeURIComponent("Geçerli bir borçlu, alacaklı ve tutar girin."));
  }

  const repo = getRepository();
  await repo.debts.createManual({ debtorPersonId, creditorPersonId, amountKurus, source, description });
  revalidatePath("/borclar");
  redirect("/borclar");
}

export async function addRepaymentAction(formData: FormData): Promise<void> {
  const debtId = String(formData.get("debtId") ?? "");
  const amountKurus = parseTlInput(String(formData.get("amount") ?? "0"));
  const paidAt = String(formData.get("paidAt") ?? new Date().toISOString().slice(0, 10));
  const description = String(formData.get("description") ?? "").trim() || null;

  const repo = getRepository();
  try {
    await repo.debts.addRepayment({ debtId, amountKurus, paidAt, description });
  } catch (err) {
    redirect("/borclar?error=" + encodeURIComponent((err as Error).message));
  }
  revalidatePath("/borclar");
  redirect("/borclar");
}

export async function cancelRepaymentAction(formData: FormData): Promise<void> {
  const repaymentId = String(formData.get("repaymentId") ?? "");
  const repo = getRepository();
  await repo.debts.cancelRepayment(repaymentId);
  revalidatePath("/borclar");
  redirect("/borclar");
}
