import { listaConversas } from "@/lib/ai";
import { requireCtx } from "@/lib/ctx";
import { ConversationList } from "@/modules/ai/ConversationList";

export default async function AiLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const itens = await listaConversas(ctx.workspace.id);
  return (
    <div className="ai-grid">
      <ConversationList itens={itens.map((c) => ({ ...c, updated_at: c.updated_at.toISOString() }))} />
      <div style={{ minWidth: 0, overflowY: "auto" }} className="content">{children}</div>
    </div>
  );
}
