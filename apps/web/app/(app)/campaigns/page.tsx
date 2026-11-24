import { db } from "@domus-ads/core";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { can, requireCtx } from "@/lib/ctx";
import { campanhas, opcoesFiltro, parseFiltro } from "@/lib/queries";
import { CampaignTable } from "@/modules/campaigns/CampaignTable";
import { Rascunhos } from "@/modules/campaigns/ListaRascunhos";
import { GoogleAdsLogo, MetaLogo } from "@/modules/connections/Logos";
import { Filters } from "@/modules/dashboard/Filters";
import { HeroFx } from "@/modules/shell/HeroFx";

export const metadata = { title: "Campanhas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const f = parseFiltro(await searchParams);
  const [opcoes, linhas, rascunhos] = await Promise.all([opcoesFiltro(ctx.workspace.id), campanhas(ctx.workspace.id, f), db()<{ id: string; name: string; status: string; source: string; updated_at: Date }[]>`
    select id, name, status, source, updated_at from ads.campaign_drafts where workspace_id = ${ctx.workspace.id} and status <> 'PUBLISHED' order by updated_at desc limit 12`]);
  return (
    <div className="page">
      <div className="page-head">
        <HeroFx />
        <div>
          <div className="eyebrow cp-eyebrow" data-enter><GoogleAdsLogo size={14} /> Google Ads <MetaLogo size={14} /> Meta Ads</div>
          <h1 className="page-title" data-enter>Campanhas</h1>
        </div>
        <div className="cluster" data-enter style={{ gap: 8 }}>
          <Suspense><Filters contas={opcoes.contas} campanhas={opcoes.campanhas} /></Suspense>
          {can(ctx, "editor") && <Link href="/campaigns/nova" className="btn btn-primary"><Plus aria-hidden /> Nova campanha</Link>}
        </div>
      </div>
      {rascunhos.length > 0 && <Rascunhos itens={rascunhos.map((r) => ({ ...r, updated_at: r.updated_at.toISOString() }))} podeEditar={can(ctx, "editor")} />}
      <CampaignTable
        linhas={linhas.map((l) => ({ ...l, last_synced_at: l.last_synced_at?.toISOString() ?? null }))}
        podeEditar={can(ctx, "editor")}
        destaque={f.campaign}
      />
    </div>
  );
}
