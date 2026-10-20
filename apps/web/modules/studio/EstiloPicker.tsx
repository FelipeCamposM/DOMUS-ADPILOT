"use client";

import { Sparkles, X } from "lucide-react";
import { Escolha } from "../motion/Escolha";

export type Estilo = "hud" | "clay" | "editorial" | "livre";
const ESTILOS: { v: Estilo; nome: string; desc: string }[] = [
  { v: "hud", nome: "Tech HUD", desc: "Escuro, neon, vidro" },
  { v: "clay", nome: "Claymorphism 3D", desc: "Massinha, pastel, quique" },
  { v: "editorial", nome: "Editorial", desc: "Revista, serifada, elegante" },
  { v: "livre", nome: "Livre (IA)", desc: "A IA cria do zero" },
];

export interface EstiloSalvo { id: string; nome: string; descricao: string; capaId: string | null }

/**
 * Cartões de estilo com uma miniatura desenhada em CSS de cada um (dá para "ver" o estilo antes de gerar). Estilos
 * salvos (vídeos do modo Livre que o cliente aprovou) aparecem depois, com a capa do vídeo de origem.
 */
export function EstiloPicker({ valor, onChange, semLivre = false, salvos = [], salvo = null, onSalvo, onApagar }: {
  valor: Estilo; onChange: (v: Estilo) => void; semLivre?: boolean;
  salvos?: EstiloSalvo[]; salvo?: string | null; onSalvo?: (id: string | null) => void; onApagar?: (id: string) => void;
}) {
  const atual = salvo ? `s:${salvo}` : valor;
  const escolherSalvo = (id: string) => { onChange("livre"); onSalvo?.(id); };
  return (
    <Escolha valor={atual} className="kpis" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
      {ESTILOS.filter((e) => !semLivre || e.v !== "livre").map((e) => (
        <button key={e.v} data-opt={e.v} type="button" className="panel" aria-pressed={atual === e.v} onClick={() => { onSalvo?.(null); onChange(e.v); }}
          style={{ padding: 8, display: "flex", gap: 10, alignItems: "center", textAlign: "left", cursor: "pointer" }}>
          <Miniatura estilo={e.v} />
          <span style={{ minWidth: 0 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{e.nome}</b><br /><span className="subtle" style={{ fontSize: 11 }}>{e.desc}</span></span>
        </button>
      ))}
      {salvos.map((e) => (
        <div key={e.id} data-opt={`s:${e.id}`} role="button" tabIndex={0} className="panel estilo-salvo" aria-pressed={atual === `s:${e.id}`} title={e.descricao}
          onClick={() => escolherSalvo(e.id)} onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); escolherSalvo(e.id); } }}
          style={{ padding: 8, display: "flex", gap: 10, alignItems: "center", textAlign: "left", cursor: "pointer", position: "relative" }}>
          <span aria-hidden style={{ width: 46, height: 58, borderRadius: 8, flex: "none", overflow: "hidden", background: "conic-gradient(from 210deg,#A855FF,#22D3EE,#F472B6,#A855FF)" }}>
            {e.capaId && <img src={`/api/creatives/${e.capaId}/file?kind=thumb`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </span>
          <span style={{ minWidth: 0 }}><b style={{ fontWeight: 600, fontSize: 13 }}>{e.nome}</b><br /><span className="subtle" style={{ fontSize: 11 }}>Estilo salvo · a IA repete este visual</span></span>
          {onApagar && <button type="button" className="btn btn-ghost btn-xs estilo-apagar" aria-label={`Apagar o estilo ${e.nome}`} onClick={(k) => { k.stopPropagation(); onApagar(e.id); }}><X aria-hidden /></button>}
        </div>
      ))}
    </Escolha>
  );
}

function Miniatura({ estilo }: { estilo: Estilo }) {
  const base = { width: 46, height: 58, borderRadius: 8, flex: "none", position: "relative" as const, overflow: "hidden", display: "grid", placeItems: "center" };
  if (estilo === "hud") return (
    <span aria-hidden style={{ ...base, background: "#07070A", backgroundImage: "linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)", backgroundSize: "8px 8px", boxShadow: "inset 0 0 0 1px rgba(168,85,255,.5)" }}>
      <i style={{ position: "absolute", left: 4, top: 4, width: 7, height: 7, borderLeft: "1.5px solid #A855FF", borderTop: "1.5px solid #A855FF" }} />
      <i style={{ position: "absolute", right: 4, bottom: 4, width: 7, height: 7, borderRight: "1.5px solid #A855FF", borderBottom: "1.5px solid #A855FF" }} />
      <span style={{ display: "grid", gap: 3, justifyItems: "center" }}>
        <i style={{ width: 26, height: 4, borderRadius: 2, background: "#fff" }} />
        <i style={{ width: 18, height: 4, borderRadius: 2, background: "#A855FF", boxShadow: "0 0 8px #A855FF" }} />
      </span>
    </span>
  );
  if (estilo === "clay") return (
    <span aria-hidden style={{ ...base, background: "radial-gradient(120% 90% at 30% 10%,#fff,#EFE9FF 60%)" }}>
      <i style={{ position: "absolute", right: -6, top: -4, width: 26, height: 26, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#c4b5fd,#8B5CF6 60%)", boxShadow: "inset -2px -3px 5px rgba(0,0,0,.2),inset 2px 2px 4px rgba(255,255,255,.6)" }} />
      <i style={{ position: "absolute", left: 4, bottom: 6, width: 12, height: 12, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#e0f2fe,#7DD3FC 60%)", boxShadow: "inset -1px -2px 3px rgba(0,0,0,.15)" }} />
      <i style={{ position: "relative", width: 28, height: 12, borderRadius: 99, background: "#fff", boxShadow: "2px 3px 6px rgba(80,50,160,.25),inset 0 1px 2px #fff" }} />
    </span>
  );
  if (estilo === "editorial") return (
    <span aria-hidden style={{ ...base, background: "#F2EEE6", placeItems: "start", padding: 6, boxSizing: "border-box", alignContent: "center", gap: 3 }}>
      <i style={{ width: 12, height: 2, background: "#C2410C" }} />
      <b style={{ fontFamily: "Georgia, serif", fontSize: 17, color: "#161412", fontWeight: 500, lineHeight: 1 }}>Aa</b>
      <i style={{ width: 30, height: 1, background: "rgba(22,20,18,.35)" }} />
      <i style={{ width: 22, height: 1, background: "rgba(22,20,18,.35)" }} />
    </span>
  );
  return (
    <span aria-hidden style={{ ...base, background: "conic-gradient(from 210deg,#A855FF,#22D3EE,#F472B6,#A855FF)" }}>
      <Sparkles size={18} color="#fff" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.4))" }} />
    </span>
  );
}
