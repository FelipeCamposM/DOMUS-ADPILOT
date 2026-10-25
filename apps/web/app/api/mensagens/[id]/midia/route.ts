import { db } from "@domus-ads/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { servirArquivo } from "@/lib/servir";

/** Imagem, vídeo, áudio ou arquivo de uma mensagem do WhatsApp. Mensagens são da plataforma: só o admin vê. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
  const [m] = await db()<{ midia_storage: string | null; midia_key: string | null; midia_mime: string | null; midia_nome: string | null }[]>`
    select midia_storage, midia_key, midia_mime, midia_nome from ads.whatsapp_envios where id = ${id.data}`;
  if (!m?.midia_key || !m.midia_storage) return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
  const download = req.nextUrl.searchParams.has("download") ? (m.midia_nome || m.midia_key.split("/").pop()!).replace(/[^\w\-. ]/g, "_") : undefined;
  return servirArquivo(req, { storage: m.midia_storage, key: m.midia_key, mime: m.midia_mime, download });
}
