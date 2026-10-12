"use client";

import type { MidiaIG } from "@domus-ads/core";
import { STATUS_POST, TIPOS_POST } from "@domus-ads/core/instagram-regras";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Clapperboard, Copy, ExternalLink, Grid3x3, Heart, Loader2, MessageCircle, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ContaIG, PostIG } from "@/lib/instagram";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { apagarPublicacao, voltarParaRascunho } from "./actions";
import { arquivo, Avatar, Legenda } from "./Mockups";
import { ICONE_TIPO, NovaPublicacao } from "./NovaPublicacao";

const num = (n: number | null | undefined) => (n == null ? "–" : new Intl.NumberFormat("pt-BR", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n));
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const capaIG = (m: MidiaIG) => m.thumbnail_url ?? m.media_url ?? m.children?.data[0]?.thumbnail_url ?? m.children?.data[0]?.media_url ?? "";

type Aba = "posts" | "reels" | "planejados";

export function PerfilInstagram({ conta, contas, midias, posts, erroApi, podeEditar }: {
  conta: ContaIG; contas: ContaIG[]; midias: MidiaIG[]; posts: PostIG[]; erroApi: string | null; podeEditar: boolean;
}) {
  const [aba, setAba] = useState<Aba>("posts");
  const [nova, setNova] = useState(false);
  const [verPlanejados, setVerPlanejados] = useState(true);
  const [aberta, setAberta] = useState<MidiaIG | null>(null);
  const planejados = posts.filter((p) => p.status !== "PUBLICADO");
  const naGrade = planejados.filter((p) => p.tipo !== "STORY");
  const reels = midias.filter((m) => m.media_product_type === "REELS");
  const perfil = { username: conta.username, foto: conta.foto, nome: conta.nome };

  return (
    <div className="ig-pagina">
      {contas.length > 1 && (
        <nav className="cluster" style={{ gap: 6 }} aria-label="Perfis">
          {contas.map((c) => (
            <Link key={c.id} href={`/instagram?conta=${c.id}`} className="chip" data-active={c.id === conta.id} style={{ gap: 8 }}>
              <Avatar p={c} size={20} />@{c.username}
            </Link>
          ))}
        </nav>
      )}

      <header className="ig-perfil">
        <div className="ig-perfil-foto"><Avatar p={perfil} size={150} anel /></div>
        <div className="ig-perfil-info">
          <div className="ig-perfil-linha">
            <h1>{conta.username}</h1>
            {podeEditar && <button className="btn btn-primary btn-sm" onClick={() => setNova(true)}><Plus aria-hidden /> Nova publicação</button>}
            <a className="btn btn-secondary btn-sm" href={`https://www.instagram.com/${conta.username}/`} target="_blank" rel="noreferrer">Abrir no Instagram <ExternalLink aria-hidden /></a>
          </div>
          <ul className="ig-perfil-nums">
            <li><b>{num(conta.publicacoes)}</b> publicações</li>
            <li><b>{num(conta.seguidores)}</b> seguidores</li>
            <li><b>{num(conta.seguindo)}</b> seguindo</li>
          </ul>
          <div className="ig-perfil-bio">
            {conta.nome && <b>{conta.nome}</b>}
            {conta.bio && <p>{conta.bio}</p>}
            {conta.site && <a href={conta.site} target="_blank" rel="noreferrer">{conta.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
          </div>
        </div>
      </header>

      {erroApi && <div className="cn-erro" style={{ margin: 0 }}><AlertTriangle size={15} aria-hidden /><span>Não consegui carregar as publicações do Instagram agora: {erroApi}</span></div>}

      <div className="ig-abas" role="tablist">
        {([["posts", "Publicações", Grid3x3, null], ["reels", "Reels", Clapperboard, null], ["planejados", "Planejados", CalendarClock, planejados.length]] as const).map(([k, l, I, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} className="ig-aba" onClick={() => setAba(k)}><I size={14} aria-hidden /> {l}{n ? <span className="ig-aba-n">{n}</span> : null}</button>
        ))}
        {aba === "posts" && naGrade.length > 0 && (
          <label className="ig-ver-planejados"><input type="checkbox" checked={verPlanejados} onChange={(e) => setVerPlanejados(e.target.checked)} /> Prévia com os planejados</label>
        )}
      </div>

      {aba === "planejados" ? <Planejados posts={posts} podeEditar={podeEditar} onNova={() => setNova(true)} /> : (
        <div className="ig-grade grande">
          {aba === "posts" && verPlanejados && naGrade.map((p) => <CelulaPlanejada key={p.id} p={p} />)}
          {(aba === "reels" ? reels : midias).map((m) => (
            <button key={m.id} type="button" className="ig-celula" onClick={() => setAberta(m)} aria-label="Ver publicação">
              <img src={capaIG(m)} alt="" referrerPolicy="no-referrer" loading="lazy" />
              {m.media_type === "CAROUSEL_ALBUM" ? <Copy className="ig-celula-tipo" size={18} /> : m.media_product_type === "REELS" ? <Clapperboard className="ig-celula-tipo" size={18} /> : null}
              <span className="ig-celula-hover"><span><Heart size={18} fill="currentColor" /> {num(m.like_count)}</span><span><MessageCircle size={18} fill="currentColor" /> {num(m.comments_count)}</span></span>
            </button>
          ))}
          {!erroApi && midias.length === 0 && !(aba === "posts" && verPlanejados && naGrade.length) && <p className="subtle small" style={{ gridColumn: "1/-1", padding: 32, textAlign: "center" }}>Nenhuma publicação ainda.</p>}
        </div>
      )}

      <NovaPublicacao open={nova} onClose={() => setNova(false)} conta={conta.id} />
      <Visualizador m={aberta} perfil={perfil} onClose={() => setAberta(null)} />
    </div>
  );
}

function CelulaPlanejada({ p }: { p: PostIG }) {
  const I = ICONE_TIPO[p.tipo];
  return (
    <Link href={`/instagram/publicar/${p.id}`} className="ig-celula planejada" data-status={p.status}>
      {p.capa ? <img src={arquivo(p.capa.id, p.capa.type === "VIDEO")} alt="" /> : <div className="ig-sem-midia">Sem mídia</div>}
      <I className="ig-celula-tipo" size={18} />
      <span className="ig-selo" data-status={p.status}>{p.status === "AGENDADO" ? quando(p.agendado_para) : STATUS_POST[p.status]}</span>
    </Link>
  );
}

function Planejados({ posts, podeEditar, onNova }: { posts: PostIG[]; podeEditar: boolean; onNova: () => void }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [apagar, setApagar] = useState<PostIG | null>(null);
  const acao = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    const r = await fn();
    if (r.ok) toast.ok(ok); else toast.err(r.error ?? "Erro");
    setApagar(null);
    router.refresh();
  });
  if (!posts.length) return (
    <div className="cn-vazio panel"><CalendarClock size={28} aria-hidden style={{ color: "rgb(var(--c-brand))" }} /><h2>Nada planejado</h2>
      <p className="muted small">Crie uma publicação e agende: ela aparece aqui e na prévia do feed.</p>
      {podeEditar && <button className="btn btn-primary btn-sm" onClick={onNova}><Plus aria-hidden /> Nova publicação</button>}</div>
  );
  return (
    <div className="ig-lista">
      {posts.map((p) => {
        const I = ICONE_TIPO[p.tipo];
        return (
          <div key={p.id} className="ig-item" data-status={p.status}>
            <Link href={`/instagram/publicar/${p.id}`} className="ig-item-capa">{p.capa ? <img src={arquivo(p.capa.id, p.capa.type === "VIDEO")} alt="" /> : <I size={20} />}</Link>
            <div className="ig-item-txt">
              <div className="cluster" style={{ gap: 8 }}>
                <span className="ig-item-tipo"><I size={13} aria-hidden /> {TIPOS_POST[p.tipo].nome}</span>
                <span className="ig-selo inline" data-status={p.status}>{p.status === "PUBLICANDO" && <Loader2 size={11} className="animate-spin" />}{STATUS_POST[p.status]}</span>
                {p.status === "AGENDADO" && <span className="subtle small">{quando(p.agendado_para)}</span>}
                {p.status === "PUBLICADO" && <span className="subtle small">{quando(p.publicado_em)}</span>}
              </div>
              <p className="ig-item-legenda">{p.tipo === "STORY" ? "Story (sem legenda)" : p.legenda.trim() || <span className="subtle">Sem legenda</span>}</p>
              {p.erro && <p className="error-text small">{p.erro}</p>}
            </div>
            <div className="cluster" style={{ gap: 4, flexWrap: "nowrap" }}>
              {p.permalink && <a className="btn btn-ghost btn-xs" href={p.permalink} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Ver</a>}
              {podeEditar && p.status !== "PUBLICADO" && p.status !== "PUBLICANDO" && <Link className="btn btn-secondary btn-xs" href={`/instagram/publicar/${p.id}`}><Pencil aria-hidden /> Editar</Link>}
              {podeEditar && p.status === "AGENDADO" && <button className="btn btn-ghost btn-xs" disabled={pend} onClick={() => acao(() => voltarParaRascunho(p.id), "Agendamento cancelado")}><Undo2 aria-hidden /> Cancelar</button>}
              {podeEditar && p.status !== "PUBLICANDO" && <button className="btn btn-ghost btn-xs cn-del" onClick={() => setApagar(p)} aria-label="Apagar"><Trash2 aria-hidden /></button>}
            </div>
          </div>
        );
      })}
      <Dialog open={!!apagar} onClose={() => setApagar(null)} title="Apagar publicação">
        <p className="muted small">{apagar?.status === "PUBLICADO" ? "Sai só da plataforma; o post continua no Instagram." : "O rascunho/agendamento some e nada é publicado."}</p>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setApagar(null)}>Cancelar</button>
          <button className="btn btn-danger btn-sm" disabled={pend} onClick={() => apagar && acao(() => apagarPublicacao(apagar.id), "Publicação apagada")}><Trash2 aria-hidden /> Apagar</button>
        </div>
      </Dialog>
    </div>
  );
}

