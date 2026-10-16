"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { UsoArmazenamento } from "@/lib/armazenamento";
import { UsoR2 } from "../arquivos/UsoR2";
import { toast } from "../shell/toast";
import { salvarArmazenamento } from "./actions";

export interface CfgArmazenamento { limiteGb: number; diasSemUso: number; arquivarPublicados: boolean; previas: boolean }

/** Regras de quanto fica no R2 (pequeno, dividido com a Domus) e quando o original vai só para o Google Drive. */
export function Armazenamento({ cfg, uso, podeAdmin }: { cfg: CfgArmazenamento; uso: UsoArmazenamento; podeAdmin: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(cfg);
  const [pend, start] = useTransition();
  const set = (x: Partial<CfgArmazenamento>) => setV((a) => ({ ...a, ...x }));
  const mudou = JSON.stringify(v) !== JSON.stringify(cfg);

  const salvar = () => start(async () => {
    const r = await salvarArmazenamento(v);
    if (r.ok) toast.ok("Regras salvas: valem na próxima passada do worker (até 30 min)"); else toast.err(r.error);
    router.refresh();
  });

  return (
    <>
      <UsoR2 uso={uso} limiteGb={cfg.limiteGb} />
      <fieldset disabled={!podeAdmin || pend} className="cfg-grade">
        <div className="field">
          <label className="label" htmlFor="arm-limite">Limite do AdPilot no R2</label>
          <div className="cluster" style={{ gap: 6 }}>
            <input id="arm-limite" className="input-sm tabular" style={{ width: 90 }} type="number" min={0.2} max={9} step={0.5} value={v.limiteGb} onChange={(e) => set({ limiteGb: Number(e.target.value) })} />
            <span className="subtle small">GB</span>
          </div>
          <span className="subtle caption">Passou disso, sai do R2 o que foi usado há mais tempo (nada usado nas últimas 24 h).</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="arm-dias">Tirar do R2 depois de</label>
          <div className="cluster" style={{ gap: 6 }}>
            <input id="arm-dias" className="input-sm tabular" style={{ width: 90 }} type="number" min={1} max={365} step={1} value={v.diasSemUso} onChange={(e) => set({ diasSemUso: Number(e.target.value) })} />
            <span className="subtle small">dias sem uso</span>
          </div>
          <span className="subtle caption">Mesmo abaixo do limite: arquivo parado vai para o Drive.</span>
        </div>
        <label className="chave">
          <input type="checkbox" checked={v.arquivarPublicados} onChange={(e) => set({ arquivarPublicados: e.target.checked })} />
          <span><b>Arquivar depois de publicar</b><small className="subtle">A mídia já está no Instagram: o original vai para o Drive logo após postar.</small></span>
        </label>
        <label className="chave">
          <input type="checkbox" checked={v.previas} onChange={(e) => set({ previas: e.target.checked })} />
          <span><b>Deixar prévia leve no R2</b><small className="subtle">Imagem até 1080 px e vídeo em 480p: o site continua mostrando sem o PC ligado.</small></span>
        </label>
      </fieldset>
      <p className="subtle caption">Ficam sempre no R2: miniaturas, logos das marcas e mídia de publicações agendadas. O original de todo o resto também fica no Google Drive do PC do worker e volta sozinho quando alguém abre.</p>
      {podeAdmin ? (
        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={pend || !mudou} onClick={salvar}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Salvar regras</button>
      ) : <p className="subtle small">Só o administrador da plataforma altera essas regras.</p>}
    </>
  );
}
