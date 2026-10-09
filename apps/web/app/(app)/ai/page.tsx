import { db } from "@domus-ads/core";
import { z } from "zod";
import { contasAtivas } from "@/lib/ai";
import { can, requireCtx } from "@/lib/ctx";
import { Chat } from "@/modules/ai/Chat";

export const metadata = { title: "IA" };

/** Nova conversa. Atalhos: ?campaign=<id> (vindo de "Analisar com IA") e ?prompt=como-esta (Visão geral). */
export default async function NovaConversa({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  let sugestao: string | undefined;
  const camp = z.string().uuid().safeParse(sp.campaign);
  if (camp.success) {
    const [c] = await db()<{ name: string }[]>`select name from ads.campaigns where id = ${camp.data} and workspace_id = ${ctx.workspace.id}`;
    if (c) sugestao = `Analise a campanha “${c.name}” (id ${camp.data}): desempenho em 7 e 30 dias, o que está bom, o que está ruim e o que você recomenda.`;
  } else if (sp.prompt === "como-esta") {
    sugestao = `Como estão as campanhas do ${ctx.workspace.name}? Quais estão desperdiçando dinheiro?`;
  }
  return <Chat key={sugestao ?? "nova"} inicial={null} podeEditar={can(ctx, "editor")} sugestao={sugestao} provedores={await contasAtivas()} />;
}
