import { createHmac } from "node:crypto";
import { decrypt } from "./crypto";
import { db } from "./db";
import { fetchJson } from "./providers/http";

/**
 * Instagram pela Graph API da Meta (conta Profissional ligada a uma Página). O token é o de um usuário do sistema do
 * Business Manager com instagram_basic, instagram_content_publish, pages_show_list e pages_read_engagement.
 */
const PERFIL = "id,username,name,profile_picture_url,biography,website,followers_count,follows_count,media_count";
const MIDIA = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}";
const RATE = new Set([4, 17, 32, 613, 9, 36003]);
const codigo = (b: unknown) => (b as { error?: { code?: number } } | null)?.error?.code;

export interface PerfilIG {
  id: string; username: string; name?: string; profile_picture_url?: string; biography?: string; website?: string;
  followers_count?: number; follows_count?: number; media_count?: number;
}
export interface MidiaIG {
  id: string; caption?: string; media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"; media_product_type?: "FEED" | "REELS" | "STORY" | "AD";
  media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number;
  children?: { data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string }[] };
}

export class InstagramApi {
  private base = `https://graph.facebook.com/${process.env.META_API_VERSION || "v26.0"}`;
  constructor(private token: string) {}

  private auth(): Record<string, string> {
    const p: Record<string, string> = { access_token: this.token };
    const s = process.env.META_APP_SECRET;
    if (s) p.appsecret_proof = createHmac("sha256", s).update(this.token).digest("hex");
    return p;
  }
  private req<T>(path: string, params: Record<string, string> = {}, metodo: "GET" | "POST" = "GET") {
    const q = new URLSearchParams({ ...params, ...this.auth() });
    const url = metodo === "GET" ? `${this.base}/${path}?${q}` : `${this.base}/${path}`;
    return fetchJson<T>(url, metodo === "GET" ? {} : { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: q }, {
      name: "Instagram", retries: 3,
      isRateLimited: (_s, b) => RATE.has(codigo(b) ?? -1),
      isAuthError: (_s, b) => codigo(b) === 190,
    });
  }

  /** Perfis do Instagram das Páginas que o token enxerga. */
  async contas(): Promise<(PerfilIG & { pageId: string })[]> {
    const r = await this.req<{ data: { id: string; instagram_business_account?: PerfilIG }[] }>("me/accounts", { fields: `id,name,instagram_business_account{${PERFIL}}`, limit: "100" });
    return r.data.filter((p) => p.instagram_business_account).map((p) => ({ ...p.instagram_business_account!, pageId: p.id }));
  }
  perfil(igId: string) { return this.req<PerfilIG>(igId, { fields: PERFIL }); }
  async midias(igId: string, limite = 30): Promise<MidiaIG[]> {
    return (await this.req<{ data: MidiaIG[] }>(`${igId}/media`, { fields: MIDIA, limit: String(limite) })).data;
  }
  criarContainer(igId: string, campos: Record<string, string>) { return this.req<{ id: string }>(`${igId}/media`, campos, "POST"); }
  statusContainer(id: string) { return this.req<{ status_code: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED"; status?: string }>(id, { fields: "status_code,status" }); }
  publicar(igId: string, creationId: string) { return this.req<{ id: string }>(`${igId}/media_publish`, { creation_id: creationId }, "POST"); }
  permalink(mediaId: string) { return this.req<{ permalink?: string }>(mediaId, { fields: "permalink" }); }
}

export const instagramDaConexao = (credentialsEnc: string) => new InstagramApi(decrypt<{ accessToken: string }>(credentialsEnc).accessToken);

/** Grava/atualiza os perfis da conexão (contadores, foto, bio). Usado ao conectar e no job SYNC_INSTAGRAM. */
export async function salvarPerfisInstagram(workspaceId: string, connectionId: string, perfis: (PerfilIG & { pageId?: string })[]) {
  const sql = db();
  for (const p of perfis) {
    await sql`
      insert into ads.instagram_accounts (workspace_id, connection_id, ig_user_id, page_id, username, nome, foto, bio, site, seguidores, seguindo, publicacoes, atualizado_em)
      values (${workspaceId}, ${connectionId}, ${p.id}, ${p.pageId ?? null}, ${p.username}, ${p.name ?? null}, ${p.profile_picture_url ?? null}, ${p.biography ?? null},
        ${p.website ?? null}, ${p.followers_count ?? null}, ${p.follows_count ?? null}, ${p.media_count ?? null}, now())
      on conflict (connection_id, ig_user_id) do update set page_id = coalesce(excluded.page_id, ads.instagram_accounts.page_id), username = excluded.username,
        nome = excluded.nome, foto = excluded.foto, bio = excluded.bio, site = excluded.site, seguidores = excluded.seguidores,
        seguindo = excluded.seguindo, publicacoes = excluded.publicacoes, atualizado_em = now()`;
  }
}

export async function syncInstagram(connectionId: string, log: (m: string) => Promise<void> = async () => {}) {
  const sql = db();
  const [k] = await sql<{ id: string; workspace_id: string; credentials_enc: string }[]>`
    select id, workspace_id, credentials_enc from ads.ad_connections where id = ${connectionId} and provider = 'INSTAGRAM'`;
  if (!k) throw new Error("Conexão do Instagram não encontrada");
  try {
    const perfis = await instagramDaConexao(k.credentials_enc).contas();
    await salvarPerfisInstagram(k.workspace_id, k.id, perfis);
    await sql`update ads.ad_connections set status = 'ACTIVE', last_error = null, last_synced_at = now() where id = ${k.id}`;
    await log(`${perfis.length} perfil(is): ${perfis.map((p) => `@${p.username}`).join(", ")}`);
    return { perfis: perfis.length };
  } catch (e) {
    await sql`update ads.ad_connections set status = 'ERROR', last_error = ${(e as Error).message} where id = ${k.id}`;
    throw e;
  }
}
