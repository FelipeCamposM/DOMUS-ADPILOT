"use client";

import { Check, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { apagarCriativos, apagarProjetos } from "../studio/actions";
import { confirmar } from "./confirmar";
import { toast } from "./toast";

interface SelecaoCtx { sel: Set<string>; alternar: (chave: string) => void }
const Ctx = createContext<SelecaoCtx | null>(null);

/**
 * Seleção de vários cartões para apagar de uma vez, sem abrir um por um.
 * Cada cartão tem uma chave (projeto: id; criativo: ids do cartão separados por vírgula, um carrossel são vários).
 */
export function Selecao({ tipo, chaves, children }: { tipo: "projetos" | "criativos"; chaves: string[]; children: ReactNode }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [indo, start] = useTransition();
  const alternar = useCallback((k: string) => setSel((s) => { const n = new Set(s); if (!n.delete(k)) n.add(k); return n; }), []);

  useEffect(() => {
    if (!sel.size) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(new Set()); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [sel.size]);

  // a lista mudou (filtro, busca, apagou): tira da seleção o que sumiu
  useEffect(() => { setSel((s) => new Set([...s].filter((k) => chaves.includes(k)))); }, [chaves]);

  const nome = tipo === "projetos" ? (sel.size === 1 ? "projeto" : "projetos") : sel.size === 1 ? "item" : "itens";
  const apagar = () => start(async () => {
    const extra = tipo === "projetos" ? " Some tudo o que cada um gerou." : "";
    if (!(await confirmar(`Apagar ${sel.size} ${nome}? Não dá para desfazer.${extra}`))) return;
    const r = tipo === "projetos" ? await apagarProjetos([...sel]) : await apagarCriativos([...sel].map((k) => k.split(",")));
    if (!r.ok) { toast.err(r.error); return; }
    const { apagados, pulados } = r.data;
    toast.ok(`${apagados} apagado${apagados === 1 ? "" : "s"}${pulados ? ` · ${pulados} não (gerando ou em uso)` : ""}`);
    setSel(new Set());
    router.refresh();
  });

  return (
    <Ctx.Provider value={{ sel, alternar }}>
      <div data-selecionando={sel.size > 0 || undefined} style={{ display: "contents" }}>{children}</div>
      {sel.size > 0 && (
        <div className="sel-barra" role="toolbar" aria-label="Seleção">
          <b className="tabular">{sel.size} {nome}</b>
          {sel.size < chaves.length && <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set(chaves))}>Selecionar todos ({chaves.length})</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}><X aria-hidden />Limpar</button>
          <button className="btn btn-danger btn-sm" onClick={apagar} disabled={indo}>{indo ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}Apagar</button>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Caixinha no canto do cartão. Com algo selecionado, clicar no cartão também marca (não abre). */
export function useMarcavel(chave: string | undefined) {
  const c = useContext(Ctx);
  if (!c || !chave) return null;
  const marcado = c.sel.has(chave);
  return {
    marcado,
    onClickCartao: (e: React.MouseEvent) => { if (c.sel.size > 0) { e.preventDefault(); c.alternar(chave); } },
    caixa: (
      <span role="checkbox" aria-checked={marcado} aria-label={marcado ? "Desmarcar" : "Selecionar"} tabIndex={0} className="sel-check"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); c.alternar(chave); }}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); c.alternar(chave); } }}>
        {marcado && <Check aria-hidden />}
      </span>
    ),
  };
}
