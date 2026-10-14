"use client";

import { Globe, Palette } from "lucide-react";
import Link from "next/link";
import type { MarcaResumo } from "@/lib/marcas";
import { Escolha } from "../motion/Escolha";

/** O que falta para o botão de gerar liberar (em vez de só ficar cinza). */
export function faltando(f: { produto: string; objetivo: string; orientacao: string }): string | null {
  if (f.produto.trim().length < 2) return "Informe o produto";
  if (f.objetivo.trim().length < 2 && f.orientacao.trim().length < 2) return "Escreva o objetivo ou as orientações para a IA";
  return null;
}

/** Brief + marca no formato das actions: marca escolhida = identidade "workspace" (salva); nenhuma = referências. */
export const comMarca = <T extends object>(f: T, marcaId: string | null) => ({ brief: { ...f, identidade: marcaId ? "workspace" : "referencias" }, marcaId });

/** Identidade da peça: uma das marcas salvas do workspace ou a tirada das referências (sites, Instagram, imagens). */
export function Identidade({ marcas, valor, onChange }: { marcas: MarcaResumo[]; valor: string | null; onChange: (marcaId: string | null) => void }) {
  const opcoes = [
    ...marcas.map((m) => ({ v: m.id, l: m.nome, d: `Cores, fontes${m.temLogo ? ", logo" : ""} e tom da marca`, cores: m.cores })),
    { v: "ref", l: "Das referências", d: "Outra marca: site, Instagram ou imagens", cores: [] as MarcaResumo["cores"] },
  ];
  return (
    <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="panel-title">Marca</div>
      <Escolha valor={valor ?? "ref"} className="kpis" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {opcoes.map((o) => (
          <button key={o.v} data-opt={o.v} type="button" className="panel" aria-pressed={(valor ?? "ref") === o.v} onClick={() => onChange(o.v === "ref" ? null : o.v)}
            style={{ padding: "10px 12px", textAlign: "left", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
            {o.v === "ref" ? <Globe size={18} aria-hidden /> : o.cores.length
              ? <span aria-hidden style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, width: 18, flex: "none" }}>{o.cores.slice(0, 4).map((c, i) => <i key={i} style={{ height: 8, borderRadius: 2, background: c.hex }} />)}</span>
              : <Palette size={18} aria-hidden />}
            <span><b style={{ fontWeight: 600 }}>{o.l}</b><br /><span className="subtle" style={{ fontSize: 11 }}>{o.d}</span></span>
          </button>
        ))}
      </Escolha>
      <p className="subtle caption">
        {valor
          ? "Usa a identidade desta marca. Links e imagens anexadas continuam valendo como referência."
          : "Cole links de site ou de posts do Instagram (em Links ou nas orientações) e anexe imagens: o worker baixa as fotos e tira a paleta delas. Diga nas orientações o que usar, ex.: “use as fotos do site e as cores do Instagram”."}
        {" "}<Link href="/marcas" style={{ textDecoration: "underline" }}>{marcas.length ? "Gerenciar marcas" : "Criar uma marca"}</Link>
      </p>
    </div>
  );
}
