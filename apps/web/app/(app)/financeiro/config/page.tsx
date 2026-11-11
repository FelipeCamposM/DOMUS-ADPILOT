import { db } from "@domus-ads/core";
import { categorias, conexoes, contas, etiquetas } from "@domus-ads/core/financeiro-db";
import { Landmark, ListFilter, Shapes, Tags, Wallet } from "lucide-react";
import { Categorias, Conexoes, Contas, Etiquetas, Regras, type Regra } from "@/modules/financeiro/Config";
import { HeroFx } from "@/modules/shell/HeroFx";

export const metadata = { title: "Financeiro · Configurações" };

export default async function FinanceiroConfig() {
  const sql = db();
  const [cons, cts, cats, etqs, regras] = await Promise.all([
    conexoes(sql), contas(sql), categorias(sql), etiquetas(sql),
    sql<Regra[]>`select r.id, r.padrao, c.nome as categoria, e.nome as etiqueta, r.natureza from ads.fin_regras r
      left join ads.fin_categorias c on c.id = r.categoria_id left join ads.fin_etiquetas e on e.id = r.etiqueta_id order by r.created_at desc`,
  ]);
  const Painel = ({ icone, titulo, sub, children }: { icone: React.ReactNode; titulo: string; sub: string; children: React.ReactNode }) => (
    <section className="panel" data-enter>
      <header className="panel-head"><span className="panel-title cluster" style={{ gap: 8 }}>{icone} {titulo}</span><span className="subtle caption">{sub}</span></header>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
  return (
    <div className="page fin">
      <div className="page-head">
        <HeroFx />
        <div>
          <div className="eyebrow" data-enter>Financeiro</div>
          <h1 className="page-title" data-enter>Configurações</h1>
        </div>
      </div>
      <Painel icone={<Wallet size={16} aria-hidden />} titulo="Bancos (Pluggy)" sub="Open Finance: só leitura"><Conexoes conexoes={cons} /></Painel>
      <Painel icone={<Landmark size={16} aria-hidden />} titulo="Contas e cartões" sub="PF ou PJ, apelido e de onde vem cada entrada"><Contas contas={cts} categorias={cats} /></Painel>
      <Painel icone={<Tags size={16} aria-hidden />} titulo="Etiquetas" sub="Ex.: gastos com a Juju"><Etiquetas etiquetas={etqs} /></Painel>
      <Painel icone={<Shapes size={16} aria-hidden />} titulo="Categorias e orçamentos" sub="Valor por mês"><Categorias categorias={cats} /></Painel>
      <Painel icone={<ListFilter size={16} aria-hidden />} titulo="Regras automáticas" sub="Valem para o histórico e os próximos syncs"><Regras regras={regras} /></Painel>
    </div>
  );
}
