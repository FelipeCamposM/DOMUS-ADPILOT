import { db } from "@domus-ads/core";
import { campanhas, configProsp, etapasProsp, leadsProsp } from "@domus-ads/core/prospeccao-db";
import { Prospeccao, type Aba } from "@/modules/prospeccao/Prospeccao";

export const metadata = { title: "CRM · Prospecção" };

const ABAS: readonly Aba[] = ["search", "results", "pipeline", "settings"];

export default async function ProspeccaoPage({ searchParams }: { searchParams: Promise<{ c?: string; aba?: string }> }) {
  // admin da plataforma já checado no layout do CRM
  const sp = await searchParams;
  const sql = db();
  const lista = await campanhas(sql);
  const atual = lista.find((c) => c.id === sp.c) ?? null;
  const [leads, etapas, config, ia, jobs] = await Promise.all([
    // numa busca: os leads dela (com a lixeira); sem busca aberta: os do pipeline, de todas
    leadsProsp(sql, atual ? { campanhaId: atual.id } : { limite: 1500 }),
    etapasProsp(sql),
    configProsp(sql),
    sql`select 1 from ads.ai_accounts where status = 'ACTIVE' limit 1`,
    sql<{ id: string; payload: { ids?: string[] }; progress: number | null }[]>`
      select id, payload, progress from ads.jobs where type = 'AI_LEADS' and status in ('PENDING', 'RUNNING') order by created_at desc limit 1`,
  ]);
  const j = jobs[0];
  const aba = ABAS.includes(sp.aba as Aba) ? (sp.aba as Aba) : atual ? "results" : lista.length ? "results" : "search";
  return (
    <Prospeccao key={atual?.id ?? "todas"} campanhas={lista} campanhaId={atual?.id ?? null} leads={leads} etapas={etapas} config={config}
      iaPronta={ia.length > 0} abaInicial={aba} analise={j ? { jobId: j.id, ids: j.payload.ids ?? [], progress: j.progress ?? 0 } : null} />
  );
}
