import { db } from "@domus-ads/core";
import { Bot, Cog, User } from "lucide-react";
import { requireCtx } from "@/lib/ctx";
import { dateTime, money, STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Auditoria" };

const ORIGEM: Record<string, [string, typeof User, string]> = {
  USER: ["Usuário", User, ""], AI_RECOMMENDATION: ["Recomendação da IA", Bot, "badge-brand"], SYNC: ["Sincronização", Cog, ""], SYSTEM: ["Sistema", Cog, ""],
};

/** Mostra before/after de forma legível: orçamento em moeda, status traduzido, resto como texto. */
function valor(v: unknown): string {
  if (v == null) return "—";
  if (typeof v !== "object") return String(v);
  return Object.entries(v as Record<string, unknown>).map(([k, x]) =>
    k === "dailyBudget" ? `${money(x as string)}/dia` : k === "status" ? (STATUS_LABEL[x as string] ?? String(x)) : `${k}: ${String(x)}`).join(", ");
}

export default async function AuditPage() {
  const ctx = await requireCtx();
  const linhas = await db()<{ id: number; created_at: Date; user_email: string | null; action: string; entity_name: string | null; before: unknown; after: unknown; source: string }[]>`
    select id::int as id, created_at, user_email, action, entity_name, before, after, source
    from ads.audit_logs where workspace_id = ${ctx.workspace.id} order by created_at desc limit 300`;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>Toda alteração fica registrada</div>
          <h1 className="page-title" data-enter>Auditoria</h1>
        </div>
      </div>
      <div className="panel" data-enter>
        {linhas.length === 0 ? <div className="empty">Nenhuma alteração registrada ainda.</div> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Item</th><th>Anterior</th><th>Novo</th><th>Origem</th></tr></thead>
              <tbody>
                {linhas.map((l) => {
                  const [rot, Icon, cls] = ORIGEM[l.source] ?? [l.source, Cog, ""];
                  return (
                    <tr key={l.id}>
                      <td className="tabular">{dateTime(l.created_at)}</td>
                      <td>{l.user_email ?? "—"}</td>
                      <td style={{ fontWeight: 550 }}>{l.action}</td>
                      <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }} title={l.entity_name ?? ""}>{l.entity_name ?? "—"}</td>
                      <td className="muted">{valor(l.before)}</td>
                      <td>{valor(l.after)}</td>
                      <td><span className={`badge ${cls}`}><Icon aria-hidden />{rot}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
