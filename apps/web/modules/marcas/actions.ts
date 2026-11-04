"use server";

import { audit, brandSchema, db, enqueueJob, type Json } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole } from "@/lib/ctx";
import { marcaDoWorkspace } from "@/lib/marcas";

const nomeMarca = z.string().trim().min(2, "Nome da marca muito curto").max(60, "Nome da marca muito longo");
const DUPLICADA = "Já existe uma marca com esse nome";

export async function criarMarca(nome: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const n = nomeMarca.parse(nome);
    const [m] = await db()<{ id: string }[]>`
      insert into ads.brands (workspace_id, nome) values (${ctx.workspace.id}, ${n}) on conflict (workspace_id, nome) do nothing returning id`;
    if (!m) throw new Error(DUPLICADA);
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Criar marca", entityType: "brand", entityId: m.id, entityName: n });
    revalidatePath("/marcas");
    return m.id;
  });
}

/** Nome + identidade (cores, fontes, logo, tom, regras). Vale para o que for criado depois com esta marca. */
export async function salvarMarca(id: string, input: { nome: unknown; brand: unknown }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const mid = (await marcaDoWorkspace(ctx.workspace.id, id))!;
    const n = nomeMarca.parse(input.nome);
    const brand = brandSchema.parse(input.brand);
    const sql = db();
    if (brand.logoId) {
      const [l] = await sql`select 1 from ads.creatives where id = ${brand.logoId} and workspace_id = ${ctx.workspace.id} and type = 'IMAGE' and status = 'READY'`;
      if (!l) throw new Error("A logo escolhida não é uma imagem deste workspace");
    }
    const [dup] = await sql`select 1 from ads.brands where workspace_id = ${ctx.workspace.id} and nome = ${n} and id <> ${mid}`;
    if (dup) throw new Error(DUPLICADA);
    const [antes] = await sql<{ nome: string; brand: unknown }[]>`select nome, brand from ads.brands where id = ${mid}`;
    await sql`update ads.brands set nome = ${n}, brand = ${sql.json(brand as unknown as Json)}, updated_at = now() where id = ${mid}`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Alterar marca", entityType: "brand", entityId: mid, entityName: n, before: (antes ?? null) as Json, after: { nome: n, brand } as unknown as Json });
    revalidatePath("/marcas");
  });
}

const siteSchema = z.string().trim().max(500).refine((u) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(u), "Site inválido: use o endereço completo, ex.: https://digitaldomus.com.br");

/** Base de conhecimento: o worker vasculha o site e a IA organiza os fatos da marca (roda no PC do worker). */
export async function gerarConhecimento(id: string, url: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const mid = (await marcaDoWorkspace(ctx.workspace.id, id))!;
    const site = siteSchema.parse(url);
    const sql = db();
    const [rodando] = await sql`select 1 from ads.jobs where type = 'MARCA_CONHECIMENTO' and status in ('PENDING','RUNNING') and payload->>'brandId' = ${mid}`;
    if (rodando) throw new Error("A base desta marca já está sendo gerada");
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "MARCA_CONHECIMENTO", payload: { brandId: mid, url: site }, createdBy: ctx.user.id, maxAttempts: 1 });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Gerar base de conhecimento", entityType: "brand", entityId: mid, after: { site } });
    revalidatePath("/marcas");
  });
}

/** Texto da base revisado à mão pelo cliente. */
export async function salvarConhecimento(id: string, texto: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const mid = (await marcaDoWorkspace(ctx.workspace.id, id))!;
    const t = z.string().trim().max(30_000, "Base muito longa (até 30 mil caracteres)").parse(texto);
    await db()`update ads.brands set conhecimento = ${t}, conhecimento_em = now(), updated_at = now() where id = ${mid}`;
    revalidatePath("/marcas");
  });
}

/** Apagar a marca não apaga nada criado com ela (os projetos ficam sem marca). */
export async function apagarMarca(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const mid = (await marcaDoWorkspace(ctx.workspace.id, id))!;
    const [m] = await db()<{ nome: string; brand: unknown }[]>`delete from ads.brands where id = ${mid} returning nome, brand`;
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Apagar marca", entityType: "brand", entityId: mid, entityName: m?.nome, before: (m ?? null) as Json });
    revalidatePath("/marcas");
  });
}
