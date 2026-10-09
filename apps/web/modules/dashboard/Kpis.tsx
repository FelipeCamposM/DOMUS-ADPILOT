import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { derive } from "@/lib/format";
import type { Totais } from "@/lib/queries";
import { CountUp, type CountFormat } from "../motion/CountUp";

type K = keyof ReturnType<typeof derive>;
const CARDS: { k: K; label: string; kind: CountFormat; menorMelhor?: boolean; hero?: boolean }[] = [
  { k: "spend", label: "Investimento", kind: "money", hero: true },
  { k: "impressions", label: "Impressões", kind: "compact" },
  { k: "clicks", label: "Cliques", kind: "int" },
  { k: "ctr", label: "CTR", kind: "pct" },
  { k: "cpc", label: "CPC", kind: "money", menorMelhor: true },
  { k: "cpm", label: "CPM", kind: "money", menorMelhor: true },
  { k: "leads", label: "Leads", kind: "int" },
  { k: "conversions", label: "Conversões", kind: "int" },
  { k: "cpa", label: "CPA", kind: "money", menorMelhor: true },
  { k: "revenue", label: "Receita", kind: "money" },
  { k: "roas", label: "ROAS", kind: "ratio" },
];

/** Os 11 indicadores da spec, com variação contra o período anterior de mesmo tamanho. */
export function Kpis({ atual, anterior, dias }: { atual: Totais; anterior: Totais; dias: number }) {
  const a = derive(atual), b = derive(anterior);
  return (
    <div className="kpis">
      {CARDS.map((c) => {
        const va = a[c.k], vb = b[c.k];
        const delta = va != null && vb != null && vb !== 0 ? (va - vb) / Math.abs(vb) : null;
        const bom = delta != null && (c.menorMelhor ? delta < 0 : delta > 0);
        return (
          <div key={c.k} className={`kpi spotlight ${c.hero ? "hero" : ""}`} data-enter="scale">
            <div className="kpi-label">{c.label}</div>
            <div className="kpi-value"><CountUp value={va} kind={c.kind} /></div>
            <div className={`delta ${delta == null || Math.abs(delta) < 0.005 ? "subtle" : bom ? "up" : "down"}`} style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}
              title={`Comparado aos ${dias} dias anteriores`}>
              {delta == null ? "sem base de comparação" : (
                <>
                  {delta >= 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
                  {`${(Math.abs(delta) * 100).toFixed(1).replace(".", ",")}%`}
                  <span className="subtle" style={{ fontWeight: 500 }}>&nbsp;vs. anterior</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
