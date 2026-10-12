import { db } from "@domus-ads/core";
import { can, requireCtx } from "@/lib/ctx";
import { Connections, type Conexao } from "@/modules/connections/Connections";

export const metadata = { title: "Conexões" };

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const sql = db();
  const conexoes = await sql<Omit<Conexao, "contas" | "perfis">[]>`
    select k.id, k.provider, k.label, k.status, k.last_error, k.perfil,
      to_char(k.last_synced_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_synced_at,
      to_char(k.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
      exists (select 1 from ads.jobs j where j.status in ('PENDING', 'RUNNING') and j.payload->>'connectionId' = k.id::text) as sincronizando
    from ads.ad_connections k where k.workspace_id = ${ctx.workspace.id} order by k.created_at`;
  const contas = await sql<(Conexao["contas"][number] & { connection_id: string })[]>`
    select a.id, a.connection_id, a.name, a.external_id, a.currency, a.timezone, a.status, count(c.id)::int as campanhas,
      count(c.id) filter (where c.status = 'ACTIVE')::int as ativas
    from ads.ad_accounts a left join ads.campaigns c on c.ad_account_id = a.id and c.status <> 'ARCHIVED'
    where a.workspace_id = ${ctx.workspace.id} group by a.id order by a.name`;

  const perfis = await sql<(Conexao["perfis"][number] & { connection_id: string })[]>`
    select id, connection_id, username, nome, foto, seguidores, publicacoes from ads.instagram_accounts where workspace_id = ${ctx.workspace.id} order by username`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Conexões</h1>
          <p className="subtle small" data-enter>Contas de anúncio da Meta e do Google que a plataforma lê e gerencia. Tokens ficam cifrados no servidor.</p>
        </div>
      </div>
      <Connections
        conexoes={conexoes.map((k) => ({ ...k, contas: contas.filter((a) => a.connection_id === k.id), perfis: perfis.filter((a) => a.connection_id === k.id) }))}
        podeAdmin={can(ctx, "admin")}
        podeEditar={can(ctx, "editor")}
        googleConfigurado={!!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET)}
        aviso={sp.erro ? { tipo: "erro", codigo: sp.erro, msg: sp.msg ?? null } : sp.ok === "google" ? { tipo: "ok", contas: Number(sp.contas ?? 0) } : null}
      />
    </div>
  );
}
