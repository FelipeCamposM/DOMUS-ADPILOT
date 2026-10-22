import { db } from "@domus-ads/core";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CONV_DIR } from "../env";
import { perguntarIA } from "./ask";

/**
 * Pedido de um sistema conectado (job AI_SISTEMA): responde com as contas permitidas para o sistema, grava o texto aos
 * poucos (o app busca pela API) e apaga instruções e prompt no fim. O app pode parar: o pedido vira CANCELADO e a
 * API cancela o job, que o vigia do index.ts transforma em abort.
 */
export async function runSistema(pedidoId: string, signal: AbortSignal, log: (m: string) => Promise<void>) {
  const sql = db();
  const [p] = await sql<{ status: string; instrucoes: string | null; prompt: string | null; sistema_id: string; ativo: boolean; contas: string[] | null; limite_pct: string | null }[]>`
    select p.status, p.instrucoes, p.prompt, p.sistema_id, s.ativo, s.contas, s.limite_pct::text
    from ads.sistema_pedidos p join ads.sistemas s on s.id = p.sistema_id where p.id = ${pedidoId}`;
  if (!p || p.status !== "FILA" || !p.prompt) return { pulado: true };
  if (!p.ativo) {
    await sql`update ads.sistema_pedidos set status = 'ERRO', erro = 'Sistema desativado no AdPilot.', instrucoes = null, prompt = null, updated_at = now() where id = ${pedidoId}`;
    return { pulado: true };
  }
  await sql`update ads.sistema_pedidos set status = 'RODANDO', updated_at = now() where id = ${pedidoId} and status = 'FILA'`;

  const pasta = join(CONV_DIR, `sistema-${pedidoId}`);
  mkdirSync(pasta, { recursive: true });
  let ultimo = 0;
  try {
    const r = await perguntarIA({
      workspaceId: null, sistemaId: p.sistema_id, contas: p.contas, limitePct: p.limite_pct ? Number(p.limite_pct) : null,
      sistema: p.instrucoes ?? "", prompt: p.prompt, cwd: pasta, signal, log,
      onText: (t) => {
        if (Date.now() - ultimo < 700) return; // texto parcial a cada 0,7 s
        ultimo = Date.now();
        void sql`update ads.sistema_pedidos set texto = ${t}, updated_at = now() where id = ${pedidoId} and status = 'RODANDO'`;
      },
    });
    await sql`
      update ads.sistema_pedidos set status = 'PRONTO', texto = ${r.text}, conta = ${r.conta}, provider = ${r.provider}, modelo = ${r.model},
        tokens_entrada = ${r.inputTokens}, tokens_saida = ${r.outputTokens}, duracao_ms = ${r.durationMs},
        instrucoes = null, prompt = null, updated_at = now()
      where id = ${pedidoId} and status = 'RODANDO'`;
    return { conta: r.conta, provider: r.provider };
  } catch (e) {
    const msg = signal.aborted ? "Parado." : (e as Error).message;
    await sql`
      update ads.sistema_pedidos set status = ${signal.aborted ? "CANCELADO" : "ERRO"}, erro = ${msg.slice(0, 500)}, instrucoes = null, prompt = null, updated_at = now()
      where id = ${pedidoId} and status in ('FILA', 'RODANDO')`;
    if (!signal.aborted) throw e;
    return { cancelado: true };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

/** Pedidos com mais de 7 dias somem (o consumo continua em ai_usage). */
export async function limparPedidos() {
  await db()`delete from ads.sistema_pedidos where created_at < now() - interval '7 days'`;
}
