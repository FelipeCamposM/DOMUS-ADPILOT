"use client";

import { Clapperboard, GalleryHorizontalEnd, ImageIcon, Loader2, Smartphone } from "lucide-react";
import { useFormStatus } from "react-dom";
import { TIPOS_POST, type TipoPost } from "@domus-ads/core/instagram-regras";
import { Dialog } from "../shell/Dialog";
import { novaPublicacao } from "./actions";

export const ICONE_TIPO: Record<TipoPost, typeof ImageIcon> = { FEED: ImageIcon, CARROSSEL: GalleryHorizontalEnd, REELS: Clapperboard, STORY: Smartphone };

function Opcao({ t }: { t: TipoPost }) {
  const { pending, data } = useFormStatus();
  const I = ICONE_TIPO[t];
  const esta = pending && data?.get("tipo") === t;
  return (
    <button type="submit" name="tipo" value={t} className="ig-tipo-card" disabled={pending}>
      <span className="ig-tipo-icone">{esta ? <Loader2 className="animate-spin" size={22} /> : <I size={22} aria-hidden />}</span>
      <b>{TIPOS_POST[t].nome}</b>
      <span>{TIPOS_POST[t].desc}</span>
    </button>
  );
}

/** Escolha do tipo: cria o rascunho e abre o editor. `midias` vem preenchido quando parte do Studio/Criativos. */
export function NovaPublicacao({ open, onClose, conta, midias = [] }: { open: boolean; onClose: () => void; conta: string; midias?: string[] }) {
  return (
    <Dialog open={open} onClose={onClose} title="Nova publicação">
      <form action={novaPublicacao} className="ig-tipos">
        <input type="hidden" name="conta" value={conta} />
        {midias.map((m) => <input key={m} type="hidden" name="midia" value={m} />)}
        {(Object.keys(TIPOS_POST) as TipoPost[]).map((t) => <Opcao key={t} t={t} />)}
      </form>
    </Dialog>
  );
}
