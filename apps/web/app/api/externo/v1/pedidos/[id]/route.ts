import { z } from "zod";
import { comChave, erro, estadoPedido, ok } from "@/lib/externo";

/** Estado do pedido; o texto vem aos poucos enquanto RODANDO. */
export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return comChave(req, async (s) => {
    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) return erro(400, "Pedido inválido.");
    const p = await estadoPedido(s.id, id.data);
    return p ? ok(p) : erro(404, "Pedido não encontrado (some 7 dias depois de criado).");
  });
}
