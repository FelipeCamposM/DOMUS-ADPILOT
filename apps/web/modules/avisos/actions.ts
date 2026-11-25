"use server";

import { db, enqueueJob, MAX_TEXTO_WA, whatsappAvisos } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

const textoSchema = z.string().trim().min(1, "Escreva a resposta").max(MAX_TEXTO_WA, `Resposta muito longa (até ${MAX_TEXTO_WA} caracteres)`);

/**
 * Resposta escrita na tela Avisos, no lugar de responder pelo WhatsApp: entra no histórico como se você tivesse mandado
 * e o worker trata igual ("sim" agenda, "não" pergunta o que mudar, o resto vira pedido de ajuste).
 */
export async function responderAviso(texto: string) {
  return run(async () => {
    const ctx = await requireCtx();
    if (!isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma responde os avisos");
    const t = textoSchema.parse(texto);
    const sql = db();
    const avisos = await whatsappAvisos();
    if (!avisos) throw new Error("Configure o número dos avisos em Configurações → WhatsApp");
    await sql`insert into ads.whatsapp_envios (para, texto, status, direcao, tipo, autor) values (${avisos}, ${t}, 'RECEBIDO', 'IN', 'texto', 'pela plataforma')`;
    await enqueueJob(sql, { workspaceId: null, type: "AVISO_RESPONDER", payload: { texto: t }, createdBy: ctx.user.id, maxAttempts: 1 });
    revalidatePath("/avisos");
  });
}
