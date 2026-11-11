"use client";

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Popover } from "../shell/Popover";
import { toast } from "../shell/toast";
import { ajustarComIA, resultadoAjuste } from "./actions";

const ATALHOS = ["Mais curta", "Mais próxima e informal", "Mais profissional", "Corrigir o português", "Com uma pergunta no fim"];

/**
 * "Ajustar com IA" no campo da conversa: a IA (conta conectada, no worker) reescreve o que está escrito seguindo o pedido.
 * Campo vazio = escreve do zero. Contato vindo da prospecção: a IA também vê os dados da empresa e a sua oferta.
 */
export function AjustarIA({ numero, texto, usar, desligado }: { numero: string; texto: string; usar: (t: string) => void; desligado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [pedido, setPedido] = useState("");
  const [indo, setIndo] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const ajustar = async (p: string) => {
    setIndo(true);
    const r = await ajustarComIA({ numero, texto, pedido: p });
    if (!r.ok) { setIndo(false); return toast.err(r.error); }
    // a vaga rápida do worker responde em segundos; desiste em 2 min
    for (let i = 0; i < 80 && vivo.current; i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const s = await resultadoAjuste(r.data);
      if (!s.ok) { toast.err(s.error); break; }
      if (s.data.status === "COMPLETED" && s.data.texto) { usar(s.data.texto); setAberto(false); setPedido(""); toast.ok("Mensagem ajustada: revise antes de enviar"); break; }
      if (s.data.status === "FAILED" || s.data.status === "CANCELLED") { toast.err(s.data.erro ?? "A IA não conseguiu ajustar"); break; }
      if (i === 79) toast.err("A IA demorou demais. Tente de novo.");
    }
    if (vivo.current) setIndo(false);
  };

  return (
    <span style={{ position: "relative" }}>
      <button className="btn btn-ghost btn-sm" aria-label="Ajustar com IA" title={texto.trim() ? "Ajustar com IA" : "Escrever com IA"} disabled={desligado} onClick={() => setAberto((a) => !a)}>
        {indo ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
      </button>
      <Popover open={aberto} onClose={() => !indo && setAberto(false)} width={340} style={{ top: "auto", bottom: "calc(100% + 8px)" }}>
        <div className="stack" style={{ gap: 8, padding: 10 }}>
          <b className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}><Wand2 size={14} aria-hidden /> {texto.trim() ? "Ajustar a mensagem com IA" : "Escrever a mensagem com IA"}</b>
          <div className="cluster" style={{ gap: 4, flexWrap: "wrap" }}>
            {ATALHOS.map((a) => <button key={a} className="chip" style={{ height: 26, fontSize: 11.5 }} disabled={indo} onClick={() => void ajustar(a)}>{a}</button>)}
          </div>
          <textarea className="input" rows={2} maxLength={400} value={pedido} disabled={indo} placeholder="Ou diga como quer (ex.: cite o site fora do ar e ofereça uma conversa de 10 min)"
            onChange={(e) => setPedido(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ajustar(pedido); } }} />
          <button className="btn btn-primary btn-sm" disabled={indo} onClick={() => void ajustar(pedido)}>
            {indo ? <><Loader2 className="animate-spin" aria-hidden /> A IA está escrevendo…</> : <><Sparkles aria-hidden /> {texto.trim() ? "Ajustar" : "Escrever"}</>}
          </button>
          <span className="subtle caption">Substitui o texto do campo. Nada é enviado sem você clicar em enviar.</span>
        </div>
      </Popover>
    </span>
  );
}
