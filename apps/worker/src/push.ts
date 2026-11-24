import { db } from "@domus-ads/core";
import * as webpush from "web-push";

/** Mesmos eventos do sininho do topo, agora também como notificação no celular/PC (PWA). */
type Tipo = "lead" | "acao" | "falha" | "email";
interface Evento { chave: string; tipo: Tipo; ws: string | null; titulo: string; corpo: string; url: string }
interface Inscricao { endpoint: string; user_id: string; p256dh: string; auth: string; email: string; desligados: string[] }

const admins = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

async function eventos(): Promise<Evento[]> {
  const sql = db();
  // só o que é recente: worker parado por horas não despeja um monte de aviso velho quando volta
  const [leads, acoes, falhas, emails] = await Promise.all([
    sql<{ numero: string; nome: string; site: string | null; origem: string | null; lead_em: Date }[]>`
      select c.numero, c.nome, s.nome as site, c.lead_dados->>'origem' as origem, c.lead_em from ads.whatsapp_contatos c
      left join ads.lead_sites s on s.id = c.lead_site where c.etapa is not null and c.lead_em > now() - interval '15 minutes'`,
    sql<{ id: string; workspace_id: string; summary: string; conversation_id: string | null }[]>`
      select id, workspace_id, summary, conversation_id from ads.ai_actions where status = 'PENDING_APPROVAL' and created_at > now() - interval '15 minutes'`,
    sql<{ id: string; workspace_id: string | null; type: string; error: string | null }[]>`
      select id, workspace_id, type, error from ads.jobs where status = 'FAILED' and finished_at > now() - interval '15 minutes'`,
    sql<{ id: string; email: string; em: Date | null }[]>`select id, email, verificado_em as em from ads.email_contas where status = 'EXPIRADA'`,
  ]);
  return [
    ...leads.map((l) => ({ chave: `lead:${l.numero}:${l.lead_em.toISOString()}`, tipo: "lead" as const, ws: null, titulo: `Novo lead: ${l.nome}`, corpo: l.origem ?? (l.site ? `Site ${l.site}` : "Formulário"), url: `/crm?c=${l.numero}` })),
    ...acoes.map((a) => ({ chave: `acao:${a.id}`, tipo: "acao" as const, ws: a.workspace_id, titulo: "A IA precisa da sua aprovação", corpo: a.summary, url: a.conversation_id ? `/ai/${a.conversation_id}` : "/ai" })),
    ...falhas.map((f) => ({ chave: `falha:${f.id}`, tipo: "falha" as const, ws: f.workspace_id, titulo: `Falhou: ${f.type}`, corpo: f.error?.slice(0, 140) ?? "Veja em Jobs", url: "/jobs" })),
    ...emails.map((e) => ({ chave: `email:${e.id}:${e.em?.toISOString() ?? ""}`, tipo: "email" as const, ws: null, titulo: `Gmail desconectou: ${e.email}`, corpo: "Toque para reconectar", url: `/crm/emails?conta=${e.id}` })),
  ];
}

async function mandar(i: Inscricao, msg: { titulo: string; corpo: string; url: string; tag?: string }) {
  try {
    await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(msg), { TTL: 6 * 3600 });
  } catch (e) {
    const st = (e as { statusCode?: number }).statusCode;
    // aparelho desinstalou o app ou tirou a permissão: a inscrição morreu
    if (st === 404 || st === 410) await db()`delete from ads.push_inscricoes where endpoint = ${i.endpoint}`;
    else throw e;
  }
}

export async function enviarPush() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails(process.env.APP_PUBLIC_URL || process.env.APP_URL || "https://localhost", pub, priv);
  const sql = db();
  const inscricoes = await sql<Inscricao[]>`
    select i.endpoint, i.user_id, i.p256dh, i.auth, lower(u.email) as email, coalesce(p.desligados, '{}') as desligados
    from ads.push_inscricoes i join auth.users u on u.id = i.user_id left join ads.push_preferencias p on p.user_id = i.user_id`;
  if (!inscricoes.length) return;

  // aparelho recém-ativado: confirmação na hora, para a pessoa ver que funciona
  const novas = await sql<{ endpoint: string }[]>`update ads.push_inscricoes set confirmada_em = now() where confirmada_em is null returning endpoint`;
  for (const n of novas) {
    const i = inscricoes.find((x) => x.endpoint === n.endpoint);
    if (i) await mandar(i, { titulo: "Notificações ativadas ✅", corpo: "Este aparelho vai receber os avisos do AdPilot.", url: "/settings#notificacoes" }).catch(() => {});
  }

  const evs = await eventos();
  if (!evs.length) return;
  const novos = new Set((await sql<{ chave: string }[]>`
    insert into ads.push_enviados (chave) select unnest(${evs.map((e) => e.chave)}::text[]) on conflict do nothing returning chave`).map((r) => r.chave));
  const membros = await sql<{ workspace_id: string; user_id: string }[]>`select workspace_id, user_id from ads.workspace_members`;
  const adm = admins();
  for (const ev of evs.filter((e) => novos.has(e.chave))) {
    // lead e Gmail são da plataforma (só admin); aprovação e falha vão para quem é do workspace
    const para = inscricoes.filter((i) => !i.desligados.includes(ev.tipo) &&
      (ev.ws ? membros.some((m) => m.workspace_id === ev.ws && m.user_id === i.user_id) : adm.includes(i.email)));
    await Promise.all(para.map((i) => mandar(i, { titulo: ev.titulo, corpo: ev.corpo, url: ev.url, tag: ev.chave }).catch((e) => console.error("push:", (e as Error).message))));
  }
  await sql`delete from ads.push_enviados where enviado_em < now() - interval '30 days'`;
}
