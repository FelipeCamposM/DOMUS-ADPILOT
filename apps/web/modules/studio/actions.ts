"use server";

import { anexosSchema, apagarArquivo, audit, briefImagemSchema, briefSchema, db, enqueueJob, MUSICA_TAGS, planoImagemSchema, storyboardSchema, violacoes, type Json } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole, type Ctx } from "@/lib/ctx";

const uuid = z.string().uuid("Projeto inválido");

async function workerOnline() {
  const [w] = await db()<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
  if (!w?.ok) throw new Error("O worker está offline. Ligue o PC do worker (pnpm dev) e tente de novo.");
}

async function doWorkspace(ctx: Ctx, id: string) {
  const [p] = await db()<{ id: string; title: string; creative_id: string | null }[]>`
    select id, title, creative_id from ads.video_projects where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
  if (!p) throw new Error("Projeto não encontrado");
  const [ativo] = await db()`select 1 from ads.jobs where type in ('GENERATE_VIDEO','GENERATE_IMAGE') and status in ('PENDING','RUNNING') and payload->>'projectId' = ${p.id}`;
  return { ...p, ocupado: !!ativo };
}

async function enfileirar(ctx: Ctx, projectId: string, payload: Record<string, unknown>) {
  // trava atômica: só sai de um estado parado (NEW/REVIEW/READY/FAILED); dois cliques não geram dois jobs
  const r = await db()`update ads.video_projects set status = 'QUEUED', step_detail = 'Na fila do worker…', error = null, updated_at = now()
    where id = ${projectId} and status in ('NEW','REVIEW','READY','FAILED')`;
  if (!r.count) throw new Error("Este projeto já está sendo gerado");
  const [k] = await db()<{ kind: string }[]>`select kind from ads.video_projects where id = ${projectId}`;
  await enqueueJob(db(), { workspaceId: ctx.workspace.id, type: k?.kind === "image" ? "GENERATE_IMAGE" : "GENERATE_VIDEO", payload: { projectId, ...payload }, createdBy: ctx.user.id, maxAttempts: 1 });
}

/** Anexos só podem apontar para arquivos deste workspace. */
async function validarAnexos(ctx: Ctx, input: unknown) {
  const a = anexosSchema.parse(input ?? {});
  const ids = a.assets.map((x) => x.creativeId);
  if (ids.length) {
    const ok = await db()<{ id: string }[]>`select id from ads.creatives where id = any(${ids}::uuid[]) and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
    if (ok.length !== new Set(ids).size) throw new Error("Algum arquivo anexado não existe mais neste workspace");
  }
  return a;
}

/** Nova imagem (1–4 variações para teste A/B), com identidade visual e anexos. */
export async function criarImagem(input: { brief: unknown; anexos?: unknown }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const brief = briefImagemSchema.parse(input.brief);
    const anexos = await validarAnexos(ctx, input.anexos);
    await workerOnline();
    const sql = db();
    const [p] = await sql<{ id: string }[]>`
      insert into ads.video_projects (workspace_id, kind, title, brief, status, assets, links, created_by)
      values (${ctx.workspace.id}, 'image', ${brief.produto}, ${sql.json(brief as unknown as Json)}, 'NEW', ${sql.json(anexos.assets as unknown as Json)}, ${sql.json(anexos.links as unknown as Json)}, ${ctx.user.id})
      returning id`;
    await enfileirar(ctx, p!.id, { mode: "full" });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Gerar imagens", entityType: "video_project", entityId: p!.id, entityName: brief.produto, after: { formato: brief.formato, variacoes: brief.variacoes } });
    revalidatePath("/studio");
    return p!.id;
  });
}

/** Mais variações no mesmo projeto de imagem (diferentes das que já existem). */
export async function maisVariacoes(projectId: string, quantidade: number) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este projeto já está sendo gerado");
    await workerOnline();
    await enfileirar(ctx, p.id, { mode: "mais", quantidade: z.number().int().min(1).max(4).parse(quantidade) });
    revalidatePath(`/studio/${p.id}`);
  });
}

/** Refaz UMA variação com um pedido em texto (a IA ajusta a arte dela). */
export async function ajustarVariacao(projectId: string, creativeId: string, pedido: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este projeto já está sendo gerado");
    const [c] = await db()`select 1 from ads.creatives where id = ${uuid.parse(creativeId)} and workspace_id = ${ctx.workspace.id} and metadata->>'projectId' = ${p.id}`;
    if (!c) throw new Error("Variação não encontrada");
    await workerOnline();
    const instruction = z.string().trim().min(3, "Descreva o ajuste").max(2000, "Pedido muito longo").parse(pedido);
    await enfileirar(ctx, p.id, { mode: "adjust", creativeId, instruction });
    revalidatePath(`/studio/${p.id}`);
  });
}

