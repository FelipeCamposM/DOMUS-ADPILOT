import "server-only";
import { db } from "@domus-ads/core";

export interface ChatMsg { id: number; role: "user" | "assistant" | "system"; content: string; status: string; provider: string | null; meta: Record<string, unknown>; created_at: string }
export interface ChatAction { id: string; message_id: number | null; type: string; summary: string; reason: string | null; status: string; error: string | null }
export interface ChatState {
  conversation: { id: string; title: string; status: string; provider_pref: string };
  messages: ChatMsg[];
  actions: ChatAction[];
}

/** Estado completo de uma conversa (sempre filtrado pelo workspace). Usado na página e no polling. */
export async function chatState(workspaceId: string, conversationId: string): Promise<ChatState | null> {
  const sql = db();
  const [conversation] = await sql<ChatState["conversation"][]>`
    select id, title, status, provider_pref from ads.ai_conversations where id = ${conversationId} and workspace_id = ${workspaceId}`;
  if (!conversation) return null;
  const messages = await sql<ChatMsg[]>`
    select id::int as id, role, content, status, provider, meta, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from ads.ai_messages where conversation_id = ${conversationId} order by id`;
  const actions = await sql<ChatAction[]>`
    select id, message_id::int as message_id, type, summary, reason, status, error from ads.ai_actions where conversation_id = ${conversationId} order by created_at`;
  return { conversation, messages, actions };
}

export async function listaConversas(workspaceId: string) {
  return db()<{ id: string; title: string; status: string; updated_at: Date; pendentes: number }[]>`
    select c.id, c.title, c.status, c.updated_at,
      (select count(*)::int from ads.ai_actions a where a.conversation_id = c.id and a.status = 'PENDING_APPROVAL') as pendentes
    from ads.ai_conversations c where c.workspace_id = ${workspaceId} order by c.updated_at desc limit 200`;
}

export async function contasAtivas() {
  const r = await db()<{ provider: "claude" | "codex"; n: number }[]>`
    select provider, count(*)::int as n from ads.ai_accounts where status = 'ACTIVE' group by provider`;
  return { claude: r.find((x) => x.provider === "claude")?.n ?? 0, codex: r.find((x) => x.provider === "codex")?.n ?? 0 };
}
