import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { isAuthText, isLimitText, usageFromClaude, usageFromCodex, type Usage } from "./limits";

export type AiProvider = "claude" | "codex";
/** config_dir "native" = perfil padrão do Windows (~/.claude, ~/.codex); senão pasta isolada da conta. */
export const NATIVE = "native";

export interface RunInput {
  provider: AiProvider;
  configDir: string;
  cwd: string;
  prompt: string;
  systemPromptFile: string; // Claude: --system-prompt-file. Codex: o texto vai no início do prompt da 1ª rodada.
  sessionId: string | null;
  signal: AbortSignal;
  onText: (full: string) => void;
  onUsage: (u: Usage) => void;
  /** Arte (vídeo/imagem): a IA pode ver arquivos da pasta do job. Claude: só a ferramenta Read, que o próprio Claude
   *  limita à pasta (fora dela pede permissão, negada no modo -p). Codex: as imagens vão anexadas com -i. */
  verArquivos?: { imagens: string[] };
}

export interface RunResult {
  ok: boolean;
  text: string;
  sessionId: string | null;
  limit: { resetsAt: string | null } | null;
  authError: boolean;
  error: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  durationMs: number;
}

// Codex sem shell, navegador, computador, apps/MCP e plugins; sandbox só-leitura e sem o config.toml do usuário.
const CODEX_ISOLADO = ["--json", "--skip-git-repo-check", "--ignore-user-config", "-c", 'sandbox_mode="read-only"',
  "--disable", "shell_tool", "--disable", "browser_use", "--disable", "computer_use", "--disable", "apps", "--disable", "plugins", "--disable", "in_app_browser"];

export function comando(p: AiProvider, args: string[]): [string, string[]] {
  if (p === "claude") return [process.env.CLAUDE_BIN || "claude", args];
  if (process.env.CODEX_BIN) return [process.env.CODEX_BIN, args];
  // No Windows o "codex" do npm é um .cmd (spawn sem shell não executa): roda o entry JS direto com o próprio Node.
  const js = join(process.env.APPDATA ?? "", "npm/node_modules/@openai/codex/bin/codex.js");
  return process.platform === "win32" && existsSync(js) ? [process.execPath, [js, ...args]] : ["codex", args];
}

/**
 * Ambiente do CLI para uma conta. NATIVE apaga CLAUDE_CONFIG_DIR/CODEX_HOME herdados (o worker pode ter sido aberto
 * de um terminal com perfil do OMNI); senão aponta para a pasta da conta.
 */
export function cliEnv(provider: AiProvider, configDir: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT; // o worker pode ter sido iniciado de dentro de um Claude Code
  const chave = provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  if (configDir === NATIVE) delete env[chave];
  else env[chave] = configDir;
  return env;
}

