import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getRepository, isDemoMode } from "@/lib/db";
import { getDemoStore } from "@/lib/db/demo/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRepository();
  const doc = await repo.documents.get(id);
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });
  }

  if (isDemoMode()) {
    const filePath = path.join(getDemoStore().documentsDir(), doc.storagePath);
    try {
      const data = await fs.readFile(filePath);
      return new NextResponse(data, {
        headers: {
          "Content-Type": doc.mimeType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
        },
      });
    } catch {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }
  }

  const url = await repo.documents.getDownloadUrl(id);
  return NextResponse.redirect(url);
}
