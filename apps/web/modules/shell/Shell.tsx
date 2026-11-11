"use client";

import { usePulso } from "./usePulso";
import { LogOut, Menu, MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ago } from "@/lib/format";
import { Consultor } from "../ai/Consultor";
import { Motion } from "../motion/Motion";
import { Notificacoes, type DadosNotificacoes } from "./Notificacoes";
import { Whatsapp, type EstadoWhatsapp } from "../settings/Whatsapp";
import { Dialog } from "./Dialog";
import { sair } from "./actions";
import { CommandPalette } from "./CommandPalette";
import { Popover } from "./Popover";
import { Sidebar } from "./Sidebar";
import { Confirmador } from "./confirmar";
import { Toaster, toast } from "./toast";
import { UsoIA } from "./UsoIA";
import type { UsoContaIA } from "@/lib/queries";
import type { IaPreferencias } from "@domus-ads/core";

export interface ShellProps {
  children: ReactNode;
  user: { email: string };
  workspaces: { id: string; name: string; role: string }[];
  workspaceId: string;
  campanhas: { id: string; name: string }[];
  notificacoes: DadosNotificacoes;
  worker: { online: boolean; lastSeen: string | null };
  whatsapp: { estado: EstadoWhatsapp | null; qr: string | null; erro: string | null };
  admin: boolean;
  contasIA: UsoContaIA[];
  iaPref: IaPreferencias;
}

export function Shell(p: ShellProps) {
  const router = useRouter();
  const [paleta, setPaleta] = useState(false);
  const [menu, setMenu] = useState<"bell" | "user" | "ia" | null>(null);
  const [mobile, setMobile] = useState(false);
  const [zap, setZap] = useState(false);
  const fechar = useCallback(() => setMenu(null), []);
  const fecharPaleta = useCallback(() => setPaleta(false), []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaleta((v) => !v); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // notificações e status do worker: confere a cada 30 s e só recarrega se mudou
  usePulso("shell", 30_000);

  return (
    <>
    <div className="shell">
      <Sidebar pendentes={p.notificacoes.acoes.length} open={mobile} />
      {mobile && <div className="overlay only-mobile" style={{ zIndex: 90 }} onClick={() => setMobile(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="chip only-mobile" onClick={() => setMobile((v) => !v)} aria-label="Abrir menu"><Menu aria-hidden /></button>

          <button className="chip chip-busca" onClick={() => setPaleta(true)} style={{ justifyContent: "flex-start" }}>
            <Search aria-hidden /> <span style={{ flex: 1, textAlign: "left" }}>Buscar…</span> <span className="kbd">Ctrl K</span>
          </button>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <UsoIA contas={p.contasIA} pref={p.iaPref} podeEditar={p.admin} aberto={menu === "ia"} onToggle={() => setMenu(menu === "ia" ? null : "ia")} onClose={fechar} />
            <Link href="/settings#worker" className="chip" suppressHydrationWarning title={p.worker.lastSeen ? `Último sinal ${ago(p.worker.lastSeen)}` : "O worker nunca se conectou"}>
              <span className={`dot ${p.worker.online ? "on" : "err"}`} aria-hidden />
              Worker {p.worker.online ? "online" : "offline"}
            </Link>
            {p.whatsapp.estado && (() => {
              const on = p.whatsapp.estado.state === "open";
              const conteudo = <><span className={`dot ${on ? "on" : "err"}`} aria-hidden /><MessageCircle aria-hidden /> {on ? "WhatsApp" : "WhatsApp desconectado"}</>;
              const titulo = on ? `WhatsApp conectado${p.whatsapp.estado.numero ? ` · ${p.whatsapp.estado.numero}` : ""}` : "Clique para conectar com QR code";
              return p.admin
                ? <button className="chip" data-alerta={!on} onClick={() => setZap(true)} title={titulo}>{conteudo}</button>
                : <Link href="/settings#whatsapp" className="chip" title={titulo}>{conteudo}</Link>;
            })()}

            <Notificacoes n={p.notificacoes} aberto={menu === "bell"} onToggle={() => setMenu(menu === "bell" ? null : "bell")} onClose={fechar} />

            <div style={{ position: "relative" }}>
              <button className="chip" onClick={() => setMenu(menu === "user" ? null : "user")} aria-label="Conta">
                <span style={{ width: 22, height: 22, borderRadius: 99, display: "grid", placeItems: "center", background: "rgb(var(--c-bg-elevated))", fontWeight: 700, fontSize: 11 }}>
                  {p.user.email[0]?.toUpperCase()}
                </span>
              </button>
              <Popover open={menu === "user"} onClose={fechar} align="right">
                <div style={{ padding: "8px 10px" }} className="subtle">{p.user.email}</div>
                <form action={sair}><button className="menu-item" type="submit"><LogOut aria-hidden /> Sair</button></form>
              </Popover>
            </div>
          </div>
        </header>
        <main className="content" id="conteudo">{p.children}</main>
      </div>
      {p.admin && p.whatsapp.estado && (
        <Dialog open={zap} onClose={() => setZap(false)} title="WhatsApp dos avisos">
          {zap && <Whatsapp estado={p.whatsapp.estado} qr={p.whatsapp.qr} erro={p.whatsapp.erro} avisos={null} podeAdmin workerOnline={p.worker.online} compacto autoConectar />}
        </Dialog>
      )}
      <CommandPalette open={paleta} onClose={fecharPaleta} campanhas={p.campanhas} />
      <Consultor key={p.workspaceId} podeEditar={["editor", "admin", "owner"].includes(p.workspaces.find((w) => w.id === p.workspaceId)?.role ?? "")} />
      <Motion />
    </div>
    {/* fora do .shell (fixed = contexto de empilhamento próprio): toasts ficam acima dos modais, que vão para o <body> */}
    <Toaster />
    <Confirmador />
    </>
  );
}
