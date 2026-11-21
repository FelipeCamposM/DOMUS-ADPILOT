"use client";

import { ArrowRight, FileText, GalleryHorizontal, Image as ImageIco, Loader2, Minus, Plus, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CardEstilo } from "@/lib/estilos";
import { Escolha } from "../motion/Escolha";
import { toast } from "../shell/toast";
import { EstiloPicker, type Estilo } from "./EstiloPicker";
import { Palco } from "./Palco";
import { criarImagem } from "./actions";
import { Anexos, paraEnvio, type AnexosValor } from "./Anexos";
import type { MarcaResumo } from "@/lib/marcas";
import { comMarca, faltando, Identidade } from "./Identidade";
import { anexosComEstilo, Campo, Dobra, FaixaEstilos, FORMATO_DA_FAMILIA, orientacaoComEstilo, Passo } from "./Cria";

const FORMATOS = [
  { v: "1:1", l: "Quadrado", d: "Feed", w: 28, h: 28 },
  { v: "4:5", l: "Retrato", d: "Feed (mais área)", w: 24, h: 30 },
  { v: "9:16", l: "Vertical", d: "Stories, Reels", w: 18, h: 32 },
  { v: "1.91:1", l: "Link", d: "Anúncio com link", w: 38, h: 20 },
] as const;
const MAX_SLIDES = 20; // limite atual do Instagram
const DO_CARROSSEL = ["1:1", "4:5"];

