"use client";

import { gsap } from "gsap";
import { ArrowUp, Check, Loader2, Square, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatAction, ChatMsg, ChatState } from "@/lib/ai";
import { toast } from "../shell/toast";
import { aprovarAcao, cancelarResposta, enviarMensagem, novaConversa, rejeitarAcao } from "./actions";

const SUGESTOES = [
  "Como estão as campanhas hoje?",
  "Quais campanhas estão desperdiçando dinheiro?",
  "Qual campanha tem o melhor CPA nos últimos 7 dias?",
  "Qual anúncio devo pausar?",
  "Aumente 20% o orçamento das campanhas com ROAS acima de 4.",
];
const PROVIDERS = [{ v: "auto", l: "Auto" }, { v: "claude", l: "Claude" }, { v: "codex", l: "Codex" }] as const;
const semBlocos = (s: string) => s.replace(/```domus-action[\s\S]*?(```|$)/g, "").trim();

export function Chat({ inicial, podeEditar, sugestao, provedores }: {
  inicial: ChatState | null; podeEditar: boolean; sugestao?: string; provedores: { claude: number; codex: number };
}) {
  const router = useRouter();
  const [st, setSt] = useState<ChatState | null>(inicial);
  const [txt, setTxt] = useState(sugestao ?? "");
  const [prov, setProv] = useState(inicial?.conversation.provider_pref ?? "auto");
  const [enviando, start] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const vistos = useRef(new Set<number>(inicial?.messages.map((m) => m.id) ?? []));
  const rodando = st?.conversation.status === "RUNNING" || st?.messages.some((m) => m.status === "STREAMING");

  useEffect(() => setSt(inicial), [inicial]);

  // Polling enquanto a IA responde; ao terminar, atualiza lista de conversas e notificações.
  useEffect(() => {
    if (!st || !rodando) return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await fetch(`/api/ai/conversations/${st.conversation.id}`, { cache: "no-store" });
      if (!r.ok || !vivo) return;
      const novo = (await r.json()) as ChatState;
      setSt(novo);
      if (novo.conversation.status !== "RUNNING" && !novo.messages.some((m) => m.status === "STREAMING")) router.refresh();
    }, 700);
    return () => { vivo = false; clearInterval(t); };
  }, [st?.conversation.id, rodando, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mensagens novas entram com GSAP; rolagem acompanha se o usuário está perto do fim.
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    const novos = Array.from(el.querySelectorAll<HTMLElement>("[data-msg]")).filter((n) => !vistos.current.has(Number(n.dataset.msg)));
    novos.forEach((n) => vistos.current.add(Number(n.dataset.msg)));
    if (novos.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(novos, { opacity: 0, y: 12, filter: "blur(4px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "expo.out", stagger: 0.05, clearProps: "filter,transform" });
    }
    const box = el.closest(".content");
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 240) fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [st]);

  const enviar = () => {
    const t = txt.trim();
    if (!t || enviando) return;
    start(async () => {
      if (!st) {
        const r = await novaConversa({ texto: t, provider: prov });
        if (!r.ok) return toast.err(r.error);
        setTxt("");
        router.push(`/ai/${r.data}`);
        return;
      }
      const otimista: ChatMsg = { id: -Date.now(), role: "user", content: t, status: "DONE", provider: null, meta: {}, created_at: new Date().toISOString() };
      setSt({ ...st, conversation: { ...st.conversation, status: "RUNNING" }, messages: [...st.messages, otimista] });
      setTxt("");
      const r = await enviarMensagem(st.conversation.id, { texto: t, provider: prov });
      if (!r.ok) { toast.err(r.error); setSt(st); setTxt(t); }
    });
  };

  const cancelar = () => st && start(async () => {
    const r = await cancelarResposta(st.conversation.id);
    if (!r.ok) toast.err(r.error);
    router.refresh();
  });

  const semConta = provedores.claude + provedores.codex === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", maxWidth: 880, margin: "0 auto", width: "100%", padding: "28px 24px 0" }}>
      {!st ? <Vazio onPick={setTxt} /> : (
        <div className="term" ref={lista} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 700, marginBottom: 12 }} data-enter>{st.conversation.title}</h1>
          {st.messages.map((m) => <Mensagem key={m.id} m={m} acoes={st.actions.filter((a) => a.message_id === m.id)} podeEditar={podeEditar} onDecidiu={() => router.refresh()} />)}
          {rodando && !st.messages.some((m) => m.status === "STREAMING") && (
            <div className="term-msg term-sys" style={{ gap: 10 }}><span className="spinner-dots"><i /><i /><i /></span> Na fila do worker…</div>
          )}
          <div ref={fim} style={{ height: 8 }} />
        </div>
      )}

      <div style={{ position: "sticky", bottom: 0, paddingBlock: "16px 20px", background: "linear-gradient(transparent, rgb(var(--c-bg-main)) 30%)" }}>
        {semConta && <p className="small" style={{ color: "rgb(var(--c-warning))", marginBottom: 8 }}>Nenhuma conta de IA conectada ainda. <Link href="/settings#ia" style={{ textDecoration: "underline" }}>Conectar ou importar em Configurações → Contas de IA</Link></p>}
        <div className="composer">
          <textarea
            value={txt} onChange={(e) => setTxt(e.target.value)} disabled={!podeEditar}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder={podeEditar ? "Pergunte sobre as campanhas…  (Enter envia · Shift+Enter quebra linha)" : "Seu papel é somente leitura"}
            rows={Math.min(8, Math.max(2, txt.split("\n").length))} aria-label="Mensagem para a IA"
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 8px 12px" }}>
            <div className="cluster" style={{ gap: 4 }} role="radiogroup" aria-label="Modelo">
              {PROVIDERS.map((p) => (
                <button key={p.v} role="radio" aria-checked={prov === p.v} className="chip" data-active={prov === p.v} onClick={() => setProv(p.v)} style={{ height: 26, fontSize: 11.5 }}
                  title={p.v === "auto" ? "Usa a próxima conta disponível (Claude ou Codex) e troca sozinho no limite" : `${p.v === "claude" ? provedores.claude : provedores.codex} conta(s) ativa(s)`}>
                  {p.l}
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            {rodando ? (
              <button className="btn btn-secondary btn-xs" onClick={cancelar} title="Parar a resposta"><Square aria-hidden /> Parar</button>
            ) : (
              <button className="btn btn-primary btn-xs" onClick={enviar} disabled={!txt.trim() || enviando || !podeEditar} aria-label="Enviar" style={{ width: 34, padding: 0 }}>
                {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowUp aria-hidden />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Mensagem({ m, acoes, podeEditar, onDecidiu, semMeta }: { m: ChatMsg; acoes: ChatAction[]; podeEditar: boolean; onDecidiu: () => void; semMeta?: boolean }) {
  if (m.role === "user") return <div className="term-msg" data-msg={m.id}><div className="term-user">{m.content}</div></div>;
  if (m.role === "system") return <div className="term-msg term-sys" data-msg={m.id}>{m.content}</div>;
  const meta = m.meta as { account?: string; model?: string; outputTokens?: number; costUsd?: number | null; durationMs?: number; error?: string; switches?: string[] };
  const corpo = semBlocos(m.content);
  return (
    <div className="term-msg" data-msg={m.id}>
      {meta.switches?.map((s, i) => <div key={i} className="term-sys" style={{ marginBottom: 8 }}>{s}. Continuando em outra conta…</div>)}
      <div className={`term-ai ${m.status === "ERROR" ? "err" : ""}`}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {corpo ? (
            <div className="md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{corpo}</ReactMarkdown>
              {m.status === "STREAMING" && <span className="caret" aria-hidden />}
            </div>
          ) : m.status === "STREAMING" ? (
            <span className="subtle" style={{ display: "inline-flex", gap: 10, alignItems: "center" }}><span className="spinner-dots"><i /><i /><i /></span>Lendo as métricas do workspace…</span>
          ) : null}
          {m.status === "ERROR" && <p className="error-text" style={{ marginTop: 6 }}>{meta.error ?? "Falha na resposta"}</p>}
          {acoes.length > 0 && <div className="stack" style={{ gap: 8, marginTop: 12 }}>{acoes.map((a) => <AcaoCard key={a.id} a={a} podeEditar={podeEditar} onDecidiu={onDecidiu} />)}</div>}
          {m.status === "DONE" && !semMeta && (
            <div className="subtle" style={{ fontSize: 11, marginTop: 8 }}>
              {[m.provider, meta.account, meta.model, meta.outputTokens != null && `${meta.outputTokens} tokens`, meta.durationMs != null && `${(meta.durationMs / 1000).toFixed(1)} s`, meta.costUsd != null && `US$ ${meta.costUsd.toFixed(4)}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_ACAO: Record<string, string> = { EXECUTED: "Aprovada e aplicada", REJECTED: "Cancelada", FAILED: "Falhou", EXECUTING: "Aplicando…" };

function AcaoCard({ a, podeEditar, onDecidiu }: { a: ChatAction; podeEditar: boolean; onDecidiu: () => void }) {
  const [pend, start] = useTransition();
  const [status, setStatus] = useState(a.status);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setStatus(a.status), [a.status]);
  const decidir = (aprovar: boolean) => start(async () => {
    const r = aprovar ? await aprovarAcao(a.id) : await rejeitarAcao(a.id);
    if (!r.ok) { toast.err(r.error); setStatus("FAILED"); }
    else {
      setStatus(aprovar ? "EXECUTED" : "REJECTED");
      toast.ok(aprovar ? "Mudança aplicada e registrada na auditoria" : "Proposta cancelada");
      if (aprovar) gsap.fromTo(ref.current, { boxShadow: "0 0 0 0 rgb(168 85 255 / 0.7)" }, { boxShadow: "0 0 0 18px rgb(168 85 255 / 0)", duration: 0.9, ease: "power2.out" });
    }
    onDecidiu();
  });
  return (
    <div ref={ref} className="action-card" data-status={status}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650 }}>{a.summary}</div>
          {a.reason && <div className="muted small" style={{ marginTop: 2 }}>{a.reason}</div>}
          {status === "FAILED" && a.error && <div className="error-text" style={{ marginTop: 4 }}>{a.error}</div>}
        </div>
        {status === "PENDING_APPROVAL" && podeEditar ? (
          <div className="cluster" style={{ gap: 6, flexWrap: "nowrap" }}>
            <button className="btn btn-ghost btn-xs" onClick={() => decidir(false)} disabled={pend}><X aria-hidden /> Cancelar</button>
            <button className="btn btn-primary btn-xs" onClick={() => decidir(true)} disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Aprovar</button>
          </div>
        ) : (
          <span className={`badge ${status === "EXECUTED" ? "badge-brand" : status === "FAILED" ? "badge-error" : status === "PENDING_APPROVAL" ? "badge-warning" : ""}`}>
            {STATUS_ACAO[status] ?? "Aguardando aprovação"}
          </span>
        )}
      </div>
    </div>
  );
}

/** Estado inicial: título com digitação animada percorrendo as perguntas de exemplo da spec. */
function Vazio({ onPick }: { onPick: (t: string) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) { if (el) el.textContent = SUGESTOES[0]!; return; }
    const tl = gsap.timeline({ repeat: -1 });
    for (const s of SUGESTOES) {
      const o = { n: 0 };
      tl.to(o, { n: s.length, duration: s.length * 0.035, ease: "none", onUpdate: () => { el.textContent = s.slice(0, Math.round(o.n)); } })
        .to({}, { duration: 1.6 })
        .to(o, { n: 0, duration: s.length * 0.012, ease: "none", onUpdate: () => { el.textContent = s.slice(0, Math.round(o.n)); } });
    }
    return () => { tl.kill(); };
  }, []);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22, paddingBlock: "8vh" }}>
      <div className="eyebrow" data-enter>AI Analyst</div>
      <h1 className="mono" style={{ fontSize: "clamp(1.3rem, 1rem + 1.4vw, 2rem)", fontWeight: 500, letterSpacing: "-0.02em", minHeight: "2.6em" }} data-enter>
        <span style={{ color: "rgb(var(--c-brand))" }}>❯ </span><span ref={ref} /><span className="caret" aria-hidden />
      </h1>
      <p className="muted" style={{ maxWidth: 560 }} data-enter>
        A IA lê as métricas do workspace a cada mensagem. Quando sugerir pausar, ativar ou mudar orçamento, a proposta aparece como um cartão e só é aplicada depois que você aprovar.
      </p>
      <div className="cluster" style={{ gap: 8 }} data-enter>
        {SUGESTOES.map((s) => <button key={s} className="chip" onClick={() => onPick(s)}>{s}</button>)}
      </div>
    </div>
  );
}
