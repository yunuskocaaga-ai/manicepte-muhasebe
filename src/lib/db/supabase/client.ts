import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Sunucu tarafında kullanılan, service role key ile RLS'i bypass eden
 * istemci. Yalnızca API route / server action içinden, admin oturumu
 * doğrulandıktan sonra kullanılmalıdır.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase ortam değişkenleri tanımlı değil (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js'in global fetch'i Data Cache ile sarmalar; bu olmadan
      // Supabase REST çağrıları route "force-dynamic" olsa bile önbelleğe
      // alınabilir ve yeni/güncellenmiş kayıtlar bir süre eski veri olarak
      // görünür. Finansal veri için bu kabul edilemez, her çağrı taze olmalı.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return adminClient;
}
