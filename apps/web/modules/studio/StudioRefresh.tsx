"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Enquanto há vídeo sendo gerado, a lista se atualiza sozinha a cada 4 s. */
export function StudioRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
