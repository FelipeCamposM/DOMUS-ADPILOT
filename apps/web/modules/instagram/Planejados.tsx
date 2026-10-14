"use client";

import { TIPOS_POST } from "@domus-ads/core/instagram-regras";
import { gsap } from "gsap";
import { AlertTriangle, Bookmark, CalendarCheck2, CalendarClock, ExternalLink, FilePen, Heart, Loader2, MessageCircle, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { PostIG } from "@/lib/instagram";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { apagarPublicacao, voltarParaRascunho } from "./actions";
import { arquivo, Avatar, Legenda, type PerfilPreview } from "./Mockups";
import { ICONE_TIPO } from "./NovaPublicacao";

const dataLonga = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
const diaCurto = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "em 2 dias", "em 3 horas", "em 12 minutos" (ou "atrasado" se a hora já passou e ainda não saiu). */
function faltam(iso: string, agora: number) {
  const s = (new Date(iso).getTime() - agora) / 1000;
  if (s <= 0) return "na fila para sair";
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (s < 3600) return rtf.format(Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

/** Mesma hora atual em todo o feed, atualizada a cada 30 s (contagem regressiva). */
function useAgora() {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 30_000); return () => clearInterval(i); }, []);
  return t;
}

const ORDEM: Record<string, number> = { PUBLICANDO: 0, AGENDADO: 1, FALHOU: 2, RASCUNHO: 3 };

