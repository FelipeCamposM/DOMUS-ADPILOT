"use client";

import { Check, Film, Loader2, MousePointerClick, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { apagarCriativos, apagarProjetos } from "../studio/actions";
import { confirmar } from "./confirmar";
import { toast } from "./toast";

/** O que a barra de seleção mostra de cada cartão marcado. */
export interface MetaCartao { titulo: string; capa?: string }
interface SelecaoCtx { sel: Set<string>; apagando: Set<string>; alternar: (chave: string) => void; registrar: (chave: string, m: MetaCartao) => void }
const Ctx = createContext<SelecaoCtx | null>(null);

/**
 * Seleção de vários cartões para apagar de uma vez. Marca com o botão direito; o clique normal abre o cartão.
 * Cada cartão tem uma chave (projeto: id; criativo: ids do cartão separados por vírgula, um carrossel são vários).
 */
export function Selecao({ tipo, chaves, children }: { tipo: "projetos" | "criativos"; chaves: string[]; children: ReactNode }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [apagando, setApagando] = useState<Set<string>>(new Set());
  const [indo, start] = useTransition();
  const metas = useRef(new Map<string, MetaCartao>());
  const alternar = useCallback((k: string) => setSel((s) => { const n = new Set(s); if (!n.delete(k)) n.add(k); return n; }), []);
  const registrar = useCallback((k: string, m: MetaCartao) => { metas.current.set(k, m); }, []);

  useEffect(() => {
    if (!sel.size || apagando.size) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".overlay")) setSel(new Set()); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [sel.size, apagando.size]);

  // a lista mudou (filtro, busca, apagou): tira da seleção o que sumiu
  useEffect(() => { setSel((s) => new Set([...s].filter((k) => chaves.includes(k)))); }, [chaves]);

  const plural = (n: number) => (tipo === "projetos" ? (n === 1 ? "projeto" : "projetos") : n === 1 ? "item" : "itens");
  const nome = plural(sel.size);
  const apagar = () => start(async () => {
    const extra = tipo === "projetos" ? " Some tudo o que cada um gerou." : "";
    if (!(await confirmar(`Apagar ${sel.size} ${nome}? Não dá para desfazer.${extra}`))) return;
    const alvo = [...sel];
    setApagando(new Set(alvo));
    const aviso = toast.carregando(`Apagando ${alvo.length} ${plural(alvo.length)}…`);
    try {
      const r = tipo === "projetos" ? await apagarProjetos(alvo) : await apagarCriativos(alvo.map((k) => k.split(",")));
      if (!r.ok) { toast.fim(aviso, "err", r.error); return; }
      const { apagados, pulados } = r.data;
      toast.fim(aviso, apagados ? "ok" : "err", `${apagados} apagado${apagados === 1 ? "" : "s"}${pulados ? ` · ${pulados} não (gerando ou em uso)` : ""}`);
      setSel(new Set());
      router.refresh();
    } catch (e) {
      toast.fim(aviso, "err", (e as Error).message || "Não foi possível apagar");
    }
  });
  // os cartões ficam apagados (escuros, girando) até a transição acabar, que inclui o refresh da lista
  useEffect(() => { if (!indo) setApagando(new Set()); }, [indo]);

  const marcados = [...sel];
  const ocupado = apagando.size > 0;
  return (
    <Ctx.Provider value={{ sel, apagando, alternar, registrar }}>
      <div data-selecionando={sel.size > 0 || undefined} style={{ display: "contents" }}>{children}</div>
      {sel.size > 0 && (
        <div className="sel-barra" role="region" aria-label="Seleção" aria-busy={ocupado}>
          <div className="sel-barra-cab">
            <span className="sel-barra-n tabular">{sel.size}</span>
            <span className="sel-barra-txt">
              <b>{ocupado ? `Apagando ${sel.size} ${nome}…` : `${nome[0]!.toUpperCase()}${nome.slice(1)} selecionado${sel.size === 1 ? "" : "s"}`}</b>
              <small>{ocupado ? "Pode levar alguns segundos" : <><MousePointerClick aria-hidden />Botão direito marca mais · Esc cancela</>}</small>
            </span>
            {!ocupado && sel.size < chaves.length && <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSel(new Set(chaves))}>Todos ({chaves.length})</button>}
          </div>
          <ul className="sel-barra-itens" aria-label="Selecionados">
            {marcados.slice(0, 8).map((k) => {
              const m = metas.current.get(k);
              return (
                <li key={k} title={m?.titulo}>
                  {m?.capa ? <img src={m.capa} alt="" loading="lazy" /> : <Film aria-hidden />}
                  {!ocupado && <button type="button" aria-label={`Desmarcar ${m?.titulo ?? ""}`} onClick={() => alternar(k)}><X aria-hidden /></button>}
                </li>
              );
            })}
            {marcados.length > 8 && <li className="sel-barra-mais">+{marcados.length - 8}</li>}
          </ul>
          {ocupado && <span className="sel-barra-prog" aria-hidden><i /></span>}
          <div className="sel-barra-acoes">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSel(new Set())} disabled={ocupado}><X aria-hidden />Cancelar</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={apagar} disabled={indo}>{ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}{ocupado ? "Apagando…" : `Apagar ${sel.size}`}</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Cartão marcável: botão direito marca/desmarca; com marcação, aparece o visto no canto. */
export function useMarcavel(chave: string | undefined, meta: MetaCartao) {
  const c = useContext(Ctx);
  const { titulo, capa } = meta;
  useEffect(() => { if (c && chave) c.registrar(chave, { titulo, capa }); }, [c, chave, titulo, capa]);
  if (!c || !chave) return null;
  const marcado = c.sel.has(chave);
  return {
    marcado,
    apagando: c.apagando.has(chave),
    alternar: () => c.alternar(chave),
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); c.alternar(chave); },
    caixa: marcado ? (
      <span role="checkbox" aria-checked="true" aria-label="Desmarcar" tabIndex={0} className="sel-check"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); c.alternar(chave); }}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); c.alternar(chave); } }}>
        <Check aria-hidden />
      </span>
    ) : null,
  };
}
