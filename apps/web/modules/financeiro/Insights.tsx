"use client";

import type { Insight } from "@domus-ads/core/financeiro";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

const ICONE = { alerta: TriangleAlert, atencao: CircleAlert, info: Info, bom: CircleCheck } as const;

/** Achados do código (sem IA): cor e ícone pelo nível. */
export function Insights({ itens }: { itens: Insight[] }) {
  if (!itens.length) return <div className="empty">Nada fora do normal neste mês. 👌</div>;
  return (
    <ul className="fin-insights">
      {itens.map((i) => {
        const I = ICONE[i.nivel];
        return (
          <li key={i.id} data-nivel={i.nivel}>
            <I aria-hidden />
            <span><b>{i.titulo}</b><small>{i.texto}</small></span>
          </li>
        );
      })}
    </ul>
  );
}
