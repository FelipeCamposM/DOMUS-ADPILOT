import { Bot, Cable, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { requireCtx } from "@/lib/ctx";
import { derive, money, pct } from "@/lib/format";
import { campanhas, kpis, opcoesFiltro, parseFiltro, serie } from "@/lib/queries";
import { ProviderTag, StatusTag } from "@/modules/campaigns/Tags";
import { Filters } from "@/modules/dashboard/Filters";
import { Kpis } from "@/modules/dashboard/Kpis";
import { TrendChart } from "@/modules/dashboard/TrendChart";

export const metadata = { title: "Visão geral" };

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const f = parseFiltro(await searchParams);
  const ws = ctx.workspace.id;
  // tudo de uma vez (se não houver conta, as outras voltam vazias rápido)
  const [opcoes, { atual, anterior }, pontos, todas] = await Promise.all([opcoesFiltro(ws), kpis(ws, f), serie(ws, f), campanhas(ws, f)]);
  const top = todas.slice(0, 6);

  if (opcoes.contas.length === 0) {
    return (
      <div className="page">
        <Header nome={ctx.workspace.name} />
        <div className="panel" data-enter="scale">
          <div className="empty">
            <span className="icon-tile"><Cable aria-hidden /></span>
            <h2 className="h3">Conecte sua primeira conta de anúncios</h2>
            <p className="muted" style={{ maxWidth: 440 }}>Assim que a Meta ou o Google estiverem conectados e sincronizados, investimento, resultados e ROAS aparecem aqui.</p>
            <Link href="/connections" className="btn btn-primary" style={{ marginTop: 8 }}>Conectar conta</Link>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="page">
      <Header nome={ctx.workspace.name}>
        <Suspense><Filters contas={opcoes.contas} campanhas={opcoes.campanhas} /></Suspense>
      </Header>
      <Kpis atual={atual} anterior={anterior} dias={f.days} />
      <TrendChart data={pontos} />
      <div className="panel" data-enter>
        <div className="panel-head">
          <span className="panel-title">Campanhas que mais investiram</span>
          <Link href="/campaigns" className="btn btn-ghost btn-xs">Ver todas</Link>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Campanha</th><th>Plataforma</th><th>Status</th><th className="num">Gasto</th><th className="num">CTR</th><th className="num">CPA</th><th className="num">ROAS</th></tr></thead>
            <tbody>
              {top.map((c) => {
                const d = derive(c);
                return (
                  <tr key={c.id}>
                    <td style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }}><Link href={`/campaigns?campaign=${c.id}`}>{c.name}</Link></td>
                    <td><ProviderTag p={c.provider} /></td>
                    <td><StatusTag s={c.status} /></td>
                    <td className="num">{money(c.spend, c.currency)}</td>
                    <td className="num">{pct(d.ctr)}</td>
                    <td className="num">{d.cpa == null ? "—" : money(d.cpa, c.currency)}</td>
                    <td className="num">{d.roas == null ? "—" : `${d.roas.toFixed(2).replace(".", ",")}x`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Link href="/ai?nova=1&prompt=como-esta" className="panel spotlight" data-enter style={{ display: "flex", alignItems: "center", gap: 16, padding: 18 }}>
        <span className="icon-tile"><Sparkles aria-hidden /></span>
        <span style={{ flex: 1 }}>
          <b style={{ fontWeight: 650 }}>Pergunte à IA: “Como estão as campanhas do {ctx.workspace.name}?”</b>
          <span className="muted small" style={{ display: "block" }}>Ela lê as métricas do workspace, aponta desperdício e sugere ajustes. Toda mudança espera sua aprovação.</span>
        </span>
        <Bot aria-hidden className="text-tertiary" />
      </Link>
    </div>
  );
}

function Header({ nome, children }: { nome: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow" data-enter>{nome}</div>
        <h1 className="page-title" data-enter>Visão geral</h1>
      </div>
      {children}
    </div>
  );
}
