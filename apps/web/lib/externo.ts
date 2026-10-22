import "server-only";
import { db, sistemaDaChave, type Sistema } from "@domus-ads/core";
import { NextResponse } from "next/server";

/**
 * API dos sistemas conectados (/api/externo/v1): o app manda `Authorization: Bearer domus_…` (chave criada em Sistemas).
 * Sem cookie e sem sessão: a chave é a única credencial. Nada aqui executa comando; o worker só roda o tipo AI_SISTEMA.
 */
export async function comChave(req: Request, fn: (s: Sistema) => Promise<Response>): Promise<Response> {
  const chave = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  try {
    const s = await sistemaDaChave(db(), chave);
    if (!s) return erro(401, "Chave inválida ou sistema desativado.");
    return await fn(s);
  } catch (e) {
    console.error("[externo]", (e as Error).message);
    return erro(500, "Erro inesperado no AdPilot.");
  }
}

export const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } });
export const ok = (dados: unknown, status = 200) => NextResponse.json(dados, { status, headers: { "Cache-Control": "no-store" } });

export interface EstadoPedido {
  id: string; status: "FILA" | "RODANDO" | "PRONTO" | "ERRO" | "CANCELADO"; texto: string; erro: string | null;
  conta: string | null; provider: string | null; modelo: string | null;
  tokens_entrada: number | null; tokens_saida: number | null; duracao_ms: number | null;
}

export async function estadoPedido(sistemaId: string, id: string): Promise<EstadoPedido | null> {
  const [p] = await db()<EstadoPedido[]>`
    select id, status, texto, erro, conta, provider, modelo, tokens_entrada::int, tokens_saida::int, duracao_ms
    from ads.sistema_pedidos where id = ${id} and sistema_id = ${sistemaId}`;
  return p ?? null;
}
