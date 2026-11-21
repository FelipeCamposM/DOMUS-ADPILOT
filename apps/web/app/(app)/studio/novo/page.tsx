import { chaveElevenLabs, db, vozesElevenLabs } from "@domus-ads/core";
import { redirect } from "next/navigation";
import { can, requireCtx } from "@/lib/ctx";
import { contasInstagram } from "@/lib/instagram";
import { marcasDoWorkspace, resumo } from "@/lib/marcas";
import { StudioNovo } from "@/modules/studio/StudioNovo";
import { estiloPronto, textoDoEstilo, type Familia } from "@domus-ads/core/estilos";
import type { EstiloEscolhido } from "@/modules/studio/Anexos";

const FORMATO: Partial<Record<Familia, string>> = { stories: "9:16", banner: "1.91:1", post: "4:5" };

export const metadata = { title: "Novo criativo" };

export default async function NovoPage({ searchParams }: { searchParams: Promise<{ tipo?: string; item?: string; estilo?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "editor")) redirect("/studio");
  const { tipo: t, item: itemId, estilo: estiloId } = await searchParams;
  const inicial = t === "imagem" ? "imagem" : t === "post" ? "post" : t === "edicao" ? "edicao" : t === "motion" ? "motion" : "video";
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
  const estilosSalvos = (await sql<{ id: string; nome: string; descricao: string; capa_id: string | null }[]>`
    select id, nome, descricao, capa_id from ads.estilos_video where workspace_id = ${ws} order by created_at desc`).map((e) => ({ id: e.id, nome: e.nome, descricao: e.descricao, capaId: e.capa_id }));
  const vozesEl = chave ? (await vozesElevenLabs(chave).catch(() => [])).map(({ id, nome, categoria, preview }) => ({ id, nome, categoria, preview })) : [];

  // "Usar meu vídeo" no calendário: o Reels que vai receber a edição (só deste workspace)
  const [item] = itemId && /^[0-9a-f-]{36}$/i.test(itemId) ? await sql<{ id: string; tema: string; data_hora: Date }[]>`
    select id, tema, data_hora from ads.calendario_itens where id = ${itemId} and workspace_id = ${ws} and formato = 'REELS'` : [];

  // "Usar" na biblioteca de estilos: pronto (chave) ou do workspace (uuid, com as referências como inspiração)
  let estilo: EstiloEscolhido | null = null;
  const pronto = estiloId ? estiloPronto(estiloId) : null;
  if (pronto) estilo = { nome: pronto.nome, texto: textoDoEstilo(pronto), formato: FORMATO[pronto.familia], tresD: pronto.familia === "3d", refs: [] };
  else if (estiloId && /^[0-9a-f-]{36}$/i.test(estiloId)) {
    const [e] = await sql<{ nome: string; prompt: string; familia: Familia; referencias: string[] }[]>`
      select nome, prompt, familia, referencias from ads.estilos where id = ${estiloId} and workspace_id = ${ws}`;
    if (e) {
      const refs = await sql<{ id: string; name: string; type: string }[]>`
        select id, name, type from ads.creatives where id = any(${e.referencias}::uuid[]) and workspace_id = ${ws} and status = 'READY'`;
      estilo = { nome: e.nome, texto: textoDoEstilo(e), formato: FORMATO[e.familia], tresD: e.familia === "3d",
        refs: refs.map((r) => ({ creativeId: r.id, name: r.name, type: r.type, uso: "inspiracao" as const, nota: `Referência do estilo “${e.nome}”` })) };
    }
  }

  return (
    <div className="page">
      <StudioNovo inicial={inicial} estilo={estilo} post={{ contas: contas.map((c) => ({ id: c.id, username: c.username })), marcas }}
        video={{ produto, musicas: Object.fromEntries(tags.map((t) => [t.tag, t.n])), marcas, vozesEl, favoritas: eu?.vozes_favoritas ?? [], estilosSalvos }}
        imagem={{ produto, marcas }}
        edicao={{ marcas, item: item ? { id: item.id, tema: item.tema, quando: item.data_hora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) } : null }} />
    </div>
  );
}
