"use client";

import { ArrowRight, AudioLines, Loader2, MessageSquareText, Mic, MicOff, Music2, Play, Sparkles, Star, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Escolha, Revelar } from "../motion/Escolha";
import { toast } from "../shell/toast";
import { EstiloPicker, type Estilo } from "./EstiloPicker";
import { Palco } from "./Palco";
import { criarVideo, favoritarVoz } from "./actions";
import { Anexos, paraEnvio, type AnexosValor } from "./Anexos";
import type { MarcaResumo } from "@/lib/marcas";
import { comMarca, faltando, Identidade } from "./Identidade";

const FORMATOS = [
  { v: "9:16", l: "Vertical", d: "Reels, Stories, Shorts", w: 18, h: 32 },
  { v: "4:5", l: "Retrato", d: "Feed", w: 24, h: 30 },
  { v: "1:1", l: "Quadrado", d: "Feed", w: 28, h: 28 },
  { v: "16:9", l: "Paisagem", d: "YouTube, site", w: 36, h: 20 },
] as const;
const DURACOES = [10, 15, 20, 30, 45, 60];
const VOZES = [
  { v: "pf_dora", l: "Dora", d: "feminina" },
  { v: "pm_alex", l: "Alex", d: "masculina" },
  { v: "pm_santa", l: "Santa", d: "masculina, grave" },
  { v: "none", l: "Sem voz", d: "só texto e música" },
] as const;
const MUSICAS: [string, string][] = [["auto", "Automática"], ["none", "Sem música"], ["corporate", "Corporativa"], ["technology", "Tecnologia"], ["energetic", "Energética"], ["premium", "Premium"], ["minimal", "Minimalista"], ["emotional", "Emocional"], ["dark", "Dark"]];

export interface VozEl { id: string; nome: string; categoria: string; preview: string | null }

