import postgres from "postgres";

/**
 * Postgres do Supabase (schema `ads`). Web e worker usam o pooler em MODO SESSÃO (DIRECT_URL, porta 5432).
 * Não usar o modo transação (porta 6543): o postgres.js manda consultas em paralelo na mesma conexão (pipelining) e o
 * Supavisor em modo transação embaralha as respostas — uma consulta recebia o resultado de outra (08/10/2026: layout
 * caiu com "last_seen undefined"; o SIAPLUS já tinha travado pelo mesmo motivo).
 * Numeric e bigint voltam como string (driver): dinheiro nunca vira float.
 */
// globalThis: o hot reload do Next em dev reavalia o módulo; sem isso cada reload abria outro pool
const g = globalThis as { __adsDb?: postgres.Sql };

export function db(): postgres.Sql {
  const url = process.env.ADS_DB_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL ausente");
  if (/:6543\//.test(url)) console.warn("[db] porta 6543 (modo transação) embaralha consultas paralelas; use DIRECT_URL (5432)");
  // timeouts no servidor: consulta de um processo que morreu no meio não fica segurando trava para sempre
  // O modo sessão do Supavisor tem só 15 clientes para web local + worker + instâncias da Vercel. Na Vercel a instância
  // congela entre requisições e segura a conexão aberta: pool menor (ADS_DB_POOL) e conexão ociosa fecha rápido.
  g.__adsDb ??= postgres(url, {
    prepare: false, max: Number(process.env.ADS_DB_POOL ?? (process.env.VERCEL ? 2 : 5)), idle_timeout: process.env.VERCEL ? 5 : 20, connect_timeout: 10,
    connection: { application_name: "domus-adpilot", statement_timeout: 120_000, idle_in_transaction_session_timeout: 120_000 },
  });
  return g.__adsDb;
}

export type Sql = postgres.Sql | postgres.TransactionSql;

export const iso = (d: Date | string | null | undefined) => (d == null ? null : d instanceof Date ? d.toISOString() : d);

export type Json = postgres.JSONValue;
