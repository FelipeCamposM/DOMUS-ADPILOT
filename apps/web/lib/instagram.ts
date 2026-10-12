import "server-only";
import { db, instagramDaConexao, type MidiaIG } from "@domus-ads/core";

export interface ContaIG {
  id: string; username: string; nome: string | null; foto: string | null; bio: string | null; site: string | null;
  seguidores: number | null; seguindo: number | null; publicacoes: number | null; conexao_ok: boolean;
}
export interface PostIG {
  id: string; ig_account_id: string; tipo: "FEED" | "CARROSSEL" | "REELS" | "STORY"; legenda: string; midias: { creativeId: string }[]; opcoes: { compartilharNoFeed?: boolean; capaMs?: number };
  status: string; agendado_para: string | null; publicado_em: string | null; permalink: string | null; erro: string | null;
  sugestao: { gerando?: boolean; legenda?: string; hashtags?: string[]; erro?: string } | null; updated_at: string;
  capa: { id: string; type: string } | null;
}

const ISO = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export function contasInstagram(workspaceId: string) {
  return db()<ContaIG[]>`
    select a.id, a.username, a.nome, a.foto, a.bio, a.site, a.seguidores, a.seguindo, a.publicacoes, (k.status = 'ACTIVE') as conexao_ok
    from ads.instagram_accounts a join ads.ad_connections k on k.id = a.connection_id
    where a.workspace_id = ${workspaceId} and k.status <> 'REVOKED' order by a.username`;
}

/** Publicações da plataforma (todas menos as publicadas há mais de 30 dias). */
export function postsInstagram(workspaceId: string, contaId: string | null, id?: string) {
  const sql = db();
  return sql<PostIG[]>`
    select p.id, p.ig_account_id, p.tipo, p.legenda, p.midias, p.opcoes, p.status, p.permalink, p.erro, p.sugestao,
      ${sql.unsafe(ISO("p.agendado_para"))} as agendado_para, ${sql.unsafe(ISO("p.publicado_em"))} as publicado_em, ${sql.unsafe(ISO("p.updated_at"))} as updated_at,
      (select jsonb_build_object('id', c.id, 'type', c.type) from ads.creatives c where c.id = (p.midias->0->>'creativeId')::uuid and c.workspace_id = p.workspace_id) as capa
    from ads.instagram_posts p
    where p.workspace_id = ${workspaceId} and ${contaId ? sql`p.ig_account_id = ${contaId}` : sql`true`}
      and ${id ? sql`p.id = ${id}` : sql`(p.status <> 'PUBLICADO' or p.publicado_em > now() - interval '30 days')`}
    order by coalesce(p.agendado_para, p.updated_at) desc`;
}

/**
 * Perfil e últimas publicações direto da API (URLs de mídia do Instagram expiram, então não vão para o banco).
 * Falhou (token, rede): devolve só o perfil salvo e o motivo.
 */
export async function aoVivo(workspaceId: string, contaId: string): Promise<{ midias: MidiaIG[]; erro: string | null }> {
  const [k] = await db()<{ ig_user_id: string; credentials_enc: string }[]>`
    select a.ig_user_id, k.credentials_enc from ads.instagram_accounts a join ads.ad_connections k on k.id = a.connection_id
    where a.id = ${contaId} and a.workspace_id = ${workspaceId}`;
  if (!k) return { midias: [], erro: "Perfil não encontrado" };
  try {
    return { midias: await instagramDaConexao(k.credentials_enc).midias(k.ig_user_id, 36), erro: null };
  } catch (e) {
    return { midias: [], erro: (e as Error).message };
  }
}

/** Fotos e vídeos prontos da biblioteca que servem para o Instagram. */
export function midiasDaBiblioteca(workspaceId: string) {
  return db()<{ id: string; name: string; type: "IMAGE" | "VIDEO"; width: number | null; height: number | null; duration_ms: number | null; created_at: Date }[]>`
    select id, name, type, width, height, duration_ms, created_at from ads.creatives
    where workspace_id = ${workspaceId} and status = 'READY' and type in ('IMAGE', 'VIDEO') and r2_key is not null and not ('referencia' = any(tags))
    order by created_at desc limit 300`;
}
