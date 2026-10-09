import { caminhoLocal, db, r2Presign } from "@domus-ads/core";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/ctx";

const TIPOS: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", png: "image/png", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac" };

/**
 * Arquivo de um criativo, só para quem é do workspace. No PC (storage local): lido do disco com suporte a Range, para o
 * player avançar sem baixar tudo. No R2: redireciona para uma URL pré-assinada (1 h).
 * ?kind=thumb para a miniatura, ?download=1 para baixar com o nome do criativo.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Criativo inválido" }, { status: 400 });
  const [c] = await db()<{ name: string; storage: string; r2_key: string | null; thumbnail_key: string | null; mime: string | null }[]>`
    select name, storage, r2_key, thumbnail_key, mime from ads.creatives where id = ${id.data} and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
  const thumb = req.nextUrl.searchParams.get("kind") === "thumb";
  const key = thumb ? c?.thumbnail_key : c?.r2_key;
  if (!c || !key) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const ext = key.split(".").pop()!.toLowerCase();
  const nome = req.nextUrl.searchParams.get("download") ? `${c.name.replace(/[^\w\- ]/g, "_")}.${ext}` : undefined;

  if (c.storage !== "local") {
    return NextResponse.redirect(await r2Presign(key, "GET", 3600, nome), { status: 302, headers: { "Cache-Control": "private, max-age=1800" } });
  }

  if (!process.env.MEDIA_DIR) {
    return NextResponse.json({ error: "MEDIA_DIR não está carregado neste servidor: reinicie o pnpm dev (o .env só é lido ao iniciar)" }, { status: 503 });
  }
  const caminho = caminhoLocal(key);
  const info = await stat(caminho).catch(() => null);
  if (!info) return NextResponse.json({ error: "O arquivo não está no disco deste PC (MEDIA_DIR)" }, { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": (thumb ? null : c.mime) ?? TIPOS[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (nome) headers["Content-Disposition"] = `attachment; filename="${nome}"`;

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const total = info.size;
    let inicio = range[1] ? Number(range[1]) : total - Number(range[2]);
    let fim = range[1] && range[2] ? Number(range[2]) : total - 1;
    inicio = Math.max(0, inicio);
    fim = Math.min(total - 1, fim);
    if (inicio > fim) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    const corpo = Readable.toWeb(createReadStream(caminho, { start: inicio, end: fim })) as ReadableStream;
    return new Response(corpo, { status: 206, headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${total}`, "Content-Length": String(fim - inicio + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(caminho)) as ReadableStream, { status: 200, headers: { ...headers, "Content-Length": String(info.size) } });
}