/** Aba Planejados em formato de feed: cada publicação como um post do Instagram, com o status em destaque no topo. */
export function Planejados({ posts, perfil, podeEditar, onNova }: { posts: PostIG[]; perfil: PerfilPreview; podeEditar: boolean; onNova: () => void }) {
  const router = useRouter();
  const agora = useAgora();
  const [pend, start] = useTransition();
  const [apagar, setApagar] = useState<PostIG | null>(null);
  const [sumindo, setSumindo] = useState<string | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  const ativos = posts.filter((p) => p.status !== "PUBLICADO")
    .sort((a, b) => (ORDEM[a.status] ?? 9) - (ORDEM[b.status] ?? 9) || (a.agendado_para ?? a.updated_at).localeCompare(b.agendado_para ?? b.updated_at));
  const agendados = ativos.filter((p) => p.status === "AGENDADO" && p.agendado_para);
  const publicados = posts.filter((p) => p.status === "PUBLICADO");
  const proximo = agendados[0];

  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, id?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.err(r.error ?? "Erro"); return; }
    setApagar(null);
    // o cartão sai com animação antes de a lista recarregar
    const el = id ? feed.current?.querySelector<HTMLElement>(`[data-post="${id}"]`) : null;
    if (el && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSumindo(id!);
      await gsap.to(el, { opacity: 0, scale: 0.96, height: 0, marginBottom: -18, duration: 0.45, ease: "power2.in" });
    }
    toast.ok(ok);
    setSumindo(null);
    router.refresh();
  });

  if (!ativos.length && !publicados.length) return (
    <div className="cn-vazio panel"><CalendarClock size={28} aria-hidden style={{ color: "rgb(var(--c-brand))" }} /><h2>Nada planejado</h2>
      <p className="muted small">Crie uma publicação e agende: ela aparece aqui como no feed e na prévia da grade.</p>
      {podeEditar && <button className="btn btn-primary btn-sm" onClick={onNova}><Plus aria-hidden /> Nova publicação</button>}</div>
  );

  return (
    <div className="igp">
      <div className="igp-feed" ref={feed}>
        {!ativos.length && <div className="cn-vazio panel"><CalendarCheck2 size={26} aria-hidden /><h2>Tudo publicado</h2><p className="muted small">Nenhum rascunho ou agendamento pendente.</p></div>}
        {ativos.map((p) => <Cartao key={p.id} p={p} perfil={perfil} agora={agora} podeEditar={podeEditar} ocupado={pend || sumindo === p.id}
          onApagar={() => setApagar(p)} onCancelar={() => rodar(() => voltarParaRascunho(p.id), "Agendamento cancelado: voltou para rascunho")} />)}
      </div>

      <aside className="igp-lado">
        <div className="igp-resumo panel">
          <div className="igp-resumo-nums">
            <div><b>{agendados.length}</b><span>agendado{agendados.length === 1 ? "" : "s"}</span></div>
            <div><b>{ativos.filter((p) => p.status === "RASCUNHO").length}</b><span>rascunhos</span></div>
            {ativos.some((p) => p.status === "FALHOU") && <div data-erro><b>{ativos.filter((p) => p.status === "FALHOU").length}</b><span>com erro</span></div>}
          </div>
          {proximo?.agendado_para && (
            <Link href={`/instagram/publicar/${proximo.id}`} className="igp-proximo">
              <span>Próximo post</span>
              <b suppressHydrationWarning>{faltam(proximo.agendado_para, agora)}</b>
              <em suppressHydrationWarning>{dataLonga(proximo.agendado_para)}</em>
            </Link>
          )}
          {podeEditar && <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={onNova}><Plus aria-hidden /> Nova publicação</button>}
        </div>

        {agendados.length > 0 && (
          <div className="igp-agenda panel">
            <div className="igp-titulo"><CalendarClock size={14} aria-hidden /> Agenda</div>
            <ol>
              {agendados.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => feed.current?.querySelector(`[data-post="${p.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                    <span className="igp-agenda-dia" suppressHydrationWarning>{diaCurto(p.agendado_para!)}<b>{horaCurta(p.agendado_para!)}</b></span>
                    {p.capa ? <img src={arquivo(p.capa.id, p.capa.type === "VIDEO")} alt="" /> : <span className="igp-agenda-sem" />}
                    <span className="igp-agenda-txt">{TIPOS_POST[p.tipo].nome}<em>{p.legenda.trim().split("\n")[0] || "Sem legenda"}</em></span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {publicados.length > 0 && (
          <div className="igp-agenda panel">
            <div className="igp-titulo"><CalendarCheck2 size={14} aria-hidden /> Publicados pela plataforma</div>
            <ol>
              {publicados.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <a href={p.permalink ?? "#"} target="_blank" rel="noreferrer">
                    <span className="igp-agenda-dia" suppressHydrationWarning>{p.publicado_em ? diaCurto(p.publicado_em) : ""}<b>{p.publicado_em ? horaCurta(p.publicado_em) : ""}</b></span>
                    {p.capa ? <img src={arquivo(p.capa.id, p.capa.type === "VIDEO")} alt="" /> : <span className="igp-agenda-sem" />}
                    <span className="igp-agenda-txt">{TIPOS_POST[p.tipo].nome}<em>Ver no Instagram</em></span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </aside>

      <ConfirmarApagar p={apagar} ocupado={pend} perfil={perfil} onClose={() => setApagar(null)}
        onCancelarAgendamento={(p) => rodar(() => voltarParaRascunho(p.id), "Agendamento cancelado: ficou como rascunho")}
        onApagar={(p) => rodar(() => apagarPublicacao(p.id), "Publicação apagada", p.id)} />
    </div>
  );
}

function Cartao({ p, perfil, agora, podeEditar, ocupado, onApagar, onCancelar }: {
  p: PostIG; perfil: PerfilPreview; agora: number; podeEditar: boolean; ocupado: boolean; onApagar: () => void; onCancelar: () => void;
}) {
  const I = ICONE_TIPO[p.tipo];
  const vertical = p.tipo === "REELS" || p.tipo === "STORY";
  const editavel = podeEditar && p.status !== "PUBLICANDO";
  return (
    <article className="igp-card" data-status={p.status} data-post={p.id}>
      <div className="igp-faixa">
        {p.status === "AGENDADO" && p.agendado_para ? <>
          <CalendarClock size={16} aria-hidden />
          <span suppressHydrationWarning><b>Agendado</b> · {dataLonga(p.agendado_para)}</span>
          <em suppressHydrationWarning>{faltam(p.agendado_para, agora)}</em>
        </> : p.status === "PUBLICANDO" ? <>
          <Loader2 size={16} className="animate-spin" aria-hidden /><span><b>Publicando agora</b> no Instagram…</span>
        </> : p.status === "FALHOU" ? <>
          <AlertTriangle size={16} aria-hidden /><span><b>Não foi publicado</b>{p.erro ? ` · ${p.erro}` : ""}</span>
        </> : <>
          <FilePen size={16} aria-hidden /><span><b>Rascunho</b> · só sai quando você agendar ou publicar</span>
        </>}
      </div>

      <div className="ig-post-head">
        <Avatar p={perfil} size={32} anel />
        <b>{perfil.username}</b>
        <span className="igp-tipo"><I size={13} aria-hidden /> {TIPOS_POST[p.tipo].nome}</span>
      </div>

      <Link href={`/instagram/publicar/${p.id}`} className="igp-midia" data-vertical={vertical} aria-label="Abrir no editor">
        {p.capa ? (p.capa.type === "VIDEO" ? <img src={arquivo(p.capa.id, true)} alt="" /> : <img src={arquivo(p.capa.id)} alt="" />) : <div className="ig-sem-midia">Sem mídia ainda</div>}
        {p.midias.length > 1 && <span className="ig-contador">1/{p.midias.length}</span>}
        {p.capa?.type === "VIDEO" && <I className="ig-celula-tipo" size={20} />}
      </Link>

      {p.tipo !== "STORY" && <>
        <div className="ig-post-acoes" aria-hidden>
          <Heart size={22} /><MessageCircle size={22} /><Send size={22} />
          {p.midias.length > 1 && <span className="ig-pontos">{p.midias.map((_, k) => <i key={k} data-on={k === 0} />)}</span>}
          <Bookmark size={22} style={{ marginLeft: "auto" }} />
        </div>
        <div className="ig-post-txt">
          {p.legenda.trim() ? <Legenda usuario={perfil.username} texto={p.legenda} /> : <span className="subtle small">Sem legenda ainda</span>}
        </div>
      </>}

      <div className="igp-acoes">
        {editavel && <Link className="btn btn-secondary btn-sm" href={`/instagram/publicar/${p.id}`}><Pencil aria-hidden /> {p.status === "RASCUNHO" ? "Editar e agendar" : "Editar"}</Link>}
        {podeEditar && p.status === "AGENDADO" && <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={onCancelar}><Undo2 aria-hidden /> Cancelar agendamento</button>}
        {p.permalink && <a className="btn btn-ghost btn-sm" href={p.permalink} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Ver</a>}
        {editavel && <button className="btn btn-ghost btn-sm igp-apagar" disabled={ocupado} onClick={onApagar}><Trash2 aria-hidden /> Apagar</button>}
      </div>
    </article>
  );
}

/** Apagar com a consequência clara. Agendado: dá para só cancelar o agendamento e manter o rascunho. */
function ConfirmarApagar({ p, ocupado, perfil, onClose, onApagar, onCancelarAgendamento }: {
  p: PostIG | null; ocupado: boolean; perfil: PerfilPreview; onClose: () => void; onApagar: (p: PostIG) => void; onCancelarAgendamento: (p: PostIG) => void;
}) {
  const titulo = !p ? "" : p.status === "AGENDADO" ? "Apagar publicação agendada?" : p.status === "FALHOU" ? "Apagar publicação com erro?" : "Apagar rascunho?";
  return (
    <Dialog open={!!p} onClose={onClose} title={titulo}>
      {p && (
        <div className="igp-confirma">
          <div className="igp-confirma-item">
            {p.capa ? <img src={arquivo(p.capa.id, p.capa.type === "VIDEO")} alt="" /> : <span className="igp-agenda-sem" />}
            <div>
              <b>{TIPOS_POST[p.tipo].nome} de @{perfil.username}</b>
              <span>{p.status === "AGENDADO" && p.agendado_para ? `Sairia ${dataLonga(p.agendado_para)}` : p.legenda.trim().split("\n")[0]?.slice(0, 80) || "Sem legenda"}</span>
            </div>
          </div>
          <p className="muted small">
            {p.status === "AGENDADO"
              ? "Apagando, ela não vai mais ser publicada e some da plataforma. Se só quer mudar a data ou desistir por enquanto, cancele o agendamento: ela fica como rascunho."
              : "Ela some da plataforma e nada é publicado. As mídias continuam nos Criativos."}
          </p>
          <div className="igp-confirma-botoes">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Manter</button>
            {p.status === "AGENDADO" && <button className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => onCancelarAgendamento(p)}><Undo2 aria-hidden /> Só cancelar o agendamento</button>}
            <button className="btn btn-primary btn-sm igp-perigo" disabled={ocupado} onClick={() => onApagar(p)}>{ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} Apagar de vez</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
