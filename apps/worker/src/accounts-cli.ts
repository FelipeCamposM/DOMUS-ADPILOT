import { ACCOUNTS_DIR } from "./env"; // primeiro: carrega o .env
import { db } from "@domus-ads/core";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cliEnv, NATIVE, type AiProvider } from "./ai/cli";
import { resolveConfigDir } from "./ai/login";

/**
 * Alternativa de terminal à tela Configurações → IA (lá dá para conectar, importar e refazer login sem comando).
 * Contas de IA do PC do worker. Cada conta tem a própria pasta de config (CLAUDE_CONFIG_DIR / CODEX_HOME), então
 * várias assinaturas convivem sem uma deslogar a outra. "native" usa o login padrão do Windows (~/.claude, ~/.codex).
 *
 *   pnpm worker:account add claude "Pessoal"        cria e abre o login no navegador
 *   pnpm worker:account add codex "Trabalho"
 *   pnpm worker:account add claude "Meu PC" --native   usa o login que já existe no Windows
 *   pnpm worker:account login "Pessoal"             refaz o login (token expirou)
 *   pnpm worker:account list
 *   pnpm worker:account remove "Pessoal"
 */
const sql = db();
const [cmd, ...args] = process.argv.slice(2);

function cliLogin(provider: AiProvider, configDir: string) {
  const env = cliEnv(provider, resolveConfigDir(configDir));
  const [bin, argv] = provider === "claude" ? ["claude", ["auth", "login"]] : ["codex", ["login"]];
  console.log(`\nAbrindo o login do ${provider}. Entre com a conta desejada no navegador.\n`);
  const r = spawnSync(bin, argv, { stdio: "inherit", env, shell: process.platform === "win32" && provider === "codex" });
  if (r.status !== 0) throw new Error(`O login do ${provider} não terminou (código ${r.status}).`);
}

async function achar(ref: string) {
  const [a] = await sql<{ id: string; provider: AiProvider; name: string; config_dir: string }[]>`
    select id, provider, name, config_dir from ads.ai_accounts where id::text = ${ref} or lower(name) = lower(${ref}) limit 1`;
  if (!a) throw new Error(`Conta "${ref}" não encontrada. Veja: pnpm worker:account list`);
  return a;
}

try {
  if (cmd === "add") {
    const [provider, name] = args;
    if ((provider !== "claude" && provider !== "codex") || !name) throw new Error('uso: add <claude|codex> "<nome>" [--native] [--priority N]');
    const nativa = args.includes("--native");
    const pi = args.indexOf("--priority");
    const priority = pi > 0 ? Number(args[pi + 1]) || 0 : 0;
    const configDir = nativa ? NATIVE : randomUUID();
    if (!nativa) {
      mkdirSync(join(ACCOUNTS_DIR, configDir), { recursive: true });
      cliLogin(provider, configDir);
    }
    await sql`insert into ads.ai_accounts (provider, name, config_dir, priority) values (${provider}, ${name}, ${configDir}, ${priority})`;
    console.log(`\nConta "${name}" (${provider}) cadastrada. Ela já aparece em Configurações → IA na plataforma.`);
  } else if (cmd === "login") {
    const a = await achar(args[0] ?? "");
    if (a.config_dir !== NATIVE && !existsSync(join(ACCOUNTS_DIR, a.config_dir))) mkdirSync(join(ACCOUNTS_DIR, a.config_dir), { recursive: true });
    cliLogin(a.provider, a.config_dir);
    await sql`update ads.ai_accounts set last_error = null, limited_until = null where id = ${a.id}`;
    console.log(`Login de "${a.name}" renovado.`);
  } else if (cmd === "remove") {
    const a = await achar(args[0] ?? "");
    await sql`delete from ads.ai_accounts where id = ${a.id}`;
    console.log(`Conta "${a.name}" removida da plataforma. A pasta ${a.config_dir === NATIVE ? "(login nativo)" : join(ACCOUNTS_DIR, a.config_dir)} não foi apagada.`);
  } else if (cmd === "list" || !cmd) {
    const contas = await sql<{ name: string; provider: string; status: string; priority: number; limited_until: Date | null; usage: { five_hour?: { pct: number }; seven_day?: { pct: number } } | null; last_error: string | null }[]>`
      select name, provider, status, priority, limited_until, usage, last_error from ads.ai_accounts order by priority, created_at`;
    if (!contas.length) console.log('Nenhuma conta. Cadastre com: pnpm worker:account add claude "Nome"');
    console.table(contas.map((c) => ({
      nome: c.name, provider: c.provider, status: c.status, prioridade: c.priority,
      "5h %": c.usage?.five_hour?.pct ?? "-", "semana %": c.usage?.seven_day?.pct ?? "-",
      bloqueada_ate: c.limited_until && c.limited_until > new Date() ? c.limited_until.toLocaleString("pt-BR") : "-",
      erro: c.last_error?.slice(0, 50) ?? "",
    })));
  } else {
    throw new Error("comandos: add | login | list | remove");
  }
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
