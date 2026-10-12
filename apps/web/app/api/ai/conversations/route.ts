import { NextResponse } from "next/server";
import { listaConversas } from "@/lib/ai";
import { requireCtx } from "@/lib/ctx";

/** Histórico do consultor (bolha flutuante). */
export async function GET() {
  const ctx = await requireCtx();
  const itens = await listaConversas(ctx.workspace.id, "consultor");
  return NextResponse.json(itens.map((c) => ({ ...c, updated_at: c.updated_at.toISOString() })), { headers: { "Cache-Control": "no-store" } });
}
