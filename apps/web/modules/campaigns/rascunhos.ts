"use server";

import { audit, db, enqueueJob, googleSearchSchema, publicarRascunho, validarRascunho, type Json } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole, type Ctx } from "@/lib/ctx";

const uuid = z.string().uuid("Rascunho inválido");

async function workerOnline() {
  const [w] = await db()<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
  if (!w?.ok) throw new Error("O worker está offline. Ligue o PC do worker (pnpm dev) e tente de novo.");
}

/** A conta escolhida precisa ser do Google e deste workspace. */
async function contaGoogle(ctx: Ctx, id: string) {
  const [a] = await db()<{ id: string; currency: string }[]>`
    select id, currency from ads.ad_accounts where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id} and provider = 'GOOGLE'`;
  if (!a) throw new Error("Conta do Google Ads não encontrada neste workspace");
  return a;
}

async function doWorkspace(ctx: Ctx, id: string) {
  const [d] = await db()<{ id: string; status: string; name: string }[]>`select id, status, name from ads.campaign_drafts where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
  if (!d) throw new Error("Rascunho não encontrado");
  return d;
}

const novoSchema = z.discriminatedUnion("modo", [
  z.object({
    modo: z.literal("ia"),
    contaId: z.string(),
    pedido: z.string().trim().min(15, "Conte em pelo menos uma frase o que quer anunciar").max(4000, "Pedido muito longo"),
    orcamento: z.string().trim().regex(/^\d{1,9}([.,]\d{1,2})?$/, "Use um valor como 70 ou 70,50"),
    url: z.string().trim().url("URL inválida").or(z.literal("")),
  }),
  z.object({
    modo: z.literal("manual"),
    contaId: z.string(),
    nome: z.string().trim().min(3, "Nome muito curto").max(120),
    orcamento: z.string().trim().regex(/^\d{1,9}([.,]\d{1,2})?$/, "Use um valor como 70 ou 70,50"),
    url: z.string().trim().url("URL inválida (use https://…)"),
  }),
]);

/** Novo rascunho: com IA (o worker escreve a proposta) ou manual (começa com um esqueleto para preencher). */
export async function criarRascunho(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const v = novoSchema.parse(input);
    const conta = await contaGoogle(ctx, v.contaId);
    const sql = db();
    const orcamento = v.orcamento.replace(",", ".");
    if (v.modo === "ia") {
      await workerOnline();
      const pedido = `${v.pedido}\n\nOrçamento diário: ${orcamento} ${conta.currency}${v.url ? `\nSite: ${v.url}` : ""}`;
      const [d] = await sql<{ id: string }[]>`
        insert into ads.campaign_drafts (workspace_id, ad_account_id, name, status, source, prompt, spec, created_by)
        values (${ctx.workspace.id}, ${conta.id}, 'Campanha em criação…', 'GENERATING', 'AI', ${pedido}, ${sql.json({ orcamentoDiario: orcamento, urlFinal: v.url || undefined } as unknown as Json)}, ${ctx.user.id})
        returning id`;
      await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "AI_CAMPAIGN", payload: { draftId: d!.id }, createdBy: ctx.user.id, maxAttempts: 1 });
      await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Pedir campanha à IA", entityType: "campaign_draft", entityId: d!.id });
      revalidatePath("/campaigns");
      return d!.id;
    }
    const spec = {
      nome: v.nome, orcamentoDiario: orcamento, lances: "MAXIMIZE_CLICKS", urlFinal: v.url, localizacoes: ["Brasil"], idiomas: ["pt"], parceirosPesquisa: false,
      negativas: [], sitelinks: [], frasesDestaque: [],
      grupos: [{ nome: "Grupo 1", palavras: [], negativas: [], anuncios: [{ titulos: ["", "", ""], descricoes: ["", ""], caminho1: "", caminho2: "" }] }],
    };
    const [d] = await sql<{ id: string }[]>`
      insert into ads.campaign_drafts (workspace_id, ad_account_id, name, status, source, spec, created_by)
      values (${ctx.workspace.id}, ${conta.id}, ${v.nome}, 'DRAFT', 'MANUAL', ${sql.json(spec as unknown as Json)}, ${ctx.user.id}) returning id`;
    revalidatePath("/campaigns");
    return d!.id;
  });
}

/** Salva a edição. Aceita rascunho incompleto (vai sendo preenchido); a validação completa é na publicação. */
export async function salvarRascunho(id: string, spec: unknown, contaId?: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const d = await doWorkspace(ctx, id);
    if (!["DRAFT", "FAILED"].includes(d.status)) throw new Error("Este rascunho não pode ser editado agora");
    const bruto = z.record(z.string(), z.unknown()).parse(spec);
    if (JSON.stringify(bruto).length > 200_000) throw new Error("Rascunho grande demais");
    const conta = contaId ? await contaGoogle(ctx, contaId) : null;
    const nome = typeof bruto.nome === "string" && bruto.nome.trim() ? bruto.nome.trim().slice(0, 120) : d.name;
    await db()`update ads.campaign_drafts set spec = ${db().json(bruto as Json)}, name = ${nome}, validated_at = null,
      ad_account_id = coalesce(${conta?.id ?? null}, ad_account_id), status = 'DRAFT', updated_at = now() where id = ${d.id}`;
    revalidatePath(`/campaigns/rascunhos/${d.id}`);
  });
}

/** Pede à IA um ajuste na proposta ("mais palavras de cauda longa", "foco em Goiânia"…). */
export async function ajustarComIA(id: string, pedido: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const d = await doWorkspace(ctx, id);
    const texto = z.string().trim().min(3, "Descreva o ajuste").max(2000, "Pedido muito longo").parse(pedido);
    await workerOnline();
    const r = await db()`update ads.campaign_drafts set status = 'GENERATING', error = null, updated_at = now() where id = ${d.id} and status in ('DRAFT', 'FAILED')`;
    if (!r.count) throw new Error("Este rascunho não pode ser ajustado agora");
    await enqueueJob(db(), { workspaceId: ctx.workspace.id, type: "AI_CAMPAIGN", payload: { draftId: d.id, pedido: texto }, createdBy: ctx.user.id, maxAttempts: 1 });
    revalidatePath(`/campaigns/rascunhos/${d.id}`);
  });
}

/** "Validar no Google": confere tudo na API sem criar nada. */
export async function validar(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const d = await doWorkspace(ctx, id);
    await validarRascunho({ workspaceId: ctx.workspace.id, draftId: d.id });
    revalidatePath(`/campaigns/rascunhos/${d.id}`);
  });
}

/** Publica (cria no Google, PAUSADA). Só admin/owner: é dinheiro de verdade. */
export async function publicar(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "admin");
    const d = await doWorkspace(ctx, id);
    const [r] = await db()<{ spec: unknown }[]>`select spec from ads.campaign_drafts where id = ${d.id}`;
    googleSearchSchema.parse(r!.spec); // erros em português antes de ir ao Google
    await publicarRascunho({ workspaceId: ctx.workspace.id, draftId: d.id, actor: ctx.actor });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/rascunhos/${d.id}`);
  });
}

export async function apagarRascunho(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const d = await doWorkspace(ctx, id);
    if (d.status === "PUBLISHING" || d.status === "GENERATING") throw new Error("Espere terminar antes de apagar");
    await db()`delete from ads.campaign_drafts where id = ${d.id}`;
    revalidatePath("/campaigns");
  });
}
