"use client";

import { ArrowUp, History, Loader2, MessageCircleQuestion, Plus, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ChatMsg, ChatState } from "@/lib/ai";
import { ago } from "@/lib/format";
import { toast } from "../shell/toast";
import { apagarConversa, cancelarResposta, enviarMensagem, novaConversa } from "./actions";
import { Mensagem } from "./Chat";

interface Item { id: string; title: string; status: string; updated_at: string }

const SUGESTOES = [
  "Com R$ 5 por dia, como monto minha campanha no Google?",
  "Como estão minhas campanhas esta semana?",
  "Qual a diferença entre correspondência de frase e exata?",
  "Meu CTR está baixo, o que eu faço?",
  "Como medir conversões do site no Google Ads?",
];
const CHAVE = "adpilot:consultor";
const lerSalvo = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };
const salvar = (id: string | null) => { try { if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE); } catch { /* sem storage: só não lembra a conversa */ } };

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
    setTimeout(() => campo.current?.focus(), 50);
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

  useEffect(() => { const el = lista.current; if (el) el.scrollTop = el.scrollHeight; }, [st?.messages.length, st?.messages.at(-1)?.content.length]);

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

  return (
    <>
      <button className="consultor-fab" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-label={aberto ? "Fechar consultor" : "Abrir consultor de tráfego"} title="Consultor de tráfego pago">
        {aberto ? <X aria-hidden /> : <MessageCircleQuestion aria-hidden />}
        {!aberto && rodando && <span className="dot on" aria-hidden style={{ position: "absolute", top: 6, right: 6 }} />}
      </button>

      {aberto && (
        <section className="consultor-painel panel" role="dialog" aria-label="Consultor de tráfego pago">
          <header className="panel-head" style={{ padding: "10px 12px" }}>
            <div style={{ minWidth: 0 }}>
              <div className="panel-title">Consultor de tráfego</div>
              <div className="subtle" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {vista === "historico" ? "Histórico de conversas" : st ? st.conversation.title : "Google Ads, Meta Ads e seus dados"}
              </div>
            </div>
            <div className="cluster" style={{ gap: 2, flexWrap: "nowrap" }}>
              <button className="btn btn-ghost btn-xs" onClick={vista === "historico" ? () => setVista("conversa") : verHistorico} aria-pressed={vista === "historico"} title="Histórico"><History aria-hidden /><span className="sr-only">Histórico</span></button>
              <button className="btn btn-ghost btn-xs" onClick={nova} title="Nova conversa"><Plus aria-hidden /><span className="sr-only">Nova conversa</span></button>
              <button className="btn btn-ghost btn-xs" onClick={() => setAberto(false)} title="Fechar (Esc)"><X aria-hidden /><span className="sr-only">Fechar</span></button>
            </div>
          </header>

          {vista === "historico" ? (
            <nav style={{ flex: 1, overflowY: "auto", padding: 8 }} aria-label="Conversas do consultor">
              {itens === null ? <p className="subtle small" style={{ padding: 12 }}>Carregando…</p>
                : itens.length === 0 ? <p className="subtle small" style={{ padding: 12 }}>Nenhuma conversa ainda.</p>
                : itens.map((c) => (
                  <div key={c.id} className="conv-item" data-active={c.id === st?.conversation.id}>
                    <button onClick={() => abrir(c.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {c.status === "RUNNING" && <span className="dot on" aria-label="Respondendo" />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 550 }}>{c.title}</span>
                      </div>
                      <div className="subtle" style={{ fontSize: 11 }} suppressHydrationWarning>{ago(c.updated_at)}</div>
                    </button>
                    {podeEditar && <button className="conv-del" onClick={() => apagar(c)} aria-label={`Apagar ${c.title}`}><Trash2 size={13} aria-hidden /></button>}
                  </div>
                ))}
            </nav>
          ) : (
            <>
              <div ref={lista} className="term" style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
                {!st ? (
                  <div className="stack" style={{ gap: 10, paddingBlock: 16 }}>
                    <p className="muted small">Pergunte qualquer coisa sobre tráfego pago. Eu também leio as campanhas, rascunhos e conexões deste workspace.</p>
                    <div className="cluster" style={{ gap: 6 }}>
                      {SUGESTOES.map((s) => <button key={s} className="chip" style={{ height: "auto", padding: "6px 10px", textAlign: "left", whiteSpace: "normal" }} onClick={() => podeEditar && enviar(s)} disabled={!podeEditar || pend}>{s}</button>)}
                    </div>
                  </div>
                ) : (
                  <>
                    {st.messages.map((m) => <Mensagem key={m.id} m={m} acoes={st.actions.filter((a) => a.message_id === m.id)} podeEditar={podeEditar} onDecidiu={() => void carregar(st.conversation.id)} />)}
                    {rodando && !st.messages.some((m) => m.status === "STREAMING") && (
                      <div className="term-msg term-sys" style={{ gap: 10 }}><span className="spinner-dots"><i /><i /><i /></span> Na fila do worker…</div>
                    )}
                  </>
                )}
              </div>
              <div style={{ padding: 10, borderTop: "1px solid rgb(var(--c-border))" }}>
                <div className="composer">
                  <textarea ref={campo} value={txt} onChange={(e) => setTxt(e.target.value)} disabled={!podeEditar} rows={2}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    placeholder={podeEditar ? "Sua dúvida…  (Enter envia)" : "Seu papel é somente leitura"} aria-label="Pergunta para o consultor"
                    style={{ minHeight: 44, fontFamily: "var(--font-sans)" }} />
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 8px 8px" }}>
                    {rodando ? (
                      <button className="btn btn-secondary btn-xs" onClick={parar}><Square aria-hidden /> Parar</button>
                    ) : (
                      <button className="btn btn-primary btn-xs" onClick={() => enviar()} disabled={!txt.trim() || pend || !podeEditar} aria-label="Enviar" style={{ width: 34, padding: 0 }}>
                        {pend ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowUp aria-hidden />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
