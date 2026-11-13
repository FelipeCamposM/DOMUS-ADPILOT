"use server";

import { approveAiAction, db, enqueueJob, rejectAiAction, TIPOS_VENDAS } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx, requireRole, type Ctx } from "@/lib/ctx";

const texto = z.string().trim().min(1, "Escreva uma mensagem").max(16_000, "Mensagem muito longa (máx. 16 mil caracteres)");
const pref = z.enum(["auto", "claude", "codex"], { message: "Modelo inválido" });
const uuid = z.string().uuid("Identificador inválido");
// tela aberta quando a pergunta foi feita (bolha do consultor): vai para o worker como contexto
const pagina = z.object({
  path: z.string().trim().startsWith("/", "Rota inválida").max(500),
  titulo: z.string().max(300).default(""),
  texto: z.string().max(20_000, "Página grande demais").default(""),
}).optional();
const tipo = z.enum(["analista", "consultor", "marketing", "vendas"], { message: "Tipo de conversa inválido" }).default("analista");

/** Modo Vendas mexe no CRM/WhatsApp da plataforma: só o admin da plataforma. */
function vendasSoAdmin(ctx: Ctx, t: string) {
  if (t === "vendas" && !isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma usa o consultor de vendas");
}

async function conversaDoWorkspace(ctx: Ctx, id: string) {
  const [c] = await db()<{ id: string; status: string; tipo: string }[]>`
    select id, status, tipo from ads.ai_conversations where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
  if (!c) throw new Error("Conversa não encontrada");
  vendasSoAdmin(ctx, c.tipo);
  return c;
}

async function enfileirar(ctx: Ctx, conversationId: string, conteudo: string, pag?: z.infer<typeof pagina>) {
  const sql = db();
  await sql.begin(async (tx) => {
    // trava atômica: dois envios simultâneos (duplo clique, duas abas) não geram duas respostas
    const r = await tx`update ads.ai_conversations set status = 'RUNNING', updated_at = now() where id = ${conversationId} and status <> 'RUNNING'`;
    if (!r.count) throw new Error("Espere a resposta atual terminar (ou cancele).");
    await tx`insert into ads.ai_messages (conversation_id, role, content, meta) values (${conversationId}, 'user', ${conteudo}, ${tx.json(pag ? { pagina: pag } : {})})`;
    await enqueueJob(tx, { workspaceId: ctx.workspace.id, type: "AI_CHAT", payload: { conversationId }, createdBy: ctx.user.id, maxAttempts: 2 });
  });
}

export async function novaConversa(input: { texto: string; provider: string; tipo?: string; pagina?: unknown }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const t = texto.parse(input.texto);
    const tp = tipo.parse(input.tipo);
    vendasSoAdmin(ctx, tp);
    const [c] = await db()<{ id: string }[]>`
      insert into ads.ai_conversations (workspace_id, user_id, provider_pref, tipo)
      values (${ctx.workspace.id}, ${ctx.user.id}, ${pref.parse(input.provider)}, ${tp}) returning id`;
    await enfileirar(ctx, c!.id, t, pagina.parse(input.pagina));
    revalidatePath("/ai", "layout");
    return c!.id;
  });
}

export async function enviarMensagem(conversationId: string, input: { texto: string; provider: string; pagina?: unknown }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const c = await conversaDoWorkspace(ctx, conversationId);
    if (c.status === "RUNNING") throw new Error("Espere a resposta atual terminar (ou cancele).");
    await db()`update ads.ai_conversations set provider_pref = ${pref.parse(input.provider)} where id = ${c.id}`;
    await enfileirar(ctx, c.id, texto.parse(input.texto), pagina.parse(input.pagina));
    revalidatePath("/ai", "layout");
  });
}

export async function cancelarResposta(conversationId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const c = await conversaDoWorkspace(ctx, conversationId);
    const sql = db();
    await sql`update ads.jobs set status = 'CANCELLED', finished_at = now()
              where type = 'AI_CHAT' and status in ('PENDING','RUNNING') and payload->>'conversationId' = ${c.id}`;
    await sql`update ads.ai_conversations set status = 'IDLE' where id = ${c.id}`;
    await sql`update ads.ai_messages set status = 'ERROR', meta = meta || '{"error":"Cancelado"}' where conversation_id = ${c.id} and status = 'STREAMING'`;
  });
}

export async function apagarConversa(conversationId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const c = await conversaDoWorkspace(ctx, conversationId);
    await db()`delete from ads.ai_conversations where id = ${c.id}`;
    revalidatePath("/ai", "layout");
  });
}

/** Aprovar executa na Meta/Google (via core: trava de status, auditoria com origem AI_RECOMMENDATION). */
export async function aprovarAcao(actionId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    await acaoPermitida(ctx, actionId);
    await approveAiAction(ctx.workspace.id, uuid.parse(actionId), ctx.actor);
    revalidatePath("/", "layout");
  });
}

async function acaoPermitida(ctx: Ctx, actionId: string) {
  const [a] = await db()<{ type: string }[]>`select type from ads.ai_actions where id = ${uuid.parse(actionId)} and workspace_id = ${ctx.workspace.id}`;
  if (a && (TIPOS_VENDAS as readonly string[]).includes(a.type)) vendasSoAdmin(ctx, "vendas");
}

export async function rejeitarAcao(actionId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    await acaoPermitida(ctx, actionId);
    await rejectAiAction(ctx.workspace.id, uuid.parse(actionId), ctx.actor);
    revalidatePath("/", "layout");
  });
}
