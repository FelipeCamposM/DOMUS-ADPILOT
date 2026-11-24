"use client";

import { BellOff, BellRing, Loader2, Share } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { inscreverPush, removerPush, salvarPushDesligados } from "./actions";

const TIPOS = [
  ["lead", "Leads novos", "Formulário dos sites e WhatsApp"],
  ["acao", "Aprovações da IA", "Quando a IA espera seu “ok” para agir"],
  ["falha", "Falhas", "Job que deu erro (sincronização, publicação, vídeo)"],
  ["email", "Gmail desconectado", "Conta de e-mail que precisa reconectar"],
] as const;

type Estado = "carregando" | "sem-suporte" | "instalar" | "bloqueado" | "desligado" | "ligado";

// chave VAPID vem em base64url; o navegador quer os bytes
const bytes = (b64: string) => Uint8Array.from(atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Notificações do PWA: liga/desliga neste aparelho e escolhe quais avisos chegam (vale para todos os aparelhos). */
export function Push({ chave, desligados: inicial, aparelhos }: { chave: string | null; desligados: string[]; aparelhos: number }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [desligados, setDesligados] = useState(inicial);
  const [pend, start] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // iPhone só tem push com o app instalado na Tela de Início
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches;
      return setEstado(ios ? "instalar" : "sem-suporte");
    }
    if (Notification.permission === "denied") return setEstado("bloqueado");
    navigator.serviceWorker.register("/sw.js")
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setEstado(s ? "ligado" : "desligado"), () => setEstado("sem-suporte"));
  }, []);

  const ativar = () => start(async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave!) });
      const j = sub.toJSON();
      const r = await inscreverPush({ endpoint: j.endpoint, keys: j.keys, aparelho: navigator.userAgent.slice(0, 120) });
      if (!r.ok) { await sub.unsubscribe(); return toast.err(r.error); }
      setEstado("ligado");
      toast.ok("Ativado. Em alguns segundos chega uma notificação de teste.");
      router.refresh();
    } catch {
      setEstado(Notification.permission === "denied" ? "bloqueado" : "desligado");
      toast.err("O aparelho não deixou ativar as notificações");
    }
  });

  const desativar = () => start(async () => {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await removerPush(sub.endpoint); await sub.unsubscribe(); }
    setEstado("desligado");
    toast.ok("Notificações desligadas neste aparelho");
    router.refresh();
  });

  const alternar = (t: string) => {
    const novo = desligados.includes(t) ? desligados.filter((x) => x !== t) : [...desligados, t];
    setDesligados(novo);
    start(async () => { const r = await salvarPushDesligados(novo); if (!r.ok) { setDesligados(desligados); toast.err(r.error); } });
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <span className="small">
          {estado === "carregando" && "Verificando este aparelho…"}
          {estado === "ligado" && <><BellRing size={14} aria-hidden /> <b>Ativadas neste aparelho</b></>}
          {estado === "desligado" && "Desligadas neste aparelho."}
          {estado === "bloqueado" && <><BellOff size={14} aria-hidden /> Bloqueadas pelo navegador. Libere em Ajustes → Notificações → AdPilot (ou no cadeado do navegador).</>}
          {estado === "sem-suporte" && "Este navegador não recebe notificações."}
          {estado === "instalar" && <>No iPhone: toque em <Share size={14} aria-label="Compartilhar" /> → <b>Adicionar à Tela de Início</b>, abra o AdPilot pelo ícone e ative aqui.</>}
          {aparelhos > 0 && <span className="subtle"> · {aparelhos} aparelho{aparelhos > 1 ? "s" : ""} recebendo</span>}
        </span>
        {estado === "desligado" && <button className="btn btn-primary btn-xs" onClick={ativar} disabled={pend || !chave}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <BellRing aria-hidden />} Ativar neste aparelho</button>}
        {estado === "ligado" && <button className="btn btn-secondary btn-xs" onClick={desativar} disabled={pend}><BellOff aria-hidden /> Desligar neste aparelho</button>}
      </div>
      {!chave && <p className="error-text small">Falta a variável VAPID_PUBLIC_KEY no servidor.</p>}
      <div className="stack" style={{ gap: 8 }}>
        {TIPOS.map(([t, nome, desc]) => (
          <button key={t} type="button" role="switch" aria-checked={!desligados.includes(t)} className="chave" onClick={() => alternar(t)}>
            <span className="chave-trilho"><span className="chave-bola" /></span> {nome} <span className="subtle caption">· {desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
