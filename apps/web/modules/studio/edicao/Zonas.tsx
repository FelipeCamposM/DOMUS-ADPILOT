"use client";

import { ESTILOS_LEGENDA, REDES, zonasPara, type EstiloLegenda, type Rede } from "@domus-ads/core/edicao";
import { FORMATOS, type Formato } from "@domus-ads/core/video";
import { Escolha } from "../../motion/Escolha";

/**
 * Áreas que a interface da rede cobre (nome do perfil, descrição, botões…), desenhadas por cima do vídeo: é onde a
 * legenda e as animações nunca ficam. "Todas" mostra as três redes juntas.
 */
export function ZonasRede({ rede, formato }: { rede: Rede; formato: Formato }) {
  const [w, h] = FORMATOS[formato];
  const zonas = zonasPara(rede, formato);
  return (
    <div className="zonas" aria-label={`Áreas bloqueadas: ${REDES[rede]}`}>
      {zonas.map((z, i) => (
        <div key={i} className="zona" data-rede={z.rede} title={`${z.rede === "geral" ? "" : `${REDES[z.rede as Rede]}: `}${z.rotulo}`}
          style={{ left: `${(z.x0 / w) * 100}%`, top: `${(z.y0 / h) * 100}%`, width: `${((z.x1 - z.x0) / w) * 100}%`, height: `${((z.y1 - z.y0) / h) * 100}%` }}>
          {z.rotulo !== "Margem" && rede !== "todas" && <span>{z.rotulo}</span>}
        </div>
      ))}
    </div>
  );
}

export function EscolhaRede({ valor, onChange, disabled }: { valor: Rede; onChange: (r: Rede) => void; disabled?: boolean }) {
  return (
    <Escolha valor={valor} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
      {(Object.keys(REDES) as Rede[]).map((r) => (
        <button key={r} data-opt={r} type="button" className="chip" data-active={valor === r} disabled={disabled} onClick={() => onChange(r)} style={{ height: 30 }}>{REDES[r]}</button>
      ))}
    </Escolha>
  );
}

/** Cada estilo de legenda com uma amostra viva (a palavra do meio é a "falada"). */
export function EscolhaLegenda({ valor, onChange, disabled }: { valor: EstiloLegenda; onChange: (e: EstiloLegenda) => void; disabled?: boolean }) {
  return (
    <Escolha valor={valor} className="leg-estilos">
      {(Object.keys(ESTILOS_LEGENDA) as EstiloLegenda[]).map((e) => (
        <button key={e} data-opt={e} type="button" className="panel leg-estilo" aria-pressed={valor === e} disabled={disabled} onClick={() => onChange(e)} title={ESTILOS_LEGENDA[e].descricao}>
          <span className={`leg-amostra lgp-${e}`} aria-hidden>
            {e === "palavra" ? <i className="on">VÍDEO</i> : <><i>seu</i> <i className="on">vídeo</i> <i>pronto</i></>}
          </span>
          <b>{ESTILOS_LEGENDA[e].nome}</b>
        </button>
      ))}
    </Escolha>
  );
}
