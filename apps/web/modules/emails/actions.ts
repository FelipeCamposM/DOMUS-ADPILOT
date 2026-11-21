"use server";

import { db } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { responder } from "@/lib/gmail";

async function admin() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma usa os e-mails");
  return ctx;
}

const respostaSchema = z.object({
  conta: z.string().uuid("Conta inválida"),
  thread: z.string().regex(/^[0-9a-f]{6,32}$/i, "Conversa inválida"),
  texto: z.string().trim().min(1, "Escreva a resposta").max(20_000, "Resposta muito longa (até 20 mil caracteres)"),
});

export async function responderEmail(input: unknown) {
  return run(async () => {
    await admin();
    const r = respostaSchema.parse(input);
    await responder(r.conta, r.thread, r.texto);
    revalidatePath("/crm/emails");
  });
}

export async function desconectarEmail(id: unknown) {
  return run(async () => {
    await admin();
    await db()`delete from ads.email_contas where id = ${z.string().uuid("Conta inválida").parse(id)}`;
    revalidatePath("/crm/emails");
  });
}
