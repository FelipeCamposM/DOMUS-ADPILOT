"use client";

import { BookOpenText, Check, Globe, Loader2, Pencil, Save, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { gerarConhecimento, salvarConhecimento } from "./actions";

export interface ConhecimentoTela { texto: string; em: string | null; fontes: string[]; job: { status: string; progress: number | null; error: string | null; log: string | null } | null }

const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** Markdown simples da base (títulos ##, listas e parágrafos) sem biblioteca. */
function Leitura({ texto }: { texto: string }) {
  return (
    <div className="kb-texto">
      {texto.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return null;
        if (/^#{1,4}\s/.test(t)) return <h4 key={i}>{t.replace(/^#+\s*/, "")}</h4>;
        if (/^fontes?:/i.test(t)) return <p key={i} className="kb-fonte">{t}</p>;
        if (/^[-*]\s/.test(t)) return <p key={i} className="kb-item">{t.replace(/^[-*]\s*/, "").replace(/\*\*/g, "")}</p>;
        return <p key={i}>{t.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}

/**
 * Base de conhecimento da marca: cola o site, a IA (no worker) vasculha as páginas e organiza os fatos.
 * Entra em roteiros, legendas, calendário e campanhas. Dá para revisar o texto à mão.
 */
export function BaseConhecimento({ marcaId, site, kb, podeEditar }: { marcaId: string; site: string; kb: ConhecimentoTela; podeEditar: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(site);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(kb.texto);
  const [pend, start] = useTransition();
  const gerando = kb.job?.status === "PENDING" || kb.job?.status === "RUNNING";

  useEffect(() => setTexto(kb.texto), [kb.texto]);
  // acompanha a geração ao vivo
  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => router.refresh(), 3500);
    return () => clearInterval(t);
  }, [gerando, router]);

  const gerar = () => start(async () => {
    const r = await gerarConhecimento(marcaId, url);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Vasculhando o site: leva de 1 a 3 minutos");
    router.refresh();
  });
  const salvar = () => start(async () => {
    const r = await salvarConhecimento(marcaId, texto);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Base salva");
    setEditando(false);
    router.refresh();
  });

  return (
    <section className="panel kb" data-enter>
      <div className="kb-cab">
        <span className="icon-tile kb-ic"><BookOpenText size={18} aria-hidden /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-title">Base de conhecimento</div>
          <span className="subtle caption">
            {kb.texto ? `${kb.em ? `Atualizada em ${quando(kb.em)}` : "Preenchida"}${kb.fontes.length ? ` · ${kb.fontes.length} páginas lidas` : ""} · usada nos roteiros, legendas, calendário e campanhas desta marca.`
              : "Cole o site da marca: a IA lê as páginas e organiza produtos, público, diferenciais, provas e o jeito de falar. Os textos ficam específicos em vez de genéricos."}
          </span>
        </div>
      </div>

      {podeEditar && (
        <div className="kb-gerar">
          <label className="kb-url">
            <Globe aria-hidden />
            <input type="url" inputMode="url" maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://site-da-marca.com.br" aria-label="Site para vasculhar" disabled={gerando} />
          </label>
          <button className="btn btn-primary btn-sm" onClick={gerar} disabled={pend || gerando || !/^https?:\/\/\S+\.\S+/.test(url.trim())}>
            {gerando || pend ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} {kb.texto ? "Atualizar pelo site" : "Gerar com IA"}
          </button>
        </div>
      )}

      {gerando && (
        <div className="kb-progresso" role="status">
          <span className="kb-barra"><span style={{ width: `${Math.max(6, kb.job?.progress ?? 6)}%` }} /></span>
          <span className="subtle caption">{kb.job?.status === "PENDING" ? "Na fila do worker…" : kb.job?.log ?? "Vasculhando o site…"}</span>
        </div>
      )}
      {kb.job?.status === "FAILED" && !gerando && <p className="kb-erro">Não deu certo: {kb.job.error ?? "erro desconhecido"}</p>}

      {(kb.texto || editando) && (
        <div className="kb-corpo">
          <div className="cluster" style={{ justifyContent: "space-between", gap: 8 }}>
            <b className="small">{editando ? "Editando a base" : "O que a IA sabe sobre a marca"}</b>
            {podeEditar && (editando
              ? <span className="cluster" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setTexto(kb.texto); setEditando(false); }}><X aria-hidden /> Cancelar</button>
                  <button className="btn btn-primary btn-xs" onClick={salvar} disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Salvar</button>
                </span>
              : <button className="btn btn-ghost btn-xs" onClick={() => setEditando(true)} disabled={gerando}><Pencil aria-hidden /> Revisar texto</button>)}
          </div>
          {editando
            ? <textarea className="input-sm mono kb-edit" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={30_000} aria-label="Texto da base de conhecimento" />
            : <Leitura texto={kb.texto} />}
          {!editando && kb.fontes.length > 0 && (
            <details className="kb-fontes">
              <summary><Check size={12} aria-hidden /> Páginas lidas ({kb.fontes.length})</summary>
              <ul>{kb.fontes.map((f) => <li key={f}><a href={f} target="_blank" rel="noreferrer">{f.replace(/^https?:\/\/(www\.)?/, "")}</a></li>)}</ul>
            </details>
          )}
        </div>
      )}
      {!kb.texto && !editando && podeEditar && !gerando && (
        <button className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => setEditando(true)}><Pencil aria-hidden /> Escrever à mão</button>
      )}
    </section>
  );
}
