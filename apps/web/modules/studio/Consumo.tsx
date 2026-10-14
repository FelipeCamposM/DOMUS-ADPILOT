import { chaveElevenLabs, creditosElevenLabs, db, usdPorMilCreditos } from "@domus-ads/core";
import { AudioLines, Bot, Coins } from "lucide-react";

const int = (n: number) => n.toLocaleString("pt-BR");
const usd = (n: number) => `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;

/** Quanto este projeto gastou: tokens de IA (todas as chamadas: roteiro, composição, ajustes) e créditos do ElevenLabs. */
export async function Consumo({ workspaceId, projetoId }: { workspaceId: string; projetoId: string }) {
  const sql = db();
  const [[ia], [voz]] = await Promise.all([
    sql<{ chamadas: number; entrada: string; saida: string; custo: string | null; modelos: string | null }[]>`
      select count(*)::int chamadas, coalesce(sum(input_tokens), 0)::text entrada, coalesce(sum(output_tokens), 0)::text saida,
        sum(cost_usd)::text custo, string_agg(distinct coalesce(model, provider), ', ') modelos
      from ads.ai_usage where video_project_id = ${projetoId} and workspace_id = ${workspaceId}`,
    sql<{ caracteres: string; creditos: string }[]>`
      select coalesce(sum(characters), 0)::text caracteres, coalesce(sum(credits), 0)::text creditos
      from ads.tts_usage where video_project_id = ${projetoId} and workspace_id = ${workspaceId}`,
  ]);
  const creditos = Number(voz?.creditos ?? 0);
  // plano atual da conta para o preço por crédito (só consulta se houve gasto de voz)
  const chave = creditos > 0 ? await chaveElevenLabs() : null;
  const plano = chave ? await creditosElevenLabs(chave).then((c) => c.plano, () => null) : null;
  const custoVoz = (creditos / 1000) * usdPorMilCreditos(plano);
  const custoIa = Number(ia?.custo ?? 0);
  const tokens = Number(ia?.entrada ?? 0) + Number(ia?.saida ?? 0);

  return (
    <section className="panel" data-enter style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Coins size={15} aria-hidden /> Consumo deste projeto</div>
          <div className="subtle caption">Custo estimado em dólar. IA: valor equivalente da API (com assinatura Pro/Max/Plus, sai do limite do plano, não da fatura).</div>
        </div>
        <b className="tabular" style={{ fontSize: 18 }}>{usd(custoIa + custoVoz)}</b>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", padding: 14, gap: 10 }}>
        <div className="panel" style={{ padding: 12 }}>
          <div className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}><Bot size={14} aria-hidden /> <b>IA</b> <span className="subtle">· {ia?.chamadas ?? 0} chamada(s)</span></div>
          {ia?.chamadas ? (
            <div className="caption" style={{ marginTop: 6, lineHeight: 1.6 }}>
              <span className="tabular">{int(tokens)}</span> tokens (<span className="tabular">{int(Number(ia.entrada))}</span> de entrada · <span className="tabular">{int(Number(ia.saida))}</span> de saída)<br />
              {ia.custo != null ? <>≈ <b className="tabular">{usd(custoIa)}</b></> : "custo não informado pelo provedor"}{ia.modelos ? <span className="subtle"> · {ia.modelos}</span> : null}
            </div>
          ) : <div className="caption subtle" style={{ marginTop: 6 }}>Sem registro (projetos criados antes desta medição não têm consumo por projeto).</div>}
        </div>
        <div className="panel" style={{ padding: 12 }}>
          <div className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}><AudioLines size={14} aria-hidden /> <b>ElevenLabs</b></div>
          {creditos > 0 ? (
            <div className="caption" style={{ marginTop: 6, lineHeight: 1.6 }}>
              <span className="tabular">{int(creditos)}</span> créditos · <span className="tabular">{int(Number(voz!.caracteres))}</span> caracteres<br />
              ≈ <b className="tabular">{usd(custoVoz)}</b><span className="subtle"> · plano {plano || "estimado (Creator)"}</span>
            </div>
          ) : <div className="caption subtle" style={{ marginTop: 6 }}>Nenhum crédito gasto (voz local ou sem narração).</div>}
        </div>
      </div>
    </section>
  );
}
