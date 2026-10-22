import { db } from "@domus-ads/core";
import { comChave, ok } from "@/lib/externo";
import { workerOnline } from "@/lib/queries";

/** Worker online e uso das assinaturas que podem atender este sistema (na ordem em que são usadas). */
export function GET(req: Request) {
  return comChave(req, async (s) => {
    const w = await workerOnline();
    const contas = await db()<{ nome: string; provider: string; plano: string | null; livre: boolean; usage: Record<string, unknown> | null }[]>`
      select name as nome, provider, plan as plano, (limited_until is null or limited_until < now()) as livre, usage
      from ads.ai_accounts
      where status = 'ACTIVE' and (${s.contas}::uuid[] is null or id = any(${s.contas}::uuid[]))
      order by priority, created_at`;
    return ok({
      sistema: s.nome,
      limite_pct: s.limite_pct === null ? null : Number(s.limite_pct),
      worker: { online: w.online, visto_em: w.lastSeen?.toISOString() ?? null, maquina: typeof w.info.host === "string" ? w.info.host : null },
      contas,
    });
  });
}
