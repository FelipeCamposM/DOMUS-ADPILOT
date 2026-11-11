import { db } from "@domus-ads/core";
import { categorias, conexoes, contas, transacoes } from "@domus-ads/core/financeiro-db";
import { andarPeriodo, inicioPeriodo, mesDe, PONTOS_SERIE, receitas, resumoReceitas, type PeriodoRec } from "@domus-ads/core/financeiro";
import { vendasSiaplus } from "@domus-ads/core/vendas";
import { Receitas, type ReceitaNota } from "@/modules/financeiro/Receitas";

export const metadata = { title: "Receitas" };

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD
const PERIODOS: readonly PeriodoRec[] = ["dia", "semana", "mes"];

/** Receitas: bancos PF + PJ + vendas dos sites, conciliadas, por dia, semana ou mês (admin da plataforma já checado no layout). */
export default async function ReceitasPage({ searchParams }: { searchParams: Promise<{ p?: string; d?: string; mes?: string }> }) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const p: PeriodoRec = PERIODOS.includes(sp.p as PeriodoRec) ? (sp.p as PeriodoRec) : "mes";
  // ?mes=AAAA-MM (links antigos) ainda funciona
  const pedida = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : hoje;
  const data = pedida >= "2000-01-01" && pedida <= hoje ? pedida : hoje;
  const inicio = inicioPeriodo(p, data);
  const desde = mesDe(andarPeriodo(p, inicio, -(PONTOS_SERIE[p] - 1)));
  const sql = db();
  const [pf, pj, vendas, cats, cts, cons] = await Promise.all([
    transacoes(sql, "PF", desde),
    transacoes(sql, "PJ", desde),
    vendasSiaplus(sql, mesDe(andarPeriodo("mes", desde, -2))), // vendas um pouco antes: o crédito delas pode cair já dentro da janela
    categorias(sql),
    contas(sql),
    conexoes(sql),
  ]);
  const todas = [...pf, ...pj];
  // só o que a tela usa (sem telefone/e-mail de cliente no navegador)
  const rs = receitas(todas, vendas.map(({ pagoEm: _p, telefone: _t, email: _e, ...v }) => v));
  const r = resumoReceitas(rs, p, data);
  // entradas que você marcou como "desconsiderar" (natureza ignorado), para poder voltar atrás
  const fimP = r.fim;
  const desconsideradas: ReceitaNota[] = todas
    .filter((t) => t.natureza === "ignorado" && t.naturezaManual && t.tipo === "credito" && !t.cartao && (p === "mes" ? t.competencia === inicio : t.data >= inicio && t.data <= fimP))
    .map((t) => ({ id: t.id, data: t.data, mes: t.competencia, valor: t.valor, fonte: t.categoria ?? "Outras rendas", descricao: t.merchant || t.descricao, pessoa: t.pessoa, origem: "banco" as const, contaId: t.contaId, nota: t.nota }));
  const antes = r.serie.slice(0, -1).filter((s) => s.valor !== 0);
  return (
    <Receitas key={`${p}-${inicio}`} d={{
      hoje, r, anterior: r.serie.at(-2)?.valor ?? 0, media: antes.length ? Math.round(antes.reduce((a, s) => a + s.valor, 0) / antes.length) : 0,
      desconsideradas,
      notas: Object.fromEntries(todas.filter((t) => t.nota && r.entradas.some((e) => e.id === t.id)).map((t) => [t.id, t.nota!])),
      cores: Object.fromEntries(cats.map((c) => [c.nome, c.cor])),
      contas: Object.fromEntries(cts.map((c) => [c.id, c.apelido || c.banco || c.nome])),
      ultimaSync: cons.map((c) => c.ultima_sync).filter(Boolean).sort().at(-1) ?? null,
    }} />
  );
}
