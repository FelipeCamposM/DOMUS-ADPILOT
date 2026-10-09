"use client";

import { gsap } from "gsap";
import { Check, Copy, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { cancelarLoginIA, enviarCodigoIA, iniciarLoginIA } from "./ai-accounts";

type Provider = "claude" | "codex";
interface Estado { status: string; url: string | null; user_code: string | null; error: string | null; provider: Provider }
const FIM = ["DONE", "FAILED", "CANCELLED"];

export const ProviderLogo = ({ p, size = 40 }: { p: Provider; size?: number }) => (
  <span aria-hidden style={{
    width: size, height: size, borderRadius: size / 3.4, display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.42, flexShrink: 0,
    background: p === "claude" ? "rgb(217 119 87 / 0.16)" : "rgb(var(--c-text-primary) / 0.08)", color: p === "claude" ? "rgb(232 148 118)" : "rgb(var(--c-text-primary))",
    border: `1px solid ${p === "claude" ? "rgb(217 119 87 / 0.35)" : "rgb(var(--c-border-strong))"}`,
  }}>{p === "claude" ? "✳" : "◎"}</span>
);

/**
 * Login guiado de conta de IA, sem terminal. O worker (no PC) roda o login do CLI e publica o link/código;
 * esta tela acompanha por polling. `relogin` refaz o login de uma conta existente.
 */
export function ConnectAi({ open, onClose, relogin }: { open: boolean; onClose: () => void; relogin?: { id: string; name: string; provider: Provider } }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("claude");
  const [nome, setNome] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);
  const [st, setSt] = useState<Estado | null>(null);
  const [codigo, setCodigo] = useState("");
  const [pend, start] = useTransition();
  const okRef = useRef<SVGPathElement>(null);
  const p = relogin?.provider ?? provider;

  const reset = () => { setLoginId(null); setSt(null); setCodigo(""); };
  const fechar = () => {
    if (loginId && st && !FIM.includes(st.status)) void cancelarLoginIA(loginId);
    reset();
    onClose();
  };

  const iniciar = () => start(async () => {
    const r = await iniciarLoginIA(relogin ? { provider: relogin.provider, accountId: relogin.id } : { provider, name: nome || (provider === "claude" ? "Claude" : "Codex") });
    if (!r.ok) return toast.err(r.error);
    setLoginId(r.data);
    setSt({ status: "STARTING", url: null, user_code: null, error: null, provider: p });
  });

  // Acompanha o login enquanto não termina.
  useEffect(() => {
    if (!loginId || (st && FIM.includes(st.status))) return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await fetch(`/api/ai/logins/${loginId}`, { cache: "no-store" });
      if (!vivo || !r.ok) return;
      const s = (await r.json()) as Estado;
      setSt(s);
      if (s.status === "DONE") { toast.ok("Conta de IA conectada"); router.refresh(); }
    }, 1000);
    return () => { vivo = false; clearInterval(t); };
  }, [loginId, st?.status, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sucesso: o check se desenha.
  useEffect(() => {
    if (st?.status !== "DONE" || !okRef.current) return;
    const len = okRef.current.getTotalLength();
    gsap.fromTo(okRef.current, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.7, ease: "power3.out", delay: 0.15 });
    gsap.fromTo(okRef.current.parentElement, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.8)" });
  }, [st?.status]);

  const enviar = () => loginId && start(async () => {
    const r = await enviarCodigoIA(loginId, codigo);
    if (!r.ok) return toast.err(r.error);
    setSt((s) => s && { ...s, status: "CODE_SUBMITTED" });
  });

  const copiar = (t: string) => { void navigator.clipboard.writeText(t); toast.ok("Código copiado"); };

  return (
    <Dialog open={open} onClose={fechar} title={relogin ? `Refazer login · ${relogin.name}` : "Conectar conta de IA"}>
      {!st && (
        <>
          {!relogin && (
            <>
              <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {(["claude", "codex"] as const).map((x) => (
                  <button key={x} className="panel spotlight" onClick={() => setProvider(x)} aria-pressed={provider === x}
                    style={{ padding: 16, cursor: "pointer", textAlign: "left", display: "flex", gap: 12, alignItems: "center", borderColor: provider === x ? "rgb(var(--c-brand) / 0.6)" : undefined, boxShadow: provider === x ? "0 0 0 3px rgb(var(--c-brand) / 0.12)" : undefined }}>
                    <ProviderLogo p={x} />
                    <span><b style={{ fontWeight: 650 }}>{x === "claude" ? "Claude" : "Codex"}</b><br /><span className="subtle caption">{x === "claude" ? "Assinatura Claude (Pro/Max)" : "Assinatura ChatGPT"}</span></span>
                  </button>
                ))}
              </div>
              <div className="field">
                <label className="label" htmlFor="nome-ia">Nome da conta</label>
                <input id="nome-ia" className="input" placeholder={provider === "claude" ? "Ex.: Claude pessoal" : "Ex.: ChatGPT trabalho"} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
              </div>
            </>
          )}
          <p className="muted small">O login acontece no PC do worker, numa pasta só desta conta. Você só abre um link e confirma. Nenhuma senha passa pela plataforma.</p>
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={fechar}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={iniciar} disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : "Continuar"}</button>
          </div>
        </>
      )}

      {st?.status === "STARTING" && (
        <div className="empty" style={{ padding: 28 }}>
          <Loader2 className="animate-spin" size={26} aria-hidden style={{ color: "rgb(var(--c-brand))" }} />
          Preparando o login no PC do worker…
        </div>
      )}

      {st?.status === "AWAITING_USER" && st.url && (
        <div className="stack" style={{ gap: 16 }}>
          <Passo n={1} titulo={p === "claude" ? "Abra a página e entre com a sua conta Claude" : "Abra a página da OpenAI e entre com a sua conta ChatGPT"}>
            <a className="btn btn-secondary btn-sm" href={st.url} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start" }}>
              Abrir página de login <ExternalLink aria-hidden />
            </a>
          </Passo>
          {p === "claude" ? (
            <Passo n={2} titulo="Copie o código que aparecer no final e cole aqui">
              <div className="cluster" style={{ flexWrap: "nowrap" }}>
                <input className="input mono" autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value.trim())} placeholder="Cole o código" aria-label="Código de autorização" />
                <button className="btn btn-primary btn-sm" onClick={enviar} disabled={pend || codigo.length < 10}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : "Conectar"}</button>
              </div>
            </Passo>
          ) : (
            <Passo n={2} titulo="Digite este código na página (vale por 15 minutos)">
              <button className="mono" onClick={() => copiar(st.user_code!)} title="Copiar"
                style={{ alignSelf: "flex-start", fontSize: 28, fontWeight: 700, letterSpacing: "0.12em", padding: "10px 18px", borderRadius: 12, cursor: "pointer", border: "1px dashed rgb(var(--c-brand) / 0.6)", background: "rgb(var(--c-brand) / 0.06)", color: "rgb(var(--c-text-primary))", display: "inline-flex", gap: 12, alignItems: "center" }}>
                {st.user_code} <Copy size={16} aria-hidden />
              </button>
              <span className="subtle caption" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span className="spinner-dots"><i /><i /><i /></span>Esperando você confirmar na página…</span>
            </Passo>
          )}
        </div>
      )}

      {st?.status === "CODE_SUBMITTED" && (
        <div className="empty" style={{ padding: 28 }}><Loader2 className="animate-spin" size={26} aria-hidden style={{ color: "rgb(var(--c-brand))" }} />Validando o código…</div>
      )}

      {st?.status === "DONE" && (
        <div className="empty" style={{ padding: 28 }}>
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="30" style={{ fill: "rgb(var(--c-brand) / 0.12)", stroke: "rgb(var(--c-brand) / 0.55)" }} />
            <path ref={okRef} d="M20 33 l8 8 l16 -18" fill="none" style={{ stroke: "rgb(var(--c-lilac))" }} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <b style={{ fontWeight: 650, color: "rgb(var(--c-text-primary))" }}>Conta conectada</b>
          A IA já pode usar esta conta. Ela entra no rodízio automático.
          <button className="btn btn-primary btn-sm" onClick={fechar} style={{ marginTop: 8 }}><Check aria-hidden /> Pronto</button>
        </div>
      )}

      {(st?.status === "FAILED" || st?.status === "CANCELLED") && (
        <div className="stack">
          <p className="error-text" role="alert">{st.error ?? "Login cancelado."}</p>
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={fechar}>Fechar</button>
            <button className="btn btn-primary btn-sm" onClick={() => { reset(); }}><RotateCcw aria-hidden /> Tentar de novo</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <span style={{ width: 24, height: 24, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, background: "rgb(var(--c-brand))", color: "rgb(var(--c-brand-ink))" }}>{n}</span>
      <div className="stack" style={{ gap: 10, flex: 1, minWidth: 0 }}><b style={{ fontWeight: 600 }}>{titulo}</b>{children}</div>
    </div>
  );
}