export function NewImageForm({ produto, marcas, estilos = [], estiloInicial = null }: {
  produto: string; marcas: MarcaResumo[];
  estilos?: CardEstilo[]; estiloInicial?: string | null;
}) {
  const inicial = estilos.find((e) => e.id === estiloInicial) ?? null;
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [estilo, setEstilo] = useState<CardEstilo | null>(inicial);
  const [anexos, setAnexos] = useState<AnexosValor>(() => anexosComEstilo({ assets: [], links: [] }, null, inicial));
  const [f, setF] = useState({ produto, objetivo: "", descricao: "", publico: "", cta: "", cores: "", estilo: "premium, moderno, tipografia forte", texto: "", formato: (inicial && FORMATO_DA_FAMILIA[inicial.familia]) ?? "1:1", variacoes: 3, orientacao: "", tipo: "avulsa" as "avulsa" | "carrossel", slides: 5, estiloVisual: "livre" as Estilo });
  const [marcaId, setMarcaId] = useState<string | null>(marcas[0]?.id ?? null);
  const falta = faltando(f);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const carrossel = f.tipo === "carrossel";
  const escolherTipo = (t: "avulsa" | "carrossel") => setF((x) => ({ ...x, tipo: t, formato: t === "carrossel" && !DO_CARROSSEL.includes(x.formato) ? "4:5" : x.formato }));
  const escolherEstilo = (e: CardEstilo | null) => {
    setAnexos((v) => anexosComEstilo(v, estilo, e));
    setEstilo(e);
    const fmt = e && FORMATO_DA_FAMILIA[e.familia];
    if (e) setF((x) => ({ ...x, estiloVisual: "livre", formato: fmt && (!carrossel || DO_CARROSSEL.includes(fmt)) ? fmt : x.formato }));
  };

  const enviar = () => start(async () => {
    setErro(null);
    const r = await criarImagem({ ...comMarca({ ...f, orientacao: orientacaoComEstilo(estilo, f.orientacao) }, marcaId), anexos: paraEnvio(anexos) });
    if (!r.ok) return setErro(r.error);
    toast.ok(carrossel ? "Carrossel na fila: primeiro vêm os slides para você aprovar" : "Na fila: primeiro vêm os conceitos para você aprovar");
    router.push(`/studio/${r.data}`);
  });

  const fmt = FORMATOS.find((x) => x.v === f.formato)!;
  return (
    <div className="cria">
      <div className="cria-faixa"><FaixaEstilos estilos={estilos} familias={["post", "stories", "banner", "arte"]} valor={estilo} onChange={escolherEstilo} /></div>

      <div className="cria-main">
        <Passo n={2} titulo="Descreva a ideia">
          <textarea id="orientacao" className="input cria-ideia" rows={6} maxLength={3200} aria-label="Ideia da arte"
            placeholder="Ex.: Carrossel de 6 slides para a https://www.yourcookies.com: use as fotos dos cookies do site e a paleta do Instagram deles. Capa com gancho, um sabor por slide, CTA para encomendar no último."
            value={f.orientacao} onChange={(e) => set("orientacao", e.target.value)} />
          <div className="cria-linha">
            <Campo id="produto" label="Produto ou marca" valor={f.produto} on={(v) => set("produto", v)} max={120} />
            <Campo id="cta" label="Chamada para ação" valor={f.cta} on={(v) => set("cta", v)} max={120} ph="Ex.: Teste grátis 24h" />
          </div>
        </Passo>

        <Passo n={3} titulo="Logo, fotos ou referências" extra={<span className="subtle caption tabular">{anexos.assets.length + anexos.links.length}/12</span>}>
          <Anexos embutido valor={anexos} onChange={setAnexos} marca={marcas.find((m) => m.id === marcaId) ?? null} />
        </Passo>

        <Dobra titulo="Mais detalhes para a IA" resumo="texto obrigatório, argumentos, público, cores" icone={<FileText aria-hidden />}>
          <Campo id="texto" label="Texto obrigatório na arte" valor={f.texto} on={(v) => set("texto", v)} max={200} ph="Ex.: Seu SIAP em dia em minutos" />
          <Campo id="objetivo" label="Objetivo da arte" valor={f.objetivo} on={(v) => set("objetivo", v)} max={300} ph="Ex.: gerar testes grátis entre professores de Goiás" />
          <div className="field">
            <label className="label" htmlFor="descricao">Argumentos (o que a IA pode afirmar)</label>
            <textarea id="descricao" className="input" rows={3} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={2000}
              placeholder="Benefícios, oferta, diferenciais… A IA só usa fatos daqui, dos anexos e dos links." value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>
          <div className="cria-linha">
            <Campo id="publico" label="Público" valor={f.publico} on={(v) => set("publico", v)} max={300} />
            <Campo id="cores" label="Cores" valor={f.cores} on={(v) => set("cores", v)} max={200} ph="vazio = cores da marca" />
          </div>
          {!estilo && <Campo id="estilo" label="Tom visual" valor={f.estilo} on={(v) => set("estilo", v)} max={300} />}
        </Dobra>
      </div>

      <aside className="cria-lado">
        <section className="panel cria-bloco">
          <Palco w={fmt.w} h={fmt.h} numero={carrossel ? f.slides : f.variacoes}
            unidade={carrossel ? " slides" : f.variacoes === 1 ? " arte" : " artes"} legenda={`${f.formato.replace(".", ",")} · ${carrossel ? "carrossel" : "teste A/B"}`}
            camadas={(carrossel ? f.slides : f.variacoes) - 1} leque={carrossel} />
          <Escolha valor={f.tipo} raio={999} variante="pilula" className="cluster cria-seg">
            {([["avulsa", "Avulsas", ImageIco], ["carrossel", "Carrossel", GalleryHorizontal]] as const).map(([v, l, I]) => (
              <button key={v} data-opt={v} type="button" className="chip" data-active={f.tipo === v} onClick={() => escolherTipo(v)}><I aria-hidden /> {l}</button>
            ))}
          </Escolha>
          <div className="cria-rotulo">Formato</div>
          <Escolha valor={f.formato} raio={999} variante="pilula" className="cluster cria-chips">
            {FORMATOS.map((x) => {
              const off = carrossel && !DO_CARROSSEL.includes(x.v);
              return <button key={x.v} data-opt={x.v} type="button" className="chip" data-active={f.formato === x.v} disabled={off} onClick={() => set("formato", x.v)}
                title={off ? "Carrossel do Instagram: 1:1 ou 4:5" : x.d}>{x.v.replace(".", ",")}</button>;
            })}
          </Escolha>
          {carrossel ? <>
            <div className="cria-rotulo">Slides</div>
            <div className="cluster" style={{ gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-xs" aria-label="Menos um slide" disabled={f.slides <= 2} onClick={() => set("slides", f.slides - 1)}><Minus aria-hidden /></button>
              <b key={f.slides} className="tabular surge-escala" style={{ fontSize: 20, minWidth: 30, textAlign: "center", display: "inline-block" }}>{f.slides}</b>
              <button type="button" className="btn btn-secondary btn-xs" aria-label="Mais um slide" disabled={f.slides >= MAX_SLIDES} onClick={() => set("slides", f.slides + 1)}><Plus aria-hidden /></button>
              <input type="range" min={2} max={MAX_SLIDES} value={f.slides} onChange={(e) => set("slides", Number(e.target.value))} aria-label="Quantidade de slides" style={{ flex: 1, "--pct": `${((f.slides - 2) / (MAX_SLIDES - 2)) * 100}%` } as React.CSSProperties} />
            </div>
          </> : <>
            <div className="cria-rotulo">Variações para teste A/B</div>
            <Escolha valor={f.variacoes} raio={999} variante="pilula" className="cluster cria-chips">
              {[1, 2, 3, 4].map((n) => <button key={n} data-opt={n} type="button" className="chip" data-active={f.variacoes === n} onClick={() => set("variacoes", n)}>{n}</button>)}
            </Escolha>
          </>}
        </section>

        <Identidade marcas={marcas} valor={marcaId} onChange={setMarcaId} />

        {!estilo && (
          <Dobra titulo="Linha visual pronta" resumo={f.estiloVisual === "livre" ? "IA cria do zero" : f.estiloVisual.toUpperCase()} icone={<Wand2 aria-hidden />}>
            <EstiloPicker valor={f.estiloVisual} onChange={(v) => set("estiloVisual", v)} />
          </Dobra>
        )}

        <div className="cria-acao">
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <button className="btn btn-primary btn-lg" onClick={enviar} disabled={pend || !!falta} title={falta ?? undefined}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Sparkles aria-hidden /> {carrossel ? "Planejar carrossel" : "Criar conceitos"} <ArrowRight className="seta" aria-hidden /></>}
          </button>
          <p className="subtle caption" role="status" style={falta ? { color: "rgb(var(--c-warning))" } : undefined}>
            {falta ? `Para liberar: ${falta.toLowerCase()}` : `Você aprova ${carrossel ? "os slides" : "os conceitos"} antes; ~1 min por ${carrossel ? "slide" : "imagem"}.`}
          </p>
        </div>
      </aside>
    </div>
  );
}
