import "server-only";
import { db } from "@domus-ads/core";

export interface Periodo { respostas: number; tokens: number; pct: number; erros: number }
export interface LinhaSistema {
  id: string | null; // null = o próprio AdPilot (chat, Studio, campanhas…)
  nome: string; chave_fim: string | null; ativo: boolean; limite_pct: number | null; contas: string[] | null;
  ultimo_uso: string | null; created_at: string | null;
  hoje: Periodo; semana: Periodo; mes: Periodo;
}
export interface DiaSistema { dia: string; id: string | null; n: number; tokens: number }
export interface ContaSistema { id: string | null; conta: string | null; provider: string | null; plano: string | null; n: number; tokens: number; pct: number }
export interface ContaOpcao { id: string; nome: string; provider: string; plano: string | null }

const TZ = "America/Sao_Paulo";

/** Consumo por sistema (e do próprio AdPilot) para a tela Sistemas: hoje, 7 e 30 dias, por dia e por conta/plano. */
export async function consumoSistemas() {
  const sql = db();
  const [sistemas, agregado, porDia, porConta, contas] = await Promise.all([
    sql<{ id: string; nome: string; chave_fim: string; ativo: boolean; limite_pct: string | null; contas: string[] | null; ultimo_uso: Date | null; created_at: Date }[]>`
      select id, nome, chave_fim, ativo, limite_pct::text, contas, ultimo_uso, created_at from ads.sistemas order by created_at`,
    sql<{ id: string | null; periodo: "hoje" | "semana" | "mes"; respostas: number; tokens: string; pct: number; erros: number }[]>`
      with u as (select sistema_id, ok, input_tokens + output_tokens as tokens, coalesce(pct_5h, 0) as pct, created_at
                 from ads.ai_usage where created_at > now() - interval '30 days'),
      p as (select 'hoje' as periodo, (date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ}) as desde
            union all select 'semana', now() - interval '7 days' union all select 'mes', now() - interval '30 days')
      select u.sistema_id::text as id, p.periodo, count(*)::int as respostas, sum(u.tokens)::text as tokens,
        sum(u.pct)::float as pct, count(*) filter (where not u.ok)::int as erros
      from u join p on u.created_at >= p.desde group by 1, 2`,
    sql<{ dia: string; id: string | null; n: number; tokens: string }[]>`
      select (created_at at time zone ${TZ})::date::text as dia, sistema_id::text as id, count(*)::int as n, sum(input_tokens + output_tokens)::text as tokens
      from ads.ai_usage where created_at > now() - interval '30 days' group by 1, 2`,
    sql<{ id: string | null; conta: string | null; provider: string | null; plano: string | null; n: number; tokens: string; pct: number }[]>`
      select u.sistema_id::text as id, a.name as conta, coalesce(a.provider, u.provider) as provider, a.plan as plano,
        count(*)::int as n, sum(u.input_tokens + u.output_tokens)::text as tokens, coalesce(sum(u.pct_5h), 0)::float as pct
      from ads.ai_usage u left join ads.ai_accounts a on a.id = u.ai_account_id
      where u.created_at > now() - interval '30 days' group by 1, 2, 3, 4 order by n desc`,
    sql<ContaOpcao[]>`select id, name as nome, provider, plan as plano from ads.ai_accounts order by priority, created_at`,
  ]);
  const vazio = (): Periodo => ({ respostas: 0, tokens: 0, pct: 0, erros: 0 });
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const linhas: LinhaSistema[] = [
    { id: null, nome: "AdPilot", chave_fim: null, ativo: true, limite_pct: null, contas: null, ultimo_uso: null, created_at: null, hoje: vazio(), semana: vazio(), mes: vazio() },
    ...sistemas.map((s) => ({ ...s, limite_pct: s.limite_pct === null ? null : Number(s.limite_pct), ultimo_uso: iso(s.ultimo_uso), created_at: iso(s.created_at), hoje: vazio(), semana: vazio(), mes: vazio() })),
  ];
  for (const a of agregado) {
    const l = linhas.find((x) => x.id === a.id);
    if (l) l[a.periodo] = { respostas: a.respostas, tokens: Number(a.tokens), pct: Math.round(a.pct * 10) / 10, erros: a.erros };
  }
  return {
    linhas,
    porDia: porDia.map((d) => ({ ...d, tokens: Number(d.tokens) })) as DiaSistema[],
    porConta: porConta.map((c) => ({ ...c, tokens: Number(c.tokens), pct: Math.round(c.pct * 10) / 10 })) as ContaSistema[],
    contas,
  };
}
