"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { InstagramLogo } from "../connections/Logos";
import { novaPublicacao } from "./actions";

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-secondary btn-xs" disabled={pending}>{pending ? <Loader2 className="animate-spin" aria-hidden /> : <InstagramLogo size={14} />} {rotulo}</button>;
}

/** Atalho do Studio: abre o editor do Instagram já com as mídias (perfil: o primeiro do workspace). */
export function BotaoPublicar({ midias, tipo, rotulo = "Instagram" }: { midias: string[]; tipo: "FEED" | "CARROSSEL" | "REELS"; rotulo?: string }) {
  return (
    <form action={novaPublicacao} style={{ display: "contents" }}>
      <input type="hidden" name="tipo" value={tipo} />
      {midias.map((m) => <input key={m} type="hidden" name="midia" value={m} />)}
      <Enviar rotulo={rotulo} />
    </form>
  );
}
