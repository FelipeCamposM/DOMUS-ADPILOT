"use server";

import { audit, db, plataformaVazia, tornarOwnerInicial } from "@domus-ads/core";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});

export async function entrar(_: string | null, form: FormData): Promise<string | null> {
  const r = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!r.success) return r.error.issues[0]!.message;
  const { error } = await (await supabase()).auth.signInWithPassword(r.data);
  if (error) return /invalid/i.test(error.message) ? "E-mail ou senha incorretos" : "Não foi possível entrar. Tente de novo.";
  redirect("/");
}

const admins = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Primeiro acesso (substitui o comando no terminal): só enquanto a plataforma não tem nenhum membro e só para
 * e-mails de ADMIN_EMAILS. Conta nova é criada; conta que já existe no Supabase (compartilhado com outros sites)
 * precisa da senha atual dela — nunca trocamos a senha de uma conta existente aqui.
 */
export async function primeiroAcesso(_: string | null, form: FormData): Promise<string | null> {
  const r = schema.extend({ password: z.string().min(8, "A senha precisa de 8+ caracteres") }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!r.success) return r.error.issues[0]!.message;
  const { email, password } = r.data;
  const sql = db();
  if (!(await plataformaVazia(sql))) return "A plataforma já foi configurada. Entre com sua conta.";
  if (!admins().length) return "Defina ADMIN_EMAILS no .env com o seu e-mail e tente de novo.";
  if (!admins().includes(email)) return "Este e-mail não está em ADMIN_EMAILS.";

  const [existe] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email}`;
  if (!existe) {
    const adm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const c = await adm.auth.admin.createUser({ email, password, email_confirm: true });
    if (c.error) return `Não foi possível criar a conta: ${c.error.message}`;
  }
  const sb = await supabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return existe ? "Este e-mail já tem conta no Supabase: use a senha dessa conta." : "Conta criada, mas o login falhou. Tente entrar.";
  await tornarOwnerInicial(sql, data.user.id);
  await audit(sql, { workspaceId: null, actor: { userId: data.user.id, email }, action: "Primeiro acesso (owner inicial)", source: "SYSTEM" });
  redirect("/settings#ia");
}
