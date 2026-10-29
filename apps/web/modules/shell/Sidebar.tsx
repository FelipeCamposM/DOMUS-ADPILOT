"use client";

import { gsap } from "gsap";
import { Activity, Bot, Boxes, Cable, CalendarDays, Clapperboard, FolderOpen, Globe, Images, LayoutDashboard, Megaphone, MessageCircle, Palette, ScrollText, Settings, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import { InstagramIcon } from "../connections/Logos";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

export const NAV = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard, group: "Tráfego" },
  { href: "/campaigns", label: "Campanhas", icon: Megaphone, group: "Tráfego" },
  { href: "/marcas", label: "Marcas", icon: Palette, group: "Criação" },
  { href: "/studio", label: "Studio", icon: Clapperboard, group: "Criação" },
  { href: "/creatives", label: "Criativos", icon: Images, group: "Criação" },
  { href: "/arquivos", label: "Arquivos", icon: FolderOpen, group: "Criação" },
  { href: "/instagram", label: "Instagram", icon: InstagramIcon, group: "Criação" },
  { href: "/conteudos", label: "Conteúdos", icon: CalendarDays, group: "Criação" },
  { href: "/crm", label: "Mensagens", icon: MessageCircle, group: "CRM" },
  { href: "/crm/leads", label: "Leads", icon: Sparkles, group: "CRM" },
  { href: "/crm/sites", label: "Sites", icon: Globe, group: "CRM" },
  { href: "/crm/config", label: "Configurações", icon: Settings2, group: "CRM" },
  { href: "/ai", label: "IA", icon: Bot, group: "Inteligência" },
  { href: "/sistemas", label: "Sistemas", icon: Boxes, group: "Inteligência" },
  { href: "/jobs", label: "Jobs", icon: Activity, group: "Operação" },
  { href: "/connections", label: "Conexões", icon: Cable, group: "Operação" },
  { href: "/audit", label: "Auditoria", icon: ScrollText, group: "Operação" },
  { href: "/settings", label: "Configurações", icon: Settings, group: "Operação" },
] as const;

// "/" e "/crm" (Mensagens) têm itens filhos no menu: só ativam na própria página
const ativo = (path: string, href: string) => (href === "/" || href === "/crm" ? path === href : path.startsWith(href));

/** Sidebar com indicador que desliza (GSAP) até o item ativo, com leve "squash" no meio do caminho. */
export function Sidebar({ pendentes, open }: { pendentes: number; open: boolean }) {
  const path = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  const primeira = useRef(true);

  useLayoutEffect(() => {
    const alvo = navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    const ind = indRef.current;
    if (!ind) return;
    if (!alvo) { gsap.to(ind, { opacity: 0, duration: 0.2 }); return; }
    const y = alvo.offsetTop;
    if (primeira.current || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(ind, { y, opacity: 1 });
      primeira.current = false;
      return;
    }
    gsap.timeline()
      .to(ind, { y, opacity: 1, duration: 0.55, ease: "expo.out" }, 0)
      .fromTo(ind, { scaleY: 1 }, { scaleY: 0.82, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1 }, 0);
  }, [path]);

  let grupo = "";
  return (
    <aside className="sidebar" data-open={open}>
      <Link href="/" className="brand">
        <img src="/domus-logo.png" alt="" className="brand-logo" width={30} height={30} />
        <span>DOMUS<small>AdPilot</small></span>
      </Link>
      <nav className="nav" ref={navRef} aria-label="Navegação principal">
        <div className="nav-indicator" ref={indRef} style={{ opacity: 0 }} aria-hidden />
        {NAV.map((item) => {
          const cabecalho = item.group !== grupo ? (grupo = item.group) : null;
          const Icon = item.icon;
          return (
            <div key={item.href} style={{ display: "contents" }}>
              {cabecalho && <div className="nav-group">{cabecalho}</div>}
              <Link href={item.href} aria-current={ativo(path, item.href) ? "page" : undefined}>
                <Icon aria-hidden />
                {item.label}
                {item.href === "/ai" && pendentes > 0 && <span className="count" title="Ações aguardando aprovação">{pendentes}</span>}
              </Link>
            </div>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto", padding: "12px", fontSize: 11, color: "rgb(var(--c-text-tertiary))" }}>
        Pressione <span className="kbd">Ctrl</span> <span className="kbd">K</span> para buscar
      </div>
    </aside>
  );
}