export async function apagarVariacao(projectId: string, creativeId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Espere a geração terminar");
    const [c] = await db()<{ storage: string; r2_key: string | null }[]>`
      delete from ads.creatives where id = ${uuid.parse(creativeId)} and workspace_id = ${ctx.workspace.id} and metadata->>'projectId' = ${p.id} and type = 'IMAGE'
      returning storage, r2_key`;
    if (!c) throw new Error("Variação não encontrada");
    if (c.r2_key) await apagarArquivo(c.storage, c.r2_key).catch(() => {});
    await db()`update ads.video_projects set creative_id = (select id from ads.creatives where metadata->>'projectId' = ${p.id} order by created_at limit 1) where id = ${p.id}`;
    revalidatePath(`/studio/${p.id}`);
  });
}

/** Novo vídeo a partir do briefing (spec §15). O worker gera roteiro → voz → animação → render → R2. */
export async function criarVideo(input: { brief: unknown; anexos?: unknown }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const brief = briefSchema.parse(input.brief);
    const anexos = await validarAnexos(ctx, input.anexos);
    await workerOnline();
    const sql = db();
    const [p] = await sql<{ id: string }[]>`
      insert into ads.video_projects (workspace_id, title, brief, status, assets, links, created_by)
      values (${ctx.workspace.id}, ${brief.produto}, ${sql.json(brief as unknown as Json)}, 'NEW', ${sql.json(anexos.assets as unknown as Json)}, ${sql.json(anexos.links as unknown as Json)}, ${ctx.user.id}) returning id`;
    await enfileirar(ctx, p!.id, { mode: "full" });
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Gerar vídeo", entityType: "video_project", entityId: p!.id, entityName: brief.produto, after: { duracao: brief.duracao, formato: brief.formato } });
    revalidatePath("/studio");
    return p!.id;
  });
}

const edicaoSchema = z.array(z.object({
  headline: z.string().trim().min(1, "Toda cena precisa de um título").max(140, "Título muito longo"),
  subtext: z.string().trim().max(220, "Texto de apoio muito longo"),
  narration: z.string().trim().max(600, "Narração muito longa"),
  itens: z.array(z.string().trim().min(1, "Item vazio").max(90, "Item muito longo")).max(4, "No máximo 4 itens").optional(),
}));

/**
 * Aprova o roteiro (ou salva o texto editado) e gera o vídeo: voz, animação e render só rodam aqui.
 * Os tempos se ajustam à narração nova. musica: troca o clima da trilha ("none" = sem música).
 */
export async function regerarComStoryboard(projectId: string, cenas: unknown, musica?: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este vídeo já está sendo gerado");
    await workerOnline();
    const [row] = await db()<{ storyboard: unknown }[]>`select storyboard from ads.video_projects where id = ${p.id}`;
    if (!row?.storyboard) throw new Error("Este vídeo ainda não tem storyboard");
    const sb = storyboardSchema.parse(row.storyboard);
    const edit = edicaoSchema.parse(cenas);
    if (edit.length !== sb.scenes.length) throw new Error("O número de cenas mudou. Recarregue a página.");
    const m = musica === undefined ? undefined : z.enum(["none", ...MUSICA_TAGS], { message: "Música inválida" }).parse(musica);
    const novo = { ...sb, scenes: sb.scenes.map((s, i) => ({ ...s, ...edit[i] })), ...(m ? { music: m === "none" ? null : { tag: m, volume: sb.music?.volume ?? 0.25 } } : {}) };
    await db()`update ads.video_projects set storyboard = ${db().json(novo as unknown as Json)} where id = ${p.id}`;
    await enfileirar(ctx, p.id, { mode: "rerender" });
    revalidatePath(`/studio/${p.id}`);
  });
}

/** "Ajustar com IA": pedido em texto; a IA altera a animação atual mantendo os tempos e a narração. */
export async function ajustarComIA(projectId: string, pedido: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este vídeo já está sendo gerado");
    await workerOnline();
    const instruction = z.string().trim().min(3, "Descreva o ajuste").max(2000, "Pedido muito longo").parse(pedido);
    await enfileirar(ctx, p.id, { mode: "adjust", instruction });
    revalidatePath(`/studio/${p.id}`);
  });
}

export async function gerarDeNovo(projectId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este vídeo já está sendo gerado");
    await workerOnline();
    await enfileirar(ctx, p.id, { mode: "full" });
    revalidatePath(`/studio/${p.id}`);
  });
}

