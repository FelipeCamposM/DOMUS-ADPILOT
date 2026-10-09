import { db } from "@domus-ads/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Polling do login guiado de conta de IA (só quem iniciou, admin da plataforma). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Login inválido" }, { status: 400 });
  const [l] = await db()<{ status: string; url: string | null; user_code: string | null; error: string | null; provider: string }[]>`
    select status, url, user_code, error, provider from ads.ai_logins where id = ${id.data} and created_by = ${ctx.user.id}`;
  if (!l) return NextResponse.json({ error: "Login não encontrado" }, { status: 404 });
  return NextResponse.json(l, { headers: { "Cache-Control": "no-store" } });
}
