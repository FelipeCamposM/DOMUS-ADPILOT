"use client";

import { ArrowRight, Loader2, PenLine, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Escolha, Revelar } from "../motion/Escolha";
import { toast } from "../shell/toast";
import type { ContaGoogle } from "@/lib/contas";
import type { MarcaResumo } from "@/lib/marcas";
import { ContaSelect } from "./ContaSelect";
import { criarRascunho } from "./rascunhos";


/** Nova campanha de Pesquisa: a IA escreve a proposta a partir do pedido, ou começa um rascunho em branco. */
export function NovaCampanha({ contas, marcas }: { contas: ContaGoogle[]; marcas: MarcaResumo[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"ia" | "manual">("ia");
  const [f, setF] = useState({ contaId: contas[0]?.id ?? "", marcaId: marcas[0]?.id ?? "", pedido: "", orcamento: "70", url: "", nome: "" });
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((x) => ({ ...x, [k]: v }));
  const moeda = contas.find((c) => c.id === f.contaId)?.currency ?? "BRL";

  const enviar = () => start(async () => {
    setErro(null);
    const r = await criarRascunho(modo === "ia" ? { modo, contaId: f.contaId, marcaId: f.marcaId, pedido: f.pedido, orcamento: f.orcamento, url: f.url } : { modo, contaId: f.contaId, marcaId: f.marcaId, nome: f.nome, orcamento: f.orcamento, url: f.url });
    if (!r.ok) return setErro(r.error);
    toast.ok(modo === "ia" ? "A IA está montando a proposta" : "Rascunho criado");
    router.push(`/campaigns/rascunhos/${r.data}`);
  });

  return (
    <div className="panel" data-enter style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <Escolha valor={modo} raio={999} variante="pilula" className="cluster" style={{ gap: 4, padding: 3, borderRadius: 12, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-bg-surface))", alignSelf: "flex-start" }}>
        <button data-opt="ia" type="button" className="chip" data-active={modo === "ia"} onClick={() => setModo("ia")} style={{ height: 34, border: 0 }}><Sparkles aria-hidden /> Com IA</button>
        <button data-opt="manual" type="button" className="chip" data-active={modo === "manual"} onClick={() => setModo("manual")} style={{ height: 34, border: 0 }}><PenLine aria-hidden /> Manual</button>
      </Escolha>

      <div className="kpis" style={{ gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div className="field">
          <label className="label" htmlFor="conta">Conta do Google Ads</label>
          <ContaSelect id="conta" contas={contas} valor={f.contaId} onChange={(v) => set("contaId", v)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="orc">Orçamento diário ({moeda})</label>
          <input id="orc" className="input" inputMode="decimal" value={f.orcamento} onChange={(e) => set("orcamento", e.target.value)} placeholder="70" />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="marca">Marca anunciada (a IA usa o “sobre”, o tom e as regras dela)</label>
        <select id="marca" className="select" value={f.marcaId} onChange={(e) => set("marcaId", e.target.value)} style={{ maxWidth: 320 }}>
          {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          <option value="">Nenhuma (só o pedido e o site)</option>
        </select>
      </div>

      <Revelar aberto={modo === "ia"}>
        <div className="field" style={{ paddingTop: 2 }}>
          <label className="label" htmlFor="pedido">O que você quer anunciar?</label>
          <textarea id="pedido" className="input" rows={6} maxLength={4000} value={f.pedido} onChange={(e) => set("pedido", e.target.value)}
            placeholder="Ex.: Campanha para vender o SIAPLUS para professores da rede estadual de Goiás. Público: professores que precisam regularizar o SIAP. Oferta: teste grátis de 24 horas. Foco em Goiânia e Anápolis." />
          <span className="subtle caption">A IA monta grupos por intenção, palavras-chave, anúncios responsivos, negativas e extensões. Nada vai para o Google sem você revisar e publicar.</span>
        </div>
      </Revelar>
      <Revelar aberto={modo === "manual"}>
        <div className="field" style={{ paddingTop: 2 }}>
          <label className="label" htmlFor="nome">Nome da campanha</label>
          <input id="nome" className="input" maxLength={120} value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: SIAPLUS · Professores GO · Pesquisa" />
        </div>
      </Revelar>

      <div className="field">
        <label className="label" htmlFor="url">Página de destino {modo === "ia" && <span className="subtle">(opcional: a IA lê a página para escrever os anúncios)</span>}</label>
        <input id="url" className="input" type="url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://seusite.com.br/oferta" />
      </div>

      {erro && <p className="error-text" role="alert">{erro}</p>}
      <button className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start" }} disabled={pend || !f.contaId} onClick={enviar}>
        {pend ? <Loader2 className="animate-spin" aria-hidden /> : modo === "ia" ? <><Sparkles aria-hidden /> Montar proposta com IA <ArrowRight className="seta" aria-hidden /></> : <><PenLine aria-hidden /> Criar rascunho <ArrowRight className="seta" aria-hidden /></>}
      </button>
    </div>
  );
}
