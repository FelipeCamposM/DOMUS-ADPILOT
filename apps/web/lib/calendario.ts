import "server-only";
import { db, roteiroSchema, type FormatoCal, type Roteiro } from "@domus-ads/core";

export interface ItemTela {
  id: string; calendario_id: string; data_hora: string; formato: FormatoCal; tema: string; objetivo: string; roteiro: Roteiro; legenda: string; hashtags: string[];
  status: string; refazendo: string | null; erro: string | null; updated_at: string;
  project_id: string | null; etapa: string | null; post_id: string | null; post_status: string | null; permalink: string | null; midias: { id: string; type: string }[];
}
export interface PlanoTela { id: string; inicio: string; fim: string; objetivo: string; status: string; erro: string | null; marca: string | null; itens: number; sugeridos: number }

const ISO = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

/** Posts do calendário de um perfil num intervalo (a grade do mês), com o andamento da arte e da publicação. */
export async function itensCalendario(workspaceId: string, contaId: string, de: Date, ate: Date) {
  const sql = db();
  const r = await sql<ItemTela[]>`
    select i.id, i.calendario_id, ${sql.unsafe(ISO("i.data_hora"))} as data_hora, i.formato, i.tema, i.objetivo, i.roteiro, i.legenda, i.hashtags,
      i.status, i.refazendo, i.erro, ${sql.unsafe(ISO("i.updated_at"))} as updated_at, i.project_id, p.step_detail as etapa,
      i.post_id, x.status as post_status, x.permalink,
      -- o que vai (ou foi) para o Instagram: as mídias da publicação; antes dela, as artes do projeto (vídeo atual ou slides em ordem)
      coalesce(
        (select jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type) order by m.n) from jsonb_array_elements(x.midias) with ordinality m(v, n)
          join ads.creatives c on c.id = (m.v->>'creativeId')::uuid and c.workspace_id = i.workspace_id and c.status = 'READY'),
        (select jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type) order by (c.metadata->>'ordem')::int nulls last, c.created_at) from ads.creatives c
          where c.workspace_id = i.workspace_id and c.status = 'READY' and x.id is null
            and (c.id = p.creative_id or (i.formato <> 'REELS' and c.type = 'IMAGE' and c.metadata->>'projectId' = i.project_id::text))),
        '[]') as midias
    from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id
    left join ads.video_projects p on p.id = i.project_id left join ads.instagram_posts x on x.id = i.post_id
    where i.workspace_id = ${workspaceId} and k.ig_account_id = ${contaId} and i.data_hora >= ${de} and i.data_hora < ${ate}
    order by i.data_hora`;
  // post manual nasce com roteiro vazio: completa com os padrões (slides [], duração 30…)
  return r.map((i) => ({ ...i, roteiro: roteiroSchema.catch(roteiroSchema.parse({})).parse(i.roteiro ?? {}) }));
}

export interface PostAvulso { id: string; tipo: "FEED" | "CARROSSEL" | "REELS" | "STORY"; status: string; data: string; legenda: string }

/** Publicações feitas fora do calendário (agendadas à mão), para aparecerem na mesma grade. Reposts automáticos antigos nos stories ficam de fora. */
export function postsAvulsos(workspaceId: string, contaId: string, de: Date, ate: Date) {
  const sql = db();
  return sql<PostAvulso[]>`
    select p.id, p.tipo, p.status, ${sql.unsafe(ISO("coalesce(p.publicado_em, p.agendado_para)"))} as data, left(p.legenda, 120) as legenda
    from ads.instagram_posts p
    where p.workspace_id = ${workspaceId} and p.ig_account_id = ${contaId} and p.status in ('AGENDADO', 'PUBLICANDO', 'PUBLICADO', 'FALHOU')
      and coalesce(p.publicado_em, p.agendado_para) >= ${de} and coalesce(p.publicado_em, p.agendado_para) < ${ate}
      and not (p.opcoes ? 'repostDe') and not exists (select 1 from ads.calendario_itens i where i.post_id = p.id)
    order by data`;
}

/** Planejamentos recentes do perfil (para mostrar "planejando…", erros e refazer). */
export function planosCalendario(workspaceId: string, contaId: string) {
  return db()<PlanoTela[]>`
    select k.id, k.inicio::text, k.fim::text, k.objetivo, k.status, k.erro, b.nome as marca,
      (select count(*)::int from ads.calendario_itens i where i.calendario_id = k.id) as itens,
      (select count(*)::int from ads.calendario_itens i where i.calendario_id = k.id and i.status = 'SUGERIDO') as sugeridos
    from ads.calendarios k left join ads.brands b on b.id = k.brand_id
    where k.workspace_id = ${workspaceId} and k.ig_account_id = ${contaId} and k.fim >= current_date - 7
    order by k.inicio desc limit 12`;
}
