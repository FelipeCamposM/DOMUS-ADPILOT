import { db, type Json } from "@domus-ads/core";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { ACCOUNTS_DIR } from "../env";
import { cliEnv, comando, NATIVE, type AiProvider } from "./cli";

/** Pasta de config da conta: "native" (login padrão do Windows), caminho absoluto (ex.: perfil do OMNI) ou pasta nossa. */
export const resolveConfigDir = (cfg: string) => (cfg === NATIVE ? NATIVE : isAbsolute(cfg) ? cfg : resolve(ACCOUNTS_DIR, cfg));

const semAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

function rodar(provider: AiProvider, args: string[], configDir: string, ms = 20_000): Promise<{ code: number | null; out: string }> {
  return new Promise((ok) => {
    const [bin, argv] = comando(provider, args);
    const p = spawn(bin, argv, { env: cliEnv(provider, configDir), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => p.kill(), ms);
    p.on("error", () => { clearTimeout(t); ok({ code: null, out }); });
    p.on("close", (code) => { clearTimeout(t); ok({ code, out: semAnsi(out) }); });
  });
}

export interface Status { loggedIn: boolean; email: string | null; plan: string | null }

/** Está logada? Claude: `claude auth status --json`. Codex: `codex login status` + e-mail/plano do id_token do auth.json. */
export async function authStatus(provider: AiProvider, configDir: string): Promise<Status> {
  if (provider === "claude") {
    const r = await rodar("claude", ["auth", "status", "--json"], configDir);
    try {
      const j = JSON.parse(r.out.slice(r.out.indexOf("{"))) as { loggedIn?: boolean; email?: string; subscriptionType?: string };
      return { loggedIn: !!j.loggedIn, email: j.email ?? null, plan: j.subscriptionType ?? null };
    } catch {
      return { loggedIn: false, email: null, plan: null };
    }
  }
  const r = await rodar("codex", ["login", "status"], configDir);
  const loggedIn = r.code === 0 && /logged in/i.test(r.out);
  let email: string | null = null, plan: string | null = null;
  try {
    const dir = configDir === NATIVE ? join(homedir(), ".codex") : configDir;
    const auth = JSON.parse(readFileSync(join(dir, "auth.json"), "utf8")) as { tokens?: { id_token?: string } };
    const payload = JSON.parse(Buffer.from(auth.tokens!.id_token!.split(".")[1]!, "base64url").toString()) as Record<string, unknown>;
    email = (payload.email as string) ?? null;
    plan = ((payload["https://api.openai.com/auth"] as Record<string, unknown> | undefined)?.chatgpt_plan_type as string) ?? null;
  } catch { /* login por API key ou arquivo ausente: sem e-mail */ }
  return { loggedIn, email, plan };
}

/**
 * Login guiado pela plataforma. O worker roda o login do CLI numa pasta isolada e publica no banco o que o usuário
 * precisa: Claude → link + campo para colar o código; Codex → link + código de dispositivo. Nada de terminal.
 */
export async function runLogin(loginId: string, signal: AbortSignal, log: (m: string) => Promise<void>) {
  const sql = db();
  const [l] = await sql<{ id: string; provider: AiProvider; name: string; ai_account_id: string | null }[]>`
    select id, provider, name, ai_account_id from ads.ai_logins where id = ${loginId}`;
  if (!l) throw new Error("Login não encontrado");
  const atualizar = (campos: Record<string, unknown>) => sql`update ads.ai_logins set ${sql(campos as Record<string, string>)}, updated_at = now() where id = ${l.id}`;

  let configRel: string;
  if (l.ai_account_id) {
    const [a] = await sql<{ config_dir: string }[]>`select config_dir from ads.ai_accounts where id = ${l.ai_account_id}`;
    if (!a) throw new Error("Conta não encontrada");
    configRel = a.config_dir;
  } else {
    configRel = randomUUID();
  }
  const configDir = resolveConfigDir(configRel);
  if (configDir !== NATIVE) mkdirSync(configDir, { recursive: true });

  const [bin, argv] = comando(l.provider, l.provider === "claude" ? ["auth", "login"] : ["login", "--device-auth"]);
  await log(`iniciando login do ${l.provider} (${l.name})`);
  const p = spawn(bin, argv, { env: { ...cliEnv(l.provider, configDir), BROWSER: "none" }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let out = "", publicado = false;
  const ler = async (d: Buffer) => {
    out = semAnsi(out + d).slice(-20_000);
    if (publicado) return;
    const url = l.provider === "claude" ? out.match(/https:\/\/\S*oauth\/authorize\S*/)?.[0] : out.match(/https:\/\/auth\.openai\.com\/\S+/)?.[0];
    const codigo = l.provider === "codex" ? out.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0] : undefined;
    if (url && (l.provider === "claude" || codigo)) {
      publicado = true;
      await atualizar({ status: "AWAITING_USER", url, user_code: codigo ?? null });
      await log("link de login pronto na plataforma");
    }
  };
  p.stdout.on("data", (d) => void ler(d));
  p.stderr.on("data", (d) => void ler(d));
  const fim = new Promise<number | null>((ok) => p.on("close", ok).on("error", () => ok(null)));

  // Enquanto o processo vive: entrega o código colado (Claude), obedece cancelamento e expira em 15 min.
  const limite = Date.now() + 15 * 60_000;
  let saiu = false;
  void fim.then(() => (saiu = true));
  while (!saiu) {
    await new Promise((r) => setTimeout(r, 1000));
    const [s] = await sql<{ status: string; code: string | null }[]>`select status, code from ads.ai_logins where id = ${l.id}`;
    if (signal.aborted || s?.status === "CANCELLED" || Date.now() > limite) { p.kill(); break; }
    if (s?.code) {
      p.stdin.write(`${s.code.trim()}\n`);
      await sql`update ads.ai_logins set code = null, updated_at = now() where id = ${l.id}`; // não guarda o código
      await log("código recebido, validando…");
    }
  }
  const code = await fim;
  const [s] = await sql<{ status: string }[]>`select status from ads.ai_logins where id = ${l.id}`;
  if (s?.status === "CANCELLED") return { cancelled: true };
  if (Date.now() > limite) { await atualizar({ status: "FAILED", error: "O login expirou (15 min). Comece de novo." }); throw new Error("login expirou"); }

  const st = code === 0 ? await authStatus(l.provider, configDir) : null;
  if (!st?.loggedIn) {
    const motivo = out.split("\n").map((x) => x.replace(/^.*prompted >\s*/i, "").trim()).filter((x) => /fail|error|erro|invalid|denied|expired/i.test(x)).at(-1);
    await atualizar({ status: "FAILED", error: motivo ? `O login não foi concluído: ${motivo}` : "O login não foi concluído. Confira o código e tente de novo." });
    throw new Error(motivo ?? `login saiu com código ${code}`);
  }
  let accountId = l.ai_account_id;
  if (accountId) {
    await sql`update ads.ai_accounts set email = ${st.email}, plan = ${st.plan}, last_error = null, limited_until = null where id = ${accountId}`;
  } else {
    const [a] = await sql<{ id: string }[]>`
      insert into ads.ai_accounts (provider, name, config_dir, email, plan, priority)
      values (${l.provider}, ${l.name}, ${configRel}, ${st.email}, ${st.plan}, (select coalesce(max(priority), -1) + 1 from ads.ai_accounts))
      returning id`;
    accountId = a!.id;
  }
  await atualizar({ status: "DONE", ai_account_id: accountId, error: null });
  await log(`conta conectada: ${st.email ?? l.name}`);
  return { accountId, email: st.email };
}

export interface Detectada { key: string; provider: AiProvider; name: string; config_dir: string; loggedIn: boolean; email: string | null; plan: string | null }

/**
 * Procura contas já logadas neste PC: login padrão do Windows (~/.claude, ~/.codex) e perfis do OMNI Agents.
 * Também atualiza e-mail/plano/saúde das contas já cadastradas. O resultado vai para worker_status (a web só lê).
 */
export async function detectar(): Promise<Detectada[]> {
  const sql = db();
  const candidatos: Omit<Detectada, "loggedIn" | "email" | "plan">[] = [
    { key: "native:claude", provider: "claude", name: "Login padrão deste PC", config_dir: NATIVE },
    { key: "native:codex", provider: "codex", name: "Login padrão deste PC", config_dir: NATIVE },
  ];
  const nativos = new Set([join(homedir(), ".claude"), join(homedir(), ".codex")].map((p) => p.toLowerCase()));
  try {
    const omni = JSON.parse(readFileSync(join(process.env.LOCALAPPDATA ?? "", "com.omni.agents/engine/profiles.json"), "utf8")) as {
      profiles?: { id: string; provider: string; name: string; config_dir: string }[];
    };
    for (const p of omni.profiles ?? []) {
      if ((p.provider === "claude" || p.provider === "codex") && isAbsolute(p.config_dir) && !nativos.has(p.config_dir.toLowerCase()) && existsSync(p.config_dir)) {
        candidatos.push({ key: `omni:${p.id}`, provider: p.provider, name: `${p.name} (OMNI Agents)`, config_dir: p.config_dir });
      }
    }
  } catch { /* OMNI não instalado */ }

  const achadas: Detectada[] = [];
  for (const c of candidatos) achadas.push({ ...c, ...(await authStatus(c.provider, resolveConfigDir(c.config_dir))) });

  // Plataforma sem nenhuma conta de IA: já usa as que estão logadas neste PC (sem precisar clicar em importar).
  // Depois disso, contas novas só entram pela tela, para não ressuscitar uma conta que alguém removeu.
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from ads.ai_accounts`) as unknown as [{ n: number }];
  if (n === 0) {
    for (const [i, d] of achadas.filter((x) => x.loggedIn).entries()) {
      const nome = `${d.email ?? d.provider}${d.config_dir === NATIVE ? "" : ` · ${d.name.replace(/ \(OMNI Agents\)$/, "")}`}`;
      await sql`insert into ads.ai_accounts (provider, name, config_dir, email, plan, priority)
                values (${d.provider}, ${nome}, ${d.config_dir}, ${d.email}, ${d.plan}, ${i}) on conflict (provider, config_dir) do nothing`;
      console.log(`conta de IA importada automaticamente: ${d.provider} · ${nome}`);
    }
  }

  const contas = await sql<{ id: string; provider: AiProvider; config_dir: string; last_error: string | null }[]>`select id, provider, config_dir, last_error from ads.ai_accounts`;
  for (const a of contas) {
    const st = await authStatus(a.provider, resolveConfigDir(a.config_dir));
    if (st.loggedIn) await sql`update ads.ai_accounts set email = coalesce(${st.email}, email), plan = coalesce(${st.plan}, plan),
      last_error = case when last_error like 'Login expirado%' then null else last_error end where id = ${a.id}`;
    else await sql`update ads.ai_accounts set last_error = 'Login expirado: use "Refazer login" em Configurações → IA' where id = ${a.id}`;
  }
  limparPastasOrfas(contas.map((a) => a.config_dir));
  return achadas.filter((d) => d.loggedIn);
}

/** Apaga pastas de login que não pertencem a nenhuma conta (conta removida, login abandonado há mais de 1 h). */
function limparPastasOrfas(emUso: string[]) {
  const usadas = new Set(emUso);
  for (const nome of readdirSync(ACCOUNTS_DIR)) {
    const p = join(ACCOUNTS_DIR, nome);
    if (!/^[0-9a-f-]{36}$/.test(nome) || usadas.has(nome) || Date.now() - statSync(p).mtimeMs < 3600_000) continue;
    rmSync(p, { recursive: true, force: true });
  }
}

export async function publicarDetectadas(d: Detectada[]) {
  await db()`update ads.worker_status set info = info || ${db().json({ detected: d, detectedAt: new Date().toISOString() } as unknown as Json)}
             where id = ${process.env.WORKER_ID || "pc-local"}`;
}
