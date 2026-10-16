import { chaveElevenLabs, db, vozesElevenLabs } from "@domus-ads/core";
import { redirect } from "next/navigation";
import { can, requireCtx } from "@/lib/ctx";
import { marcasDoWorkspace, resumo } from "@/lib/marcas";
import { StudioNovo } from "@/modules/studio/StudioNovo";

export const metadata = { title: "Novo criativo" };

export default async function NovoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "editor")) redirect("/studio");
  const imagem = (await searchParams).tipo === "imagem";
  const sql = db();
  const ws = ctx.workspace.id;
  const tags = await sql<{ tag: string; n: number }[]>`
    select t as tag, count(*)::int as n from ads.creatives, unnest(tags) t where workspace_id = ${ws} and type = 'MUSIC' and status = 'READY' group by t`;
  const marcas = (await marcasDoWorkspace(ws)).map(resumo);
  const produto = marcas[0]?.nome ?? ctx.workspace.name;

  // vozes do ElevenLabs (se a chave estiver configurada); falha na API = só as locais
  const chave = await chaveElevenLabs();
  const [eu] = await sql<{ vozes_favoritas: string[] }[]>`select vozes_favoritas from ads.workspace_members where workspace_id = ${ws} and user_id = ${ctx.user.id}`;
  const vozesEl = chave ? (await vozesElevenLabs(chave).catch(() => [])).map(({ id, nome, categoria, preview }) => ({ id, nome, categoria, preview })) : [];

  return (
    <div className="page">
      <StudioNovo inicial={imagem ? "imagem" : "video"}
        video={{ produto, musicas: Object.fromEntries(tags.map((t) => [t.tag, t.n])), marcas, vozesEl, favoritas: eu?.vozes_favoritas ?? [] }}
        imagem={{ produto, marcas }} />
    </div>
  );
}
