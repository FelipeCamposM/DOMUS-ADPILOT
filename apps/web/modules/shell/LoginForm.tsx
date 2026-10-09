"use client";

import { gsap } from "gsap";
import { ArrowRight, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { entrar, primeiroAcesso } from "@/app/login/actions";
import { DotField } from "../motion/DotField";

export function LoginForm({ aviso, primeiroAcesso: primeiro }: { aviso: string | null; primeiroAcesso: boolean }) {
  const [erro, acao, enviando] = useActionState(primeiro ? primeiroAcesso : entrar, null);
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Entrada: marca gira e pousa, título sobe letra a letra, campos em cascata.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .from(".login-mark", { scale: 0, rotate: -120, duration: 1.1, ease: "back.out(1.8)" })
        .from(".login-title .ch", { yPercent: 110, opacity: 0, duration: 0.9, stagger: 0.025 }, "-=0.75")
        .from("[data-step]", { y: 18, opacity: 0, filter: "blur(6px)", duration: 0.8, stagger: 0.07, clearProps: "filter" }, "-=0.6");
    }, ref);
    return () => ctx.revert();
  }, []);

  // Erro: o cartão balança de leve.
  useEffect(() => {
    if (erro && cardRef.current) gsap.fromTo(cardRef.current, { x: -8 }, { x: 0, duration: 0.6, ease: "elastic.out(1.2, 0.3)" });
  }, [erro]);

  const titulo = primeiro ? "Vamos decolar." : "Seu tráfego, no piloto.";
  return (
    <div className="auth" ref={ref}>
      <DotField />
      <div className="glow" style={{ width: 520, height: 520, left: "50%", top: "50%", transform: "translate(-50%,-50%)", opacity: 0.45 }} />
      <div className="auth-card">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, marginBottom: 28, textAlign: "center" }}>
          <img src="/domus-logo.png" alt="DOMUS" className="brand-logo login-mark" width={64} height={64} style={{ width: 64, height: 64 }} />
          <h1 className="login-title" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.035em", overflow: "hidden" }} aria-label={titulo}>
            {titulo.split("").map((c, i) => <span key={i} className="ch" aria-hidden style={{ display: "inline-block", whiteSpace: "pre" }}>{c}</span>)}
          </h1>
          <p className="muted" data-step>{primeiro ? "Primeiro acesso: crie a conta de administrador (e-mail de ADMIN_EMAILS). Os workspaces SIAPLUS e DOMUS são criados juntos." : "Meta Ads, Google Ads e IA num só painel."}</p>
        </div>
        <div ref={cardRef} className="card card-glass" data-step style={{ padding: 28 }}>
          <form action={acao} className="stack" style={{ gap: 16 }}>
            {aviso && <p className="error-text" role="alert">{aviso}</p>}
            <div className="field" data-step>
              <label className="label" htmlFor="email">E-mail</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            <div className="field" data-step>
              <label className="label" htmlFor="password">Senha</label>
              <input className="input" id="password" name="password" type="password" autoComplete={primeiro ? "new-password" : "current-password"} minLength={primeiro ? 8 : undefined} required />
            </div>
            {erro && <p className="error-text" role="alert">{erro}</p>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={enviando} data-step style={{ width: "100%" }}>
              {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <>{primeiro ? "Criar acesso" : "Entrar"} <ArrowRight className="seta" aria-hidden /></>}
            </button>
          </form>
        </div>
        <p className="subtle caption" style={{ textAlign: "center", marginTop: 18 }} data-step>{primeiro ? "Se o e-mail já tem conta no Supabase, use a senha dessa conta." : "Acesso por convite. Fale com o administrador do workspace."}</p>
      </div>
    </div>
  );
}
