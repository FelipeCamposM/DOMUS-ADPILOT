import { db } from "@domus-ads/core";
import { categorias, conexoes, contas, transacoes } from "@domus-ads/core/financeiro-db";
import { receitas, resumoReceitas, somarMeses } from "@domus-ads/core/financeiro";
import { vendasSiaplus } from "@domus-ads/core/vendas";
import { Receitas } from "@/modules/financeiro/Receitas";

export const metadata = { title: "Receitas" };

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD

/** Receitas: bancos PF + PJ + vendas dos sites, conciliadas (admin da plataforma já checado no layout). */
export default async function ReceitasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const mesHoje = `${hojeSP().slice(0, 7)}-01`;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") && sp.mes! >= "2000-01" && `${sp.mes}-01` <= mesHoje ? `${sp.mes}-01` : mesHoje;
  const desde = somarMeses(mes, -11);
  const sql = db();
  const [pf, pj, vendas, cats, cts, cons] = await Promise.all([
    transacoes(sql, "PF", desde),
    transacoes(sql, "PJ", desde),
    vendasSiaplus(sql, somarMeses(desde, -2)), // vendas um pouco antes: o crédito delas pode cair já dentro da janela
    categorias(sql),
    contas(sql),
    conexoes(sql),
  ]);
  // só o que a tela usa (sem telefone/e-mail de cliente no navegador)
  const rs = receitas([...pf, ...pj], vendas.map(({ pagoEm: _p, telefone: _t, email: _e, ...v }) => v));
  const r = resumoReceitas(rs, mes);
  const antes = r.serie.slice(0, -1).filter((s) => s.valor !== 0);
  return (
    <Receitas key={mes} d={{
      mes, mesHoje, r, anterior: r.serie.at(-2)?.valor ?? 0, media: antes.length ? Math.round(antes.reduce((a, s) => a + s.valor, 0) / antes.length) : 0,
      cores: Object.fromEntries(cats.map((c) => [c.nome, c.cor])),
      contas: Object.fromEntries(cts.map((c) => [c.id, c.apelido || c.banco || c.nome])),
      ultimaSync: cons.map((c) => c.ultima_sync).filter(Boolean).sort().at(-1) ?? null,
    }} />
  );
}
