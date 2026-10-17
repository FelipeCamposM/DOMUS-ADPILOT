import { db, iaPreferencias, type Json } from "@domus-ads/core";
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
  workspaceId: string; sistema: string; prompt: string; cwd: string; signal: AbortSignal;
  log: (m: string) => Promise<void>; onText?: (t: string) => void;
  /** imagens (caminhos dentro de cwd) que a IA pode ver: logo, prints, inspirações */
  imagens?: string[];
  /** projeto do Studio que está gastando (consumo por vídeo/imagem) */
  projetoId?: string;
}): Promise<{ text: string; conta: string; provider: AiProvider }> {
  const sql = db();
  const sysFile = join(p.cwd, "instrucoes.md");
  writeFileSync(sysFile, p.sistema, "utf8");
  const tentadas = new Set<string>();
  const { conta: preferida } = await iaPreferencias();
  for (;;) {
    if (p.signal.aborted) throw new Error("Cancelado");
    const [conta] = await sql<{ id: string; provider: AiProvider; name: string; config_dir: string }[]>`
      select id, provider, name, config_dir from ads.ai_accounts
      where status = 'ACTIVE' and (limited_until is null or limited_until < now()) and not (id = any(${[...tentadas]}::uuid[]))
      order by id is not distinct from ${preferida}::uuid desc, priority, created_at limit 1`;
    if (!conta) throw new Error(tentadas.size ? "Todas as contas de IA falharam ou estão no limite." : "Nenhuma conta de IA ativa. Conecte uma em Configurações → Contas de IA.");
    tentadas.add(conta.id);
    await p.log(`IA: ${conta.provider} · ${conta.name}`);
    const r = await runCli({
      provider: conta.provider, configDir: resolveConfigDir(conta.config_dir), cwd: p.cwd, prompt: p.prompt, systemPromptFile: sysFile,
      sessionId: null, signal: p.signal, onText: (t) => p.onText?.(t), verArquivos: p.imagens ? { imagens: p.imagens } : undefined,
      onUsage: (u: Usage) => void sql`update ads.ai_accounts set usage = ${sql.json(u as unknown as Json)} where id = ${conta.id}`,
    });
    await sql`
      insert into ads.ai_usage (ai_account_id, workspace_id, video_project_id, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, ok)
      values (${conta.id}, ${p.workspaceId}, ${p.projetoId ?? null}, ${conta.provider}, ${r.model}, ${r.inputTokens}, ${r.outputTokens}, ${r.costUsd}, ${r.durationMs}, ${r.ok})`;
    if (r.ok) {
      await sql`update ads.ai_accounts set last_used_at = now(), last_error = null where id = ${conta.id}`;
      return { text: r.text, conta: conta.name, provider: conta.provider };
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