export async function cancelarVideo(projectId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    await db()`update ads.jobs set status = 'CANCELLED', finished_at = now() where type in ('GENERATE_VIDEO','GENERATE_IMAGE') and status in ('PENDING','RUNNING') and payload->>'projectId' = ${p.id}`;
    await db()`update ads.video_projects set status = 'FAILED', error = 'Cancelado', updated_at = now() where id = ${p.id}`;
    revalidatePath(`/studio/${p.id}`);
  });
}

/** Apaga o projeto e o vídeo final (banco + arquivo no PC ou no R2). */
export async function apagarVideo(projectId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Cancele a geração antes de apagar");
    // o vídeo final, todas as variações de imagem e as fotos baixadas dos links do projeto (banco + arquivos)
    const gerados = await db()<{ id: string; storage: string; r2_key: string | null; thumbnail_key: string | null }[]>`
      select id, storage, r2_key, thumbnail_key from ads.creatives
      where workspace_id = ${ctx.workspace.id} and (id = ${p.creative_id ?? null} or metadata->>'projectId' = ${p.id} or metadata->>'refDe' = ${p.id}) and type in ('VIDEO','IMAGE')`;
    for (const c of gerados) {
      for (const k of [c.r2_key, c.thumbnail_key]) if (k) await apagarArquivo(c.storage, k).catch(() => {});
      await db()`delete from ads.creatives where id = ${c.id}`;
    }
    await db()`delete from ads.video_projects where id = ${p.id}`;
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Apagar vídeo", entityType: "video_project", entityId: p.id, entityName: p.title });
    revalidatePath("/studio");
  });
}

/** Aprova os conceitos de imagem (editados ou não) e só então a IA desenha e o worker renderiza. */
export async function aprovarConceitos(projectId: string, conceitos: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este projeto já está sendo gerado");
    await workerOnline();
    const plano = planoImagemSchema.parse({ conceitos });
    const [b] = await db()<{ tipo: string | null }[]>`select brief->>'tipo' as tipo from ads.video_projects where id = ${p.id}`;
    if (b?.tipo === "carrossel" ? plano.conceitos.length < 2 : plano.conceitos.length > 4)
      throw new Error(b?.tipo === "carrossel" ? "O carrossel precisa de pelo menos 2 slides" : "Máximo 4 conceitos por vez");
    const r = await db()`update ads.video_projects set storyboard = ${db().json(plano as unknown as Json)} where id = ${p.id} and kind = 'image' and status = 'REVIEW'`;
    if (!r.count) throw new Error("Não há conceitos esperando aprovação. Recarregue a página.");
    await enfileirar(ctx, p.id, { mode: "render" });
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Aprovar conceitos de imagem", entityType: "video_project", entityId: p.id, entityName: p.title, after: { quantidade: plano.conceitos.length } });
    revalidatePath(`/studio/${p.id}`);
  });
}

/** Descarta os conceitos novos em revisão e volta às imagens que já existiam. */
export async function descartarRevisao(projectId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    const r = await db()`update ads.video_projects set status = 'READY', step_detail = 'Pronto', updated_at = now()
      where id = ${p.id} and kind = 'image' and status = 'REVIEW' and creative_id is not null`;
    if (!r.count) throw new Error("Nada para descartar: este projeto ainda não tem imagens");
    revalidatePath(`/studio/${p.id}`);
  });
}

/**
 * Editor visual: salva o HTML editado à mão e o PC gera o PNG de novo (sem IA, sem crédito).
 * O HTML passa pela mesma barreira de segurança antes de ir para o Chrome do worker.
 */
export async function salvarEdicao(projectId: string, creativeId: string, html: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Espere a geração atual terminar");
    const doc = z.string().min(50, "Arte vazia").max(900_000, "A arte ficou grande demais para salvar").parse(html);
    const erros = violacoes(doc);
    if (erros.length) throw new Error(`A edição não pode ser salva: ${erros[0]}`);
    const [c] = await db()`select 1 from ads.creatives where id = ${uuid.parse(creativeId)} and workspace_id = ${ctx.workspace.id} and type = 'IMAGE' and metadata->>'projectId' = ${p.id}`;
    if (!c) throw new Error("Imagem não encontrada");
    await workerOnline();
    await enfileirar(ctx, p.id, { mode: "manual", creativeId, html: doc });
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Editar imagem no editor visual", entityType: "creative", entityId: creativeId, entityName: p.title });
    revalidatePath(`/studio/${p.id}`);
  });
}
