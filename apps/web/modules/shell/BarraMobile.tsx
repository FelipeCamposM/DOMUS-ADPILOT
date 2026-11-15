"use client";

import { LayoutDashboard, Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mascote } from "../ai/Mascote";
import { WhatsappIcon } from "../connections/Logos";

/** Abre/fecha o Consultor (a bola do meio da barra); o Consultor escuta este evento. */
export const EVENTO_CONSULTOR = "consultor:alternar";

/**
 * Barra de ações rápidas do celular: Início, Mensagens, Consultor (bola em destaque no meio), Leads e Menu (abre o menu lateral).
 * Só aparece até 900px; no computador o menu lateral e a bolha do Consultor fazem esse papel.
 */
export function BarraMobile({ abrirMenu, menuAberto }: { abrirMenu: () => void; menuAberto: boolean }) {
  const path = usePathname();
  const item = (href: string, rotulo: string, icone: React.ReactNode, ativo: boolean) => (
    <Link href={href} className="bm-item" aria-current={ativo ? "page" : undefined}>{icone}<span>{rotulo}</span></Link>
  );
  return (
    <nav className="bm only-mobile" aria-label="Ações rápidas">
      {item("/", "Início", <LayoutDashboard aria-hidden />, path === "/")}
      {item("/crm", "Mensagens", <WhatsappIcon aria-hidden />, path === "/crm")}
      <button type="button" className="bm-bola" aria-label="Consultor de IA" onClick={() => window.dispatchEvent(new Event(EVENTO_CONSULTOR))}>
        <Mascote size={30} />
      </button>
      {item("/crm/leads", "Leads", <Sparkles aria-hidden />, path.startsWith("/crm/leads"))}
      <button type="button" className="bm-item" aria-expanded={menuAberto} onClick={abrirMenu}><Menu aria-hidden /><span>Menu</span></button>
    </nav>
  );
}
