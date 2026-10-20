"use server";

import { anexosSchema, apagarArquivo, audit, briefEdicaoSchema, briefImagemSchema, briefSchema, db, enqueueJob, MAX_FONTE_S, MUSICA_TAGS, paletaSchema, planoEdicaoSchema, planoImagemSchema, reescrever, storyboardSchema, violacoes, type Json } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole, type Ctx } from "@/lib/ctx";
import { marcaDoWorkspace } from "@/lib/marcas";

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
export async function criarImagem(input: { brief: unknown; anexos?: unknown; marcaId?: string | null }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const brief = briefImagemSchema.parse(input.brief);
    const anexos = await validarAnexos(ctx, input.anexos);
    const marca = brief.identidade === "workspace" ? await marcaDoWorkspace(ctx.workspace.id, input.marcaId) : null;
    await workerOnline();
    const sql = db();
    const [p] = await sql<{ id: string }[]>`
      insert into ads.video_projects (workspace_id, brand_id, kind, title, brief, status, assets, links, created_by)
      values (${ctx.workspace.id}, ${marca}, 'image', ${brief.produto}, ${sql.json(brief as unknown as Json)}, 'NEW', ${sql.json(anexos.assets as unknown as Json)}, ${sql.json(anexos.links as unknown as Json)}, ${ctx.user.id})
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
export async function criarVideo(input: { brief: unknown; anexos?: unknown; marcaId?: string | null }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const brief = briefSchema.parse(input.brief);
    const anexos = await validarAnexos(ctx, input.anexos);
    const marca = brief.identidade === "workspace" ? await marcaDoWorkspace(ctx.workspace.id, input.marcaId) : null;
    await workerOnline();
    const sql = db();
    const [p] = await sql<{ id: string }[]>`
      insert into ads.video_projects (workspace_id, brand_id, title, brief, status, assets, links, created_by)
      values (${ctx.workspace.id}, ${marca}, ${brief.produto}, ${sql.json(brief as unknown as Json)}, 'NEW', ${sql.json(anexos.assets as unknown as Json)}, ${sql.json(anexos.links as unknown as Json)}, ${ctx.user.id}) returning id`;
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
export async function regerarComStoryboard(projectId: string, cenas: unknown, musica?: string, paleta?: unknown) {
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
    // paleta conferida na revisão: o worker usa exatamente estas cores e fontes
    const pal = paleta == null ? null : paletaSchema.parse(paleta);
    await db()`update ads.video_projects set storyboard = ${db().json(novo as unknown as Json)}, paleta = coalesce(${pal ? db().json(pal as unknown as Json) : null}::jsonb, paleta) where id = ${p.id}`;
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

/** Troca só a voz: mesmo roteiro e visual, narração regravada. Post do calendário volta para a aprovação no WhatsApp. */
export async function trocarVoz(projectId: string, voz: string, vozNome: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este vídeo já está sendo gerado");
    const v = z.object({ voz: briefSchema.shape.voz, vozNome: briefSchema.shape.vozNome }).parse({ voz, vozNome });
    if (v.voz === "none") throw new Error("Escolha uma voz");
    const [row] = await db()<{ composition: string | null }[]>`select composition from ads.video_projects where id = ${p.id} and kind = 'video'`;
    if (!row?.composition) throw new Error("Gere o vídeo antes de trocar a voz");
    await workerOnline();
    await db()`update ads.video_projects set brief = brief || ${db().json(v)} where id = ${p.id}`;
    await enfileirar(ctx, p.id, { mode: "voz" });
    await db()`update ads.calendario_itens set status = 'GERANDO', aprovacao = null, updated_at = now() where project_id = ${p.id} and status = 'REVISAO'`;
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Trocar voz do vídeo", entityType: "video_project", entityId: p.id, entityName: p.title, after: v });
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

/**
 * Editar meu vídeo: o vídeo já enviado vira projeto de edição; o worker transcreve, corta as pausas e planeja as animações
 * (para revisão). Do calendário: o post de Reels passa a usar este vídeo (legenda e animações aprovadas sozinhas; a arte
 * pronta vai para a aprovação no WhatsApp como as outras).
 */
export async function criarEdicao(input: { brief: unknown; marcaId?: string | null; calendarioItemId?: string | null }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const brief = briefEdicaoSchema.parse(input.brief);
    const sql = db();
    const [v] = await sql<{ duration_ms: number | null }[]>`
      select duration_ms from ads.creatives where id = ${brief.videoId} and workspace_id = ${ctx.workspace.id} and type = 'VIDEO' and status = 'READY'`;
    if (!v) throw new Error("O vídeo enviado não foi encontrado. Envie de novo.");
    if (v.duration_ms && v.duration_ms > (MAX_FONTE_S + 1) * 1000) throw new Error(`O vídeo passa de ${MAX_FONTE_S / 60} minutos: corte antes de enviar`);
    const itemId = input.calendarioItemId ? uuid.parse(input.calendarioItemId) : null;
    const marca = brief.identidade === "workspace" ? await marcaDoWorkspace(ctx.workspace.id, input.marcaId) : null;
    await workerOnline();
    const id = await sql.begin(async (tx) => {
      const [p] = await tx<{ id: string }[]>`
        insert into ads.video_projects (workspace_id, brand_id, kind, title, brief, status, created_by)
        values (${ctx.workspace.id}, ${marca}, 'edit', ${brief.produto}, ${tx.json(brief as unknown as Json)}, 'NEW', ${ctx.user.id}) returning id`;
      if (itemId) {
        const r = await tx`update ads.calendario_itens set project_id = ${p!.id}, status = 'GERANDO', aprovacao = null, refazendo = null, erro = null, updated_at = now()
          where id = ${itemId} and workspace_id = ${ctx.workspace.id} and formato = 'REELS' and status in ('SUGERIDO', 'APROVADO', 'REVISAO', 'FALHOU') and refazendo is null`;
        if (!r.count) throw new Error("Este post não aceita vídeo agora (só Reels que ainda não foram agendados nem estão sendo gerados)");
      }
      return p!.id;
    });
    await enfileirar(ctx, id, { mode: "full" });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Editar vídeo enviado", entityType: "video_project", entityId: id, entityName: brief.produto, after: { rede: brief.rede, legenda: brief.estiloLegenda, calendario: itemId } });
    revalidatePath("/studio");
    if (itemId) revalidatePath("/conteudos");
    return id;
  });
}

const revisaoEdicaoSchema = z.object({
  // blocos da legenda que mudaram (índices das palavras do plano atual); texto vazio apaga o trecho da legenda
  legendas: z.array(z.object({ i0: z.number().int().min(0), i1: z.number().int().min(0), texto: z.string().trim().max(200, "Trecho da legenda muito longo") })).max(2000),
  overlays: z.array(z.object({
    texto: z.string().trim().min(1, "Animação sem texto").max(90, "Texto da animação muito longo"),
    sub: z.string().trim().max(140, "Texto de apoio muito longo"),
    itens: z.array(z.string().trim().min(1, "Item vazio").max(60, "Item muito longo")).max(4).optional(),
    remover: z.boolean(),
  })).max(40),
  estiloLegenda: briefEdicaoSchema.shape.estiloLegenda,
  rede: briefEdicaoSchema.shape.rede,
  legendasLigadas: z.boolean(),
});

/** Aprova a edição (legenda corrigida, animações, estilo e rede) e gera o vídeo. Também serve para refazer com outro estilo. */
export async function aprovarEdicao(projectId: string, input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    if (p.ocupado) throw new Error("Este vídeo já está sendo gerado");
    const e = revisaoEdicaoSchema.parse(input);
    const [row] = await db()<{ storyboard: unknown; brief: unknown }[]>`select storyboard, brief from ads.video_projects where id = ${p.id} and kind = 'edit'`;
    const plano = planoEdicaoSchema.safeParse(row?.storyboard);
    if (!row || !plano.success) throw new Error("Esta edição ainda não tem transcrição. Espere o worker terminar.");
    if (e.overlays.length !== plano.data.overlays.length) throw new Error("As animações mudaram. Recarregue a página.");
    // trechos de trás para frente: os índices dos anteriores não mudam
    const trechos = [...e.legendas].sort((a, b) => b.i0 - a.i0);
    let palavras = plano.data.palavras;
    let limite = palavras.length;
    for (const t of trechos) {
      if (t.i1 < t.i0 || t.i1 >= limite) throw new Error("A legenda mudou. Recarregue a página.");
      palavras = reescrever(palavras, t.i0, t.i1, t.texto);
      limite = t.i0;
    }
    const overlays = plano.data.overlays.flatMap((o, i) => (e.overlays[i]!.remover ? [] : [{ ...o, texto: e.overlays[i]!.texto, sub: e.overlays[i]!.sub, ...(o.itens ? { itens: e.overlays[i]!.itens ?? o.itens } : {}) }]));
    const novo = planoEdicaoSchema.parse({ ...plano.data, palavras, overlays });
    const brief = briefEdicaoSchema.parse({ ...(row.brief as object), estiloLegenda: e.estiloLegenda, rede: e.rede, legendas: e.legendasLigadas });
    await workerOnline();
    await db()`update ads.video_projects set storyboard = ${db().json(novo as unknown as Json)}, brief = ${db().json(brief as unknown as Json)} where id = ${p.id}`;
    await enfileirar(ctx, p.id, { mode: "render" });
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Aprovar edição do vídeo", entityType: "video_project", entityId: p.id, entityName: p.title, after: { legenda: e.estiloLegenda, rede: e.rede, trechosEditados: e.legendas.length } });
    revalidatePath(`/studio/${p.id}`);
  });
}

/**
 * Salva a linguagem visual de um vídeo do modo Livre como estilo: nos próximos vídeos a IA repete o visual com o
 * conteúdo novo (em qualquer formato). A composição aprovada vira a referência.
 */
export async function salvarEstilo(projectId: string, input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await doWorkspace(ctx, projectId);
    const e = z.object({
      nome: z.string().trim().min(2, "Dê um nome ao estilo").max(60, "Nome muito longo"),
      descricao: z.string().trim().max(400, "Descrição muito longa").default(""),
    }).parse(input);
    const sql = db();
    const [row] = await sql<{ composition: string | null; livre: boolean }[]>`
      select composition, coalesce(brief->>'estiloVisual', 'hud') = 'livre' as livre from ads.video_projects where id = ${p.id} and kind = 'video'`;
    if (!row?.composition) throw new Error("Gere o vídeo antes de salvar o estilo");
    if (!row.livre || row.composition.includes("assets/cenas.js")) throw new Error("Só vídeos do modo Livre viram estilo (os outros já são estilos prontos)");
    const [x] = await sql<{ n: number }[]>`select count(*)::int as n from ads.estilos_video where workspace_id = ${ctx.workspace.id}`;
    if ((x?.n ?? 0) >= 30) throw new Error("Limite de 30 estilos salvos: apague algum antes");
    const direcao = /<!-- direcao: ([^>]*?) -->/.exec(row.composition)?.[1] ?? "";
    const [novo] = await sql<{ id: string }[]>`insert into ads.estilos_video (workspace_id, nome, descricao, referencia, projeto_origem, capa_id, created_by)
      values (${ctx.workspace.id}, ${e.nome}, ${e.descricao || (direcao ? `linguagem "${direcao}" do vídeo de referência` : "")}, ${row.composition}, ${p.id}, ${p.creative_id}, ${ctx.user.id}) returning id`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Salvar estilo de vídeo", entityType: "video_project", entityId: p.id, entityName: e.nome });
    revalidatePath("/studio/novo");
    return novo!.id;
  });
}

export async function apagarEstilo(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const r = await db()`delete from ads.estilos_video where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
    if (!r.count) throw new Error("Estilo não encontrado");
    revalidatePath("/studio/novo");
  });
}

/** Favorita (ou desfavorita) uma voz do ElevenLabs para quem está logado: as favoritas aparecem primeiro no Studio. */
export async function favoritarVoz(vozId: string, favorita: boolean) {
  return run(async () => {
    const ctx = await requireCtx();
    const id = z.string().regex(/^[A-Za-z0-9]{8,40}$/, "Voz inválida").parse(vozId);
    await db()`update ads.workspace_members set vozes_favoritas = case when ${favorita}::boolean
        then array_append(array_remove(vozes_favoritas, ${id}), ${id}) else array_remove(vozes_favoritas, ${id}) end
      where workspace_id = ${ctx.workspace.id} and user_id = ${ctx.user.id}`;
  });
}
