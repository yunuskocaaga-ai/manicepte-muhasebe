"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/genel-bakis");
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/genel-bakis";

  const result = await login(email, password);
  if (!result.ok) {
    redirect(`/giris?error=${encodeURIComponent(result.error ?? "Giriş başarısız")}&redirect=${encodeURIComponent(safeRedirect)}`);
  }
  redirect(safeRedirect);
}
