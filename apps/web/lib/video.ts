import "server-only";
import { db, type Brief, type Storyboard } from "@domus-ads/core";

export interface ProjetoLinha {
  kind: "video" | "image"; id: string; title: string; status: string; step_detail: string | null; error: string | null; creative_id: string | null;
  brief: Brief; created_at: Date; updated_at: Date; progress: number | null; thumb: boolean;
}

/** Projetos do workspace com o progresso do job em andamento (sempre filtrado por workspace). */
export async function projetos(ws: string): Promise<ProjetoLinha[]> {
  return db()<ProjetoLinha[]>`
    select p.id, p.kind, p.title, p.status, p.step_detail, p.error, p.creative_id, p.brief, p.created_at, p.updated_at,
      (select j.progress from ads.jobs j where j.type in ('GENERATE_VIDEO','GENERATE_IMAGE') and j.payload->>'projectId' = p.id::text and j.status in ('PENDING','RUNNING') order by j.created_at desc limit 1) as progress,
      (c.thumbnail_key is not null) as thumb
    from ads.video_projects p left join ads.creatives c on c.id = p.creative_id
    where p.workspace_id = ${ws} order by p.created_at desc limit 200`;
}

export interface ProjetoDetalhe extends ProjetoLinha {
  storyboard: Storyboard | null; job_status: string | null;
  creative: { id: string; duration_ms: number | null; size_bytes: string | null; width: number | null; height: number | null; metadata: { avisos?: string[]; music?: string | null } } | null;
}

export async function projeto(ws: string, id: string): Promise<ProjetoDetalhe | null> {
  const sql = db();
  const [p] = await sql<(ProjetoDetalhe & { c_id: string | null; c_dur: number | null; c_size: string | null; c_w: number | null; c_h: number | null; c_meta: { avisos?: string[]; music?: string | null } | null })[]>`
    select p.id, p.kind, p.title, p.status, p.step_detail, p.error, p.creative_id, p.brief, p.storyboard, p.assets, p.links, p.created_at, p.updated_at,
      j.progress, j.status as job_status, (c.thumbnail_key is not null) as thumb,
      c.id as c_id, c.duration_ms as c_dur, c.size_bytes::text as c_size, c.width as c_w, c.height as c_h, c.metadata as c_meta
    from ads.video_projects p
    left join ads.creatives c on c.id = p.creative_id
    left join lateral (select progress, status from ads.jobs where type in ('GENERATE_VIDEO','GENERATE_IMAGE') and payload->>'projectId' = p.id::text order by created_at desc limit 1) j on true
    where p.id = ${id} and p.workspace_id = ${ws}`;
  if (!p) return null;
  const { c_id, c_dur, c_size, c_w, c_h, c_meta, ...resto } = p;
  return { ...resto, creative: c_id ? { id: c_id, duration_ms: c_dur, size_bytes: c_size, width: c_w, height: c_h, metadata: c_meta ?? {} } : null };
}

export interface CriativoLinha {
  id: string; name: string; type: string; status: string; mime: string | null; size_bytes: string | null; width: number | null; height: number | null;
  duration_ms: number | null; tags: string[]; license: string | null; thumb: boolean; created_at: Date; project_id: string | null;
}

export async function criativos(ws: string, tipos: string[]): Promise<CriativoLinha[]> {
  return db()<CriativoLinha[]>`
    select c.id, c.name, c.type, c.status, c.mime, c.size_bytes::text, c.width, c.height, c.duration_ms, c.tags, c.license,
      (c.thumbnail_key is not null) as thumb, c.created_at, c.metadata->>'projectId' as project_id
    from ads.creatives c where c.workspace_id = ${ws} and c.type = any(${tipos}) and c.status <> 'UPLOADING'
    order by c.created_at desc limit 300`;
}

/** Variações (criativos IMAGE) de um projeto de imagem, na ordem em que foram criadas. */
export async function variacoes(ws: string, projectId: string) {
  return db()<{ id: string; conceito: string; width: number | null; height: number | null; versao: string }[]>`
    select id, coalesce(metadata->>'conceito', name) as conceito, width, height, extract(epoch from updated_at)::bigint::text as versao
    from ads.creatives where workspace_id = ${ws} and type = 'IMAGE' and metadata->>'projectId' = ${projectId}
    order by (metadata->>'ordem')::int nulls last, created_at`;
}
