import { db } from "@domus-ads/core";
import { conexoes, contextoAnalise, etiquetas } from "@domus-ads/core/financeiro-db";
import { analisar, comprometidoFuturo, resumo, serie, somarMeses, type Pessoa } from "@domus-ads/core/financeiro";
import { notFound } from "next/navigation";
import type { Analise } from "@/modules/financeiro/Abas";
import { ABAS, Financeiro, type Aba } from "@/modules/financeiro/Financeiro";

export const metadata = { title: "Financeiro" };

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD

export default async function FinanceiroPessoa({ params, searchParams }: { params: Promise<{ pessoa: string }>; searchParams: Promise<{ mes?: string; aba?: string }> }) {
  // admin da plataforma já checado no layout
  const { pessoa: p } = await params;
  const sp = await searchParams;
  if (p !== "pf" && p !== "pj") notFound();
  const pessoa = p.toUpperCase() as Pessoa;
  const hoje = hojeSP();
  const mesHoje = `${hoje.slice(0, 7)}-01`;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") && sp.mes! >= "2000-01" && `${sp.mes}-01` <= somarMeses(mesHoje, 1) ? `${sp.mes}-01` : mesHoje;
  const sql = db();
  const [base, etqs, cons, analises, sync, ia] = await Promise.all([
    contextoAnalise(sql, pessoa, mes, hoje),
    etiquetas(sql),
    conexoes(sql),
    sql<Analise[]>`select id, mes::text, pergunta, resposta, status, erro, created_at::text from ads.fin_analises where pessoa = ${pessoa} order by created_at desc limit 10`,
    sql`select 1 from ads.jobs where type = 'FIN_SYNC' and status in ('PENDING', 'RUNNING') limit 1`,
    sql`select 1 from ads.ai_accounts where status = 'ACTIVE' limit 1`,
  ]);
  const { ctx, txs } = base;
  const s = serie(txs, mes, 12);
  const tres = [1, 2, 3].map((i) => resumo(txs, somarMeses(mes, -i)));
  const mediaCat: Record<string, number> = {};
  for (const r of tres) for (const c of r.porCategoria) mediaCat[c.nome] = (mediaCat[c.nome] ?? 0) + c.valor / 3;
  const aba = ABAS.some(([v]) => v === sp.aba) ? (sp.aba as Aba) : "geral";
  return (
    <Financeiro key={`${pessoa}-${mes}`} abaInicial={aba} d={{
      pessoa, mes, mesHoje,
      resumo: resumo(txs, mes), anterior: tres[0]!, media3: Math.round(tres.reduce((a, r) => a + r.gastos, 0) / 3), mediaCat,
      serie: s, insights: analisar(ctx), futuro: comprometidoFuturo(base.parcelados, mes),
      txs: txs.filter((t) => t.competencia === mes),
      contas: base.contas, categorias: base.categorias, etiquetas: etqs, assinaturas: base.assinaturas, parcelados: base.parcelados,
      conexoes: cons, analises, sincronizando: sync.length > 0, iaPronta: ia.length > 0,
    }} />
  );
}
