"use client";

import { usePulso } from "../shell/usePulso";

/** Enquanto há vídeo sendo gerado, a lista confere a cada 4 s e só recarrega quando algo mudou. */
export function StudioRefresh() {
  usePulso("studio", 4000);
  return null;
}
