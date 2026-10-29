"use client";

import { AlertTriangle, Bell, Bot, CheckCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ago } from "@/lib/format";
import { entrar } from "../motion/entrar";
import { marcarNotificacoesLidas } from "./actions";
import { Popover } from "./Popover";
import { toast } from "./toast";

export interface DadosNotificacoes {
  acoes: { id: string; summary: string; conversation_id: string | null; created_at: string }[];
  falhas: { id: string; type: string; error: string | null; finished_at: string }[];
  leads: { numero: string; nome: string; site: string | null; origem: string | null; lead_em: string }[];
  lidasEm: string | null;
}

type Item = { id: string; tipo: "lead" | "acao" | "falha"; href: string; titulo: string; sub: string; em: string };

/** Sininho: leads novos, aprovações da IA e falhas, com "não lida" desde a última vez que marcou tudo como lido. */
export function Notificacoes({ n, aberto, onToggle, onClose }: { n: DadosNotificacoes; aberto: boolean; onToggle: () => void; onClose: () => void }) {
  const router = useRouter();
  const [lidas, setLidas] = useState(n.lidasEm);
  const [pend, start] = useTransition();
  useEffect(() => setLidas(n.lidasEm), [n.lidasEm]);

  const itens: Item[] = [
    ...n.leads.map((l) => ({ id: `l${l.numero}${l.lead_em}`, tipo: "lead" as const, href: `/crm?c=${l.numero}`, titulo: `Novo lead: ${l.nome}`, sub: l.origem ?? (l.site ? `site ${l.site}` : "formulário"), em: l.lead_em })),
    ...n.acoes.map((a) => ({ id: `a${a.id}`, tipo: "acao" as const, href: a.conversation_id ? `/ai/${a.conversation_id}` : "/ai", titulo: `Aprovar: ${a.summary}`, sub: "IA aguardando você", em: a.created_at })),
    ...n.falhas.map((f) => ({ id: `f${f.id}`, tipo: "falha" as const, href: "/jobs", titulo: `Job ${f.type} falhou`, sub: f.error?.slice(0, 80) ?? "", em: f.finished_at })),
  ].sort((a, b) => b.em.localeCompare(a.em));
  const nova = (i: Item) => !lidas || i.em > lidas;
  const naoLidas = itens.filter(nova).length;

  // lead que chegou enquanto a tela está aberta (o layout atualiza a cada 30 s): aviso na hora + sino balança
  const ultimo = useRef(n.leads[0]?.lead_em ?? "");
  const sino = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const novos = n.leads.filter((l) => l.lead_em > ultimo.current);
    if (!novos.length) return;
    ultimo.current = novos[0]!.lead_em;
    toast.ok(novos.length === 1 ? `Novo lead: ${novos[0]!.nome}` : `${novos.length} leads novos`);
    sino.current?.animate([{ rotate: "0deg" }, { rotate: "18deg" }, { rotate: "-14deg" }, { rotate: "8deg" }, { rotate: "0deg" }], { duration: 700, easing: "ease-out" });
  }, [n.leads]);

  const lista = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (aberto ? entrar(lista.current?.children ?? [], { y: 8 }, { stagger: 0.03, duration: 0.4 }) : undefined), [aberto]);

  const marcar = () => {
    setLidas(new Date().toISOString());
    start(async () => {
      try { await marcarNotificacoesLidas(); router.refresh(); } catch (e) { toast.err((e as Error).message); }
    });
  };

  return (
    <div style={{ position: "relative" }}>
      <button ref={sino} className="chip notif-sino" onClick={onToggle} aria-label={`Notificações (${naoLidas} não lidas)`} aria-expanded={aberto}>
        <Bell aria-hidden />
        {naoLidas > 0 && <span className="notif-n">{naoLidas > 99 ? "99+" : naoLidas}</span>}
      </button>
      <Popover open={aberto} onClose={onClose} align="right" width={380}>
        <div className="notif">
          <header className="notif-topo">
            <b>Notificações</b>
            {naoLidas > 0 && <span className="notif-pilula">{naoLidas} nova{naoLidas > 1 ? "s" : ""}</span>}
            <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={marcar} disabled={pend || !naoLidas}><CheckCheck aria-hidden /> Marcar todas como lidas</button>
          </header>
          <div className="notif-lista" ref={lista}>
            {itens.map((i) => {
              const Ic = i.tipo === "lead" ? Sparkles : i.tipo === "acao" ? Bot : AlertTriangle;
              return (
                <Link key={i.id} href={i.href} className="notif-item" data-tipo={i.tipo} data-nova={nova(i)} onClick={onClose}>
                  <span className="notif-ic"><Ic aria-hidden /></span>
                  <span className="notif-txt"><b>{i.titulo}</b><small suppressHydrationWarning>{i.sub ? `${i.sub} · ` : ""}{ago(i.em)}</small></span>
                  {nova(i) && <i className="notif-ponto" aria-label="não lida" />}
                </Link>
              );
            })}
            {!itens.length && <div className="notif-vazio"><CheckCheck aria-hidden /> Tudo em dia.</div>}
          </div>
        </div>
      </Popover>
    </div>
  );
}
