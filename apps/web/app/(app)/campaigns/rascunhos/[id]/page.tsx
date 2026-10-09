import { db } from "@domus-ads/core";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireCtx } from "@/lib/ctx";
import { DraftEditor, type RascunhoView } from "@/modules/campaigns/DraftEditor";

export const metadata = { title: "Rascunho de campanha" };

export default async function RascunhoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const sql = db();
  const [d] = await sql<(Omit<RascunhoView, "validated_at"> & { validated_at: Date | null; updated_at: Date })[]>`
    select id, name, status, source, error, validated_at, ad_account_id, spec, updated_at from ads.campaign_drafts where id = ${id.data} and workspace_id = ${ctx.workspace.id}`;
  if (!d) notFound();
  const contas = await sql<{ id: string; name: string; currency: string }[]>`
    select a.id, a.name, a.currency from ads.ad_accounts a where a.workspace_id = ${ctx.workspace.id} and a.provider = 'GOOGLE' order by a.name`;
  const moeda = contas.find((c) => c.id === d.ad_account_id)?.currency ?? "BRL";
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div>
          <Link href="/campaigns" className="eyebrow" data-enter style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> Campanhas</Link>
          <h1 className="page-title" data-enter>{d.name}</h1>
          <p className="subtle small" data-enter>Google Ads · Pesquisa · nada vai para o Google até você publicar</p>
        </div>
      </div>
      {/* remonta o editor quando a IA termina (spec nova) */}
      <DraftEditor key={`${d.status}-${d.updated_at.getTime()}`} d={{ ...d, validated_at: d.validated_at?.toISOString() ?? null }} contas={contas} moeda={moeda}
        podeEditar={can(ctx, "editor")} podePublicar={can(ctx, "admin")} />
    </div>
  );
}