export function NewVideoForm({ produto, musicas, marcas, vozesEl, favoritas: favIniciais }: {
  produto: string; musicas: Record<string, number>; vozesEl: VozEl[]; favoritas: string[];
  marcas: MarcaResumo[];
}) {
  const [anexos, setAnexos] = useState<AnexosValor>({ assets: [], links: [] });
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({
    produto, objetivo: "", descricao: "", publico: "", cta: "", estilo: "premium, moderno, tipografia forte", cores: "",
    duracao: 15, formato: "9:16", voz: "pf_dora", vozNome: "", musica: "auto", efeitos: true, orientacao: "", estiloVisual: "hud" as Estilo, legendas: true,
  });
  const [marcaId, setMarcaId] = useState<string | null>(marcas[0]?.id ?? null);
  const [favoritas, setFavoritas] = useState(favIniciais);
  // favoritas primeiro (na ordem em que foram marcadas), depois o resto como veio do ElevenLabs
  const vozesOrdem = [...vozesEl].sort((a, b) => (favoritas.includes(a.id) ? favoritas.indexOf(a.id) : 1e9) - (favoritas.includes(b.id) ? favoritas.indexOf(b.id) : 1e9));
  const favoritar = async (id: string) => {
    const on = !favoritas.includes(id);
    setFavoritas((x) => (on ? [...x, id] : x.filter((v) => v !== id)));
    const r = await favoritarVoz(id, on);
    if (!r.ok) { toast.err(r.error); setFavoritas((x) => (on ? x.filter((v) => v !== id) : [...x, id])); }
  };
  const falta = faltando(f);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [ouvindo, setOuvindo] = useState<HTMLAudioElement | null>(null);
  const ouvir = (url: string) => { ouvindo?.pause(); const a = new Audio(url); void a.play(); setOuvindo(a); };

  const enviar = () => start(async () => {
    setErro(null);
    const r = await criarVideo({ ...comMarca(f, marcaId), anexos: paraEnvio(anexos) });
    if (!r.ok) return setErro(r.error);
    toast.ok("Na fila: primeiro vem o roteiro para você aprovar");
    router.push(`/studio/${r.data}`);
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="studio-form">
      <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="panel-title">Briefing</div>
        <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Campo id="produto" label="Produto" valor={f.produto} on={(v) => set("produto", v)} max={120} />
          <Campo id="cta" label="Chamada para ação (CTA)" valor={f.cta} on={(v) => set("cta", v)} max={120} ph="Ex.: Teste grátis por 24 horas" />
        </div>
        <div className="field">
          <label className="label" htmlFor="orientacao" style={{ display: "flex", gap: 6, alignItems: "center" }}><MessageSquareText size={14} aria-hidden /> Orientações para a IA (do que se trata, livre)</label>
          <textarea id="orientacao" className="input" rows={5} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={4000}
            placeholder="Ex.: Vídeo mostrando o professor que perde horas no SIAP e descobre que a plataforma faz tudo em minutos. Comece com a dor, mostre a tela do sistema (anexei o print) e termine com o teste grátis. Ritmo rápido, estilo tech, nada de exageros."
            value={f.orientacao} onChange={(e) => set("orientacao", e.target.value)} />
          <span className="subtle caption" style={{ textAlign: "right" }}>{f.orientacao.length}/4000 · a IA segue isto com prioridade, sem inventar fatos</span>
        </div>
        <Campo id="objetivo" label="Objetivo do vídeo (opcional se as orientações explicarem)" valor={f.objetivo} on={(v) => set("objetivo", v)} max={300} ph="Ex.: vender o SIAPLUS para professores da rede estadual de Goiás" />
        <div className="field">
          <label className="label" htmlFor="descricao">Descrição e argumentos (o que a IA pode afirmar)</label>
          <textarea id="descricao" className="input" rows={4} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={2000}
            placeholder="Benefícios, diferenciais, oferta… A IA usa só fatos daqui: não inventa preço, prazo ou estatística."
            value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </div>
        <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Campo id="publico" label="Público" valor={f.publico} on={(v) => set("publico", v)} max={300} ph="Ex.: professores de 25 a 50 anos" />
          <Campo id="cores" label="Cores / identidade" valor={f.cores} on={(v) => set("cores", v)} max={200} ph="Ex.: fundo escuro, verde #D1FE17" />
        </div>
        <Campo id="estilo" label="Estilo" valor={f.estilo} on={(v) => set("estilo", v)} max={300} />
      </div>
      <div className="studio-anexos"><Anexos valor={anexos} onChange={setAnexos} marca={marcas.find((m) => m.id === marcaId) ?? null} /></div>

      <div className="stack studio-lateral" style={{ gap: 16 }}>
        <Identidade marcas={marcas} valor={marcaId} onChange={setMarcaId} />
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel-title">Estilo visual</div>
          <EstiloPicker valor={f.estiloVisual} onChange={(v) => set("estiloVisual", v)} />
          <p className="subtle caption">{f.estiloVisual === "livre" ? "A IA escreve a animação do zero: mais variedade, resultado menos previsível." : "Cenas prontas e testadas (sem texto saindo da tela). A IA escolhe as cenas e escreve os textos; o roteiro passa por você antes."}</p>
          <button type="button" role="switch" aria-checked={f.legendas} className="chave" onClick={() => set("legendas", !f.legendas)} disabled={f.voz === "none"}>
            <span className="chave-trilho"><span className="chave-bola" /></span> Legenda da narração {f.voz === "none" ? "(sem voz)" : f.legendas ? "ligada" : "desligada"}
          </button>
        </div>
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Palco w={FORMATOS.find((x) => x.v === f.formato)!.w} h={FORMATOS.find((x) => x.v === f.formato)!.h} numero={f.duracao} unidade="s"
            legenda={`${f.formato} · ${f.voz === "none" ? "sem voz" : f.voz.startsWith("el:") ? f.vozNome || "ElevenLabs" : VOZES.find((x) => x.v === f.voz)?.l ?? ""}`} />
          <div className="panel-title">Formato</div>
          <Escolha valor={f.formato} className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {FORMATOS.map((x) => (
              <button key={x.v} data-opt={x.v} type="button" className="panel spotlight" aria-pressed={f.formato === x.v} onClick={() => set("formato", x.v)}
                style={{ padding: "12px 6px", display: "grid", justifyItems: "center", gap: 8, cursor: "pointer" }}>
                <span aria-hidden style={{ width: x.w, height: x.h, borderRadius: 4, border: "2px solid currentColor", color: f.formato === x.v ? "rgb(var(--c-glow))" : "rgb(var(--c-text-tertiary))", boxShadow: f.formato === x.v ? "0 0 14px rgb(var(--c-brand) / 0.7)" : "none", transition: "color .3s, box-shadow .4s" }} />
                <b style={{ fontSize: 12.5 }}>{x.v}</b>
                <span className="subtle" style={{ fontSize: 10.5, textAlign: "center", lineHeight: 1.3 }}>{x.d}</span>
              </button>
            ))}
          </Escolha>
          <div className="panel-title" style={{ marginTop: 4 }}>Duração</div>
          <Escolha valor={f.duracao} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
            {DURACOES.map((d) => <button key={d} data-opt={d} type="button" className="chip" data-active={f.duracao === d} onClick={() => set("duracao", d)}>{d} s</button>)}
          </Escolha>
        </div>

        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Mic size={15} aria-hidden /> Voz local (sem custo)</div>
          <Escolha valor={f.voz} className="kpis" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {VOZES.map((x) => (
              <button key={x.v} data-opt={x.v} type="button" className="panel" aria-pressed={f.voz === x.v} onClick={() => set("voz", x.v)}
                style={{ padding: "10px 12px", textAlign: "left", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                {x.v === "none" ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
                <span><b style={{ fontWeight: 600 }}>{x.l}</b><br /><span className="subtle" style={{ fontSize: 11 }}>{x.d}</span></span>
              </button>
            ))}
          </Escolha>
          {vozesEl.length > 0 && <>
            <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}><AudioLines size={15} aria-hidden /> ElevenLabs</div>
            <Escolha valor={f.voz} raio={999} variante="pilula" className="cluster" style={{ gap: 6, maxHeight: 168, overflowY: "auto" }}>
              {vozesOrdem.map((x) => (
                <span key={x.id} data-opt={`el:${x.id}`} className="chip" data-active={f.voz === `el:${x.id}`} style={{ paddingLeft: 4, paddingRight: x.preview ? 4 : undefined }}>
                  <button type="button" className="btn btn-ghost btn-xs" style={{ height: 22, padding: "0 4px" }} onClick={() => void favoritar(x.id)}
                    aria-pressed={favoritas.includes(x.id)} aria-label={`${favoritas.includes(x.id) ? "Desfavoritar" : "Favoritar"} ${x.nome}`} title={favoritas.includes(x.id) ? "Favorita: aparece primeiro" : "Favoritar"}>
                    <Star aria-hidden style={favoritas.includes(x.id) ? { fill: "#F5B70A", color: "#F5B70A" } : { opacity: 0.45 }} />
                  </button>
                  <button type="button" onClick={() => setF((o) => ({ ...o, voz: `el:${x.id}`, vozNome: x.nome.slice(0, 80) }))} style={{ all: "unset", cursor: "pointer" }}
                    title={x.categoria === "cloned" ? "Voz clonada" : x.categoria}>{x.nome}</button>
                  {x.preview && <button type="button" className="btn btn-ghost btn-xs" style={{ height: 22, padding: "0 6px" }} onClick={() => ouvir(x.preview!)} aria-label={`Ouvir ${x.nome}`}><Play aria-hidden /></button>}
                </span>
              ))}
            </Escolha>
          </>}
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}><Music2 size={15} aria-hidden /> Música</div>
          <Escolha valor={f.musica} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
            {MUSICAS.map(([v, l]) => (
              <button key={v} data-opt={v} type="button" className="chip" data-active={f.musica === v} onClick={() => set("musica", v)}
                title={v === "auto" ? "A IA escolhe o clima" : v !== "none" && !musicas[v] ? "Sem música da biblioteca nesta tag: uma trilha original é composta para o vídeo" : undefined}>
                {l}{!!musicas[v] && <span className="subtle" style={{ fontSize: 10.5 }}>{musicas[v]}</span>}
              </button>
            ))}
          </Escolha>
          <Revelar aberto={f.musica !== "none"}><p className="subtle small">Usa uma música da biblioteca com este clima; se não houver, compõe uma trilha original no ritmo do vídeo.</p></Revelar>
          <button type="button" role="switch" aria-checked={f.efeitos} className="chave" onClick={() => set("efeitos", !f.efeitos)}>
            <span className="chave-trilho"><span className="chave-bola" /></span>
            {f.efeitos ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />} Efeitos sonoros {f.efeitos ? "ligados" : "desligados"}
          </button>
        </div>

        {erro && <p className="error-text" role="alert">{erro}</p>}
        <button className="btn btn-primary btn-lg" onClick={enviar} disabled={pend || !!falta} title={falta ?? undefined} data-enter>
          {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Sparkles aria-hidden /> Criar roteiro <ArrowRight className="seta" aria-hidden /></>}
        </button>
        {falta && <p className="subtle caption" role="status" style={{ textAlign: "center", color: "rgb(var(--c-warning))" }}>Para liberar: {falta.toLowerCase()}</p>}
        <p className="subtle caption" style={{ textAlign: "center" }}>Primeiro você aprova o roteiro; depois, de 3 a 8 minutos no PC do worker.</p>
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
