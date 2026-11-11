import { numeroSalvo } from "./contatos";
import type { db } from "./db";
import type { VendaSite } from "./financeiro";
import { enqueueJob } from "./jobs";
import { formatarNumero } from "./mensagens";
import { whatsappAvisos } from "./settings";

type Sql = ReturnType<typeof db>;

/**
 * Vendas dos sistemas seus que moram no mesmo banco (hoje: SIAPLUS, schema siaplus). O AdPilot só LÊ essas tabelas:
 * o site continua dono delas. Sem o schema (outro banco), devolve vazio.
 */
export interface VendaComContato extends VendaSite { pagoEm: string; telefone: string | null; email: string | null }

export async function vendasSiaplus(sql: Sql, desde = "2000-01-01"): Promise<VendaComContato[]> {
  const [t] = await sql<{ ok: boolean }[]>`select to_regclass('siaplus.pagamentos') is not null and to_regclass('siaplus.pedidos') is not null as ok`;
  if (!t?.ok) return [];
  const rs = await sql<{ id: string; cliente: string; plano: string; bruto: number; liquido: number | null; metodo: string; pago_em: Date; data: string; interno: boolean; telefone: string | null; email: string | null }[]>`
    select p.gateway_pagamento_id as id, pe.nome as cliente, coalesce(pl.nome, pe.plano, '') as plano, p.valor_centavos::int as bruto, p.liquido_centavos::int as liquido,
           coalesce(p.metodo, '') as metodo, p.pago_em, (p.pago_em at time zone 'America/Sao_Paulo')::date::text as data,
           (pe.plano = 'interno' or not coalesce(p.contabilizar, true)) as interno, pe.telefone, pe.email
    from siaplus.pagamentos p
    join siaplus.pedidos pe on pe.id = p.pedido_id
    left join siaplus.planos pl on pl.codigo = pe.plano
    where p.status = 'pago' and p.pago_em >= ${desde}::date
    order by p.pago_em`;
  return rs.map((r) => ({ ...r, sistema: "SIAPLUS", pagoEm: r.pago_em.toISOString() }));
}

const METODO: Record<string, string> = { pix: "Pix", cartao: "cartão", saldo: "saldo Mercado Pago" };
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const AVISO_ATE_H = 6; // venda mais velha que isso (importação do histórico) não vira aviso no WhatsApp

/**
 * Cada venda paga do SIAPLUS vira lead "Fechou" no CRM, com o valor somado ao negócio e uma nota na conversa.
 * Idempotente: a venda fica marcada em lead_dados.vendas; trava (advisory lock) para o worker e a tela não importarem juntos.
 * Teste interno não entra. Venda recente avisa no seu WhatsApp (mesmo número dos avisos de lead).
 */
export async function importarVendasCrm(sql: Sql): Promise<number> {
  const desde = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
  const vendas = (await vendasSiaplus(sql, desde)).filter((v) => !v.interno && v.telefone && v.telefone.replace(/\D/g, "").length >= 10);
  if (!vendas.length) return 0;
  const feitas = new Set((await sql<{ k: string }[]>`
    select jsonb_object_keys(lead_dados->'vendas') as k from ads.whatsapp_contatos where jsonb_typeof(lead_dados->'vendas') = 'object'`).map((r) => r.k));
  const novas = vendas.filter((v) => !feitas.has(`siaplus:${v.id}`));
  if (!novas.length) return 0;

  let [site] = await sql<{ id: string }[]>`select id from ads.lead_sites where nome ilike 'siaplus' order by (chave like 'sistema:%') desc, created_at limit 1`;
  site ??= (await sql<{ id: string }[]>`insert into ads.lead_sites (nome, chave, mensagem_inicial) values ('SIAPLUS', 'vendas:siaplus', 'Olá! Sou {nome}, vim pelo {site}.')
    on conflict (chave) do update set chave = excluded.chave returning id`)[0]!;
  const avisos = await whatsappAvisos();
  let n = 0;
  for (const v of novas) {
    const tel = v.telefone!.replace(/\D/g, "");
    const numero = await numeroSalvo(sql, tel.startsWith("55") && tel.length > 11 ? tel : `55${tel}`);
    const chave = `siaplus:${v.id}`;
    const quando = new Date(v.pagoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const entrou = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('adpilot:importar-vendas'))`;
      const [ja] = await tx`select 1 from ads.whatsapp_contatos where lead_dados->'vendas' ? ${chave}`;
      if (ja) return false;
      const venda = { valor: v.bruto / 100, liquido: v.liquido == null ? null : v.liquido / 100, plano: v.plano, metodo: v.metodo, pago_em: v.pagoEm };
      await tx`insert into ads.whatsapp_contatos (numero, nome, salvo, lido_em, etapa, etapa_em, lead_site, lead_em, lead_valor, lead_dados, consentimento_em, consentimento_texto)
        values (${numero}, ${v.cliente}, true, now() - interval '1 second', 'GANHO', ${v.pagoEm}, ${site!.id}, ${v.pagoEm}, ${(v.bruto / 100).toFixed(2)},
                ${tx.json({ origem: "Compra no site", ...(v.email && { email: v.email }), vendas: { [chave]: venda } })}, ${v.pagoEm}, 'Termos de uso e Política de Privacidade do SIAPLUS (compra no site)')
        on conflict (numero) do update set
          nome = case when ads.whatsapp_contatos.salvo then ads.whatsapp_contatos.nome else excluded.nome end, salvo = true,
          etapa = 'GANHO', etapa_em = case when ads.whatsapp_contatos.etapa = 'GANHO' then ads.whatsapp_contatos.etapa_em else excluded.etapa_em end,
          lead_site = coalesce(ads.whatsapp_contatos.lead_site, excluded.lead_site), lead_em = coalesce(ads.whatsapp_contatos.lead_em, excluded.lead_em),
          lead_valor = coalesce(ads.whatsapp_contatos.lead_valor, 0) + excluded.lead_valor,
          lead_dados = (excluded.lead_dados - 'vendas') || coalesce(ads.whatsapp_contatos.lead_dados, '{}'::jsonb)
            || jsonb_build_object('vendas', coalesce(ads.whatsapp_contatos.lead_dados->'vendas', '{}'::jsonb) || (excluded.lead_dados->'vendas')),
          consentimento_em = coalesce(ads.whatsapp_contatos.consentimento_em, excluded.consentimento_em),
          consentimento_texto = coalesce(ads.whatsapp_contatos.consentimento_texto, excluded.consentimento_texto), updated_at = now()`;
      // nota interna na conversa (nunca vai para o WhatsApp)
      await tx`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${numero},
        ${`💰 Venda · SIAPLUS\n${v.plano}\n${reais(v.bruto)} · ${METODO[v.metodo] ?? v.metodo} · pago em ${quando}`}, 'NOTA', 'NOTA', 'SIAPLUS')`;
      return true;
    });
    if (!entrou) continue;
    n++;
    if (avisos && Date.now() - Date.parse(v.pagoEm) < AVISO_ATE_H * 3600_000) {
      const texto = `💰 *Venda nova* · SIAPLUS\n${v.cliente} · ${formatarNumero(numero)}\n${v.plano} · ${reais(v.bruto)} (${METODO[v.metodo] ?? v.metodo})`;
      const [m] = await sql<{ id: string }[]>`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${avisos}, ${texto}, 'PENDENTE', 'OUT', 'DOMUS (automático)') returning id`;
      await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP_ENVIAR", payload: { id: m!.id }, maxAttempts: 1 });
    }
  }
  return n;
}
