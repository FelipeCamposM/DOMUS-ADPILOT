import { db } from "@domus-ads/core";
import { FileText, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { can, requireCtx } from "@/lib/ctx";
import { ago } from "@/lib/format";
import { campanhas, opcoesFiltro, parseFiltro } from "@/lib/queries";
import { CampaignTable } from "@/modules/campaigns/CampaignTable";
import { Filters } from "@/modules/dashboard/Filters";

export const metadata = { title: "Campanhas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const f = parseFiltro(await searchParams);
  const opcoes = await opcoesFiltro(ctx.workspace.id);
  const linhas = await campanhas(ctx.workspace.id, f);
  const rascunhos = await db()<{ id: string; name: string; status: string; source: string; updated_at: Date }[]>`
    select id, name, status, source, updated_at from ads.campaign_drafts where workspace_id = ${ctx.workspace.id} and status <> 'PUBLISHED' order by updated_at desc limit 12`;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>Meta + Google</div>
          <h1 className="page-title" data-enter>Campanhas</h1>
        </div>
        <div className="cluster" data-enter style={{ gap: 8 }}>
          <Suspense><Filters contas={opcoes.contas} campanhas={opcoes.campanhas} /></Suspense>
          {can(ctx, "editor") && <Link href="/campaigns/nova" className="btn btn-primary"><Plus aria-hidden /> Nova campanha</Link>}
        </div>
      </div>
      {rascunhos.length > 0 && (
        <div className="panel" data-enter style={{ marginBottom: 16 }}>
          <div className="panel-head"><div><div className="panel-title">Rascunhos</div><div className="subtle caption">Propostas da IA e campanhas em montagem. Nada disso está no Google ainda.</div></div></div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {rascunhos.map((r) => (
              <Link key={r.id} href={`/campaigns/rascunhos/${r.id}`} className="panel spotlight" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center", textDecoration: "none", color: "inherit" }}>
                <span className="icon-tile" style={{ width: 34, height: 34, flex: "none" }}>{r.source === "AI" ? <Sparkles size={16} aria-hidden className={r.status === "GENERATING" ? "animate-pulse" : undefined} /> : <FileText size={16} aria-hidden />}</span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</b>
                  <span className="subtle" style={{ fontSize: 11.5 }} suppressHydrationWarning>
                    {({ GENERATING: "IA escrevendo…", DRAFT: "Rascunho", FAILED: "Com erro", PUBLISHING: "Publicando…" } as Record<string, string>)[r.status] ?? r.status} · Google Pesquisa · {ago(r.updated_at.toISOString())}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <CampaignTable
        linhas={linhas.map((l) => ({ ...l, last_synced_at: l.last_synced_at?.toISOString() ?? null }))}
        podeEditar={can(ctx, "editor")}
        destaque={f.campaign}
      />
    </div>
  );
}
