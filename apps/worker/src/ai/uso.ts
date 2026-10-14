import { db, type Json } from "@domus-ads/core";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { NATIVE, type AiProvider } from "./cli";
import { blockedUntil, type Usage } from "./limits";
import { resolveConfigDir } from "./login";

/**
 * Uso das assinaturas consultado direto no Claude/ChatGPT (o mesmo número das telas de uso deles), com o login que já
 * está no PC. Pega também o que foi gasto FORA da plataforma (Claude Code, Codex, apps). O token só vai para o
 * próprio provedor e nunca sai do PC. Token expirado: pula (a CLI renova no próximo uso).
 */
const lerJson = (arq: string) => (existsSync(arq) ? (JSON.parse(readFileSync(arq, "utf8")) as Record<string, unknown>) : null);
const isoDe = (s: unknown) => (typeof s === "string" && s ? new Date(s).toISOString() : typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString() : null);

export async function consultarUso(provider: AiProvider, configDir: string): Promise<{ usage: Usage; plano: string | null } | null> {
  const dir = resolveConfigDir(configDir);
  const sinal = AbortSignal.timeout(15_000);
  if (provider === "claude") {
    const cred = lerJson(join(dir === NATIVE ? join(homedir(), ".claude") : dir, ".credentials.json"))?.claudeAiOauth as
      { accessToken?: string; expiresAt?: number; subscriptionType?: string } | undefined;
    if (!cred?.accessToken || (cred.expiresAt && cred.expiresAt < Date.now())) return null;
    const r = await fetch("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: `Bearer ${cred.accessToken}`, "anthropic-beta": "oauth-2025-04-20" }, signal: sinal });
    if (!r.ok) throw new Error(`Claude respondeu ${r.status}`);
    const j = (await r.json()) as Record<string, { utilization?: number; resets_at?: string } | null>;
    const win = (w?: { utilization?: number; resets_at?: string } | null) => (w && typeof w.utilization === "number" ? { pct: w.utilization, resets_at: isoDe(w.resets_at) } : undefined);
    return { usage: { five_hour: win(j.five_hour), seven_day: win(j.seven_day), observed_at: new Date().toISOString(), source: "claude_api" }, plano: cred.subscriptionType ?? null };
  }
  const auth = lerJson(join(dir === NATIVE ? join(homedir(), ".codex") : dir, "auth.json"))?.tokens as { access_token?: string; account_id?: string } | undefined;
  if (!auth?.access_token) return null;
  const r = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    headers: { Authorization: `Bearer ${auth.access_token}`, ...(auth.account_id ? { "ChatGPT-Account-Id": auth.account_id } : {}), "User-Agent": "codex_cli_rs" }, signal: sinal,
  });
  if (!r.ok) throw new Error(`ChatGPT respondeu ${r.status}`);
  const j = (await r.json()) as { plan_type?: string; rate_limit?: { primary_window?: Janela; secondary_window?: Janela } };
  const win = (w?: Janela) => (w && typeof w.used_percent === "number" ? { pct: w.used_percent, resets_at: isoDe(w.reset_at) } : undefined);
  return { usage: { five_hour: win(j.rate_limit?.primary_window), seven_day: win(j.rate_limit?.secondary_window), observed_at: new Date().toISOString(), source: "codex_api" }, plano: j.plan_type ?? null };
}
interface Janela { used_percent?: number; reset_at?: number }

/** Atualiza o uso de todas as contas e acerta o rodízio: libera a conta que zerou, segura a que está em 100%. */
export async function atualizarUsoContas(log: (m: string) => void) {
  const sql = db();
  const contas = await sql<{ id: string; provider: AiProvider; name: string; config_dir: string; plan: string | null }[]>`
    select id, provider, name, config_dir, plan from ads.ai_accounts where status = 'ACTIVE'`;
  for (const c of contas) {
    try {
      const r = await consultarUso(c.provider, c.config_dir);
      if (!r) continue;
      const cheia = [r.usage.five_hour, r.usage.seven_day].some((w) => w && w.pct >= 100);
      await sql`update ads.ai_accounts set usage = ${sql.json(r.usage as unknown as Json)}, plan = coalesce(plan, ${r.plano}),
        limited_until = ${cheia ? blockedUntil(r.usage, null) : null} where id = ${c.id}`;
    } catch (e) {
      log(`uso de “${c.name}”: ${(e as Error).message}`);
    }
  }
}
