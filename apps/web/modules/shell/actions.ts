"use server";

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
