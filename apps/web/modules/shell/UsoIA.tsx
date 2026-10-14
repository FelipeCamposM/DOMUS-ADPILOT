"use client";

import { Gauge, Settings2 } from "lucide-react";
import Link from "next/link";
import { ago } from "@/lib/format";
import type { UsoContaIA } from "@/lib/queries";
import { Popover } from "./Popover";

const cls = (pct: number) => (pct >= 100 ? "err" : pct >= 80 ? "warn" : "");

function Janela({ rotulo, w }: { rotulo: string; w?: { pct: number; resets_at: string | null } }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "54px 1fr 92px", gap: 8, alignItems: "center" }}>
      <span className="subtle caption">{rotulo}</span>
      {w ? <div className={`bar ${cls(w.pct)}`}><i style={{ width: `${Math.min(100, w.pct)}%` }} /></div> : <span className="subtle caption">sem dado</span>}
      <span className="caption tabular" style={{ textAlign: "right" }} suppressHydrationWarning>
        {w ? <><b>{w.pct.toFixed(0)}%</b>{w.resets_at ? <span className="subtle"> · {ago(w.resets_at)}</span> : null}</> : ""}
      </span>
    </div>
  );
}

/** Botão no topo com o uso das contas de IA (janelas de 5 h e 7 dias, como no Claude/ChatGPT) e o gasto em 24 h. */
export function UsoIA({ contas, aberto, onToggle, onClose }: { contas: UsoContaIA[]; aberto: boolean; onToggle: () => void; onClose: () => void }) {
  const ativas = contas.filter((c) => c.status === "ACTIVE");
  const limitada = (c: UsoContaIA) => !!c.limited_until && new Date(c.limited_until) > new Date();
  const disponiveis = ativas.filter((c) => !limitada(c));
  // o número do botão: a conta disponível mais folgada na janela de 5 h (é a que a IA vai usar)
  const menor = disponiveis.map((c) => c.usage?.five_hour?.pct).filter((x): x is number => typeof x === "number").sort((a, b) => a - b)[0];
  const ponto = !ativas.length || !disponiveis.length ? "err" : menor != null && menor >= 80 ? "warn" : "on";

  return (
    <div style={{ position: "relative" }}>
      <button className="chip" onClick={onToggle} aria-haspopup="menu" aria-expanded={aberto} title="Uso das contas de IA">
        <Gauge aria-hidden />
        <span className={`dot ${ponto}`} aria-hidden />
        <span className="tabular">{!ativas.length ? "IA" : !disponiveis.length ? "IA no limite" : menor != null ? `IA ${menor.toFixed(0)}%` : "IA"}</span>
      </button>
      <Popover open={aberto} onClose={onClose} align="right" width={380}>
        <div className="nav-group" style={{ margin: "6px 10px" }}>Contas de IA</div>
        {!contas.length && <div className="empty" style={{ padding: 20 }}>Nenhuma conta conectada.</div>}
        {contas.map((c) => (
          <div key={c.id} className="menu-item" style={{ display: "block", cursor: "default", opacity: c.status === "ACTIVE" ? 1 : 0.55 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span className={`dot ${c.status !== "ACTIVE" ? "" : limitada(c) ? "err" : "on"}`} aria-hidden />
              <b style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</b>
              <span className="subtle caption">{c.provider === "claude" ? "Claude" : "ChatGPT"}{c.plan ? ` ${c.plan}` : ""}</span>
            </div>
            {c.email && <div className="subtle caption" style={{ marginTop: -4, marginBottom: 6 }}>{c.email}</div>}
            <div className="stack" style={{ gap: 5 }}>
              <Janela rotulo="5 horas" w={c.usage?.five_hour} />
              <Janela rotulo="Semana" w={c.usage?.seven_day} />
            </div>
            <div className="subtle caption" style={{ marginTop: 6 }} suppressHydrationWarning>
              {c.status !== "ACTIVE" ? "Desativada" : limitada(c) ? `No limite · volta ${ago(c.limited_until!)}` : "Disponível"}
              {" · "}24 h: {c.chamadas24h} chamada(s), {Number(c.tokens24h).toLocaleString("pt-BR")} tokens{c.custo24h ? ` ≈ US$ ${Number(c.custo24h).toFixed(2)}` : ""}
              {c.usage?.observed_at ? ` · medido ${ago(c.usage.observed_at)}` : ""}
            </div>
          </div>
        ))}
        <Link href="/settings#ia" className="menu-item" onClick={onClose} style={{ borderTop: "1px solid rgb(var(--c-border))" }}>
          <Settings2 aria-hidden /> Gerenciar contas de IA
        </Link>
      </Popover>
    </div>
  );
}
