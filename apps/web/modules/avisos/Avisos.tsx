"use client";

import { AlertCircle, Check, CheckCheck, Loader2, SendHorizontal, ThumbsDown, ThumbsUp, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { MAX_TEXTO_WA } from "@domus-ads/core/mensagens";
import { formatar } from "../mensagens/Mensagens";
import { toast } from "../shell/toast";
import { usePulso } from "../shell/usePulso";
import { responderAviso } from "./actions";

export interface MsgAviso { id: string; created_at: string; texto: string; status: string; erro: string | null; direcao: "IN" | "OUT"; tipo: string; midia: boolean; autor: string | null }
export interface Andamento { id: string; tema: string; formato: string; quando: string; etapa: string; pedido: string | null; atualizado: string; progresso: number | null; esperandoVoce: boolean }

const hora = (d: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const dataHora = (d: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const dia = (d: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(d));
const midia = (id: string) => `/api/mensagens/${id}/midia`;

/** Conversa com o robô dos avisos (a mesma do WhatsApp) + andamento dos posts que estão sendo refeitos ou esperando você. */
export function Avisos({ mensagens, posts, configurado, online }: { mensagens: MsgAviso[]; posts: Andamento[]; configurado: boolean; online: boolean }) {
  usePulso("avisos", 4000, true, posts.some((p) => !p.esperandoVoce));
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, start] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [mensagens.length]);

  const responder = (t: string) => start(async () => {
    const r = await responderAviso(t);
    if (!r.ok) { toast.err(r.error); return; }
    setTexto("");
    router.refresh();
  });
  const esperando = posts.some((p) => p.esperandoVoce);

  return (
    <div className="av">
      <section className="panel av-chat">
        <header className="panel-head"><div className="panel-title">Conversa</div>
          {!online && <span className="badge badge-warning"><WifiOff size={12} aria-hidden /> Worker offline: a resposta fica na fila</span>}
        </header>
        <div className="wa-corpo">
          {!configurado && <div className="wa-dia">Configure o número dos avisos em <Link href="/settings#whatsapp" style={{ textDecoration: "underline" }}>Configurações → WhatsApp</Link>.</div>}
          {configurado && !mensagens.length && <div className="wa-dia">Nenhum aviso ainda.</div>}
          {mensagens.map((m, i) => {
            // OUT = o robô mandou para você; IN = sua resposta (pelo celular ou por aqui)
            const robo = m.direcao === "OUT";
            return (
              <Fragment key={m.id}>
                {(i === 0 || dia(mensagens[i - 1]!.created_at) !== dia(m.created_at)) && <div className="wa-dia" suppressHydrationWarning>{dia(m.created_at)}</div>}
                <div className="wa-bolha" data-lado={robo ? "in" : "out"} data-erro={m.status === "FALHOU"}>
                  {m.midia && (m.tipo === "video"
                    ? <video src={midia(m.id)} controls playsInline preload="metadata" className="av-midia" />
                    : m.tipo === "imagem" ? <a href={midia(m.id)} target="_blank" rel="noopener noreferrer"><img src={midia(m.id)} alt={m.texto || "Arte enviada para aprovação"} loading="lazy" className="av-midia" /></a> : null)}
                  {m.texto && <p>{formatar(m.texto)}</p>}
                  {m.status === "FALHOU" && <p className="wa-motivo"><AlertCircle size={13} aria-hidden /> Não chegou no WhatsApp{m.erro ? `: ${m.erro}` : ""}</p>}
                  <span className="wa-meta" suppressHydrationWarning>
                    {!robo && <span>{m.autor === "pela plataforma" ? "por aqui" : "pelo celular"} ·</span>}
                    {hora(m.created_at)}
                    {!robo && (m.autor === "pela plataforma" ? <CheckCheck size={15} className="wa-ok" aria-hidden /> : <Check size={14} className="wa-ok" aria-hidden />)}
                  </span>
                </div>
              </Fragment>
            );
          })}
          <div ref={fim} />
        </div>
        <footer className="wa-compor">
          {esperando && (
            <div className="cluster" style={{ gap: 6 }}>
              <button className="btn btn-secondary btn-xs" disabled={enviando} onClick={() => responder("sim")}><ThumbsUp aria-hidden /> Sim, agendar</button>
              <button className="btn btn-secondary btn-xs" disabled={enviando} onClick={() => responder("não")}><ThumbsDown aria-hidden /> Não, quero mudar</button>
            </div>
          )}
          <div className="wa-compor-linha">
            <textarea rows={1} value={texto} maxLength={MAX_TEXTO_WA} disabled={!configurado} onChange={(e) => setTexto(e.target.value)}
              placeholder={esperando ? "Responda SIM ou diga o que mudar (ex.: use o balão de black friday dos materiais da SIAPLUS)" : "Responder"}
              aria-label="Resposta para o robô dos avisos"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && texto.trim()) { e.preventDefault(); responder(texto); } }} />
            <button className="btn btn-primary btn-sm" aria-label="Enviar resposta" disabled={enviando || !texto.trim()} onClick={() => responder(texto)}>
              {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <SendHorizontal aria-hidden />}
            </button>
          </div>
          <span className="subtle caption">Vale igual a responder no WhatsApp. O robô responde aqui e no celular.</span>
        </footer>
      </section>

      <aside className="panel av-lado">
        <header className="panel-head"><div className="panel-title">Andamento</div><Link href="/conteudos" className="btn btn-ghost btn-xs">Conteúdos</Link></header>
        {!posts.length && <div className="empty">Nenhum post sendo gerado ou esperando aprovação.</div>}
        <ul className="av-posts">
          {posts.map((p) => (
            <li key={p.id} data-voce={p.esperandoVoce}>
              <span className="av-topo"><span className="badge">{p.formato}</span><small className="subtle" suppressHydrationWarning>{dataHora(p.quando)}</small></span>
              <b>{p.tema}</b>
              <span className="av-etapa">{p.progresso !== null ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}{p.etapa}</span>
              {p.progresso !== null && <span className="av-barra" role="progressbar" aria-valuenow={p.progresso} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(4, p.progresso)}%` }} /></span>}
              {p.pedido && <details><summary className="subtle caption">Seus pedidos</summary><p className="caption" style={{ whiteSpace: "pre-line", margin: "4px 0 0" }}>{p.pedido}</p></details>}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
