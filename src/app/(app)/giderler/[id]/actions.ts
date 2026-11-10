"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/db";
import { parseTlInput } from "@/lib/domain/money";
import type { SplitMode } from "@/lib/domain/types";

export async function addPaymentAction(formData: FormData): Promise<void> {
  const expenseId = String(formData.get("expenseId") ?? "");
  const payerPersonId = String(formData.get("payerPersonId") ?? "");
  const paidAt = String(formData.get("paidAt") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  const repo = getRepository();
  const shares = await repo.expenses.getShares(expenseId);
  const beneficiaryPersonIds = shares
    .map((s) => s.personId)
    .filter((id) => formData.get(`beneficiary_${id}`) === "on");

  if (!expenseId || !payerPersonId || beneficiaryPersonIds.length === 0) {
    redirect(`/giderler/${expenseId}?error=${encodeURIComponent("Ödeyen ve en az bir kişi seçmelisiniz.")}`);
  }

  const amountKurusPerBeneficiary: Record<string, number> = {};
  for (const id of beneficiaryPersonIds) {
    const raw = String(formData.get(`amount_${id}`) ?? "").trim();
    if (raw) amountKurusPerBeneficiary[id] = parseTlInput(raw);
  }

  try {
    await repo.payments.create({
      expenseId,
      payerPersonId,
      beneficiaryPersonIds,
      amountKurusPerBeneficiary,
      paidAt: paidAt || new Date().toISOString().slice(0, 10),
      note,
    });
  } catch (err) {
    redirect(`/giderler/${expenseId}?error=${encodeURIComponent((err as Error).message)}`);
  }

  revalidatePath(`/giderler/${expenseId}`);
  revalidatePath("/giderler");
  revalidatePath("/borclar");
  redirect(`/giderler/${expenseId}`);
}

export async function cancelPaymentAction(formData: FormData): Promise<void> {
  const expenseId = String(formData.get("expenseId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const repo = getRepository();
  try {
    await repo.payments.cancel(paymentId);
  } catch (err) {
    redirect(`/giderler/${expenseId}?error=${encodeURIComponent((err as Error).message)}`);
  }
  revalidatePath(`/giderler/${expenseId}`);
  revalidatePath("/borclar");
  redirect(`/giderler/${expenseId}`);
}

export async function updateExpenseAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const repo = getRepository();
  const persons = await repo.persons.list(false);

  const name = String(formData.get("name") ?? "").trim();
  const amountKurus = parseTlInput(String(formData.get("amount") ?? "0"));
  const dueDay = Number(formData.get("dueDay") ?? 1);
  const description = String(formData.get("description") ?? "").trim() || null;
  const splitMode = String(formData.get("splitMode") ?? "equal") as SplitMode;
  const participantPersonIds = persons.filter((p) => formData.get(`participant_${p.id}`) === "on").map((p) => p.id);

  const shareValues =
    splitMode === "equal"
      ? undefined
      : participantPersonIds.map((pid) => {
          const raw = String(formData.get(`share_${pid}`) ?? "0").trim();
          const value = splitMode === "percentage" ? Number(raw.replace(",", ".")) : parseTlInput(raw || "0");
          return { personId: pid, value };
        });

  try {
    await repo.expenses.update(id, {
      name,
      amountKurus,
      dueDay,
      description,
      splitMode,
      participantPersonIds: participantPersonIds.length > 0 ? participantPersonIds : undefined,
      shareValues,
    });
  } catch (err) {
    redirect(`/giderler/${id}?error=${encodeURIComponent((err as Error).message)}`);
  }

  revalidatePath(`/giderler/${id}`);
  revalidatePath("/giderler");
  redirect(`/giderler/${id}`);
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const repo = getRepository();
  await repo.expenses.softDelete(id);
  revalidatePath("/giderler");
  redirect("/giderler");
}

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const expenseId = String(formData.get("expenseId") ?? "");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect(`/giderler/${expenseId}`);
  }
  const repo = getRepository();
  const buffer = Buffer.from(await file.arrayBuffer());
  await repo.documents.upload({
    ownerType: "expense",
    ownerId: expenseId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    data: buffer,
  });
  revalidatePath(`/giderler/${expenseId}`);
  redirect(`/giderler/${expenseId}`);
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const expenseId = String(formData.get("expenseId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const repo = getRepository();
  await repo.documents.softDelete(documentId);
  revalidatePath(`/giderler/${expenseId}`);
  redirect(`/giderler/${expenseId}`);
}
