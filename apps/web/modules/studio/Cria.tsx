"use client";

import { Check, ChevronDown, LayoutGrid, Search, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { FAMILIAS, textoDoEstilo, type Familia } from "@domus-ads/core/estilos";
import type { CardEstilo } from "@/lib/estilos";
import { Revelar } from "../motion/Escolha";
import type { AnexoItem, AnexosValor } from "./Anexos";
import { Previa } from "./Estilos";

/** Blocos da tela de criação do Studio: título numerado, seção dobrável e a faixa de estilos. */

export function Passo({ n, titulo, extra, children }: { n: number; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel cria-bloco">
      <header className="cria-topo"><b className="cria-n">{n}</b><h2>{titulo}</h2>{extra}</header>
      {children}
    </section>
  );
}

/** Seção recolhida por padrão, com o resumo do que está escolhido para não precisar abrir. */
export function Dobra({ titulo, resumo, icone, children, inicial = false }: { titulo: string; resumo?: string; icone?: ReactNode; children: ReactNode; inicial?: boolean }) {
  const [aberto, setAberto] = useState(inicial);
  return (
    <section className="panel cria-dobra" data-aberto={aberto}>
      <button type="button" className="cria-dobra-topo" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        {icone}<span>{titulo}</span>{resumo && <small>{resumo}</small>}<ChevronDown aria-hidden />
      </button>
      <Revelar aberto={aberto}><div className="cria-dobra-corpo">{children}</div></Revelar>
    </section>
  );
}

export function Campo({ id, label, valor, on, max, ph }: { id: string; label: string; valor: string; on: (v: string) => void; max: number; ph?: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" value={valor} onChange={(e) => on(e.target.value)} maxLength={max} placeholder={ph} />
    </div>
  );
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Passo 1: faixa com os estilos da biblioteca (os da família desta criação primeiro). "Ver todos" abre a grade com filtro. */
export function FaixaEstilos({ estilos, familias, valor, onChange }: { estilos: CardEstilo[]; familias: Familia[]; valor: CardEstilo | null; onChange: (e: CardEstilo | null) => void }) {
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);
  const [fam, setFam] = useState<Familia | "">("");
  const lista = useMemo(() => {
    const t = sem(q.trim());
    const peso = (e: CardEstilo) => (e.pronto ? 0 : -100) + (familias.includes(e.familia) ? familias.indexOf(e.familia) : 50);
    return estilos
      .filter((e) => (todos ? !fam || e.familia === fam : true) && (!t || sem(`${e.nome} ${e.resumo} ${e.tags.join(" ")} ${FAMILIAS[e.familia]}`).includes(t)))
      .sort((a, b) => peso(a) - peso(b))
      .slice(0, todos ? undefined : 14);
  }, [estilos, familias, q, todos, fam]);

  return (
    <Passo n={1} titulo="Estilo" extra={<>
      <label className="cria-busca"><Search aria-hidden /><input placeholder="Buscar estilo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar estilo" /></label>
      <button type="button" className="cria-link" onClick={() => setTodos(!todos)}><LayoutGrid aria-hidden /> {todos ? "Menos" : `Ver todos (${estilos.length})`}</button>
    </>}>
      {todos && (
        <div className="cria-fams">
          {(["", ...Object.keys(FAMILIAS)] as (Familia | "")[]).map((f) => (
            <button key={f || "todas"} type="button" className="chip" data-active={fam === f} onClick={() => setFam(f)}>{f ? FAMILIAS[f] : "Todas"}</button>
          ))}
        </div>
      )}
      <div className={todos ? "cria-estilos cria-estilos-grade" : "cria-estilos"}>
        <button type="button" className="cria-estilo cria-livre" aria-pressed={!valor} onClick={() => onChange(null)}>
          <span className="cria-estilo-thumb"><Sparkles aria-hidden /><em>A IA escolhe</em></span>
          <span className="cria-estilo-nome">Livre</span>
        </button>
        {lista.map((e) => (
          <button key={e.id} type="button" className="cria-estilo" aria-pressed={valor?.id === e.id} onClick={() => onChange(valor?.id === e.id ? null : e)} title={e.resumo}>
            <span className="cria-estilo-thumb est-thumb" data-familia={e.familia}><Previa e={e} />{valor?.id === e.id && <i className="cria-ok"><Check aria-hidden /></i>}</span>
            <span className="cria-estilo-nome">{e.nome}{!e.pronto && <small>seu</small>}</span>
          </button>
        ))}
        {!lista.length && <p className="subtle caption" style={{ alignSelf: "center" }}>Nenhum estilo com “{q}”.</p>}
      </div>
      {valor && <p className="subtle caption cria-estilo-info"><b>{valor.nome}</b> · {valor.resumo}{valor.refs.length ? ` · ${valor.refs.length} referência(s) vão como inspiração` : ""}</p>}
    </Passo>
  );
}

/** Troca o estilo: tira as referências do estilo anterior dos anexos e põe as do novo (como inspiração). */
export function anexosComEstilo(v: AnexosValor, antes: CardEstilo | null, depois: CardEstilo | null): AnexosValor {
  const fora = new Set(antes?.refs.map((r) => r.id) ?? []);
  const novas: AnexoItem[] = (depois?.refs ?? []).map((r) => ({ creativeId: r.id, name: r.name, type: r.type, uso: "inspiracao", nota: `Referência do estilo “${depois!.nome}”` }));
  const resto = v.assets.filter((a) => !fora.has(a.creativeId) && !novas.some((n) => n.creativeId === a.creativeId));
  return { ...v, assets: [...resto, ...novas].slice(0, 12) };
}

/** Orientações que vão para a IA: direção de arte do estilo + o que o usuário escreveu. */
export const orientacaoComEstilo = (estilo: CardEstilo | null, texto: string) =>
  (estilo ? `${textoDoEstilo(estilo)}\n\n${texto}` : texto).slice(0, 4000);

/** Formato sugerido pela família do estilo. */
export const FORMATO_DA_FAMILIA: Partial<Record<Familia, string>> = { stories: "9:16", banner: "1.91:1", post: "4:5" };
