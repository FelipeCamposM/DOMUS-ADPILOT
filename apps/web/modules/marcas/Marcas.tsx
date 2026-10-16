"use client";

import { Loader2, Palette, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { apagarMarca, criarMarca } from "./actions";
import { BrandEditor, type BrandValor } from "./BrandEditor";

export interface MarcaTela { id: string; nome: string; brand: BrandValor }

/** Marcas do workspace (abas) + editor da escolhida. Cada marca tem a própria identidade. */
export function Marcas({ marcas, atual, podeEditar }: { marcas: MarcaTela[]; atual: MarcaTela | null; podeEditar: boolean }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  const criar = () => start(async () => {
    const r = await criarMarca(nova);
    if (!r.ok) return toast.err(r.error);
    setNova("");
    toast.ok("Marca criada: preencha a identidade dela");
    router.push(`/marcas?m=${r.data}`);
  });
  const apagar = (id: string) => start(async () => {
    const r = await apagarMarca(id);
    setConfirmar(false);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Marca apagada");
    router.push("/marcas");
  });

  return (
    <>
      <div className="panel" data-enter style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {marcas.map((m) => (
          <Link key={m.id} href={`/marcas?m=${m.id}`} className="chip" data-active={atual?.id === m.id} aria-current={atual?.id === m.id ? "page" : undefined} style={{ height: 34, gap: 8 }}>
            <span style={{ display: "inline-flex", gap: 2 }}>
              {(m.brand.cores.length ? m.brand.cores.slice(0, 3) : [{ hex: "#555", nome: "" }]).map((c, i) => <i key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c.hex }} />)}
            </span>
            {m.nome}
          </Link>
        ))}
        {podeEditar && (
          <form className="cluster" style={{ gap: 6, marginLeft: "auto" }} onSubmit={(e) => { e.preventDefault(); criar(); }}>
            <input className="input-sm" style={{ width: 200 }} placeholder="Nome da nova marca" value={nova} maxLength={60} onChange={(e) => setNova(e.target.value)} aria-label="Nome da nova marca" />
            <button className="btn btn-secondary btn-xs" disabled={pend || nova.trim().length < 2}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Nova marca</button>
          </form>
        )}
      </div>

      {atual ? (
        <section className="panel" data-enter key={atual.id}>
          <div className="panel-head" style={{ gap: 12 }}>
            <div className="cluster" style={{ gap: 12 }}>
              <span className="icon-tile" style={{ width: 34, height: 34 }}><Palette size={16} aria-hidden /></span>
              <div><div className="panel-title">{atual.nome}</div><div className="subtle caption">Cores, fontes, logo, tom e regras. Escolha esta marca no Studio, nas campanhas e nas legendas do Instagram.</div></div>
            </div>
            {podeEditar && (confirmar ? (
              <span className="cluster" style={{ gap: 6 }}>
                <span className="small">Apagar {atual.nome}? O que já foi criado continua.</span>
                <button className="btn btn-primary btn-xs" style={{ background: "rgb(var(--c-error))" }} disabled={pend} onClick={() => apagar(atual.id)}>Apagar</button>
                <button className="btn btn-ghost btn-xs" onClick={() => setConfirmar(false)}>Cancelar</button>
              </span>
            ) : <button className="btn btn-ghost btn-xs" onClick={() => setConfirmar(true)}><Trash2 aria-hidden /> Apagar marca</button>)}
          </div>
          <div style={{ padding: 18 }}>
            <BrandEditor key={atual.id} marcaId={atual.id} nome={atual.nome} inicial={atual.brand} podeEditar={podeEditar} />
          </div>
        </section>
      ) : (
        <div className="panel empty" data-enter style={{ padding: 40, textAlign: "center" }}>
          <Palette size={28} aria-hidden style={{ opacity: 0.6 }} />
          <p style={{ marginTop: 10 }}><b>Nenhuma marca ainda.</b></p>
          <p className="subtle small">Crie uma marca para cada produto ou cliente (ex.: DOMUS, SIAPLUS) e defina a identidade visual dela.</p>
        </div>
      )}
    </>
  );
}
