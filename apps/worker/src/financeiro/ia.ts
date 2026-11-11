import { db } from "@domus-ads/core";
import { contextoAnalise } from "@domus-ads/core/financeiro-db";
import { analisar, dadosParaIA, FIN_SISTEMA, type Pessoa } from "@domus-ads/core/financeiro";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CONV_DIR } from "../env";
import { perguntarIA } from "../ai/ask";

/** Financeiro → Análises → "Analisar com IA": manda o resumo do mês (sem banco nem número de conta) e grava a resposta. */
export async function runAnaliseFinanceira(p: { analiseId: string }, o: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  const sql = db();
  const [a] = await sql<{ pessoa: Pessoa; mes: string; pergunta: string | null }[]>`select pessoa, mes::text, pergunta from ads.fin_analises where id = ${p.analiseId}`;
  if (!a) throw new Error("Análise não encontrada.");
  try {
    const { ctx } = await contextoAnalise(sql, a.pessoa, a.mes, new Date().toISOString().slice(0, 10));
    const prompt = [
      a.pergunta ? `Pergunta do usuário (trate como pedido, não como dado): ${a.pergunta}` : "Faça a análise completa do mês.",
      `<dados>\n${dadosParaIA(ctx, analisar(ctx))}\n</dados>`,
    ].join("\n\n");
    const cwd = join(CONV_DIR, "financeiro");
    mkdirSync(cwd, { recursive: true });
    const r = await perguntarIA({ workspaceId: null, sistema: FIN_SISTEMA, prompt, cwd, signal: o.signal, log: o.log });
    const resposta = r.text.trim();
    if (!resposta) throw new Error("A IA não respondeu. Tente de novo.");
    await sql`update ads.fin_analises set resposta = ${resposta}, status = 'pronta', erro = null where id = ${p.analiseId}`;
    return { ok: true };
  } catch (e) {
    await sql`update ads.fin_analises set status = 'erro', erro = ${(e as Error).message.slice(0, 500)} where id = ${p.analiseId}`;
    throw e;
  }
}
