import { db } from "@domus-ads/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/ctx";

/** Polling do editor: status da publicação e a legenda que a IA está gerando. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Publicação inválida" }, { status: 400 });
  const [p] = await db()`
    select status, erro, permalink, sugestao from ads.instagram_posts where id = ${id.data} and workspace_id = ${ctx.workspace.id}`;
  if (!p) return NextResponse.json({ error: "Publicação não encontrada" }, { status: 404 });
  return NextResponse.json(p, { headers: { "Cache-Control": "no-store" } });
}
