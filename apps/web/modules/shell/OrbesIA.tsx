"use client";

import { useState, type CSSProperties } from "react";
import { ago } from "@/lib/format";
import type { UsoContaIA } from "@/lib/queries";
import { ClaudeLogo, OpenAILogo } from "../connections/Logos";
import { CountUp } from "../motion/CountUp";
import { Escolha } from "../motion/Escolha";

export const COR_IA = { claude: "#D97757", codex: "#10A37F" } as const;
export const limitadaIA = (c: UsoContaIA) => !!c.limited_until && new Date(c.limited_until) > new Date();

/** Por provedor, a conta que a IA usa agora: a fixada (se livre) ou a 1ª livre na ordem de prioridade (contas já vêm ordenadas). */
export function contasEmUso(contas: UsoContaIA[], fixada: string | null) {
  const ativas = contas.filter((c) => c.status === "ACTIVE");
  const livres = ativas.filter((c) => !limitadaIA(c)).sort((a, b) => Number(b.id === fixada) - Number(a.id === fixada));
  const emUso = (["claude", "codex"] as const).map((pv) => ({ pv, c: livres.find((c) => c.provider === pv) ?? null, tem: ativas.some((c) => c.provider === pv) })).filter((x) => x.tem);
  return { ativas, livres, emUso };
}

const NOME = { claude: "Claude", codex: "ChatGPT" } as const;

/** Uma orbe por provedor: o "líquido" sobe com o % usado da janela; a cor esquenta perto do limite. */
export function OrbesIA({ contas, fixada, compacto }: { contas: UsoContaIA[]; fixada: string | null; compacto?: boolean }) {
  const [janela, setJanela] = useState<"five_hour" | "seven_day">("five_hour");
  const { emUso } = contasEmUso(contas, fixada);
  if (!emUso.length) return null;
  return (
    <div className="orbes" data-compacto={compacto}>
      <Escolha valor={janela} variante="pilula" className="orbes-janela" raio={99}>
        <button type="button" className="chip" data-opt="five_hour" data-active={janela === "five_hour"} onClick={() => setJanela("five_hour")}>5 horas</button>
        <button type="button" className="chip" data-opt="seven_day" data-active={janela === "seven_day"} onClick={() => setJanela("seven_day")}>Semana</button>
      </Escolha>
      <div className="orbes-grade">
        {emUso.map(({ pv, c }) => {
          const w = c?.usage?.[janela];
          const pct = !c ? 100 : Math.min(100, Math.max(0, w?.pct ?? 0));
          const nivel = pct >= 100 ? "cheio" : pct >= 80 ? "alto" : "ok";
          return (
            <div key={pv} className="orbe-item" data-nivel={nivel}>
              <div className="orbe" style={{ "--cor": COR_IA[pv], "--nivel": `${pct}%` } as CSSProperties} aria-hidden>
                <i className="orbe-liquido" />
                <span className="orbe-logo">{pv === "codex" ? <OpenAILogo size={compacto ? 20 : 26} /> : <ClaudeLogo size={compacto ? 20 : 26} />}</span>
              </div>
              <div className="orbe-txt">
                <b className="orbe-pct tabular">{c ? (w ? <CountUp value={pct} kind="int" /> : "—") : "limite"}{c && w && <small>%</small>}</b>
                <span className="orbe-rot"><i style={{ background: COR_IA[pv] }} />{NOME[pv]}, janela de {janela === "five_hour" ? "5 horas" : "7 dias"}</span>
                <span className="orbe-renova" suppressHydrationWarning>
                  {!c ? "Todas as contas no limite" : w?.resets_at ? `Renova ${ago(w.resets_at)}` : w ? "" : "Sem leitura ainda"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
