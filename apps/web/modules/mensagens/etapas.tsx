"use client";

import { rgbCor, type EtapaCrm } from "@domus-ads/core/mensagens";
import { createContext, useContext, type CSSProperties } from "react";

/** Colunas do funil (ads.crm_etapas) para as telas do CRM, sem passar de componente em componente. */
export const EtapasCtx = createContext<EtapaCrm[]>([]);
export const useEtapas = () => useContext(EtapasCtx);

/** `--e` da coluna para o CSS (rgb(var(--e) / 0.1)); sem coluna, a cor da marca. */
export const corEtapa = (e: EtapaCrm | undefined): CSSProperties => ({ "--e": e ? rgbCor(e.cor) : "var(--c-glow)" }) as CSSProperties;
