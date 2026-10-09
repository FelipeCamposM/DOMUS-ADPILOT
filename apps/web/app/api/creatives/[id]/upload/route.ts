import { caminhoLocal, db } from "@domus-ads/core";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { can, requireCtx } from "@/lib/ctx";

/**
 * Upload da biblioteca quando o armazenamento é o PC: o navegador manda o arquivo para cá (PUT) e ele é gravado em
 * streaming no MEDIA_DIR, sem passar pela memória inteiro. Só aceita um criativo deste workspace ainda em UPLOADING, e
 * no máximo o tamanho declarado no início.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "editor")) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success || !req.body) return NextResponse.json({ error: "Upload inválido" }, { status: 400 });
  const [c] = await db()<{ r2_key: string; size_bytes: string; storage: string }[]>`
    select r2_key, size_bytes::text, storage from ads.creatives where id = ${id.data} and workspace_id = ${ctx.workspace.id} and status = 'UPLOADING'`;
  if (!c || c.storage !== "local") return NextResponse.json({ error: "Upload não encontrado" }, { status: 404 });

  const limite = Number(c.size_bytes);
  const destino = caminhoLocal(c.r2_key);
  await mkdir(dirname(destino), { recursive: true });
  let recebidos = 0;
  const contador = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      recebidos += chunk.length;
      cb(recebidos > limite ? new Error("Arquivo maior que o declarado") : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as never), contador, createWriteStream(destino));
  } catch (e) {
    await rm(destino, { force: true });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, bytes: recebidos });
}
