import { db } from "@domus-ads/core";
import { z } from "zod";
import { comChave, erro, estadoPedido, ok } from "@/lib/externo";

/** Para a resposta: o pedido vira CANCELADO e o job é cancelado (o worker encerra o CLI em até 2 s). */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return comChave(req, async (s) => {
    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) return erro(400, "Pedido inválido.");
    const sql = db();
    const [p] = await sql<{ job_id: string | null }[]>`
      update ads.sistema_pedidos set status = 'CANCELADO', erro = 'Parado.', instrucoes = null, prompt = null, updated_at = now()
      where id = ${id.data} and sistema_id = ${s.id} and status in ('FILA', 'RODANDO') returning job_id`;
    if (p?.job_id) await sql`update ads.jobs set status = 'CANCELLED', finished_at = now() where id = ${p.job_id} and status in ('PENDING', 'RUNNING')`;
    const e = await estadoPedido(s.id, id.data);
    return e ? ok(e) : erro(404, "Pedido não encontrado.");
  });
}
