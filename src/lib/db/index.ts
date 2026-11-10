import type { Repository } from "./repository";
import { getDemoRepository } from "./demo/repository";
import { getSupabaseRepository } from "./supabase/repository";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== "" &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY !== "",
  );
}

export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

let cached: Repository | null = null;

/**
 * Supabase ortam değişkenleri tanımlı değilse otomatik olarak yerel demo
 * repository'ye düşer. Böylece Supabase bağlanmadan da uygulama tam
 * işlevli çalışır.
 */
export function getRepository(): Repository {
  if (cached) return cached;
  cached = isSupabaseConfigured() ? getSupabaseRepository() : getDemoRepository();
  return cached;
}

export type { Repository } from "./repository";
