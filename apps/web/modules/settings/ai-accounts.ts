"use server";

import { audit, db, enqueueJob } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Contas de IA e o worker são globais (servem todos os workspaces): só admin da plataforma (ADMIN_EMAILS). */
async function admin() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) throw new Error("Só administradores da plataforma (ADMIN_EMAILS) gerenciam as contas de IA");
  return ctx;
}

const uuid = z.string().uuid("Identificador inválido");

/** Começa um login guiado: o worker abre o login do CLI e devolve link/código para esta tela. */
export async function iniciarLoginIA(input: { provider: string; name?: string; accountId?: string }) {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    let provider: string, name: string, accountId: string | null = null;
    if (input.accountId) {
      const [a] = await sql<{ id: string; provider: string; name: string }[]>`select id, provider, name from ads.ai_accounts where id = ${uuid.parse(input.accountId)}`;
      if (!a) throw new Error("Conta não encontrada");
      ({ provider, name } = a);
      accountId = a.id;
    } else {
      provider = z.enum(["claude", "codex"], { message: "Escolha Claude ou Codex" }).parse(input.provider);
      name = z.string().trim().min(1, "Dê um nome para a conta").max(60, "Nome muito longo").parse(input.name);
    }
    const [w] = await sql<{ online: boolean }[]>`select last_seen > now() - interval '90 seconds' as online from ads.worker_status order by last_seen desc limit 1`;
    if (!w?.online) throw new Error("O worker está offline. Ligue o PC do worker (pnpm dev) e tente de novo.");
    await sql`update ads.ai_logins set status = 'CANCELLED', updated_at = now() where status in ('STARTING','AWAITING_USER','CODE_SUBMITTED') and created_by = ${ctx.user.id}`;
    const [l] = await sql<{ id: string }[]>`
      insert into ads.ai_logins (provider, name, ai_account_id, created_by) values (${provider}, ${name}, ${accountId}, ${ctx.user.id}) returning id`;
    await enqueueJob(sql, { workspaceId: null, type: "AI_LOGIN", payload: { loginId: l!.id }, createdBy: ctx.user.id, maxAttempts: 1 });
    return l!.id;
  });
}

/** Claude: o código que a página da Anthropic mostra depois do login. Vai para o worker, que apaga ao usar. */
export async function enviarCodigoIA(loginId: string, codigo: string) {
  return run(async () => {
    const ctx = await admin();
    const code = z.string().trim().min(10, "Cole o código completo").max(2000, "Código inválido").regex(/^[\w.#~-]+$/, "Cole só o código, sem espaços").parse(codigo);
    const r = await db()`update ads.ai_logins set code = ${code}, status = 'CODE_SUBMITTED', updated_at = now()
                         where id = ${uuid.parse(loginId)} and created_by = ${ctx.user.id} and status = 'AWAITING_USER'`;
    if (!r.count) throw new Error("Este login não está mais esperando código. Comece de novo.");
  });
}

export async function cancelarLoginIA(loginId: string) {
  return run(async () => {
    const ctx = await admin();
    await db()`update ads.ai_logins set status = 'CANCELLED', code = null, updated_at = now()
               where id = ${uuid.parse(loginId)} and created_by = ${ctx.user.id} and status not in ('DONE','FAILED')`;
  });
}

/** Cadastra uma conta que o worker achou já logada no PC (login padrão ou perfil do OMNI). O caminho vem do worker, nunca do navegador. */
export async function importarContaIA(key: string) {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    const [w] = await sql<{ info: { detected?: { key: string; provider: string; name: string; config_dir: string; email: string | null; plan: string | null }[] } }[]>`
      select info from ads.worker_status order by last_seen desc limit 1`;
    const d = w?.info.detected?.find((x) => x.key === z.string().max(200).parse(key));
    if (!d) throw new Error("Conta não encontrada. Clique em “Procurar neste PC” de novo.");
    const [ja] = await sql`select 1 from ads.ai_accounts where provider = ${d.provider} and config_dir = ${d.config_dir}`;
    if (ja) throw new Error("Esta conta já está cadastrada");
    const nome = d.email ? `${d.email}` : d.name;
    const [a] = await sql<{ id: string }[]>`
      insert into ads.ai_accounts (provider, name, config_dir, email, plan, priority)
      values (${d.provider}, ${nome}, ${d.config_dir}, ${d.email}, ${d.plan}, (select coalesce(max(priority), -1) + 1 from ads.ai_accounts)) returning id`;
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: "Importar conta de IA", entityType: "ai_account", entityId: a!.id, entityName: nome, after: { provider: d.provider } });
    revalidatePath("/settings");
  });
}

export async function procurarContasIA() {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    const [dup] = await sql`select 1 from ads.jobs where type = 'AI_DETECT' and status in ('PENDING','RUNNING')`;
    if (!dup) await enqueueJob(sql, { workspaceId: null, type: "AI_DETECT", payload: {}, createdBy: ctx.user.id, maxAttempts: 1 });
  });
}

export async function removerContaIA(id: string) {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    const [a] = await sql<{ name: string; provider: string }[]>`delete from ads.ai_accounts where id = ${uuid.parse(id)} returning name, provider`;
    if (!a) throw new Error("Conta não encontrada");
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: "Remover conta de IA", entityType: "ai_account", entityId: id, entityName: a.name, before: { provider: a.provider } });
    revalidatePath("/settings");
  });
}

/** Liga/desliga o início do worker com o Windows (Agendador de Tarefas). Só acontece com este clique. */
/** Conectar (gera QR na tela) ou desconectar o WhatsApp dos avisos. Quem fala com a Evolution é o worker. */
export async function whatsappAcao(acao: "conectar" | "desconectar") {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    const a = z.enum(["conectar", "desconectar"], { message: "Ação inválida" }).parse(acao);
    await sql`update ads.jobs set status = 'CANCELLED', finished_at = now() where type = 'WHATSAPP' and status in ('PENDING','RUNNING')`;
    await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP", payload: { acao: a }, createdBy: ctx.user.id, maxAttempts: 1 });
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: a === "conectar" ? "Conectar WhatsApp" : "Desconectar WhatsApp", entityType: "worker" });
  });
}

export async function inicializacaoWorker(ligar: boolean) {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    await enqueueJob(sql, { workspaceId: null, type: "WORKER_STARTUP", payload: { enable: z.boolean().parse(ligar) }, createdBy: ctx.user.id, maxAttempts: 1 });
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: ligar ? "Ativar início do worker com o Windows" : "Desativar início do worker com o Windows", entityType: "worker" });
  });
}
