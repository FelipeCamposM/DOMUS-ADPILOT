"use client";

import type { Categoria, Conta, Etiqueta } from "@domus-ads/core/financeiro-db";
import { brl, NATUREZA_ROTULO, NATUREZAS, type Natureza, type TxBase } from "@domus-ads/core/financeiro";
import { gsap } from "gsap";
import { Check, Repeat, Search, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { reduzido } from "../motion/entrar";
import { classificar, virarAssinatura } from "./actions";

export type TxFin = TxBase & { status: string; nota: string | null; categoriaManual: boolean; naturezaManual: boolean };

const diaLongo = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

/** Lista do mês agrupada por dia, com busca e filtros. Clicar abre o editor (categoria, tipo, etiquetas, nota, "aplicar às parecidas"). */
export function Transacoes({ txs, categorias, etiquetas, contas, naturezas, vazio }: {
  txs: TxFin[]; categorias: Categoria[]; etiquetas: Etiqueta[]; contas: Conta[]; naturezas?: Natureza[]; vazio: string;
}) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<string>("");
  const [etq, setEtq] = useState<string>("");
  const [aberta, setAberta] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const conta = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return txs.filter((t) => (!naturezas || naturezas.includes(t.natureza))
      && (!b || t.descricao.toLowerCase().includes(b) || (t.merchant ?? "").toLowerCase().includes(b) || (t.nota ?? "").toLowerCase().includes(b))
      && (!cat || (cat === "_" ? !t.categoria : t.categoria === cat))
      && (!etq || t.etiquetas.includes(etq)));
  }, [txs, naturezas, busca, cat, etq]);

  const dias = useMemo(() => {
    const m = new Map<string, TxFin[]>();
    for (const t of lista) (m.get(t.data) ?? m.set(t.data, []).get(t.data)!).push(t);
    return [...m];
  }, [lista]);

  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const els = ref.current.querySelectorAll(".fin-tx");
    const t = gsap.fromTo([...els].slice(0, 30), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.018, ease: "expo.out", clearProps: "opacity,transform" });
    return () => { t.progress(1).kill(); };
  }, [cat, etq, naturezas]);

  const total = lista.reduce((a, t) => a + (t.tipo === "credito" ? t.valor : -t.valor), 0);
  const cats = [...new Set(txs.map((t) => t.categoria).filter(Boolean))] as string[];

  return (
    <div className="fin-txs">
      <div className="fin-filtros">
        <label className="fin-busca"><Search aria-hidden /><input className="input-sm" placeholder="Buscar descrição, loja ou nota" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar transações" /></label>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          <option value="_">Sem categoria</option>
          {cats.sort().map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" value={etq} onChange={(e) => setEtq(e.target.value)} aria-label="Filtrar por etiqueta">
          <option value="">Todas as etiquetas</option>
          {etiquetas.map((e) => <option key={e.id} value={e.nome}>{e.emoji ? `${e.emoji} ` : ""}{e.nome}</option>)}
        </select>
        <span className="fin-filtros-total tabular">{lista.length} lançamentos · <b className={total < 0 ? "neg" : "pos"}>{brl(total)}</b></span>
      </div>
      {!dias.length && <div className="empty">{vazio}</div>}
      <div ref={ref}>
        {dias.map(([dia, ts]) => (
          <section key={dia} className="fin-dia-grupo">
            <h4>{diaLongo(dia)}<span className="tabular">{brl(ts.reduce((a, t) => a + (t.tipo === "credito" ? t.valor : -t.valor), 0))}</span></h4>
            {ts.map((t) => (
              <div key={t.id}>
                <button className="fin-tx" data-aberta={aberta === t.id || undefined} onClick={() => setAberta(aberta === t.id ? null : t.id)}>
                  <span className="fin-tx-ico" style={{ background: categorias.find((c) => c.nome === t.categoria)?.cor ?? "#3f3a4f" }} aria-hidden>
                    {(t.merchant || t.descricao).trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="fin-tx-txt">
                    <b>{t.merchant || t.descricao}</b>
                    <small>
                      {t.merchant && t.merchant !== t.descricao ? `${t.descricao} · ` : ""}{conta.get(t.contaId)?.apelido || conta.get(t.contaId)?.banco || ""}
                      {t.status === "pendente" && " · pendente"}
                    </small>
                  </span>
                  <span className="fin-tx-tags">
                    {t.totalParcelas && t.totalParcelas > 1 && <span className="fin-pill">{t.parcela}/{t.totalParcelas}</span>}
                    {t.assinaturaId && <span className="fin-pill" title="Assinatura"><Repeat aria-hidden />mensal</span>}
                    {t.natureza !== "gasto" && t.natureza !== "renda" && <span className="fin-pill" data-n={t.natureza}>{NATUREZA_ROTULO[t.natureza]}</span>}
                    {t.etiquetas.map((e) => {
                      const x = etiquetas.find((y) => y.nome === e);
                      return <span key={e} className="fin-pill" style={{ borderColor: x?.cor, color: x?.cor }}>{x?.emoji} {e}</span>;
                    })}
                    {t.categoria ? <span className="fin-pill fin-pill-cat">{t.categoria}</span> : t.natureza === "gasto" && <span className="fin-pill" data-n="sem">sem categoria</span>}
                  </span>
                  <span className={`fin-tx-valor tabular ${t.tipo === "credito" ? "pos" : ""}`}>{t.tipo === "credito" ? "+" : "−"}{brl(t.valor)}</span>
                </button>
                {aberta === t.id && <Editor t={t} categorias={categorias} etiquetas={etiquetas} fechar={() => setAberta(null)} />}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Editor({ t, categorias, etiquetas, fechar }: { t: TxFin; categorias: Categoria[]; etiquetas: Etiqueta[]; fechar: () => void }) {
  const [categoriaId, setCategoriaId] = useState<number | null>(t.categoriaId);
  const [natureza, setNatureza] = useState<Natureza>(t.natureza);
  const [etqs, setEtqs] = useState<number[]>(etiquetas.filter((e) => t.etiquetas.includes(e.nome)).map((e) => e.id));
  const [nota, setNota] = useState(t.nota ?? "");
  const [parecidas, setParecidas] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [indo, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const tw = gsap.fromTo(ref.current, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.4, ease: "expo.out", clearProps: "height,opacity" });
    return () => { tw.progress(1).kill(); };
  }, []);
  const tipo = natureza === "renda" ? "renda" : "gasto";

  const salvar = () => start(async () => {
    const r = await classificar({
      id: t.id,
      categoriaId: categoriaId !== t.categoriaId ? categoriaId : undefined,
      natureza: natureza !== t.natureza ? natureza : undefined,
      etiquetas: etqs, nota: nota.trim() || null, parecidas,
    });
    if (!r.ok) { setMsg(r.error); return; }
    setMsg(r.data.afetadas > 1 ? `Salvo. ${r.data.afetadas - 1} parecida(s) atualizada(s) e a regra vale para as próximas.` : "Salvo.");
    setTimeout(fechar, 900);
  });

  return (
    <div className="fin-editor" ref={ref}>
      <div className="fin-editor-grade">
        <label>Tipo
          <select className="select" value={natureza} onChange={(e) => setNatureza(e.target.value as Natureza)}>
            {NATUREZAS.map((n) => <option key={n} value={n}>{NATUREZA_ROTULO[n]}</option>)}
          </select>
        </label>
        <label>Categoria
          <select className="select" value={categoriaId ?? ""} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sem categoria</option>
            {categorias.filter((c) => c.tipo === tipo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="fin-editor-nota">Nota
          <input className="input-sm" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: jantar de aniversário" />
        </label>
      </div>
      <div className="fin-editor-etq" role="group" aria-label="Etiquetas">
        {etiquetas.map((e) => {
          const on = etqs.includes(e.id);
          return (
            <button key={e.id} type="button" className="fin-etq" aria-pressed={on} style={{ "--etq": e.cor } as React.CSSProperties}
              onClick={() => setEtqs(on ? etqs.filter((x) => x !== e.id) : [...etqs, e.id])}>
              {e.emoji} {e.nome}{on && <Check aria-hidden />}
            </button>
          );
        })}
        {!etiquetas.length && <span className="subtle caption">Crie etiquetas (ex.: Juju) em Financeiro → Configurações.</span>}
      </div>
      <div className="fin-editor-pe">
        <label className="fin-check"><input type="checkbox" checked={parecidas} onChange={(e) => setParecidas(e.target.checked)} />
          Aplicar às parecidas (histórico e próximas: “{t.descricao.replace(/\d+/g, "").trim().slice(0, 40)}”)</label>
        <span className="cluster" style={{ gap: 8 }}>
          {msg && <span className="caption subtle" role="status">{msg}</span>}
          {t.tipo === "debito" && !t.assinaturaId && !(t.totalParcelas && t.totalParcelas > 1) && (
            <button className="btn btn-ghost btn-sm" disabled={indo} onClick={() => start(async () => { const r = await virarAssinatura(t.id); setMsg(r.ok ? "Virou assinatura." : r.error); })}>
              <Repeat aria-hidden />É assinatura
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={fechar}><X aria-hidden />Fechar</button>
          <button className="btn btn-primary btn-sm" disabled={indo} onClick={salvar}><Check aria-hidden />{indo ? "Salvando…" : "Salvar"}</button>
        </span>
      </div>
    </div>
  );
}
