import postgres from "postgres";

/**
 * Postgres do Supabase (schema `ads`) pelo pooler em MODO TRANSAÇÃO (DATABASE_URL, porta 6543).
 * O modo sessão (5432) tem só 15 clientes para o projeto inteiro (dividido com a Domus) e esgotava com web local +
 * worker + instâncias da Vercel, que congelam segurando a conexão (EMAXCONNSESSION, 11/10/2026).
 * O modo transação embaralhava respostas quando o postgres.js mandava várias consultas seguidas na mesma conexão
 * (pipelining: 08/10/2026 o layout caiu com "last_seen undefined"). Por isso max_pipeline: 0 = uma consulta por vez em
 * cada conexão. Só que com 0 o postgres.js recusa sql.begin; transação vai num segundo pool com pipeline normal, que é
 * seguro ali porque o Supavisor prende o mesmo backend do BEGIN ao COMMIT.
 * Numeric e bigint voltam como string (driver): dinheiro nunca vira float.
 */
// globalThis: o hot reload do Next em dev reavalia o módulo; sem isso cada reload abria outro pool
const g = globalThis as { __adsDb?: postgres.Sql };

export function db(): postgres.Sql {
  if (g.__adsDb) return g.__adsDb;
  const url = process.env.ADS_DB_URL ?? process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("DATABASE_URL ausente");
  const opcoes = {
    prepare: false, idle_timeout: process.env.VERCEL ? 5 : 20, connect_timeout: 10,
    // timeouts no servidor: consulta de um processo que morreu no meio não fica segurando trava para sempre
    connection: { application_name: "domus-adpilot", statement_timeout: 120_000, idle_in_transaction_session_timeout: 120_000 },
  };
  // max_pipeline existe no driver (src/index.js) mas falta nos tipos do pacote
  const solto = postgres(url, { ...opcoes, max: Number(process.env.ADS_DB_POOL ?? (process.env.VERCEL ? 3 : 5)), max_pipeline: 0 } as postgres.Options<{}>);
  const transacoes = postgres(url, { ...opcoes, max: 2 });
  // ponytail: Proxy só para desviar begin/end; o resto (template, json, unsafe…) é o cliente sem pipeline
  g.__adsDb = new Proxy(solto, {
    get(alvo, k, r) {
      if (k === "begin") return transacoes.begin.bind(transacoes);
      if (k === "end") return async (o?: { timeout?: number }) => { await Promise.all([alvo.end(o), transacoes.end(o)]); };
      return Reflect.get(alvo, k, r);
    },
  });
  return g.__adsDb;
}

export type Sql = postgres.Sql | postgres.TransactionSql;

export const iso = (d: Date | string | null | undefined) => (d == null ? null : d instanceof Date ? d.toISOString() : d);

export type Json = postgres.JSONValue;
