"use client";

import { ArrowRight, GalleryHorizontal, Image as ImageIco, Loader2, MessageSquareText, Minus, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Escolha, Revelar } from "../motion/Escolha";
import { toast } from "../shell/toast";
import { EstiloPicker, type Estilo } from "./EstiloPicker";
import { Palco } from "./Palco";
import { criarImagem } from "./actions";
import { Anexos, paraEnvio, type AnexosValor, type ArquivoLib } from "./Anexos";
import type { MarcaResumo } from "@/lib/marcas";
import { comMarca, faltando, Identidade } from "./Identidade";

const FORMATOS = [
  { v: "1:1", l: "Quadrado", d: "Feed", w: 28, h: 28 },
  { v: "4:5", l: "Retrato", d: "Feed (mais área)", w: 24, h: 30 },
  { v: "9:16", l: "Vertical", d: "Stories, Reels", w: 18, h: 32 },
  { v: "1.91:1", l: "Link", d: "Anúncio com link", w: 38, h: 20 },
] as const;
const MAX_SLIDES = 20; // limite atual do Instagram

export function NewImageForm({ produto, biblioteca, marcas }: {
  produto: string; biblioteca: ArquivoLib[]; marcas: MarcaResumo[];
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [anexos, setAnexos] = useState<AnexosValor>({ assets: [], links: [] });
  const [f, setF] = useState({ produto, objetivo: "", descricao: "", publico: "", cta: "", cores: "", estilo: "premium, moderno, tipografia forte", texto: "", formato: "1:1", variacoes: 3, orientacao: "", tipo: "avulsa" as "avulsa" | "carrossel", slides: 5, estiloVisual: "livre" as Estilo });
  const [marcaId, setMarcaId] = useState<string | null>(marcas[0]?.id ?? null);
  const falta = faltando(f);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const carrossel = f.tipo === "carrossel";
  const escolherTipo = (t: "avulsa" | "carrossel") => setF((x) => ({ ...x, tipo: t, formato: t === "carrossel" && !["1:1", "4:5"].includes(x.formato) ? "4:5" : x.formato }));

  const enviar = () => start(async () => {
    setErro(null);
    const r = await criarImagem({ ...comMarca(f, marcaId), anexos: paraEnvio(anexos) });
    if (!r.ok) return setErro(r.error);
    toast.ok(carrossel ? "Carrossel na fila: primeiro vêm os slides para você aprovar" : "Na fila: primeiro vêm os conceitos para você aprovar");
    router.push(`/studio/${r.data}`);
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="studio-form">
      <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="panel-title">Briefing</div>
        <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Campo id="produto" label="Produto" valor={f.produto} on={(v) => set("produto", v)} max={120} />
          <Campo id="cta" label="Chamada para ação (CTA)" valor={f.cta} on={(v) => set("cta", v)} max={120} ph="Ex.: Teste grátis 24h" />
        </div>
        <div className="field">
          <label className="label" htmlFor="orientacao" style={{ display: "flex", gap: 6, alignItems: "center" }}><MessageSquareText size={14} aria-hidden /> Orientações para a IA (do que se trata, livre)</label>
          <textarea id="orientacao" className="input" rows={5} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={4000}
            placeholder="Ex.: Carrossel de 6 slides para a https://www.yourcookies.com: use as fotos dos cookies do site e a paleta do Instagram deles. Capa com gancho, um sabor por slide, CTA para encomendar no último."
            value={f.orientacao} onChange={(e) => set("orientacao", e.target.value)} />
          <span className="subtle caption" style={{ textAlign: "right" }}>{f.orientacao.length}/4000 · a IA segue isto com prioridade, sem inventar fatos</span>
        </div>
        <Campo id="objetivo" label="Objetivo da arte (opcional se as orientações explicarem)" valor={f.objetivo} on={(v) => set("objetivo", v)} max={300} ph="Ex.: gerar testes grátis entre professores de Goiás" />
        <div className="field">
          <label className="label" htmlFor="descricao">Descrição e argumentos (o que a IA pode afirmar)</label>
          <textarea id="descricao" className="input" rows={3} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={2000}
            placeholder="Benefícios, oferta, diferenciais… A IA só usa fatos daqui, dos anexos e dos links." value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </div>
        <Campo id="texto" label="Texto obrigatório na arte (opcional)" valor={f.texto} on={(v) => set("texto", v)} max={200} ph="Ex.: Seu SIAP em dia em minutos" />
        <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Campo id="publico" label="Público" valor={f.publico} on={(v) => set("publico", v)} max={300} />
          <Campo id="cores" label="Cores (vazio = identidade escolhida)" valor={f.cores} on={(v) => set("cores", v)} max={200} />
        </div>
        <Campo id="estilo" label="Estilo" valor={f.estilo} on={(v) => set("estilo", v)} max={300} />
      </div>
      <div className="studio-anexos"><Anexos valor={anexos} onChange={setAnexos} biblioteca={biblioteca} marca={marcas.find((m) => m.id === marcaId) ?? null} /></div>

      <div className="stack studio-lateral" style={{ gap: 16 }}>
        <Identidade marcas={marcas} valor={marcaId} onChange={setMarcaId} />
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel-title">Estilo visual</div>
          <EstiloPicker valor={f.estiloVisual} onChange={(v) => set("estiloVisual", v)} />
        </div>
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Palco w={FORMATOS.find((x) => x.v === f.formato)!.w} h={FORMATOS.find((x) => x.v === f.formato)!.h} numero={carrossel ? f.slides : f.variacoes}
            unidade={carrossel ? " slides" : f.variacoes === 1 ? " arte" : " artes"} legenda={`${f.formato.replace(".", ",")} · ${carrossel ? "carrossel" : "teste A/B"}`}
            camadas={(carrossel ? f.slides : f.variacoes) - 1} leque={carrossel} />
          <div className="panel-title">Tipo</div>
          <Escolha valor={f.tipo} className="kpis" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["avulsa", "Imagens avulsas", "1 a 4 variações para teste A/B", ImageIco], ["carrossel", "Carrossel", `2 a ${MAX_SLIDES} slides relacionados`, GalleryHorizontal]] as const).map(([v, l, d, I]) => (
              <button key={v} data-opt={v} type="button" className="panel" aria-pressed={f.tipo === v} onClick={() => escolherTipo(v)}
                style={{ padding: "10px 12px", textAlign: "left", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                <I size={18} aria-hidden />
                <span><b style={{ fontWeight: 600 }}>{l}</b><br /><span className="subtle" style={{ fontSize: 11 }}>{d}</span></span>
              </button>
            ))}
          </Escolha>
          <div className="panel-title" style={{ marginTop: 4 }}>Formato</div>
          <Escolha valor={f.formato} className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {FORMATOS.map((x) => (
              <button key={x.v} data-opt={x.v} type="button" className="panel spotlight" aria-pressed={f.formato === x.v} onClick={() => set("formato", x.v)}
                disabled={carrossel && !["1:1", "4:5"].includes(x.v)} title={carrossel && !["1:1", "4:5"].includes(x.v) ? "Carrossel do Instagram: 1:1 ou 4:5" : undefined}
                style={{ padding: "12px 6px", display: "grid", justifyItems: "center", gap: 8, cursor: "pointer", ...(carrossel && !["1:1", "4:5"].includes(x.v) ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>
                <span aria-hidden style={{ width: x.w, height: x.h, borderRadius: 4, border: "2px solid currentColor", color: f.formato === x.v ? "rgb(var(--c-glow))" : "rgb(var(--c-text-tertiary))", boxShadow: f.formato === x.v ? "0 0 14px rgb(var(--c-brand) / 0.7)" : "none", transition: "color .3s, box-shadow .4s" }} />
                <b style={{ fontSize: 12.5 }}>{x.v.replace(".", ",")}</b>
                <span className="subtle" style={{ fontSize: 10.5, textAlign: "center", lineHeight: 1.3 }}>{x.d}</span>
              </button>
            ))}
          </Escolha>
          <Revelar aberto={carrossel}><div className="stack" style={{ gap: 10, paddingTop: 4 }}>
            <div className="panel-title" style={{ marginTop: 4 }}>Slides</div>
            <div className="cluster" style={{ gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-xs" aria-label="Menos um slide" disabled={f.slides <= 2} onClick={() => set("slides", f.slides - 1)}><Minus aria-hidden /></button>
              <b key={f.slides} className="tabular surge-escala" style={{ fontSize: 22, minWidth: 34, textAlign: "center", display: "inline-block" }}>{f.slides}</b>
              <button type="button" className="btn btn-secondary btn-xs" aria-label="Mais um slide" disabled={f.slides >= MAX_SLIDES} onClick={() => set("slides", f.slides + 1)}><Plus aria-hidden /></button>
              <input type="range" min={2} max={MAX_SLIDES} value={f.slides} onChange={(e) => set("slides", Number(e.target.value))} aria-label="Quantidade de slides" style={{ flex: 1, "--pct": `${((f.slides - 2) / (MAX_SLIDES - 2)) * 100}%` } as React.CSSProperties} />
            </div>
            <span className="subtle caption">Capa com gancho → desenvolvimento → CTA no último. Mesmo visual em todos. Você aprova (e pode mudar) os slides antes de gerar.</span>
          </div></Revelar>
          <Revelar aberto={!carrossel}><div className="stack" style={{ gap: 10, paddingTop: 4 }}>
            <div className="panel-title" style={{ marginTop: 4 }}>Variações para teste A/B</div>
            <div className="cluster" style={{ gap: 10 }}>
              <Escolha valor={f.variacoes} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
                {[1, 2, 3, 4].map((n) => <button key={n} data-opt={n} type="button" className="chip" data-active={f.variacoes === n} onClick={() => set("variacoes", n)}>{n}</button>)}
              </Escolha>
              <span className="subtle caption">conceitos diferentes entre si</span>
            </div>
          </div></Revelar>
        </div>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <button className="btn btn-primary btn-lg" onClick={enviar} disabled={pend || !!falta} title={falta ?? undefined} data-enter>
          {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Sparkles aria-hidden /> {carrossel ? "Planejar carrossel" : "Criar conceitos"} <ArrowRight className="seta" aria-hidden /></>}
        </button>
        {falta && <p className="subtle caption" role="status" style={{ textAlign: "center", color: "rgb(var(--c-warning))" }}>Para liberar: {falta.toLowerCase()}</p>}
        <p className="subtle caption" style={{ textAlign: "center" }}>Primeiro você aprova {carrossel ? "os slides" : "os conceitos"}; depois, cerca de 1 minuto por {carrossel ? "slide" : "imagem"} no PC do worker.</p>
      </div>
    </div>
  );
}

function Campo({ id, label, valor, on, max, ph }: { id: string; label: string; valor: string; on: (v: string) => void; max: number; ph?: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" value={valor} onChange={(e) => on(e.target.value)} maxLength={max} placeholder={ph} />
    </div>
  );
}
