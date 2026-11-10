import { NextResponse, type NextRequest } from "next/server";
import { getRepository } from "@/lib/db";
import { runReminderSweep } from "@/lib/services/notifications";

/**
 * Vercel Cron (veya herhangi bir zamanlayıcı) tarafından periyodik olarak
 * çağrılmak üzere hazırlanmıştır. CRON_SECRET tanımlıysa Authorization
 * header'ı ile doğrulanır. Gerçek e-posta servisi bağlanana kadar sadece
 * simülasyon/log üretir.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
  }

  const repo = getRepository();
  const result = await runReminderSweep(repo);
  return NextResponse.json({
    ok: true,
    gönderilen: result.sent.length,
    atlanan: result.skippedAlreadySent,
    emails: result.sent,
  });
}
