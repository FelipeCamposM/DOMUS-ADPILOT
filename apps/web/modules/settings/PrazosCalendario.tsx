"use client";

import type { ConfigCal } from "@domus-ads/core/calendario";
import { ESTILOS, VOZES } from "@domus-ads/core/video";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { salvarConfigCalendario } from "./actions";

import { Seletor } from "../shell/Seletor";
/** Até quanto atraso ainda publica, e voz e estilo dos Reels. */
export function PrazosCalendario({ cfg, podeAdmin }: { cfg: ConfigCal; podeAdmin: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(cfg);
  const [pend, start] = useTransition();
  const mudou = JSON.stringify(v) !== JSON.stringify(cfg);
  return (
    <>
      <fieldset disabled={!podeAdmin || pend} className="cfg-grade">
        <div className="field">
          <label className="label" htmlFor="tol">Publicar atrasado até</label>
          <div className="cluster" style={{ gap: 6 }}>
            <input id="tol" className="input-sm tabular" style={{ width: 90 }} type="number" min={0.5} max={24} step={0.5} value={v.toleranciaH} onChange={(e) => setV({ ...v, toleranciaH: Number(e.target.value) })} />
            <span className="subtle small">horas</span>
          </div>
          <span className="subtle caption">Passou disso sem você aprovar no WhatsApp (ou com o PC desligado), o post não sai, fica como “Falhou” e chega aviso.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="voz">Voz dos Reels</label>
          <Seletor id="voz" className="seletor-campo" ariaLabel="Voz" valor={v.voz} onChange={(x) => setV({ ...v, voz: x as ConfigCal["voz"] })}
            opcoes={Object.entries(VOZES).map(([k, n]) => ({ valor: k, rotulo: n }))} />
          <span className="subtle caption">Com uma voz do ElevenLabs favoritada (⭐ no Studio), os Reels usam ela; esta é só a reserva.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="estilo">Estilo dos Reels</label>
          <Seletor id="estilo" className="seletor-campo" ariaLabel="Estilo do vídeo" valor={v.estiloVideo} onChange={(x) => setV({ ...v, estiloVideo: x as ConfigCal["estiloVideo"] })}
            opcoes={Object.entries(ESTILOS).map(([k, e]) => ({ valor: k, rotulo: e.nome }))} />
        </div>
      </fieldset>
      {podeAdmin ? (
        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={pend || !mudou} onClick={() => start(async () => {
          const r = await salvarConfigCalendario(v);
          if (r.ok) toast.ok("Prazos salvos"); else toast.err(r.error);
          router.refresh();
        })}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Salvar prazos</button>
      ) : <p className="subtle small">Só o administrador da plataforma altera os prazos.</p>}
    </>
  );
}
