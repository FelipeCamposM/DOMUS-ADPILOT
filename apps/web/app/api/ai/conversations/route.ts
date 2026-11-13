import { NextResponse, type NextRequest } from "next/server";
import { listaConversas } from "@/lib/ai";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Histórico da bolha flutuante, por modo (?tipo=consultor | marketing | vendas; vendas só o admin da plataforma). */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  const q = req.nextUrl.searchParams.get("tipo");
  const tipo = q === "marketing" ? "marketing" : q === "vendas" && isPlatformAdmin(ctx) ? "vendas" : "consultor";
  const itens = await listaConversas(ctx.workspace.id, tipo);
  return NextResponse.json(itens.map((c) => ({ ...c, updated_at: c.updated_at.toISOString() })), { headers: { "Cache-Control": "no-store" } });
}
