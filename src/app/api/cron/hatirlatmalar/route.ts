import { NextResponse, type NextRequest } from "next/server";
import { getRepository } from "@/lib/db";
import { runReminderSweep } from "@/lib/services/notifications";

/**
 * Vercel Cron tarafından periyodik olarak çağrılmak üzere hazırlanmıştır.
 * Bu route proxy.ts'de oturum kontrolünden muaf tutulduğu için (cron'un
 * oturum çerezi yoktur) CRON_SECRET zorunludur — tanımlı değilse endpoint
 * güvenli biçimde kapalı kalır (fail-closed), asla açık bırakılmaz.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET tanımlı değil" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const repo = getRepository();
  const result = await runReminderSweep(repo);
  return NextResponse.json({
    ok: result.failed.length === 0,
    gönderilen: result.sent.length,
    atlanan: result.skippedAlreadySent,
    başarısız: result.failed.length,
    hatalar: result.failed,
  });
}
