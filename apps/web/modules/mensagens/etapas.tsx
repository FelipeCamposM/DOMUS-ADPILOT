"use client";

import { rgbCor, type EtapaCrm } from "@domus-ads/core/mensagens";
import { Check, ChevronDown, Loader2, Trophy, X } from "lucide-react";
import { createContext, useContext, useState, type CSSProperties } from "react";
import { Popover } from "../shell/Popover";

/** Colunas do funil (ads.crm_etapas) para as telas do CRM, sem passar de componente em componente. */
export const EtapasCtx = createContext<EtapaCrm[]>([]);
export const useEtapas = () => useContext(EtapasCtx);

/** `--e` da coluna para o CSS (rgb(var(--e) / 0.1)); sem coluna, a cor da marca. */
export const corEtapa = (e: EtapaCrm | undefined): CSSProperties => ({ "--e": e ? rgbCor(e.cor) : "var(--c-glow)" }) as CSSProperties;

/** Pílula com a cor da etapa que abre a lista de colunas. `nenhum` = rótulo da opção que tira do funil. */
export function EtapaSeletor({ etapas, valor, onChange, nenhum, pendente, align = "right" }: {
  etapas: EtapaCrm[]; valor: string | null; onChange: (chave: string | null) => void; nenhum: string; pendente?: boolean; align?: "left" | "right";
}) {
  const [aberto, setAberto] = useState(false);
  const atual = etapas.find((e) => e.chave === valor);
  const escolher = (k: string | null) => { setAberto(false); if (k !== valor) onChange(k); };
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" className="etapa-pilula" data-vazia={!atual} style={corEtapa(atual)} onClick={() => setAberto(!aberto)} aria-haspopup="menu" aria-expanded={aberto} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <i aria-hidden />}
        {atual?.nome ?? nenhum}
        <ChevronDown className="etapa-pilula-seta" aria-hidden />
      </button>
      <Popover open={aberto} onClose={() => setAberto(false)} align={align} width={230}>
        <div className="etapa-menu">
          {etapas.map((e) => (
            <button key={e.chave} type="button" role="menuitemradio" aria-checked={e.chave === valor} className="menu-item etapa-menu-item" style={corEtapa(e)} onClick={() => escolher(e.chave)}>
              <i aria-hidden /><span>{e.nome}</span>{e.tipo === "GANHO" && <Trophy className="etapa-menu-trofeu" aria-hidden />}
              {e.chave === valor && <Check className="etapa-menu-ok" aria-hidden />}
            </button>
          ))}
          <div className="etapa-menu-sep" />
          <button type="button" role="menuitemradio" aria-checked={!valor} className="menu-item etapa-menu-item" onClick={() => escolher(null)}>
            <X aria-hidden /><span>{nenhum}</span>{!valor && <Check className="etapa-menu-ok" aria-hidden />}
          </button>
        </div>
      </Popover>
    </span>
  );
}
