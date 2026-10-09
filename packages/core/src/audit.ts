import type { Sql } from "./db";

export type AuditSource = "USER" | "AI_RECOMMENDATION" | "SYNC" | "SYSTEM";

export interface Actor {
  userId: string | null;
  email: string | null;
}

export async function audit(sql: Sql, e: {
  workspaceId: string | null; actor: Actor; action: string; source?: AuditSource;
  entityType?: string; entityId?: string; entityName?: string; before?: unknown; after?: unknown;
}) {
  await sql`
    insert into ads.audit_logs (workspace_id, user_id, user_email, action, entity_type, entity_id, entity_name, before, after, source)
    values (${e.workspaceId}, ${e.actor.userId}, ${e.actor.email}, ${e.action}, ${e.entityType ?? null}, ${e.entityId ?? null},
            ${e.entityName ?? null}, ${e.before === undefined ? null : sql.json(e.before as never)},
            ${e.after === undefined ? null : sql.json(e.after as never)}, ${e.source ?? "USER"})`;
}
