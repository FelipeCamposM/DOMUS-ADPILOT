import { notFound } from "next/navigation";
import { z } from "zod";
import { chatState, contasAtivas } from "@/lib/ai";
import { can, requireCtx } from "@/lib/ctx";
import { Chat } from "@/modules/ai/Chat";

export default async function Conversa({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const st = await chatState(ctx.workspace.id, id.data);
  if (!st) notFound();
  return <Chat key={st.conversation.id} inicial={st} podeEditar={can(ctx, "editor")} provedores={await contasAtivas()} />;
}
