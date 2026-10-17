import { NextResponse, type NextRequest } from "next/server";
import { listaConversas } from "@/lib/ai";
import { requireCtx } from "@/lib/ctx";

/** Histórico da bolha flutuante, por modo (?tipo=consultor | marketing). */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  const tipo = req.nextUrl.searchParams.get("tipo") === "marketing" ? "marketing" : "consultor";
  const itens = await listaConversas(ctx.workspace.id, tipo);
  return NextResponse.json(itens.map((c) => ({ ...c, updated_at: c.updated_at.toISOString() })), { headers: { "Cache-Control": "no-store" } });
}
