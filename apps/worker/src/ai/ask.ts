import { db, deltaPct, iaPreferencias, type Json } from "@domus-ads/core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, type AiProvider } from "./cli";
import { blockedUntil, type Usage } from "./limits";
import { resolveConfigDir } from "./login";

/**
 * Pergunta avulsa à IA (sem conversa), com o mesmo rodízio do chat: conta no limite fica fora até o reset e a
 * pergunta segue na próxima; login expirado é marcado e pulado. Sem ferramentas: a IA só devolve texto.
 */
export async function perguntarIA(p: {
  workspaceId: string | null; sistema: string; prompt: string; cwd: string; signal: AbortSignal;
  log: (m: string) => Promise<void>; onText?: (t: string) => void;
  /** imagens (caminhos dentro de cwd) que a IA pode ver: logo, prints, inspirações */
  imagens?: string[];
  /** projeto do Studio que está gastando (consumo por vídeo/imagem) */
  projetoId?: string;
  /** sistema conectado que pediu (consumo por sistema) e as travas dele: contas permitidas e teto da janela de 5 h */
  sistemaId?: string; contas?: string[] | null; limitePct?: number | null;
}): Promise<{ text: string; conta: string; provider: AiProvider; model: string | null; inputTokens: number; outputTokens: number; durationMs: number }> {
  const sql = db();
  const sysFile = join(p.cwd, "instrucoes.md");
  writeFileSync(sysFile, p.sistema, "utf8");
  const tentadas = new Set<string>();
  const { conta: preferida } = await iaPreferencias();
  for (;;) {
    if (p.signal.aborted) throw new Error("Cancelado");
    const [conta] = await sql<{ id: string; provider: AiProvider; name: string; config_dir: string; usage: Usage | null }[]>`
      select id, provider, name, config_dir, usage from ads.ai_accounts
      where status = 'ACTIVE' and (limited_until is null or limited_until < now()) and not (id = any(${[...tentadas]}::uuid[]))
        and (${p.contas ?? null}::uuid[] is null or id = any(${p.contas ?? null}::uuid[]))
        and (${p.limitePct ?? null}::numeric is null or coalesce((usage->'five_hour'->>'pct')::numeric, 0) < ${p.limitePct ?? null}::numeric)
      order by id is not distinct from ${preferida}::uuid desc, priority, created_at limit 1`;
    if (!conta) throw new Error(p.limitePct || p.contas ? "Nenhuma conta permitida para este sistema está livre (limite ou contas escolhidas em Sistemas)."
      : tentadas.size ? "Todas as contas de IA falharam ou estão no limite." : "Nenhuma conta de IA ativa. Conecte uma em Configurações → Contas de IA.");
    tentadas.add(conta.id);
    await p.log(`IA: ${conta.provider} · ${conta.name}`);
    let depois: Usage | null = null;
    const r = await runCli({
      provider: conta.provider, configDir: resolveConfigDir(conta.config_dir), cwd: p.cwd, prompt: p.prompt, systemPromptFile: sysFile,
      sessionId: null, signal: p.signal, onText: (t) => p.onText?.(t), verArquivos: p.imagens ? { imagens: p.imagens } : undefined,
      onUsage: (u: Usage) => { depois = u; void sql`update ads.ai_accounts set usage = ${sql.json(u as unknown as Json)} where id = ${conta.id}`; },
    });
    const pct = deltaPct(conta.usage?.five_hour, (depois as Usage | null)?.five_hour);
    await sql`
      insert into ads.ai_usage (ai_account_id, workspace_id, video_project_id, sistema_id, pct_5h, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, ok)
      values (${conta.id}, ${p.workspaceId}, ${p.projetoId ?? null}, ${p.sistemaId ?? null}, ${pct}, ${conta.provider}, ${r.model}, ${r.inputTokens}, ${r.outputTokens}, ${r.costUsd}, ${r.durationMs}, ${r.ok})`;
    if (r.ok) {
      await sql`update ads.ai_accounts set last_used_at = now(), last_error = null where id = ${conta.id}`;
      return { text: r.text, conta: conta.name, provider: conta.provider, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, durationMs: r.durationMs };
    }
    if (p.signal.aborted) throw new Error("Cancelado");
    if (r.limit) {
      const ate = blockedUntil(null, r.limit.resetsAt);
      await sql`update ads.ai_accounts set limited_until = ${ate}, last_error = 'Limite de uso atingido' where id = ${conta.id}`;
      await p.log(`“${conta.name}” no limite; tentando outra conta`);
    } else {
      await sql`update ads.ai_accounts set last_error = ${(r.authError ? "Login expirado: use “Refazer login” em Configurações → Contas de IA. " : "") + (r.error ?? "")} where id = ${conta.id}`;
      await p.log(`“${conta.name}” falhou (${r.authError ? "login expirado" : r.error?.slice(0, 120)}); tentando outra conta`);
    }
  }
}

/** Extrai o primeiro bloco ```lang … ``` (ou o texto inteiro, se a IA esquecer a cerca). */
export function bloco(texto: string, lang: string): string {
  const m = texto.match(new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "i")) ?? texto.match(/```\w*\s*\n([\s\S]*?)```/);
  return (m?.[1] ?? texto).trim();
}
