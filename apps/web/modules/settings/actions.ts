"use server";

import { armazenamentoSchema, audit, db, gravarSegredo, vozesElevenLabs } from "@domus-ads/core";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx, requireRole, WS_COOKIE } from "@/lib/ctx";
import { supabase } from "@/lib/supabase";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const nome = z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo");
const papel = z.enum(["owner", "admin", "editor", "viewer"], { message: "Papel inválido" });
const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export async function renomearWorkspace(novo: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "admin");
    const n = nome.parse(novo);
    await db()`update ads.workspaces set name = ${n} where id = ${ctx.workspace.id}`;
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Renomear workspace", entityType: "workspace", entityId: ctx.workspace.id, before: { name: ctx.workspace.name }, after: { name: n } });
    revalidatePath("/", "layout");
  });
}

/** Qualquer membro cria um workspace novo (cliente/produto) e vira owner dele. */
export async function criarWorkspace(novo: string) {
  return run(async () => {
    const ctx = await requireCtx();
    const n = nome.parse(novo);
    const sql = db();
    const id = await sql.begin(async (tx) => {
      const [w] = await tx<{ id: string }[]>`
        insert into ads.workspaces (name, slug) values (${n}, ${`${slug(n) || "ws"}-${Math.random().toString(36).slice(2, 6)}`}) returning id`;
      await tx`insert into ads.workspace_members (workspace_id, user_id, role) values (${w!.id}, ${ctx.user.id}, 'owner')`;
      await audit(tx, { workspaceId: w!.id, actor: ctx.actor, action: "Criar workspace", entityType: "workspace", entityId: w!.id, entityName: n });
      return w!.id;
    });
    (await cookies()).set(WS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
  });
}

/**
 * Adiciona membro. Se o e-mail ainda não tem conta, cria com a senha provisória informada (o admin repassa; a pessoa
 * troca em Configurações → Minha conta). Sem e-mail automático: o Supabase é compartilhado com outros sites.
 */
export async function adicionarMembro(input: { email: string; role: string; senha?: string }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "admin");
    const email = z.string().trim().toLowerCase().email("E-mail inválido").parse(input.email);
    const role = papel.parse(input.role);
    if (role === "owner" && ctx.workspace.role !== "owner") throw new Error("Só um owner pode adicionar outro owner");
    const sql = db();
    let [u] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email}`;
    if (!u) {
      const senha = z.string().min(8, "Senha provisória precisa de 8+ caracteres").parse(input.senha ?? "");
      const r = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
      if (r.error) throw new Error(`Não foi possível criar a conta: ${r.error.message}`);
      u = { id: r.data.user.id };
    }
    await sql`insert into ads.workspace_members (workspace_id, user_id, role) values (${ctx.workspace.id}, ${u.id}, ${role})
              on conflict (workspace_id, user_id) do update set role = excluded.role`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Adicionar membro", entityType: "member", entityId: u.id, entityName: email, after: { role } });
    revalidatePath("/settings");
  });
}

export async function alterarPapel(userId: string, role: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "admin");
    const r = papel.parse(role);
    const uid = z.string().uuid().parse(userId);
    if (uid === ctx.user.id) throw new Error("Você não pode mudar o próprio papel");
    if (r === "owner" && ctx.workspace.role !== "owner") throw new Error("Só um owner pode promover a owner");
    const sql = db();
    const [antes] = await sql<{ role: string; email: string }[]>`
      select m.role, u.email from ads.workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = ${ctx.workspace.id} and m.user_id = ${uid}`;
    if (!antes) throw new Error("Membro não encontrado");
    if (antes.role === "owner" && ctx.workspace.role !== "owner") throw new Error("Só um owner pode alterar outro owner");
    await sql`update ads.workspace_members set role = ${r} where workspace_id = ${ctx.workspace.id} and user_id = ${uid}`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Alterar papel", entityType: "member", entityId: uid, entityName: antes.email, before: { role: antes.role }, after: { role: r } });
    revalidatePath("/settings");
  });
}

export async function removerMembro(userId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "admin");
    const uid = z.string().uuid().parse(userId);
    if (uid === ctx.user.id) throw new Error("Você não pode remover a si mesmo");
    const sql = db();
    const [m] = await sql<{ role: string; email: string }[]>`
      delete from ads.workspace_members m using auth.users u where u.id = m.user_id and m.workspace_id = ${ctx.workspace.id} and m.user_id = ${uid}
        and (m.role <> 'owner' or ${ctx.workspace.role} = 'owner') returning m.role, u.email`;
    if (!m) throw new Error("Membro não encontrado (ou é owner)");
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Remover membro", entityType: "member", entityId: uid, entityName: m.email, before: { role: m.role } });
    revalidatePath("/settings");
  });
}

export async function trocarSenha(senha: string) {
  return run(async () => {
    await requireCtx();
    const { error } = await (await supabase()).auth.updateUser({ password: z.string().min(8, "A senha precisa de 8+ caracteres").parse(senha) });
    if (error) throw new Error(error.message);
  });
}

/** Contas de IA são do PC do worker (globais, servem todos os workspaces): só admin da plataforma mexe. */
export async function atualizarContaIA(id: string, patch: { status?: string; priority?: number; liberar?: boolean }) {
  return run(async () => {
    const ctx = await requireCtx();
    if (!isPlatformAdmin(ctx)) throw new Error("Só administradores da plataforma (ADMIN_EMAILS) gerenciam as contas de IA");
    const sql = db();
    const aid = z.string().uuid().parse(id);
    if (patch.status) await sql`update ads.ai_accounts set status = ${z.enum(["ACTIVE", "DISABLED"]).parse(patch.status)} where id = ${aid}`;
    if (patch.priority != null) await sql`update ads.ai_accounts set priority = ${z.number().int().min(0).max(999).parse(patch.priority)} where id = ${aid}`;
    if (patch.liberar) await sql`update ads.ai_accounts set limited_until = null, last_error = null where id = ${aid}`;
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: "Alterar conta de IA", entityType: "ai_account", entityId: aid, after: patch });
    revalidatePath("/settings");
  });
}

/** Chave do ElevenLabs (global, cifrada no banco): só admin da plataforma. Validada na API antes de salvar. */
/** Número que recebe os avisos (post publicado, falhas). Celular ou fixo do Brasil, com DDD. */
export async function salvarWhatsappAvisos(numero: string) {
  return run(async () => {
    const ctx = await requireCtx();
    if (!isPlatformAdmin(ctx)) throw new Error("Só administradores da plataforma configuram os avisos");
    const d = z.string().transform((s) => s.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""))
      .pipe(z.string().regex(/^[1-9]{2}(9\d{8}|[2-8]\d{7})$/, "Número inválido: use DDD + número, ex.: (62) 98179-3568")).parse(numero);
    await gravarSegredo("whatsapp_avisos", `55${d}`, ctx.user.id);
    await audit(db(), { workspaceId: null, actor: ctx.actor, action: "Alterar número dos avisos no WhatsApp", entityType: "settings", entityName: "whatsapp_avisos" });
    revalidatePath("/settings");
  });
}

export async function salvarChaveElevenLabs(chave: string | null) {
  return run(async () => {
    const ctx = await requireCtx();
    if (!isPlatformAdmin(ctx)) throw new Error("Só administradores da plataforma (ADMIN_EMAILS) configuram vozes");
    const v = chave == null ? null : z.string().trim().min(20, "Chave muito curta").max(200, "Chave muito longa").regex(/^[\w-]+$/, "Chave inválida").parse(chave);
    const n = v ? (await vozesElevenLabs(v)).length : 0;
    await gravarSegredo("elevenlabs_api_key", v, ctx.user.id);
    await audit(db(), { workspaceId: null, actor: ctx.actor, action: v ? "Configurar ElevenLabs" : "Remover ElevenLabs", entityType: "settings", entityName: "elevenlabs_api_key" });
    revalidatePath("/settings");
    revalidatePath("/studio/novo");
    return n;
  });
}

/** Regras do armazenamento (limite do R2, dias sem uso, arquivar após publicar, prévias). Global: o R2 é um só. */
export async function salvarArmazenamento(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    if (!isPlatformAdmin(ctx)) throw new Error("Só administradores da plataforma alteram o armazenamento");
    const v = armazenamentoSchema.parse(input);
    await gravarSegredo("armazenamento", JSON.stringify(v), ctx.user.id);
    await audit(db(), { workspaceId: null, actor: ctx.actor, action: "Alterar regras de armazenamento", entityType: "settings", entityName: "armazenamento", after: v });
    revalidatePath("/settings");
    revalidatePath("/arquivos");
  });
}
