"use server";

import { audit, CAMPOS_REFAZER, db, enqueueJob, faltasItem, itemCalSchema, pedidoCalSchema, roteiroSchema, type FormatoCal, type Json } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole, type Ctx } from "@/lib/ctx";
import { marcaDoWorkspace } from "@/lib/marcas";

const uuid = z.string().uuid("Identificador inválido");
const EDITAVEIS = ["SUGERIDO", "APROVADO"];

async function workerOnline() {
  const [w] = await db()<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
  if (!w?.ok) throw new Error("O worker está offline: ligue o PC do worker e tente de novo.");
}

async function itemDoWorkspace(ctx: Ctx, id: string) {
  const [i] = await db()<{ id: string; calendario_id: string; status: string; refazendo: string | null; formato: FormatoCal; data_hora: Date }[]>`
    select id, calendario_id, status, refazendo, formato, data_hora from ads.calendario_itens where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
  if (!i) throw new Error("Post do calendário não encontrado");
  return i;
}

const revalidar = () => revalidatePath("/conteudos");

/** Novo planejamento: a IA sugere todos os posts do período numa chamada só. */
export async function planejarPeriodo(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = pedidoCalSchema.parse(input);
    const sql = db();
    const [conta] = await sql`select 1 from ads.instagram_accounts where id = ${p.contaId} and workspace_id = ${ctx.workspace.id}`;
    if (!conta) throw new Error("Perfil do Instagram não encontrado");
    const marca = await marcaDoWorkspace(ctx.workspace.id, p.marcaId);
    await workerOnline();
    const [c] = await sql<{ id: string }[]>`
      insert into ads.calendarios (workspace_id, ig_account_id, brand_id, inicio, fim, objetivo, mix, created_by)
      values (${ctx.workspace.id}, ${p.contaId}, ${marca}, ${p.inicio}, ${p.fim}, ${p.objetivo}, ${sql.json(p.mix)}, ${ctx.user.id}) returning id`;
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "AI_CALENDARIO", payload: { calendarioId: c!.id }, createdBy: ctx.user.id, maxAttempts: 1 });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Planejar calendário", entityType: "calendario", entityId: c!.id, entityName: `${p.inicio} a ${p.fim}`, after: p.mix });
    revalidar();
    return c!.id;
  });
}

/** Planeja o período de novo: troca as sugestões não aprovadas (as aprovadas ficam). */
export async function replanejar(calendarioId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    await workerOnline();
    const sql = db();
    const r = await sql`update ads.calendarios set status = 'GERANDO', erro = null, updated_at = now()
      where id = ${uuid.parse(calendarioId)} and workspace_id = ${ctx.workspace.id} and status <> 'GERANDO'`;
    if (!r.count) throw new Error("Este planejamento já está sendo gerado");
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "AI_CALENDARIO", payload: { calendarioId }, createdBy: ctx.user.id, maxAttempts: 1 });
    revalidar();
  });
}

/** Apaga o planejamento e as sugestões; o que já virou publicação continua em Planejados. */
export async function apagarPlanejamento(calendarioId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const sql = db();
    const [g] = await sql`select 1 from ads.calendario_itens where calendario_id = ${uuid.parse(calendarioId)} and status = 'GERANDO' limit 1`;
    if (g) throw new Error("Há uma arte sendo gerada neste planejamento; espere terminar");
    const r = await sql`delete from ads.calendarios where id = ${calendarioId} and workspace_id = ${ctx.workspace.id}`;
    if (!r.count) throw new Error("Planejamento não encontrado");
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Apagar planejamento do calendário", entityType: "calendario", entityId: calendarioId });
    revalidar();
  });
}

/** Salva o que o usuário editou. Aprovado continua aprovado se ainda estiver completo. */
export async function salvarItem(id: string, input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const i = await itemDoWorkspace(ctx, id);
    if (!EDITAVEIS.includes(i.status)) throw new Error("Este post já está sendo gerado ou publicado");
    if (i.refazendo) throw new Error("A IA está refazendo este post; espere terminar");
    const d = itemCalSchema.parse(input);
    if (Date.parse(d.dataHora) < Date.now() + 10 * 60_000) throw new Error("Escolha um horário daqui a pelo menos 10 minutos");
    const faltas = i.status === "APROVADO" ? faltasItem(d) : [];
    const sql = db();
    await sql`update ads.calendario_itens set data_hora = ${d.dataHora}, formato = ${d.formato}, tema = ${d.tema}, objetivo = ${d.objetivo},
      roteiro = ${sql.json(d.roteiro as unknown as Json)}, legenda = ${d.legenda}, hashtags = ${d.hashtags},
      status = ${faltas.length ? "SUGERIDO" : i.status}, erro = null, updated_at = now() where id = ${i.id}`;
    revalidar();
    return { voltouParaSugestao: faltas.length > 0 };
  });
}

/** A IA refaz um campo (ou o post inteiro), com uma dica opcional do usuário. */
export async function refazerComIA(id: string, campo: string, dica: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const i = await itemDoWorkspace(ctx, id);
    if (!EDITAVEIS.includes(i.status)) throw new Error("Este post já está sendo gerado ou publicado");
    const c = z.enum(CAMPOS_REFAZER, { message: "Campo inválido" }).parse(campo);
    const d = z.string().max(500, "Pedido muito longo (até 500 caracteres)").parse(dica);
    await workerOnline();
    const sql = db();
    const r = await sql`update ads.calendario_itens set refazendo = ${c}, erro = null, updated_at = now() where id = ${i.id} and refazendo is null`;
    if (!r.count) throw new Error("A IA já está refazendo este post");
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "AI_CALENDARIO", payload: { itemId: i.id, campo: c, dica: d }, createdBy: ctx.user.id, maxAttempts: 1 });
    revalidar();
  });
}

/** Aprova os posts completos (com horário no futuro). Devolve quantos e o primeiro motivo de quem ficou de fora. */
export async function aprovarItens(ids: string[]) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const lista = z.array(uuid).min(1, "Nada para aprovar").max(200).parse(ids);
    const sql = db();
    const itens = await sql<{ id: string; formato: FormatoCal; roteiro: unknown; legenda: string; hashtags: string[]; data_hora: Date; tema: string }[]>`
      select id, formato, roteiro, legenda, hashtags, data_hora, tema from ads.calendario_itens
      where id = any(${lista}::uuid[]) and workspace_id = ${ctx.workspace.id} and status = 'SUGERIDO' and refazendo is null`;
    let ok = 0;
    let motivo: string | null = null;
    for (const i of itens) {
      const faltas = faltasItem({ ...i, roteiro: roteiroSchema.parse(i.roteiro ?? {}) });
      if (i.data_hora.getTime() < Date.now() + 10 * 60_000) faltas.push("o horário já passou");
      if (faltas.length) { motivo ??= `“${i.tema.slice(0, 40)}”: ${faltas[0]}`; continue; }
      await sql`update ads.calendario_itens set status = 'APROVADO', erro = null, updated_at = now() where id = ${i.id} and status = 'SUGERIDO'`;
      ok++;
    }
    if (ok) await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Aprovar posts do calendário", entityType: "calendario", after: { quantidade: ok } });
    revalidar();
    return { aprovados: ok, motivo };
  });
}

/** Aprovado ou que falhou volta a ser sugestão (para editar e aprovar de novo). */
export async function voltarParaSugestao(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const i = await itemDoWorkspace(ctx, id);
    const r = await db()`update ads.calendario_itens set status = 'SUGERIDO', project_id = null, post_id = null, erro = null, updated_at = now()
      where id = ${i.id} and status in ('APROVADO', 'FALHOU')`;
    if (!r.count) throw new Error("Só dá para voltar posts aprovados ou que falharam");
    revalidar();
  });
}

export async function descartarItem(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const i = await itemDoWorkspace(ctx, id);
    const r = await db()`delete from ads.calendario_itens where id = ${i.id} and status in ('SUGERIDO', 'APROVADO', 'FALHOU')`;
    if (!r.count) throw new Error("Este post já está sendo gerado ou publicado");
    revalidar();
  });
}

/** Post manual num dia: entra como sugestão em branco; a IA pode preencher com “Refazer post”. Fora de um período planejado, cria um “avulsos” para o dia. */
export async function novoItem(contaId: string, calendarioId: string | null, dataHora: string, formato: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const d = itemCalSchema.pick({ dataHora: true, formato: true }).parse({ dataHora, formato });
    const sql = db();
    let cal = calendarioId ? uuid.parse(calendarioId) : null;
    if (cal) {
      const [c] = await sql`select 1 from ads.calendarios where id = ${cal} and workspace_id = ${ctx.workspace.id}`;
      if (!c) throw new Error("Planejamento não encontrado");
    } else {
      const [conta] = await sql`select 1 from ads.instagram_accounts where id = ${uuid.parse(contaId)} and workspace_id = ${ctx.workspace.id}`;
      if (!conta) throw new Error("Perfil do Instagram não encontrado");
      const dia = new Date(d.dataHora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const [c] = await sql<{ id: string }[]>`insert into ads.calendarios (workspace_id, ig_account_id, inicio, fim, objetivo, status, created_by)
        values (${ctx.workspace.id}, ${contaId}, ${dia}, ${dia}, 'Posts avulsos adicionados no calendário', 'PRONTO', ${ctx.user.id}) returning id`;
      cal = c!.id;
    }
    const [i] = await sql<{ id: string }[]>`insert into ads.calendario_itens (calendario_id, workspace_id, data_hora, formato, tema)
      values (${cal}, ${ctx.workspace.id}, ${d.dataHora}, ${d.formato}, 'Novo post') returning id`;
    revalidar();
    return i!.id;
  });
}

const OBJETIVO_STUDIO = "Posts criados no Studio";
const novoPostSchema = z.object({
  contaId: uuid,
  marcaId: z.string().uuid("Marca inválida").nullable(),
  formato: z.enum(["FEED", "CARROSSEL", "REELS"], { message: "Escolha o tipo do post" }),
  tema: z.string().trim().min(3, "Diga sobre o que é o post").max(160, "Tema com no máximo 160 caracteres"),
  detalhes: z.string().trim().max(320, "Detalhes com no máximo 320 caracteres").default(""),
  dataHora: z.string().datetime({ offset: true, message: "Data inválida" }),
});

/**
 * "Novo post" do Studio: entra no planejamento do Studio (um por perfil + marca, para a arte usar a logo e as cores certas)
 * e a IA escreve roteiro, legenda e hashtags. Depois o usuário revisa e aprova em Conteúdos; aprovado, gera e publica sozinho.
 */
export async function novoPostIA(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = novoPostSchema.parse(input);
    const quando = new Date(p.dataHora);
    if (quando.getTime() < Date.now() + 15 * 60_000) throw new Error("Escolha um horário daqui a pelo menos 15 minutos");
    const marca = await marcaDoWorkspace(ctx.workspace.id, p.marcaId);
    await workerOnline();
    const sql = db();
    const [conta] = await sql`select 1 from ads.instagram_accounts where id = ${p.contaId} and workspace_id = ${ctx.workspace.id}`;
    if (!conta) throw new Error("Perfil do Instagram não encontrado");
    const dia = quando.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const id = await sql.begin(async (tx) => {
      let [cal] = await tx<{ id: string }[]>`
        select id from ads.calendarios where workspace_id = ${ctx.workspace.id} and ig_account_id = ${p.contaId} and objetivo = ${OBJETIVO_STUDIO}
          and brand_id is not distinct from ${marca}::uuid limit 1`;
      if (cal) await tx`update ads.calendarios set fim = greatest(fim, ${dia}::date), inicio = least(inicio, ${dia}::date), updated_at = now() where id = ${cal.id}`;
      else [cal] = await tx<{ id: string }[]>`
        insert into ads.calendarios (workspace_id, ig_account_id, brand_id, inicio, fim, objetivo, mix, status, created_by)
        values (${ctx.workspace.id}, ${p.contaId}, ${marca}, ${dia}, ${dia}, ${OBJETIVO_STUDIO}, '{}', 'PRONTO', ${ctx.user.id}) returning id`;
      const [i] = await tx<{ id: string }[]>`
        insert into ads.calendario_itens (calendario_id, workspace_id, data_hora, formato, tema, objetivo, refazendo)
        values (${cal!.id}, ${ctx.workspace.id}, ${quando}, ${p.formato}, ${p.tema}, ${p.detalhes.slice(0, 300)}, 'item') returning id`;
      return i!.id;
    });
    const dica = `Post sobre: ${p.tema}${p.detalhes ? `. ${p.detalhes}` : ""}`.slice(0, 500);
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "AI_CALENDARIO", payload: { itemId: id, campo: "item", dica }, createdBy: ctx.user.id, maxAttempts: 1 });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Novo post com IA", entityType: "calendario_item", entityId: id, after: { formato: p.formato, tema: p.tema } });
    revalidar();
    return { id, conta: p.contaId, mes: dia.slice(0, 7) };
  });
}
