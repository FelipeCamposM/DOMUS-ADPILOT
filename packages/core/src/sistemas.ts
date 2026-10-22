import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "./db";

/**
 * Sistemas conectados: outros apps do dono pedem respostas da IA ao worker pela API /api/externo/v1 com uma chave.
 * A chave aparece uma vez na tela; no banco fica só o sha256 (chave aleatória de 256 bits: hash simples basta).
 */
export const hashChave = (chave: string) => createHash("sha256").update(chave, "utf8").digest("hex");

export function novaChave(): { chave: string; hash: string; fim: string } {
  const chave = `domus_${randomBytes(32).toString("base64url")}`;
  return { chave, hash: hashChave(chave), fim: chave.slice(-4) };
}

export interface Sistema { id: string; nome: string; limite_pct: string | null; contas: string[] | null }

/** Sistema ativo dono da chave (null = chave errada, revogada ou sistema desativado). */
export async function sistemaDaChave(sql: Sql, chave: string | null | undefined): Promise<Sistema | null> {
  if (!chave || !chave.startsWith("domus_") || chave.length > 200) return null;
  const [s] = await sql<Sistema[]>`
    update ads.sistemas set ultimo_uso = now() where chave_hash = ${hashChave(chave)} and ativo
    returning id, nome, limite_pct::text, contas`;
  return s ?? null;
}

type Janela = { pct: number; resets_at: string | null } | undefined;

/** Quanto a janela de 5 h subiu numa resposta. Janela que renovou no meio (reset diferente) ou sem leitura: null. */
export function deltaPct(antes: Janela, depois: Janela): number | null {
  if (!antes || !depois || antes.resets_at !== depois.resets_at) return null;
  return Math.max(0, Math.round((depois.pct - antes.pct) * 10) / 10);
}

/** Pedidos em andamento por sistema: um app com defeito não enche a fila. */
export const PEDIDOS_SIMULTANEOS = 5;
