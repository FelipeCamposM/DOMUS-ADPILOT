import { db, enqueueJob, PEDIDOS_SIMULTANEOS } from "@domus-ads/core";
import { z } from "zod";
import { comChave, erro, ok } from "@/lib/externo";

const Pedido = z.object({
  instrucoes: z.string().max(100_000, "Instruções longas demais (máx. 100 mil caracteres)").default(""),
  prompt: z.string().trim().min(1, "Prompt vazio").max(1_000_000, "Prompt longo demais (máx. 1 milhão de caracteres)"),
});

/** Novo pedido de resposta. Devolve o id para acompanhar em GET /api/externo/v1/pedidos/{id}. */
export function POST(req: Request) {
  return comChave(req, async (s) => {
    const corpo = Pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return erro(400, corpo.error.issues[0]?.message ?? "Pedido inválido.");
    const sql = db();
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from ads.sistema_pedidos where sistema_id = ${s.id} and status in ('FILA', 'RODANDO')`;
    if ((n?.n ?? 0) >= PEDIDOS_SIMULTANEOS) return erro(429, `Este sistema já tem ${PEDIDOS_SIMULTANEOS} respostas em andamento. Espere uma terminar.`);
    const id = await sql.begin(async (tx) => {
      const [p] = await tx<{ id: string }[]>`
        insert into ads.sistema_pedidos (sistema_id, instrucoes, prompt) values (${s.id}, ${corpo.data.instrucoes}, ${corpo.data.prompt}) returning id`;
      const job = await enqueueJob(tx, { workspaceId: null, type: "AI_SISTEMA", payload: { pedidoId: p!.id, sistema: s.nome }, maxAttempts: 1 });
      await tx`update ads.sistema_pedidos set job_id = ${job} where id = ${p!.id}`;
      return p!.id;
    });
    return ok({ id, status: "FILA" }, 201);
  });
}
