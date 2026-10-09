import "server-only";
import { db, type Actor } from "@domus-ads/core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { supabase } from "./supabase";

export type Role = "owner" | "admin" | "editor" | "viewer";
const PESO: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export interface Workspace { id: string; name: string; slug: string; role: Role }
export interface Ctx {
  user: { id: string; email: string };
  actor: Actor;
  workspaces: Workspace[];
  workspace: Workspace;
}

export const WS_COOKIE = "ads_ws";

/**
 * Contexto da requisição: usuário do Supabase Auth + workspaces em que é membro + workspace atual (cookie, validado
 * contra a lista de membros: o id que vem do cliente nunca é usado sem essa checagem).
 */
export const requireCtx = cache(async (): Promise<Ctx> => {
  const { data } = await (await supabase()).auth.getUser();
  if (!data.user) redirect("/login");
  const workspaces = await db()<Workspace[]>`
    select w.id, w.name, w.slug, m.role from ads.workspace_members m join ads.workspaces w on w.id = m.workspace_id
    where m.user_id = ${data.user.id} order by w.name`;
  if (!workspaces.length) redirect("/login?erro=sem-workspace");
  const escolhido = (await cookies()).get(WS_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === escolhido) ?? workspaces[0]!;
  const user = { id: data.user.id, email: data.user.email ?? "" };
  return { user, actor: { userId: user.id, email: user.email }, workspaces, workspace };
});

export class PermissionError extends Error {}

export function requireRole(ctx: Ctx, min: Role) {
  if (PESO[ctx.workspace.role] < PESO[min]) throw new PermissionError("Você não tem permissão para esta ação");
}

export const can = (ctx: Ctx, min: Role) => PESO[ctx.workspace.role] >= PESO[min];

/** Admin da plataforma (ADMIN_EMAILS): gerencia o que é global, como as contas de IA do worker. */
export const isPlatformAdmin = (ctx: Ctx) =>
  (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(ctx.user.email.toLowerCase());
