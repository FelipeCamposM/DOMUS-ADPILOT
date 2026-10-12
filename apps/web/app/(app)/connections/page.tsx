import { db } from "@domus-ads/core";
import { can, requireCtx } from "@/lib/ctx";
import { Connections, type Conexao } from "@/modules/connections/Connections";

export const metadata = { title: "Conexões" };

const ERROS: Record<string, string> = {
  "google-env": "Google Ads não configurado no servidor (veja o MANUAL.md).",
  "google-state": "A autorização do Google expirou ou não confere. Tente de novo.",
  "google-permissao": "Você precisa ser admin do workspace para conectar contas.",
  "google-token": "O Google não devolveu o token de acesso. Tente de novo.",
  "google-api": "O Google Ads recusou o acesso",
};

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const sql = db();
  const conexoes = await sql<(Omit<Conexao, "contas" | "last_synced_at"> & { last_synced_at: Date | null })[]>`
    select id, provider, label, status, last_error, last_synced_at from ads.ad_connections
    where workspace_id = ${ctx.workspace.id} order by created_at`;
  const contas = await sql<(Conexao["contas"][number] & { connection_id: string })[]>`
    select a.id, a.connection_id, a.name, a.external_id, a.currency, count(c.id)::int as campanhas
    from ads.ad_accounts a left join ads.campaigns c on c.ad_account_id = a.id and c.status <> 'ARCHIVED'
    where a.workspace_id = ${ctx.workspace.id} group by a.id order by a.name`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Conexões</h1>
        </div>
      </div>
      {sp.erro && <div className="badge badge-error" style={{ height: "auto", padding: "10px 14px" }}>{ERROS[sp.erro] ?? "Erro ao conectar"}{sp.msg ? `: ${sp.msg}` : ""}</div>}
      {sp.ok === "google" && <div className="badge badge-brand" style={{ height: "auto", padding: "10px 14px" }}>Google Ads conectado: {sp.contas} conta(s). A sincronização está na fila do worker.</div>}
      <Connections
        conexoes={conexoes.map((k) => ({ ...k, last_synced_at: k.last_synced_at?.toISOString() ?? null, contas: contas.filter((a) => a.connection_id === k.id) }))}
        podeAdmin={can(ctx, "admin")}
        googleConfigurado={!!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET)}
      />
    </div>
  );
}
