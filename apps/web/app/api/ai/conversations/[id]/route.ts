import { NextResponse } from "next/server";
import { z } from "zod";
import { chatState } from "@/lib/ai";
import { requireCtx } from "@/lib/ctx";

/** Polling do chat enquanto a IA responde (o worker grava o texto aos poucos). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Conversa inválida" }, { status: 400 });
  const s = await chatState(ctx.workspace.id, id.data);
  if (!s) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  return NextResponse.json(s, { headers: { "Cache-Control": "no-store" } });
}
