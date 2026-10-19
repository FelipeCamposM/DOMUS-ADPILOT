import { chaveElevenLabs, db, vozesElevenLabs } from "@domus-ads/core";
import { redirect } from "next/navigation";
import { can, requireCtx } from "@/lib/ctx";
import { contasInstagram } from "@/lib/instagram";
import { marcasDoWorkspace, resumo } from "@/lib/marcas";
import { StudioNovo } from "@/modules/studio/StudioNovo";

export const metadata = { title: "Novo criativo" };

export default async function NovoPage({ searchParams }: { searchParams: Promise<{ tipo?: string; item?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "editor")) redirect("/studio");
  const { tipo: t, item: itemId } = await searchParams;
  const inicial = t === "imagem" ? "imagem" : t === "post" ? "post" : t === "edicao" ? "edicao" : "video";
  const sql = db();
  const ws = ctx.workspace.id;
  const tags = await sql<{ tag: string; n: number }[]>`
    select t as tag, count(*)::int as n from ads.creatives, unnest(tags) t where workspace_id = ${ws} and type = 'MUSIC' and status = 'READY' group by t`;
  const [marcasTodas, contas] = await Promise.all([marcasDoWorkspace(ws), contasInstagram(ws)]);
  const marcas = marcasTodas.map(resumo);
  const produto = marcas[0]?.nome ?? ctx.workspace.name;

  // vozes do ElevenLabs (se a chave estiver configurada); falha na API = só as locais
  const chave = await chaveElevenLabs();
  const [eu] = await sql<{ vozes_favoritas: string[] }[]>`select vozes_favoritas from ads.workspace_members where workspace_id = ${ws} and user_id = ${ctx.user.id}`;
  const vozesEl = chave ? (await vozesElevenLabs(chave).catch(() => [])).map(({ id, nome, categoria, preview }) => ({ id, nome, categoria, preview })) : [];

  // "Usar meu vídeo" no calendário: o Reels que vai receber a edição (só deste workspace)
  const [item] = itemId && /^[0-9a-f-]{36}$/i.test(itemId) ? await sql<{ id: string; tema: string; data_hora: Date }[]>`
    select id, tema, data_hora from ads.calendario_itens where id = ${itemId} and workspace_id = ${ws} and formato = 'REELS'` : [];

  return (
    <div className="page">
      <StudioNovo inicial={inicial} post={{ contas: contas.map((c) => ({ id: c.id, username: c.username })), marcas }}
        video={{ produto, musicas: Object.fromEntries(tags.map((t) => [t.tag, t.n])), marcas, vozesEl, favoritas: eu?.vozes_favoritas ?? [] }}
        imagem={{ produto, marcas }}
        edicao={{ marcas, item: item ? { id: item.id, tema: item.tema, quando: item.data_hora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) } : null }} />
    </div>
  );
}