export async function runCli(i: RunInput): Promise<RunResult> {
  const args = i.provider === "claude"
    ? ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--tools", i.verArquivos ? "Read" : "", "--strict-mcp-config",
       "--system-prompt-file", i.systemPromptFile, ...(i.sessionId ? ["--resume", i.sessionId] : []),
       ...(process.env.AI_CLAUDE_MODEL ? ["--model", process.env.AI_CLAUDE_MODEL] : [])]
    : ["exec", ...(i.sessionId ? ["resume", i.sessionId] : []), ...CODEX_ISOLADO,
       ...(process.env.AI_CODEX_MODEL ? ["-m", process.env.AI_CODEX_MODEL] : []),
       ...(i.verArquivos?.imagens.flatMap((img) => ["-i", img]) ?? []), "-"];
  const prompt = i.provider === "codex" && !i.sessionId ? `${readFileSync(i.systemPromptFile, "utf8")}\n\n${i.prompt}` : i.prompt;

  const env = cliEnv(i.provider, i.configDir);

  const [bin, argv] = comando(i.provider, args);
  const inicio = Date.now();
  const r: RunResult = { ok: false, text: "", sessionId: i.sessionId, limit: null, authError: false, error: null, model: null, inputTokens: 0, outputTokens: 0, costUsd: null, durationMs: 0 };
  let stderr = "";

  const child = spawn(bin, argv, { cwd: i.cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const matar = () => child.kill();
  i.signal.addEventListener("abort", matar);
  const timeout = setTimeout(matar, Number(process.env.AI_TURN_TIMEOUT_MS || 600_000));
  child.stdin.end(prompt, "utf8");
  child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-8000); });

  const linhas = createInterface({ input: child.stdout });
  linhas.on("line", (linha) => {
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(linha); } catch { return; }
    if (i.provider === "claude") claudeEvent(ev); else codexEvent(ev);
  });

  function claudeEvent(ev: Record<string, unknown>) {
    if (ev.type === "system" && ev.subtype === "init") { r.sessionId = (ev.session_id as string) ?? r.sessionId; r.model = (ev.model as string) ?? null; }
    if (ev.type === "stream_event") {
      const e = ev.event as { type?: string; delta?: { type?: string; text?: string } };
      if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) { r.text += e.delta.text; i.onText(r.text); }
    }
    if (ev.type === "rate_limit_event") {
      const u = usageFromClaude(ev);
      if (u) { i.onUsage(u.usage); if (u.rejected) r.limit = { resetsAt: u.resetsAt }; }
    }
    if (ev.type === "result") {
      const res = typeof ev.result === "string" ? ev.result : "";
      if (res && !r.text) { r.text = res; i.onText(r.text); }
      r.sessionId = (ev.session_id as string) ?? r.sessionId;
      r.costUsd = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null;
      const u = ev.usage as Record<string, number> | undefined;
      r.inputTokens = (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
      r.outputTokens = u?.output_tokens ?? 0;
      if (ev.is_error) { r.error = res || String(ev.subtype); if (isLimitText(res)) r.limit ??= { resetsAt: null }; if (isAuthText(res)) r.authError = true; }
      else r.ok = true;
    }
  }

  function codexEvent(ev: Record<string, unknown>) {
    if (ev.type === "thread.started") r.sessionId = ev.thread_id as string;
    if (ev.type === "item.completed") {
      const item = ev.item as { type?: string; text?: string };
      if (item?.type === "agent_message" && item.text) { r.text += (r.text ? "\n\n" : "") + item.text; i.onText(r.text); }
    }
    if (ev.type === "turn.completed") {
      const u = ev.usage as Record<string, number> | undefined;
      r.inputTokens = u?.input_tokens ?? 0;
      r.outputTokens = u?.output_tokens ?? 0;
      r.ok = true;
    }
    if (ev.type === "turn.failed" || ev.type === "error") {
      const msg = (ev.message as string) ?? (ev.error as { message?: string })?.message ?? "Falha no Codex";
      r.error = msg; r.ok = false;
      if (isLimitText(msg)) r.limit = { resetsAt: null };
      if (isAuthText(msg)) r.authError = true;
    }
  }

  const code = await new Promise<number | null>((ok) => child.on("close", ok).on("error", (e) => { r.error = `Não consegui iniciar o ${i.provider}: ${e.message}`; ok(null); }));
  clearTimeout(timeout);
  i.signal.removeEventListener("abort", matar);
  r.durationMs = Date.now() - inicio;

  if (!r.ok && !r.error) r.error = i.signal.aborted ? "Cancelado" : stderr.trim().split("\n").slice(-3).join(" ") || `${i.provider} saiu com código ${code}`;
  if (!r.limit && isLimitText(`${r.error ?? ""} ${stderr}`)) r.limit = { resetsAt: null };
  if (!r.authError && isAuthText(`${r.error ?? ""} ${stderr}`)) r.authError = true;
  if (r.limit) r.ok = false;

  if (i.provider === "codex" && r.sessionId) {
    const u = codexUsage(i.configDir, r.sessionId);
    if (u) i.onUsage(u);
  }
  return r;
}

/** Último `token_count` do rollout desta sessão do Codex (é onde ele grava o uso de 5 h/semana). */
function codexUsage(configDir: string, threadId: string): Usage | null {
  const base = join(configDir === NATIVE ? join(homedir(), ".codex") : configDir, "sessions");
  const achar = (dir: string): string | null => {
    if (!existsSync(dir)) return null;
    for (const nome of readdirSync(dir).sort().reverse()) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) { const f = achar(p); if (f) return f; }
      else if (nome.includes(threadId) && nome.endsWith(".jsonl")) return p;
    }
    return null;
  };
  const arq = achar(base);
  if (!arq) return null;
  const linhas = readFileSync(arq, "utf8").trimEnd().split("\n").reverse();
  for (const l of linhas) {
    if (!l.includes('"token_count"')) continue;
    try {
      const ev = JSON.parse(l) as { payload?: { type?: string; rate_limits?: Record<string, unknown> } };
      if (ev.payload?.type === "token_count" && ev.payload.rate_limits) return usageFromCodex(ev.payload.rate_limits);
    } catch { /* cauda incompleta */ }
  }
  return null;
}
