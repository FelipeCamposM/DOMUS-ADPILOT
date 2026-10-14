"use server";

import { db, enqueueJob } from "@domus-ads/core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCtx, WS_COOKIE } from "@/lib/ctx";
import { supabase } from "@/lib/supabase";

export async function trocarWorkspace(id: string) {
  const wsId = z.string().uuid("Workspace inválido").parse(id);
  const ctx = await requireCtx();
  if (!ctx.workspaces.some((w) => w.id === wsId)) throw new Error("Você não é membro deste workspace");
  (await cookies()).set(WS_COOKIE, wsId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function sair() {
  await (await supabase()).auth.signOut();
  redirect("/login");
}

/** Pede ao worker para ler agora o uso das assinaturas de IA (o worker é quem tem os logins). Devolve o id do job. */
export async function atualizarUsoIA(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireCtx();
  const sql = db();
  const [w] = await sql<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
  if (!w?.ok) return { ok: false, error: "O worker está offline: ligue o PC do worker para ler o uso." };
  const [ja] = await sql<{ id: string }[]>`select id from ads.jobs where type = 'AI_USAGE' and status in ('PENDING','RUNNING') limit 1`;
  return { ok: true, id: ja?.id ?? await enqueueJob(sql, { workspaceId: null, type: "AI_USAGE", payload: {}, createdBy: ctx.user.id, maxAttempts: 1 }) };
}

export async function statusJob(id: string): Promise<string | null> {
  await requireCtx();
  const [j] = await db()<{ status: string }[]>`select status from ads.jobs where id = ${z.string().uuid().parse(id)} and type = 'AI_USAGE'`;
  return j?.status ?? null;
}
