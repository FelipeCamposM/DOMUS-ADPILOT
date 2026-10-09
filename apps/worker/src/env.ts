import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Carregado primeiro: .env da raiz do monorepo. O worker usa a conexão direta (sessão) do Postgres.
const raiz = resolve(import.meta.dirname, "../../..");
try {
  process.loadEnvFile(join(raiz, ".env"));
} catch {
  throw new Error(`Arquivo .env não encontrado em ${raiz}`);
}
process.env.ADS_DB_URL ??= process.env.DIRECT_URL;

export const WORKER_ID = process.env.WORKER_ID || "pc-local";
/** Tudo que o worker grava fica aqui: contas de IA isoladas e uma pasta por conversa/job. */
export const DATA_DIR = resolve(process.env.WORKER_DATA_DIR || join(raiz, ".worker-data"));
export const ACCOUNTS_DIR = join(DATA_DIR, "accounts");
export const CONV_DIR = join(DATA_DIR, "conversations");
mkdirSync(ACCOUNTS_DIR, { recursive: true });
mkdirSync(CONV_DIR, { recursive: true });

export const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 3);
export const SYNC_INTERVAL_MIN = Number(process.env.SYNC_INTERVAL_MIN || 60);
