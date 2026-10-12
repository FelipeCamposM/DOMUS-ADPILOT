"use client";

import { ArrowLeft, ArrowUp, ArrowUpRight, History, Loader2, Plus, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ChatMsg, ChatState } from "@/lib/ai";
import { ago } from "@/lib/format";
import { toast } from "../shell/toast";
import { apagarConversa, cancelarResposta, enviarMensagem, novaConversa } from "./actions";
import { Mensagem } from "./Chat";
import { ClaudeIcon } from "./ClaudeIcon";

interface Item { id: string; title: string; status: string; updated_at: string }

const SUGESTOES = [
  { t: "Com R$ 5 por dia, como monto minha campanha no Google?", d: "Plano realista para orçamento pequeno" },
  { t: "Como estão minhas campanhas esta semana?", d: "Leio os números do workspace" },
  { t: "Frase ou exata: qual correspondência usar?", d: "Conceitos de Google Ads" },
  { t: "Como medir as conversões do site no Google Ads?", d: "Tag, GA4 e gclid" },
];
const CHAVE = "adpilot:consultor";
const lerSalvo = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };
const salvar = (id: string | null) => { try { if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE); } catch { /* sem storage: só não lembra a conversa */ } };

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

/** Consultor de tráfego pago: bolha flutuante no canto direito, com histórico próprio (conversas tipo "consultor"). */
export function Consultor({ podeEditar }: { podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [vista, setVista] = useState<"conversa" | "historico">("conversa");
  const [st, setSt] = useState<ChatState | null>(null);
  const [itens, setItens] = useState<Item[] | null>(null);
  const [txt, setTxt] = useState("");
  const [pend, start] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const rodando = st?.conversation.status === "RUNNING" || st?.messages.some((m) => m.status === "STREAMING");
  const escrevendo = st?.messages.some((m) => m.status === "STREAMING" && m.content);

  const carregar = useCallback(async (id: string) => {
    const r = await fetch(`/api/ai/conversations/${id}`, { cache: "no-store" });
    if (!r.ok) { if (r.status === 404) { salvar(null); setSt(null); } return; }
    setSt((await r.json()) as ChatState);
  }, []);
  const carregarHistorico = useCallback(async () => {
    const r = await fetch("/api/ai/conversations", { cache: "no-store" });
    if (r.ok) setItens((await r.json()) as Item[]);
  }, []);

  // ao abrir: retoma a última conversa
  useEffect(() => {
    if (!aberto) return;
    const id = lerSalvo();
    if (id && !st) void carregar(id);
    setTimeout(() => campo.current?.focus(), 80);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aberto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [aberto]);

  // polling enquanto a IA responde
  useEffect(() => {
    if (!st || !rodando) return;
    const t = setInterval(() => void carregar(st.conversation.id), 800);
    return () => clearInterval(t);
  }, [st?.conversation.id, rodando, carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const el = lista.current; if (el) el.scrollTop = el.scrollHeight; }, [st?.messages.length, st?.messages.at(-1)?.content.length, vista]);

  // textarea cresce com o texto
  useEffect(() => { const el = campo.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }, [txt]);

  const enviar = (texto = txt) => {
    const t = texto.trim();
    if (!t || pend || rodando) return;
    start(async () => {
      setTxt("");
      if (!st) {
        const r = await novaConversa({ texto: t, provider: "auto", tipo: "consultor" });
        if (!r.ok) { setTxt(t); return toast.err(r.error); }
        salvar(r.data);
        await carregar(r.data);
        return;
      }
      const otimista: ChatMsg = { id: -Date.now(), role: "user", content: t, status: "DONE", provider: null, meta: {}, created_at: new Date().toISOString() };
      setSt({ ...st, conversation: { ...st.conversation, status: "RUNNING" }, messages: [...st.messages, otimista] });
      const r = await enviarMensagem(st.conversation.id, { texto: t, provider: st.conversation.provider_pref });
      if (!r.ok) { toast.err(r.error); setTxt(t); }
      await carregar(st.conversation.id);
    });
  };

  const nova = () => { salvar(null); setSt(null); setVista("conversa"); setTxt(""); setTimeout(() => campo.current?.focus(), 30); };
  const abrir = (id: string) => { salvar(id); setVista("conversa"); void carregar(id); };
  const verHistorico = () => { setVista("historico"); void carregarHistorico(); };
  const parar = () => st && start(async () => { const r = await cancelarResposta(st.conversation.id); if (!r.ok) toast.err(r.error); await carregar(st.conversation.id); });
  const apagar = (c: Item) => {
    if (!confirm(`Apagar a conversa “${c.title}”?`)) return;
    start(async () => {
      const r = await apagarConversa(c.id);
      if (!r.ok) return toast.err(r.error);
      if (st?.conversation.id === c.id) { salvar(null); setSt(null); }
      await carregarHistorico();
    });
  };

  const status = rodando ? (escrevendo ? "escrevendo…" : "pensando…") : "Google Ads · Meta Ads · seus dados";

  return (
    <>
      <button className="cx-fab" data-open={aberto} data-busy={!!rodando} onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        aria-label={aberto ? "Fechar consultor" : "Abrir consultor de tráfego"}>
        <span className="cx-fab-icon">{aberto ? <X size={22} aria-hidden /> : <ClaudeIcon size={26} />}</span>
        {!aberto && <span className="cx-fab-label">Consultor</span>}
      </button>

      {aberto && (
        <section className="cx-panel" role="dialog" aria-label="Consultor de tráfego pago">
          <header className="cx-head">
            {vista === "historico" ? (
              <button className="cx-icon-btn" onClick={() => setVista("conversa")} aria-label="Voltar"><ArrowLeft size={17} aria-hidden /></button>
            ) : (
              <span className="cx-avatar" data-busy={!!rodando}><ClaudeIcon size={18} /></span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cx-title">{vista === "historico" ? "Histórico" : "Consultor de tráfego"}</div>
              <div className="cx-sub">
                {vista === "historico" ? `${itens?.length ?? "…"} conversa(s)` : <><span className="cx-live" data-busy={!!rodando} />{status}</>}
              </div>
            </div>
            {vista === "conversa" && <button className="cx-icon-btn" onClick={verHistorico} title="Histórico" aria-label="Histórico"><History size={17} aria-hidden /></button>}
            <button className="cx-icon-btn" onClick={nova} title="Nova conversa" aria-label="Nova conversa"><Plus size={18} aria-hidden /></button>
            <button className="cx-icon-btn" onClick={() => setAberto(false)} title="Fechar (Esc)" aria-label="Fechar"><X size={17} aria-hidden /></button>
          </header>

          {vista === "historico" ? (
            <nav className="cx-body" aria-label="Conversas do consultor">
              {itens === null ? (
                <div className="stack" style={{ gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 54, borderRadius: 14 }} />)}</div>
              ) : itens.length === 0 ? (
                <div className="cx-empty-mini"><ClaudeIcon size={28} /><p>Nenhuma conversa ainda.</p><button className="cx-link" onClick={nova}>Começar uma</button></div>
              ) : itens.map((c) => (
                <div key={c.id} className="cx-hist" data-active={c.id === st?.conversation.id}>
                  <button className="cx-hist-main" onClick={() => abrir(c.id)}>
                    <span className="cx-hist-title">{c.status === "RUNNING" && <span className="cx-live" data-busy />}{c.title}</span>
                    <span className="cx-hist-when" suppressHydrationWarning>{ago(c.updated_at)}</span>
                  </button>
                  {podeEditar && <button className="cx-hist-del" onClick={() => apagar(c)} aria-label={`Apagar ${c.title}`}><Trash2 size={14} aria-hidden /></button>}
                </div>
              ))}
            </nav>
          ) : (
            <>
              <div ref={lista} className="cx-body cx-chat">
                {!st ? (
                  <div className="cx-hello">
                    <div className="cx-hello-mark"><ClaudeIcon size={34} /></div>
                    <h2>{saudacao()}! Em que posso ajudar?</h2>
                    <p>Sou seu consultor de tráfego pago. Tiro dúvidas de Google Ads e Meta Ads e leio as campanhas, rascunhos e conexões deste workspace.</p>
                    <div className="cx-sugs">
                      {SUGESTOES.map((s) => (
                        <button key={s.t} className="cx-sug" onClick={() => enviar(s.t)} disabled={!podeEditar || pend}>
                          <span><b>{s.t}</b><small>{s.d}</small></span>
                          <ArrowUpRight size={15} aria-hidden />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {st.messages.map((m) => <Mensagem key={m.id} m={m} semMeta acoes={st.actions.filter((a) => a.message_id === m.id)} podeEditar={podeEditar} onDecidiu={() => void carregar(st.conversation.id)} />)}
                    {rodando && !st.messages.some((m) => m.status === "STREAMING") && (
                      <div className="term-msg"><div className="term-ai"><span className="cx-typing"><i /><i /><i /></span></div></div>
                    )}
                  </>
                )}
              </div>
              <footer className="cx-foot">
                <div className="cx-input">
                  <textarea ref={campo} value={txt} onChange={(e) => setTxt(e.target.value)} disabled={!podeEditar} rows={1}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    placeholder={podeEditar ? "Pergunte ao consultor…" : "Seu papel é somente leitura"} aria-label="Pergunta para o consultor" />
                  {rodando ? (
                    <button className="cx-send" data-stop onClick={parar} aria-label="Parar resposta" title="Parar"><Square size={13} aria-hidden fill="currentColor" /></button>
                  ) : (
                    <button className="cx-send" onClick={() => enviar()} disabled={!txt.trim() || pend || !podeEditar} aria-label="Enviar">
                      {pend ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ArrowUp size={17} aria-hidden />}
                    </button>
                  )}
                </div>
                <div className="cx-hint">Enter envia · Shift+Enter quebra linha · mudanças só com sua aprovação</div>
              </footer>
            </>
          )}
        </section>
      )}
    </>
  );
}
