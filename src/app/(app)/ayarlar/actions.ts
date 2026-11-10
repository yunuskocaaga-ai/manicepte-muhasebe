"use server";

import { redirect } from "next/navigation";
import { getRepository } from "@/lib/db";
import { BackupSchema } from "@/lib/domain/types";
import { runReminderSweep } from "@/lib/services/notifications";

export async function restoreBackupAction(formData: FormData): Promise<void> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect("/ayarlar?error=" + encodeURIComponent("Lütfen bir yedek dosyası seçin."));
  }

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const backup = BackupSchema.parse(json);
    const repo = getRepository();
    await repo.backup.restore(backup);
  } catch (err) {
    redirect("/ayarlar?error=" + encodeURIComponent((err as Error).message));
  }

  redirect("/ayarlar?restored=1");
}

export async function runReminderTestAction(): Promise<void> {
  const repo = getRepository();
  const result = await runReminderSweep(repo);
  redirect(`/ayarlar?reminderSent=${result.sent.length}&reminderSkipped=${result.skippedAlreadySent}`);
}

