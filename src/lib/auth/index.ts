import bcrypt from "bcryptjs";
import { isDemoMode } from "@/lib/db";
import { createSession, destroySession, getSession } from "./session";

export { getSession, SESSION_COOKIE } from "./session";

export interface LoginResult {
  ok: boolean;
  error?: string;
}

async function loginDemo(email: string, password: string): Promise<LoginResult> {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL;
  const adminPasswordHashB64 = process.env.DEMO_ADMIN_PASSWORD_HASH_B64;
  if (!adminEmail || !adminPasswordHashB64) {
    return {
      ok: false,
      error:
        "Demo yönetici bilgileri tanımlı değil. .env.local içinde DEMO_ADMIN_EMAIL ve DEMO_ADMIN_PASSWORD_HASH_B64 ayarlayın.",
    };
  }
  if (email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) {
    return { ok: false, error: "E-posta veya şifre hatalı" };
  }
  // Hash base64 olarak saklanır: bcrypt hash'leri "$" karakteri içerir ve
  // Next.js'in env değişkeni genişletmesi (dotenv-expand) bunu "$VAR" gibi
  // yorumlayıp sessizce bozar. Base64 bu sorunu tamamen ortadan kaldırır.
  const adminPasswordHash = Buffer.from(adminPasswordHashB64, "base64").toString("utf-8");
  const valid = await bcrypt.compare(password, adminPasswordHash);
  if (!valid) return { ok: false, error: "E-posta veya şifre hatalı" };
  await createSession(adminEmail);
  return { ok: true };
}

async function loginSupabase(email: string, password: string): Promise<LoginResult> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return { ok: false, error: "NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil" };
  }
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: "E-posta veya şifre hatalı" };
  }

  const { getSupabaseAdminClient } = await import("@/lib/db/supabase/client");
  const admin = getSupabaseAdminClient();
  const { data: adminRow } = await admin.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!adminRow) {
    await client.auth.signOut();
    return { ok: false, error: "Bu hesap yönetici olarak yetkilendirilmemiş." };
  }

  await createSession(email);
  return { ok: true };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  if (!email || !password) return { ok: false, error: "E-posta ve şifre gerekli" };
  return isDemoMode() ? loginDemo(email, password) : loginSupabase(email, password);
}

export async function logout(): Promise<void> {
  await destroySession();
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Oturum bulunamadı");
  return session;
}