/** Publicação aberta como no Instagram web: mídia à esquerda, legenda e números à direita. */
function Visualizador({ m, perfil, onClose }: { m: MidiaIG | null; perfil: { username: string; foto: string | null }; onClose: () => void }) {
  const [i, setI] = useState(0);
  const itens = m ? (m.children?.data.length ? m.children.data : [{ id: m.id, media_type: m.media_type, media_url: m.media_url, thumbnail_url: m.thumbnail_url }]) : [];
  const atual = itens[Math.min(i, itens.length - 1)];
  return (
    <Dialog open={!!m} onClose={() => { setI(0); onClose(); }} title={m ? new Date(m.timestamp).toLocaleDateString("pt-BR", { dateStyle: "long" }) : ""}>
      {m && atual && (
        <div className="ig-visu">
          <div className="ig-visu-midia">
            {atual.media_type === "VIDEO" ? <video src={atual.media_url} poster={atual.thumbnail_url} controls autoPlay playsInline /> : <img src={atual.media_url} alt="" referrerPolicy="no-referrer" />}
            {itens.length > 1 && <>
              {i > 0 && <button type="button" className="ig-seta esq" onClick={() => setI(i - 1)} aria-label="Anterior"><ChevronLeft size={16} /></button>}
              {i < itens.length - 1 && <button type="button" className="ig-seta dir" onClick={() => setI(i + 1)} aria-label="Próxima"><ChevronRight size={16} /></button>}
            </>}
          </div>
          <div className="ig-visu-lado">
            <div className="ig-post-head" style={{ padding: 0 }}><Avatar p={perfil} size={32} /><b>{perfil.username}</b></div>
            <Legenda usuario={perfil.username} texto={m.caption ?? ""} />
            <div className="cluster" style={{ gap: 16, marginTop: "auto" }}>
              <span className="cluster" style={{ gap: 6 }}><Heart size={18} /> {num(m.like_count)} curtidas</span>
              <span className="cluster" style={{ gap: 6 }}><MessageCircle size={18} /> {num(m.comments_count)}</span>
            </div>
            <a className="btn btn-secondary btn-sm" href={m.permalink} target="_blank" rel="noreferrer">Abrir no Instagram <ExternalLink aria-hidden /></a>
          </div>
        </div>
      )}
    </Dialog>
  );
}
