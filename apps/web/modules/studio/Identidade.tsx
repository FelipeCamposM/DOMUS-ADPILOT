"use client";

import { Building2, Globe } from "lucide-react";
import { Escolha } from "../motion/Escolha";

export type IdentidadeValor = "workspace" | "referencias";

/** O que falta para o botão de gerar liberar (em vez de só ficar cinza). */
export function faltando(f: { produto: string; objetivo: string; orientacao: string }): string | null {
  if (f.produto.trim().length < 2) return "Informe o produto";
  if (f.objetivo.trim().length < 2 && f.orientacao.trim().length < 2) return "Escreva o objetivo ou as orientações para a IA";
  return null;
}

/** Identidade da peça: a marca do workspace ou a de outra marca, tirada das referências (sites, Instagram, imagens). */
export function Identidade({ valor, onChange, marcaPreenchida, nomeWorkspace }: { valor: IdentidadeValor; onChange: (v: IdentidadeValor) => void; marcaPreenchida: boolean; nomeWorkspace: string }) {
  return (
    <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="panel-title">Identidade visual</div>
      <Escolha valor={valor} className="kpis" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {([
          ["workspace", "Do workspace", marcaPreenchida ? `Cores, logo e fontes de ${nomeWorkspace}` : "Ainda não configurada (Configurações → Marca)", Building2],
          ["referencias", "Das referências", "Outra marca: site, Instagram ou imagens", Globe],
        ] as const).map(([v, l, d, I]) => (
          <button key={v} data-opt={v} type="button" className="panel" aria-pressed={valor === v} onClick={() => onChange(v)}
            style={{ padding: "10px 12px", textAlign: "left", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
            <I size={18} aria-hidden />
            <span><b style={{ fontWeight: 600 }}>{l}</b><br /><span className="subtle" style={{ fontSize: 11 }}>{d}</span></span>
          </button>
        ))}
      </Escolha>
      <p className="subtle caption">
        {valor === "referencias" || !marcaPreenchida
          ? "Cole links de site ou de posts do Instagram (em Links ou nas orientações) e anexe imagens: o worker baixa as fotos e tira a paleta delas. Diga nas orientações o que usar, ex.: “use as fotos do site e as cores do Instagram”."
          : "Usa a marca do workspace. Links e imagens anexadas continuam valendo como referência."}
      </p>
    </div>
  );
}
