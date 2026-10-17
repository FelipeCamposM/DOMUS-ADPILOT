"use client";

import { confirmar } from "../shell/confirmar";
import { ArrowLeft, ArrowUp, ArrowUpRight, History, Loader2, Megaphone, Plus, Square, Target, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ChatMsg, ChatState } from "@/lib/ai";
import { ago } from "@/lib/format";
import { toast } from "../shell/toast";
import { apagarConversa, cancelarResposta, enviarMensagem, novaConversa } from "./actions";
import { Mensagem } from "./Chat";
import { Mascote } from "./Mascote";

interface Item { id: string; title: string; status: string; updated_at: string }

type Modo = "consultor" | "marketing";
/** Cada modo é um consultor diferente (instruções e dados próprios no worker) com histórico separado. */
const MODOS: Record<Modo, { rotulo: string; titulo: string; sub: string; intro: string; placeholder: string; sugestoes: { t: string; d: string }[] }> = {
  consultor: {
    rotulo: "Tráfego", titulo: "Consultor de tráfego", sub: "Google Ads · Meta Ads · seus dados", placeholder: "Pergunte ao consultor…",
    intro: "Sou seu consultor de tráfego pago. Vejo a tela que você tem aberta e os dados do workspace: tiro dúvidas e, num rascunho de campanha, faço os ajustes que você pedir (você aprova antes).",
    sugestoes: [
      { t: "Com R$ 5 por dia, como monto minha campanha no Google?", d: "Plano realista para orçamento pequeno" },
      { t: "Como estão minhas campanhas esta semana?", d: "Leio os números do workspace" },
      { t: "Frase ou exata: qual correspondência usar?", d: "Conceitos de Google Ads" },
      { t: "Como medir as conversões do site no Google Ads?", d: "Tag, GA4 e gclid" },
    ],
  },
  marketing: {
    rotulo: "Marketing", titulo: "Consultor de marketing", sub: "Instagram · conteúdo · suas marcas", placeholder: "Peça um post, um carrossel, ideias…",
    intro: "Sou seu social media. Escrevo o post inteiro (arte, legenda e hashtags) com a identidade da sua marca. Você aprova com um clique e eu gero a arte e publico no Instagram sozinho.",
    sugestoes: [
      { t: "Cria um post para hoje e publica assim que ficar pronto", d: "Escolho o tema, escrevo e publico" },
      { t: "Faz um carrossel ensinando algo útil para o meu público", d: "4 a 8 slides com gancho e chamada" },
      { t: "Que datas comemorativas dessa semana combinam com a minha marca?", d: "Ideias para o calendário" },
      { t: "Me dá 5 ganchos fortes para Reels sobre o meu produto", d: "Primeiros 2 segundos que prendem" },
    ],
  },
};
const lerModo = (): Modo => { try { return localStorage.getItem("adpilot:modo") === "marketing" ? "marketing" : "consultor"; } catch { return "consultor"; } };
const lerSalvo = (m: Modo) => { try { return localStorage.getItem(`adpilot:${m}`); } catch { return null; } };
const salvarConv = (m: Modo, id: string | null) => { try { if (id) localStorage.setItem(`adpilot:${m}`, id); else localStorage.removeItem(`adpilot:${m}`); } catch { /* sem storage: só não lembra a conversa */ } };

/** Retrato da tela aberta: rota, título, texto visível e valores dos campos (o innerText não traz o que está digitado). */
function lerTela() {
  const main = document.getElementById("conteudo");
  if (!main) return undefined;
  const campos: string[] = [];
  main.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select").forEach((el) => {
    if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type) && !el.checked) return;
    const v = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.text ?? "" : el.value;
    if (!v.trim() || el.type === "password" || el.type === "hidden") return;
    const rotulo = el.labels?.[0]?.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || "campo";
    campos.push(`${rotulo}: ${v.slice(0, 2000)}`);
  });
  const texto = `${main.innerText.replace(/\n{3,}/g, "\n\n").trim()}${campos.length ? `\n\nCampos preenchidos na tela:\n${campos.join("\n")}` : ""}`;
  return { path: location.pathname + location.search, titulo: document.title, texto: texto.slice(0, 20_000) };
}

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

