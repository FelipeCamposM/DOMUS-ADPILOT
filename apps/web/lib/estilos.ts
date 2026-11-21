import { db, r2Presign } from "@domus-ads/core";
import { ESTILOS_PRONTOS, type Familia } from "@domus-ads/core/estilos";

/** Card da biblioteca de estilos (pronto ou do workspace), já com a URL da prévia e as referências. */
export interface CardEstilo {
  id: string; // chave (pronto) ou uuid (do workspace)
  pronto: boolean; nome: string; familia: Familia; resumo: string; tags: string[]; prompt: string;
  previa: string | null; // MP4 da amostra (pronto)
  previaStatus: string | null; previaErro: string | null;
  refs: { id: string; name: string; type: string }[]; // referências (imagens/vídeos) do workspace
}

/** Estilos prontos (com a prévia renderizada, quando houver) + os do workspace. */
export async function listarEstilos(ws: string): Promise<CardEstilo[]> {
  const sql = db();
  const [linhas, meus] = await Promise.all([
    sql<{ chave: string; previa_key: string | null; previa_status: string | null; previa_erro: string | null }[]>`
      select chave, previa_key, previa_status, previa_erro from ads.estilos where chave is not null`,
    sql<{ id: string; nome: string; familia: Familia; resumo: string; tags: string[]; prompt: string; referencias: string[] }[]>`
      select id, nome, familia, resumo, tags, prompt, referencias from ads.estilos where workspace_id = ${ws} order by created_at desc`,
  ]);
  const ids = meus.flatMap((m) => m.referencias);
  const refs = ids.length ? await sql<{ id: string; name: string; type: string }[]>`
    select id, name, type from ads.creatives where id = any(${ids}::uuid[]) and workspace_id = ${ws} and status = 'READY'` : [];
  const porChave = new Map(linhas.map((l) => [l.chave, l]));
  const prontos = await Promise.all(ESTILOS_PRONTOS.map(async (e): Promise<CardEstilo> => {
    const l = porChave.get(e.chave);
    return {
      id: e.chave, pronto: true, nome: e.nome, familia: e.familia, resumo: e.resumo, tags: e.tags, prompt: e.prompt,
      previa: l?.previa_key && l.previa_status === "PRONTA" ? await r2Presign(l.previa_key) : null,
      previaStatus: l?.previa_status ?? null, previaErro: l?.previa_erro ?? null, refs: [],
    };
  }));
  return [
    ...meus.map((m): CardEstilo => ({
      id: m.id, pronto: false, nome: m.nome, familia: m.familia, resumo: m.resumo, tags: m.tags, prompt: m.prompt,
      previa: null, previaStatus: null, previaErro: null,
      refs: m.referencias.map((r) => refs.find((x) => x.id === r)).filter((x): x is { id: string; name: string; type: string } => !!x),
    })),
    ...prontos,
  ];
}
