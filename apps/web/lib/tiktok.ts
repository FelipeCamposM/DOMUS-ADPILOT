import "server-only";
import { db, decrypt, encrypt } from "@domus-ads/core";

/** Login Kit (perfil), Display API (estatísticas e vídeos) e Content Posting API (envio para a caixa de entrada; a pessoa publica no app).
 * TIKTOK_SCOPES troca a lista: o app de produção só pode pedir escopos já aprovados, senão o login falha. */
export const ESCOPOS_TIKTOK = process.env.TIKTOK_SCOPES || "user.info.basic,user.info.profile,user.info.stats,video.list,video.upload";
const API = "https://open.tiktokapis.com/v2";

export const tiktokConfigurado = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);

interface Token { access_token?: string; refresh_token?: string; open_id?: string; scope?: string; error?: string; error_description?: string }

export async function tokenTikTok(params: Record<string, string>): Promise<Token> {
  const r = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, ...params }),
  });
  return (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as Token;
}

export async function perfilTikTok(accessToken: string) {
  const r = await fetch(`${API}/user/info/?fields=open_id,display_name,avatar_url`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = (await r.json().catch(() => ({}))) as { data?: { user?: { display_name?: string; avatar_url?: string } } };
  const u = j.data?.user ?? {};
  return { nome: u.display_name ?? null, foto: u.avatar_url?.startsWith("https://") ? u.avatar_url : null };
}

/** Access token novo a partir do refresh guardado (o TikTok pode girar o refresh: salva o que voltar). */
async function acessoTikTok(connectionId: string, credEnc: string) {
  const cred = decrypt<{ refreshToken: string; openId: string }>(credEnc);
  const t = await tokenTikTok({ grant_type: "refresh_token", refresh_token: cred.refreshToken });
  const sql = db();
  if (!t.access_token) {
    await sql`update ads.ad_connections set status = 'ERROR', last_error = 'A autorização do TikTok expirou. Conecte de novo.' where id = ${connectionId}`;
    throw new Error("A autorização do TikTok expirou. Conecte de novo em Conexões.");
  }
  if (t.refresh_token && t.refresh_token !== cred.refreshToken) {
    await sql`update ads.ad_connections set credentials_enc = ${encrypt({ ...cred, refreshToken: t.refresh_token })} where id = ${connectionId}`;
  }
  return t.access_token;
}

/**
 * Envia um MP4 para a caixa de entrada do TikTok da conta conectada (FILE_UPLOAD em pedaços).
 * Regras do TikTok: até 64 MB vai num pedaço só; acima, pedaços de 10 MB e o último leva o resto.
 */
export async function enviarVideoTikTok(conexao: { id: string; credentials_enc: string }, video: ArrayBuffer) {
  const token = await acessoTikTok(conexao.id, conexao.credentials_enc);
  const total = video.byteLength;
  const pedaco = total <= 64 * 1024 * 1024 ? total : 10 * 1024 * 1024;
  const n = Math.floor(total / pedaco);
  const r = await fetch(`${API}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: total, chunk_size: pedaco, total_chunk_count: n } }),
  });
  const j = (await r.json().catch(() => ({}))) as { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } };
  if (!r.ok || !j.data?.upload_url) throw new Error(`O TikTok recusou o envio: ${j.error?.message || j.error?.code || `HTTP ${r.status}`}`);
  for (let i = 0; i < n; i++) {
    const ini = i * pedaco;
    const fim = i === n - 1 ? total : ini + pedaco;
    const up = await fetch(j.data.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${ini}-${fim - 1}/${total}` },
      body: video.slice(ini, fim),
    });
    if (!up.ok) throw new Error(`Falha ao enviar o vídeo ao TikTok (parte ${i + 1}/${n}, HTTP ${up.status})`);
  }
  return j.data.publish_id ?? null;
}

export interface PerfilTT {
  display_name?: string; username?: string; avatar_url?: string; bio_description?: string; profile_deep_link?: string; is_verified?: boolean;
  follower_count?: number; following_count?: number; likes_count?: number; video_count?: number;
}
export interface VideoTT {
  id: string; title?: string; video_description?: string; cover_image_url?: string; share_url?: string; create_time?: number; duration?: number;
  view_count?: number; like_count?: number; comment_count?: number; share_count?: number;
}

async function api<T>(token: string, caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  if (!r.ok || (j.error?.code && j.error.code !== "ok")) throw new Error(j.error?.message || j.error?.code || `HTTP ${r.status}`);
  return j.data as T;
}

/** Perfil + estatísticas + últimos vídeos públicos (Display API), ao vivo. */
export async function painelTikTok(conexao: { id: string; credentials_enc: string }) {
  const token = await acessoTikTok(conexao.id, conexao.credentials_enc);
  const campos = "display_name,username,avatar_url,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count";
  const [u, v] = await Promise.all([
    api<{ user: PerfilTT }>(token, `/user/info/?fields=${campos}`),
    api<{ videos: VideoTT[] }>(token, "/video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,duration,view_count,like_count,comment_count,share_count", {
      method: "POST", body: JSON.stringify({ max_count: 20 }),
    }),
  ]);
  return { perfil: u.user, videos: v.videos ?? [] };
}
