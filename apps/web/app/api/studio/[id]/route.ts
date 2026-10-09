import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/ctx";
import { projeto } from "@/lib/video";

/** Polling do projeto de vídeo enquanto o worker gera (etapa, progresso, erro). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Projeto inválido" }, { status: 400 });
  const p = await projeto(ctx.workspace.id, id.data);
  if (!p) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  return NextResponse.json({ status: p.status, step_detail: p.step_detail, error: p.error, progress: p.progress, job_status: p.job_status, updated_at: p.updated_at }, { headers: { "Cache-Control": "no-store" } });
}
