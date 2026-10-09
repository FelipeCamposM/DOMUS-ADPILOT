import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "./db";

/**
 * Aplica migrations/*.sql ainda não aplicadas, em ordem, cada uma numa transação (registro em ads._migrations).
 * Idempotente: o worker chama ao iniciar, então ninguém precisa rodar comando de banco à mão.
 */
export async function migrate(url = process.env.DIRECT_URL ?? process.env.DATABASE_URL, log: (m: string) => void = console.log) {
  if (!url) throw new Error("DIRECT_URL ausente");
  // lock_timeout: se algo segurar a tabela, falha em 15 s com mensagem clara em vez de travar
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {}, connection: { application_name: "domus-adpilot-migrate", lock_timeout: 15_000 } });
  try {
    const dir = join(import.meta.dirname, "..", "migrations");
    await sql`create schema if not exists ads`;
    await sql`create table if not exists ads._migrations (name text primary key, applied_at timestamptz not null default now())`;
    await sql`alter table ads._migrations enable row level security`;
    const feitas = new Set((await sql<{ name: string }[]>`select name from ads._migrations`).map((r) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (feitas.has(file)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(dir, file), "utf8"));
        await tx`insert into ads._migrations (name) values (${file})`;
      });
      log(`migration aplicada: ${file}`);
    }
  } finally {
    await sql.end();
  }
}

/** Primeiro acesso só existe enquanto a plataforma não tem nenhum membro. */
export async function plataformaVazia(sql: Sql): Promise<boolean> {
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from ads.workspace_members`;
  return (r?.n ?? 0) === 0;
}

/** Cria os workspaces iniciais (SIAPLUS, DOMUS) se não houver nenhum e põe o usuário como owner de todos. */
export async function tornarOwnerInicial(sql: Sql, userId: string) {
  const [w] = await sql<{ n: number }[]>`select count(*)::int as n from ads.workspaces`;
  if (!w?.n) await sql`insert into ads.workspaces (name, slug) values ('SIAPLUS', 'siaplus'), ('DOMUS', 'domus')`;
  await sql`
    insert into ads.workspace_members (workspace_id, user_id, role) select id, ${userId}, 'owner' from ads.workspaces
    on conflict (workspace_id, user_id) do update set role = 'owner'`;
}
