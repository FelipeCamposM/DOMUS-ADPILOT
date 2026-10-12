"use client";

import { Bookmark, ChevronLeft, ChevronRight, Heart, MessageCircle, MoreHorizontal, Music2, Send } from "lucide-react";
import { useState } from "react";

export interface MidiaPreview { id: string; type: "IMAGE" | "VIDEO"; width: number | null; height: number | null }
export interface PerfilPreview { username: string; foto: string | null; nome?: string | null }

export const arquivo = (id: string, thumb = false) => `/api/creatives/${id}/file${thumb ? "?kind=thumb" : ""}`;
/** Proporção que o Instagram usa no feed: entre 4:5 (retrato) e 1,91:1 (paisagem). */
export const proporcaoFeed = (m?: MidiaPreview) => (m?.width && m.height ? Math.min(1.91, Math.max(0.8, m.width / m.height)) : 0.8);

export function Avatar({ p, size = 32, anel = false }: { p: PerfilPreview; size?: number; anel?: boolean }) {
  const img = p.foto ? <img src={p.foto} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
    : <span className="ig-avatar-vazio">{p.username[0]?.toUpperCase()}</span>;
  return <span className={`ig-avatar ${anel ? "anel" : ""}`} style={{ width: size, height: size }}>{img}</span>;
}

function Midia({ m, cobrir = true, tocar = true }: { m: MidiaPreview; cobrir?: boolean; tocar?: boolean }) {
  const s = { width: "100%", height: "100%", objectFit: cobrir ? "cover" : "contain", display: "block" } as const;
  return m.type === "VIDEO"
    ? <video src={arquivo(m.id)} poster={arquivo(m.id, true)} muted loop playsInline autoPlay={tocar} style={s} />
    : <img src={arquivo(m.id)} alt="" style={s} />;
}

/** Legenda no estilo do Instagram: usuário em negrito, hashtags/menções em azul, "… mais" depois de 2 linhas. */
export function Legenda({ usuario, texto }: { usuario: string; texto: string }) {
  const [aberta, setAberta] = useState(false);
  if (!texto.trim()) return null;
  const partes = texto.split(/((?:^|\s)[#@][\p{L}\p{N}_.]+)/gu);
  return (
    <div className={`ig-legenda ${aberta ? "aberta" : ""}`}>
      <b>{usuario}</b>{" "}
      {partes.map((p, i) => (/^\s?[#@]/.test(p) ? <span key={i} className="ig-tag">{p}</span> : <span key={i}>{p}</span>))}
      {!aberta && texto.length > 120 && <button type="button" onClick={() => setAberta(true)}>… mais</button>}
    </div>
  );
}

export function FeedMock({ perfil, midias, legenda }: { perfil: PerfilPreview; midias: MidiaPreview[]; legenda: string }) {
  const [i, setI] = useState(0);
  const atual = midias[Math.min(i, midias.length - 1)];
  const ratio = proporcaoFeed(midias[0]);
  return (
    <div className="ig-post">
      <div className="ig-post-head"><Avatar p={perfil} size={32} anel /><b>{perfil.username}</b><MoreHorizontal size={18} style={{ marginLeft: "auto" }} aria-hidden /></div>
      <div className="ig-post-media" style={{ aspectRatio: String(ratio) }}>
        {atual ? <Midia m={atual} /> : <div className="ig-sem-midia">Escolha uma mídia</div>}
        {midias.length > 1 && <>
          <span className="ig-contador">{i + 1}/{midias.length}</span>
          {i > 0 && <button type="button" className="ig-seta esq" onClick={() => setI(i - 1)} aria-label="Anterior"><ChevronLeft size={16} /></button>}
          {i < midias.length - 1 && <button type="button" className="ig-seta dir" onClick={() => setI(i + 1)} aria-label="Próxima"><ChevronRight size={16} /></button>}
        </>}
      </div>
      <div className="ig-post-acoes">
        <Heart size={22} aria-hidden /><MessageCircle size={22} aria-hidden /><Send size={22} aria-hidden />
        {midias.length > 1 && <span className="ig-pontos">{midias.map((_, k) => <i key={k} data-on={k === i} />)}</span>}
        <Bookmark size={22} aria-hidden style={{ marginLeft: "auto" }} />
      </div>
      <div className="ig-post-txt">
        <b>Seja o primeiro a curtir</b>
        <Legenda usuario={perfil.username} texto={legenda} />
        <span className="ig-quando">AGORA</span>
      </div>
    </div>
  );
}

export function ReelsMock({ perfil, midia, legenda }: { perfil: PerfilPreview; midia?: MidiaPreview; legenda: string }) {
  return (
    <div className="ig-tela">
      {midia ? <Midia m={midia} /> : <div className="ig-sem-midia">Escolha um vídeo</div>}
      <div className="ig-reels-topo"><b>Reels</b></div>
      <div className="ig-reels-lado"><span><Heart size={24} />0</span><span><MessageCircle size={24} />0</span><span><Send size={24} /></span><MoreHorizontal size={22} /></div>
      <div className="ig-reels-base">
        <div className="ig-reels-quem"><Avatar p={perfil} size={30} /><b>{perfil.username}</b><span className="ig-seguir">Seguir</span></div>
        {legenda.trim() && <p className="ig-reels-legenda">{legenda.split("\n")[0]}</p>}
        <span className="ig-reels-audio"><Music2 size={12} /> {perfil.username} · Áudio original</span>
      </div>
    </div>
  );
}

export function StoryMock({ perfil, midia }: { perfil: PerfilPreview; midia?: MidiaPreview }) {
  return (
    <div className="ig-tela">
      {midia && <div className="ig-story-fundo" style={{ backgroundImage: `url(${arquivo(midia.id, midia.type === "VIDEO")})` }} />}
      {midia ? <div className="ig-story-midia"><Midia m={midia} cobrir={false} /></div> : <div className="ig-sem-midia">Escolha uma foto ou vídeo</div>}
      <div className="ig-story-barra"><i /></div>
      <div className="ig-story-topo"><Avatar p={perfil} size={30} /><b>{perfil.username}</b><span>agora</span><MoreHorizontal size={18} style={{ marginLeft: "auto" }} /></div>
      <div className="ig-story-base"><span className="ig-story-msg">Enviar mensagem</span><Heart size={24} /><Send size={24} /></div>
    </div>
  );
}

/** Grade do perfil com a publicação nova em primeiro lugar, sobre as que já estão no ar. */
export function GradeMock({ perfil, nova, existentes }: { perfil: PerfilPreview; nova: MidiaPreview | null; existentes: string[] }) {
  return (
    <div className="ig-grade-mock">
      <div className="ig-grade-mock-head"><Avatar p={perfil} size={40} anel /><div><b>{perfil.username}</b><span>{perfil.nome}</span></div></div>
      <div className="ig-grade">
        <div className="ig-celula nova">{nova ? (nova.type === "VIDEO" ? <img src={arquivo(nova.id, true)} alt="" /> : <img src={arquivo(nova.id)} alt="" />) : <div className="ig-sem-midia" />}<span className="ig-selo">Nova</span></div>
        {existentes.slice(0, 11).map((u, i) => <div key={i} className="ig-celula"><img src={u} alt="" referrerPolicy="no-referrer" /></div>)}
      </div>
    </div>
  );
}
