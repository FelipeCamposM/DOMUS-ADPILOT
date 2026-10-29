"use server";

import { db, novaChave } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Sistemas conectados são da plataforma (usam as contas de IA globais): só o admin da plataforma mexe. */
async function exigirAdmin() {
  if (!isPlatformAdmin(await requireCtx())) throw new Error("Só o admin da plataforma gerencia os sistemas conectados");
}
const id = z.string().uuid("Sistema inválido");
const nome = z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo");

/** Cria o sistema e devolve a chave (aparece só desta vez). */
export async function criarSistema(n: string) {
  return run(async () => {
    await exigirAdmin();
    const k = novaChave();
    const sql = db();
    const [s] = await sql<{ id: string; nome: string }[]>`insert into ads.sistemas (nome, chave_hash, chave_fim) values (${nome.parse(n)}, ${k.hash}, ${k.fim}) returning id, nome`;
    // já aparece em CRM → Sites, pronto para mandar leads pela API
    await sql`insert into ads.lead_sites (nome, chave, mensagem_inicial) values (${s!.nome}, ${`sistema:${s!.id}`}, ${"Olá! Sou {nome}, vim pelo {site}."}) on conflict (chave) do nothing`;
    revalidatePath("/sistemas");
    revalidatePath("/crm", "layout");
    return { chave: k.chave };
  });
}

const Ajustes = z.object({
  nome,
  limite_pct: z.number().min(1, "Limite entre 1% e 100%").max(100, "Limite entre 1% e 100%").nullable(),
  contas: z.array(z.string().uuid()).nullable(), // null = todas as contas
});

export async function salvarSistema(sistemaId: string, ajustes: z.input<typeof Ajustes>) {
  return run(async () => {
    await exigirAdmin();
    const a = Ajustes.parse(ajustes);
    if (a.contas && !a.contas.length) throw new Error("Escolha pelo menos uma conta (ou todas)");
    await db()`update ads.sistemas set nome = ${a.nome}, limite_pct = ${a.limite_pct}, contas = ${a.contas}::uuid[] where id = ${id.parse(sistemaId)}`;
    revalidatePath("/sistemas");
  });
}

export async function alternarSistema(sistemaId: string, ativo: boolean) {
  return run(async () => {
    await exigirAdmin();
    await db()`update ads.sistemas set ativo = ${ativo} where id = ${id.parse(sistemaId)}`;
    revalidatePath("/sistemas");
  });
}

/** Troca a chave: a antiga para de funcionar na hora. */
export async function trocarChaveSistema(sistemaId: string) {
  return run(async () => {
    await exigirAdmin();
    const k = novaChave();
    await db()`update ads.sistemas set chave_hash = ${k.hash}, chave_fim = ${k.fim} where id = ${id.parse(sistemaId)}`;
    revalidatePath("/sistemas");
    return { chave: k.chave };
  });
}
