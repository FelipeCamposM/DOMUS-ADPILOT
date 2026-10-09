import { brandSchema, chaveElevenLabs, db, vozesElevenLabs } from "@domus-ads/core";
import { redirect } from "next/navigation";
import { can, requireCtx } from "@/lib/ctx";
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
  const biblioteca = await sql<{ id: string; name: string; type: string }[]>`
    select id, name, type from ads.creatives where workspace_id = ${ws} and status = 'READY' and 'asset' = any(tags) order by created_at desc limit 120`;
  const [w] = await sql<{ brand: unknown }[]>`select brand from ads.workspaces where id = ${ws}`;
  const b = brandSchema.parse(w?.brand ?? {});
  const brand = { cores: b.cores.map((c) => ({ hex: c.hex, nome: c.nome })), temLogo: !!b.logoId, preenchida: !!(b.cores.length || b.logoId || b.fonteTitulo || b.tom || b.sobre) };

  // vozes do ElevenLabs (se a chave estiver configurada); falha na API = só as locais
  const chave = await chaveElevenLabs();
  const vozesEl = chave ? (await vozesElevenLabs(chave).catch(() => [])).map(({ id, nome, categoria, preview }) => ({ id, nome, categoria, preview })) : [];

  return (
    <div className="page">
      <StudioNovo inicial={imagem ? "imagem" : "video"}
        video={{ produto: ctx.workspace.name, musicas: Object.fromEntries(tags.map((t) => [t.tag, t.n])), biblioteca, brand, vozesEl }}
        imagem={{ produto: ctx.workspace.name, biblioteca, brand }} />
    </div>
  );
}
