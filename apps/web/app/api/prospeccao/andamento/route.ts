import { db } from "@domus-ads/core";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/**
 * Andamento da busca de leads para o aviso fixo (uma linha da campanha, consulta mínima). O aviso pergunta a cada 2 s só
 * enquanto a busca roda; a página inteira só recarrega quando ela termina.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Busca inválida" }, { status: 400 });
  const [c] = await db()<{ status: string; progresso: number; etapa_texto: string; encontrados: number; a_auditar: number; auditar: boolean; bloqueado: boolean; erro: string | null; nome: string; fila: boolean }[]>`
    select c.status, c.progresso, c.etapa_texto, c.encontrados, c.a_auditar, c.auditar, c.bloqueado, c.erro, c.nome,
      coalesce((select j.started_at is null from ads.jobs j where j.id = c.job_id), false) as fila
    from ads.prosp_campanhas c where c.id = ${id}`;
  if (!c) return NextResponse.json({ status: "deleted" }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(c, { headers: { "Cache-Control": "no-store" } });
}
