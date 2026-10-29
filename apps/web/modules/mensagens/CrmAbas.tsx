"use client";

import { Globe, MessageCircle, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/crm", label: "Mensagens", icon: MessageCircle },
  { href: "/crm/leads", label: "Leads", icon: Sparkles },
  { href: "/crm/sites", label: "Sites", icon: Globe },
  { href: "/crm/config", label: "Configurações", icon: Settings2 },
] as const;

export function CrmAbas({ novos, naoLidas }: { novos: number; naoLidas: number }) {
  const path = usePathname();
  const conta: Record<string, number> = { "/crm": naoLidas, "/crm/leads": novos };
  return (
    <nav className="crm-topo" aria-label="CRM">
      <b className="crm-marca">CRM</b>
      <div className="crm-abas">
        {ABAS.map(({ href, label, icon: I }) => (
          <Link key={href} href={href} className="crm-aba" aria-current={path === href ? "page" : undefined}>
            <I size={15} aria-hidden /> {label}
            {conta[href] ? <span className="crm-aba-n">{conta[href]}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
