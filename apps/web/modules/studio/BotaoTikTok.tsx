"use client";

import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { TikTokLogo } from "../connections/Logos";
import { toast } from "../shell/toast";
import { enviarAoTikTok } from "./tiktok-actions";

/** Envia o MP4 para a caixa de entrada do TikTok; a pessoa termina (legenda, publicar) no app do TikTok. */
export function BotaoTikTok({ creativeId }: { creativeId: string }) {
  const [pend, start] = useTransition();
  const enviar = () => start(async () => {
    const r = await enviarAoTikTok(creativeId);
    if (r.ok) toast.ok(`Enviado ao TikTok (${r.data}). Abra o app do TikTok e toque na notificação para editar e publicar.`);
    else toast.err(r.error);
  });
  return (
    <button type="button" className="btn btn-secondary btn-xs" onClick={enviar} disabled={pend}>
      {pend ? <Loader2 className="animate-spin" aria-hidden /> : <TikTokLogo size={14} />} {pend ? "Enviando…" : "Enviar ao TikTok"}
    </button>
  );
}
