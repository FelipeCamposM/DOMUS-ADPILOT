import "server-only";
import postgres from "postgres";
import { ZodError } from "zod";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Server Actions devolvem { ok, error } em vez de lançar: em produção o Next esconde a mensagem de erros lançados.
 * Mensagens nossas (pt-BR) vão para a tela; erro de banco vira mensagem genérica e só vai para o log.
 */
export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e; // redirect/notFound
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
    if (e instanceof postgres.PostgresError) {
      console.error("[action] erro de banco", e);
      return { ok: false, error: "Erro inesperado ao salvar. Tente de novo." };
    }
    return { ok: false, error: (e as Error).message || "Erro inesperado" };
  }
}
