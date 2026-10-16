"use client";

import { AlertTriangle, HelpCircle } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Dialog } from "./Dialog";

interface Pedido { texto: string; responder: (ok: boolean) => void }
let atual: Pedido | null = null;
const ouvintes = new Set<() => void>();
const emitir = () => ouvintes.forEach((f) => f());
const DESTRUTIVOS = /^(apagar|remover|descartar|desconectar|excluir|sair)\b/i;

/**
 * Modal de confirmação no lugar do `confirm()` do navegador: `if (await confirmar("Apagar a pasta?")) …`.
 * O botão leva o verbo da pergunta ("Apagar", "Descartar"…) e fica vermelho quando é destrutivo.
 */
export function confirmar(texto: string): Promise<boolean> {
  atual?.responder(false);
  return new Promise((resolve) => {
    atual = { texto, responder: (ok) => { atual = null; emitir(); resolve(ok); } };
    emitir();
  });
}

export function Confirmador() {
  const p = useSyncExternalStore((f) => (ouvintes.add(f), () => ouvintes.delete(f)), () => atual, () => null);
  const perigo = !!p && DESTRUTIVOS.test(p.texto);
  const verbo = p?.texto.match(/^\p{L}+/u)?.[0] ?? "";
  const rotulo = perigo || /^(gerar|refazer|planejar|publicar|enviar|aprovar|criar)$/i.test(verbo) ? verbo : "Confirmar";
  return (
    <Dialog open={!!p} onClose={() => p?.responder(false)} title="Confirmar">
      {p && <>
        <div className="confirma">
          <span className="confirma-icone" data-perigo={perigo}>{perigo ? <AlertTriangle aria-hidden /> : <HelpCircle aria-hidden />}</span>
          <p>{p.texto}</p>
        </div>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => p.responder(false)}>Cancelar</button>
          <button className={perigo ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"} autoFocus onClick={() => p.responder(true)}>{rotulo}</button>
        </div>
      </>}
    </Dialog>
  );
}
