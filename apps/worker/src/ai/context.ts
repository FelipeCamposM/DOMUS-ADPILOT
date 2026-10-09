import { db } from "@domus-ads/core";

/** Instruções fixas do analista. Vai como system prompt (Claude) ou no topo da 1ª rodada (Codex). */
export const INSTRUCOES = `Você é o AdPilot, analista sênior de tráfego pago da plataforma DOMUS AdPilot (Meta Ads e Google Ads).
Responda sempre em português do Brasil, direto e com números. Use tabelas Markdown curtas quando ajudarem.

Regras:
- Use SOMENTE os dados do bloco <dados_do_workspace> da mensagem mais recente. Eles são atualizados a cada mensagem. Não invente números.
- Você não tem ferramentas nem acesso a arquivos, internet ou APIs. Não tente executar nada.
- Você NUNCA executa alterações. Para propor uma mudança real, inclua um bloco exatamente neste formato (um JSON ou uma lista de JSONs):

\`\`\`domus-action
{"type": "UPDATE_BUDGET", "campaignId": "<id da campanha>", "dailyBudget": "130.00", "reason": "por que"}
\`\`\`

  Tipos permitidos: PAUSE_CAMPAIGN, ACTIVATE_CAMPAIGN, UPDATE_BUDGET (orçamento diário na moeda da conta, com ponto decimal).
  Use o id exato da coluna "id" dos dados. Só proponha UPDATE_BUDGET para campanhas com orçamento no nível da campanha (coluna orc_dia preenchida).
  O usuário vê cada proposta como um cartão com [Aprovar] e [Cancelar]; só depois da aprovação a mudança vai para a Meta/Google.
  Nunca diga que algo foi alterado. Diga que deixou a proposta para aprovação.
- Pedidos fora disso (criar campanha, mexer em públicos, anúncios ou criativos) ainda não estão disponíveis na plataforma: explique e dê o passo a passo para fazer manualmente.
- Métricas: CTR = cliques/impressões; CPC = gasto/cliques; CPA = gasto/conversões; CPL = gasto/leads; ROAS = receita/gasto.
  Para detectar desperdício, compare últimos 7 dias contra 7 dias anteriores e contra 30 dias. Gasto relevante sem conversões é sinal de alerta.`;

interface Linha {
  id: string; name: string; provider: string; status: string; objective: string | null; daily_budget: string | null; currency: string; account: string;
  g7: string; g7a: string; g30: string; imp7: string; clk7: string; conv7: string; conv7a: string; conv30: string; leads7: string; leads30: string; rec7: string; rec30: string;
}

const n = (s: string) => Number(s);
const r2 = (x: number | null) => (x == null || !Number.isFinite(x) ? "-" : x.toFixed(2));
const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Retrato do workspace para a IA: campanhas não arquivadas com 7 d, 7 d anteriores e 30 d. */
export async function snapshot(workspaceId: string): Promise<string> {
  const sql = db();
  const [ws] = await sql<{ name: string }[]>`select name from ads.workspaces where id = ${workspaceId}`;
  const linhas = await sql<Linha[]>`
    with m as (
      select campaign_id,
        sum(spend) filter (where date > current_date - 7) as g7,
        sum(spend) filter (where date <= current_date - 7 and date > current_date - 14) as g7a,
        sum(spend) as g30,
        sum(impressions) filter (where date > current_date - 7) as imp7,
        sum(clicks) filter (where date > current_date - 7) as clk7,
        sum(conversions) filter (where date > current_date - 7) as conv7,
        sum(conversions) filter (where date <= current_date - 7 and date > current_date - 14) as conv7a,
        sum(conversions) as conv30,
        sum(leads) filter (where date > current_date - 7) as leads7, sum(leads) as leads30,
        sum(revenue) filter (where date > current_date - 7) as rec7, sum(revenue) as rec30
      from ads.metrics_daily where workspace_id = ${workspaceId} and date > current_date - 30 group by campaign_id)
    select c.id, c.name, c.provider, c.status, c.objective, c.daily_budget::text, a.currency, a.name as account,
      coalesce(m.g7,0)::text g7, coalesce(m.g7a,0)::text g7a, coalesce(m.g30,0)::text g30, coalesce(m.imp7,0)::text imp7,
      coalesce(m.clk7,0)::text clk7, coalesce(m.conv7,0)::text conv7, coalesce(m.conv7a,0)::text conv7a, coalesce(m.conv30,0)::text conv30,
      coalesce(m.leads7,0)::text leads7, coalesce(m.leads30,0)::text leads30, coalesce(m.rec7,0)::text rec7, coalesce(m.rec30,0)::text rec30
    from ads.campaigns c join ads.ad_accounts a on a.id = c.ad_account_id left join m on m.campaign_id = c.id
    where c.workspace_id = ${workspaceId} and c.status <> 'ARCHIVED'
    order by coalesce(m.g30,0) desc limit 150`;
  const pendentes = await sql<{ summary: string }[]>`
    select summary from ads.ai_actions where workspace_id = ${workspaceId} and status = 'PENDING_APPROVAL' order by created_at limit 20`;

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" });
  const cab = "id | campanha | plataforma | status | objetivo | conta | moeda | orc_dia | gasto_7d | gasto_7d_ant | gasto_30d | impr_7d | cliques_7d | ctr_7d% | cpc_7d | conv_7d | conv_7d_ant | conv_30d | cpa_7d | cpa_30d | leads_7d | leads_30d | receita_7d | roas_7d | roas_30d";
  const corpo = linhas.map((l) => [
    l.id, l.name.replace(/\|/g, "/"), l.provider, l.status, l.objective ?? "-", l.account.replace(/\|/g, "/"), l.currency, l.daily_budget ?? "",
    l.g7, l.g7a, l.g30, l.imp7, l.clk7, r2(div(n(l.clk7) * 100, n(l.imp7))), r2(div(n(l.g7), n(l.clk7))),
    l.conv7, l.conv7a, l.conv30, r2(div(n(l.g7), n(l.conv7))), r2(div(n(l.g30), n(l.conv30))), l.leads7, l.leads30, l.rec7,
    r2(div(n(l.rec7), n(l.g7))), r2(div(n(l.rec30), n(l.g30))),
  ].join(" | "));

  return [
    `<dados_do_workspace>`,
    `Workspace: ${ws?.name ?? "?"} · Hoje: ${hoje} · Fuso: America/Sao_Paulo`,
    linhas.length ? `Campanhas (${linhas.length}, ordenadas por gasto em 30 dias):\n${cab}\n${corpo.join("\n")}` : "Nenhuma campanha sincronizada ainda.",
    pendentes.length ? `Propostas já aguardando aprovação (não repita):\n- ${pendentes.map((p) => p.summary).join("\n- ")}` : "",
    `</dados_do_workspace>`,
  ].filter(Boolean).join("\n");
}