/** Consultor de tráfego pago: bolha flutuante no canto direito, com histórico próprio (conversas tipo "consultor"). */
export function Consultor({ podeEditar }: { podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("consultor");
  const M = MODOS[modo];
  const salvar = (id: string | null) => salvarConv(modo, id);
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
    if (!r.ok) { if (r.status === 404) setSt(null); return; }
    setSt((await r.json()) as ChatState);
  }, []);
  const carregarHistorico = useCallback(async () => {
    const r = await fetch(`/api/ai/conversations?tipo=${modo}`, { cache: "no-store" });
    if (r.ok) setItens((await r.json()) as Item[]);
  }, [modo]);

  // modo lembrado entre visitas (lido depois de montar: localStorage não existe no servidor)
  useEffect(() => setModo(lerModo()), []);
  const trocarModo = (m: Modo) => {
    if (m === modo || rodando) return;
    try { localStorage.setItem("adpilot:modo", m); } catch { /* só não lembra */ }
    setModo(m); setSt(null); setItens(null); setVista("conversa");
    const id = lerSalvo(m);
    if (id) void carregar(id);
  };

  // ao abrir: retoma a última conversa
  useEffect(() => {
    if (!aberto) return;
    const id = lerSalvo(modo);
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
        const r = await novaConversa({ texto: t, provider: "auto", tipo: modo, pagina: lerTela() });
        if (!r.ok) { setTxt(t); return toast.err(r.error); }
        salvar(r.data);
        await carregar(r.data);
        return;
      }
      const otimista: ChatMsg = { id: -Date.now(), role: "user", content: t, status: "DONE", provider: null, meta: {}, created_at: new Date().toISOString() };
      setSt({ ...st, conversation: { ...st.conversation, status: "RUNNING" }, messages: [...st.messages, otimista] });
      const r = await enviarMensagem(st.conversation.id, { texto: t, provider: st.conversation.provider_pref, pagina: lerTela() });
      if (!r.ok) { toast.err(r.error); setTxt(t); }
      await carregar(st.conversation.id);
    });
  };

  const nova = () => { salvar(null); setSt(null); setVista("conversa"); setTxt(""); setTimeout(() => campo.current?.focus(), 30); };
  const abrir = (id: string) => { salvar(id); setVista("conversa"); void carregar(id); };
  const verHistorico = () => { setVista("historico"); void carregarHistorico(); };
  const parar = () => st && start(async () => { const r = await cancelarResposta(st.conversation.id); if (!r.ok) toast.err(r.error); await carregar(st.conversation.id); });
  const apagar = async (c: Item) => {
    if (!(await confirmar(`Apagar a conversa “${c.title}”?`))) return;
    start(async () => {
      const r = await apagarConversa(c.id);
      if (!r.ok) return toast.err(r.error);
      if (st?.conversation.id === c.id) { salvar(null); setSt(null); }
      await carregarHistorico();
    });
  };

  const status = rodando ? (escrevendo ? "escrevendo…" : "pensando…") : M.sub;

  return (
    <>
      <button className="cx-fab" data-open={aberto} data-busy={!!rodando} onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        aria-label={aberto ? "Fechar consultor" : `Abrir ${M.titulo.toLowerCase()}`}>
        <span className="cx-fab-icon">{aberto ? <X size={22} aria-hidden /> : <Mascote size={30} />}</span>
        {!aberto && <span className="cx-fab-label">Consultor</span>}
      </button>

      {aberto && (
        <section className="cx-panel" role="dialog" aria-label={M.titulo}>
          <header className="cx-head">
            {vista === "historico" ? (
              <button className="cx-icon-btn" onClick={() => setVista("conversa")} aria-label="Voltar"><ArrowLeft size={17} aria-hidden /></button>
            ) : (
              <span className="cx-avatar" data-busy={!!rodando}><Mascote size={22} /></span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cx-title">{vista === "historico" ? `Histórico · ${M.rotulo}` : M.titulo}</div>
              <div className="cx-sub">
                {vista === "historico" ? `${itens?.length ?? "…"} conversa(s)` : <><span className="cx-live" data-busy={!!rodando} />{status}</>}
              </div>
            </div>
            {vista === "conversa" && <button className="cx-icon-btn" onClick={verHistorico} title="Histórico" aria-label="Histórico"><History size={17} aria-hidden /></button>}
            <button className="cx-icon-btn" onClick={nova} title="Nova conversa" aria-label="Nova conversa"><Plus size={18} aria-hidden /></button>
            <button className="cx-icon-btn" onClick={() => setAberto(false)} title="Fechar (Esc)" aria-label="Fechar"><X size={17} aria-hidden /></button>
          </header>
          <div className="cx-modos" role="tablist" aria-label="Modo do consultor" data-modo={modo}>
            <span className="cx-modos-pill" aria-hidden />
            {(["consultor", "marketing"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={modo === m} className="cx-modo" onClick={() => trocarModo(m)} disabled={!!rodando && modo !== m}
                title={rodando && modo !== m ? "Espere a resposta terminar" : undefined}>
                {m === "consultor" ? <Target size={14} aria-hidden /> : <Megaphone size={14} aria-hidden />} {MODOS[m].rotulo}
              </button>
            ))}
          </div>

          {vista === "historico" ? (
            <nav className="cx-body" aria-label="Conversas do consultor">
              {itens === null ? (
                <div className="stack" style={{ gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 54, borderRadius: 14 }} />)}</div>
              ) : itens.length === 0 ? (
                <div className="cx-empty-mini"><Mascote size={34} /><p>Nenhuma conversa ainda.</p><button className="cx-link" onClick={nova}>Começar uma</button></div>
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
                    <div className="cx-hello-mark"><Mascote size={40} /></div>
                    <h2>{saudacao()}! Em que posso ajudar?</h2>
                    <p>{M.intro}</p>
                    <div className="cx-sugs">
                      {M.sugestoes.map((s) => (
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
                    placeholder={podeEditar ? M.placeholder : "Seu papel é somente leitura"} aria-label="Pergunta para o consultor" />
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
