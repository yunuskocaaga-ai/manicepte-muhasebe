import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";

export async function GET() {
  const repo = getRepository();
  const backup = await repo.backup.export();
  const fileName = `manicepte-yedek-${backup.exportedAt.slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
