import { db } from "@domus-ads/core";
import { AlertTriangle, BadgeCheck, ExternalLink, Heart, MessageCircle, Play, PlugZap, Share2 } from "lucide-react";
import Link from "next/link";
import { requireCtx } from "@/lib/ctx";
import { painelTikTok } from "@/lib/tiktok";
import { TikTokLogo } from "@/modules/connections/Logos";

export const metadata = { title: "TikTok" };

const num = (n: number | null | undefined) => (n == null ? "–" : new Intl.NumberFormat("pt-BR", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n));

/** Perfil do TikTok conectado: números, bio e os últimos vídeos com visualizações, curtidas, comentários e compartilhamentos. */
export default async function TikTokPage() {
  const ctx = await requireCtx();
  const [k] = await db()<{ id: string; credentials_enc: string }[]>`
    select id, credentials_enc from ads.ad_connections
    where workspace_id = ${ctx.workspace.id} and provider = 'TIKTOK' and status <> 'REVOKED' order by created_at desc limit 1`;
  if (!k) {
    return (
      <div className="page">
        <div className="panel cn-vazio" data-enter>
          <span className="cn-plat-logo"><TikTokLogo size={34} /></span>
          <h2>Conecte o TikTok</h2>
          <p className="muted small" style={{ maxWidth: 460 }}>Com a conta conectada, você vê seguidores, curtidas e o desempenho de cada vídeo, e envia os vídeos do Studio direto para o seu TikTok.</p>
          <Link href="/connections" className="btn btn-primary btn-sm"><PlugZap aria-hidden /> Ir para Conexões</Link>
        </div>
      </div>
    );
  }

  let dados: Awaited<ReturnType<typeof painelTikTok>> | null = null;
  let erro: string | null = null;
  try { dados = await painelTikTok(k); } catch (e) { erro = (e as Error).message; }
  const p = dados?.perfil ?? {};
  const videos = dados?.videos ?? [];
  const user = p.username ?? p.display_name ?? "TikTok";

  return (
    <div className="page page-ig" style={{ maxWidth: 975 }}>
      <div className="ig-pagina">
        <header className="ig-perfil">
          <div className="ig-perfil-foto">
            {p.avatar_url ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" className="tt-avatar" /> : <span className="tt-avatar"><TikTokLogo size={60} /></span>}
          </div>
          <div className="ig-perfil-info">
            <div className="ig-perfil-linha">
              <h1>{user}{p.is_verified && <BadgeCheck size={18} aria-label="Verificado" style={{ color: "#20d5ec", marginLeft: 6 }} />}</h1>
              <Link className="btn btn-primary btn-sm" href="/studio"><Play aria-hidden /> Criar vídeo no Studio</Link>
              {p.profile_deep_link && <a className="btn btn-secondary btn-sm" href={p.profile_deep_link} target="_blank" rel="noreferrer">Abrir no TikTok <ExternalLink aria-hidden /></a>}
            </div>
            <ul className="ig-perfil-nums">
              <li><b>{num(p.following_count)}</b> seguindo</li>
              <li><b>{num(p.follower_count)}</b> seguidores</li>
              <li><b>{num(p.likes_count)}</b> curtidas</li>
              <li><b>{num(p.video_count)}</b> vídeos</li>
            </ul>
            <div className="ig-perfil-bio">
              {p.display_name && <b>{p.display_name}</b>}
              {p.bio_description && <p>{p.bio_description}</p>}
            </div>
          </div>
        </header>

        {erro && <div className="cn-erro" style={{ margin: 0 }}><AlertTriangle size={15} aria-hidden /><span>Não consegui carregar o TikTok agora: {erro}. Se você conectou antes do painel existir, reconecte em Conexões para liberar as estatísticas.</span></div>}

        <div className="ig-grade grande tt-grade">
          {videos.map((v) => (
            <a key={v.id} href={v.share_url} target="_blank" rel="noreferrer" className="ig-celula tt-celula" title={v.title || v.video_description || undefined}>
              {v.cover_image_url && <img src={v.cover_image_url} alt="" referrerPolicy="no-referrer" loading="lazy" />}
              <span className="tt-views"><Play size={14} fill="currentColor" aria-hidden /> {num(v.view_count)}</span>
              <span className="ig-celula-hover">
                <span><Heart size={16} fill="currentColor" /> {num(v.like_count)}</span>
                <span><MessageCircle size={16} fill="currentColor" /> {num(v.comment_count)}</span>
                <span><Share2 size={16} /> {num(v.share_count)}</span>
              </span>
            </a>
          ))}
          {!erro && videos.length === 0 && <p className="subtle small" style={{ gridColumn: "1/-1", padding: 32, textAlign: "center" }}>Nenhum vídeo público ainda.</p>}
        </div>
      </div>
    </div>
  );
}
