import { db, leadSistemaSchema } from "@domus-ads/core";
import { comChave, erro, ok } from "@/lib/externo";
import { registrarLead, type SiteDoLead } from "@/lib/leads";

const POR_HORA = 200; // teto de leads por sistema em 1 h (chave vazada não enche o CRM)

/**
 * Lead vindo de um sistema conectado (ex.: o teste grátis do SIAPLUS). Cada sistema vira um "site" no CRM
 * (chave sistema:<id>, criado no primeiro lead); pausar esse site em CRM → Sites recusa os próximos.
 */
export function POST(req: Request) {
  return comChave(req, async (s) => {
    const v = leadSistemaSchema.safeParse(await req.json().catch(() => null));
    if (!v.success) return erro(400, v.error.issues[0]?.message ?? "Dados do lead inválidos.");
    const sql = db();
    const [site] = await sql<(SiteDoLead & { ativo: boolean })[]>`
      insert into ads.lead_sites (nome, chave, mensagem_inicial) values (${s.nome}, ${`sistema:${s.id}`}, ${"Olá! Sou {nome}, vim pelo {site}."})
      on conflict (chave) do update set chave = excluded.chave
      returning id, nome, mensagem_inicial, ativo`;
    if (!site!.ativo) return erro(409, "Leads deste sistema estão pausados no AdPilot (CRM → Sites).");
    const [lim] = await sql<{ n: number }[]>`select count(*)::int as n from ads.lead_entradas where site_id = ${site!.id} and created_at > now() - interval '1 hour'`;
    if (lim!.n >= POR_HORA) return erro(429, "Leads demais nesta hora.");
    const r = await registrarLead(sql, site!, { ...v.data, consentimento: `${v.data.consentimento} (${s.nome})` }, { ipHash: null, base: new URL(req.url).origin });
    return ok({ ok: true, repetido: r.repetido, numero: r.numero }, r.repetido ? 200 : 201);
  });
}
