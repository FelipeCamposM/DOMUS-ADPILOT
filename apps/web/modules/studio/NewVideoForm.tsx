"use client";

import { ArrowRight, AudioLines, FileText, Scissors, UserRound, Loader2, Mic, MicOff, Music2, Play, Sparkles, Star, Volume2, VolumeX, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CardEstilo } from "@/lib/estilos";
import { Escolha, Revelar } from "../motion/Escolha";
import { toast } from "../shell/toast";
import { EstiloPicker, type Estilo, type EstiloSalvo } from "./EstiloPicker";
import { Palco } from "./Palco";
import { apagarEstilo, criarVideo, favoritarVoz } from "./actions";
import { confirmar } from "../shell/confirmar";
import { Anexos, paraEnvio, type AnexosValor } from "./Anexos";
import type { MarcaResumo } from "@/lib/marcas";
import { comMarca, faltando, Identidade } from "./Identidade";
import { GravarVoz, type VozGravada } from "./GravarVoz";
import { anexosComEstilo, Campo, Dobra, FaixaEstilos, orientacaoComEstilo, Passo } from "./Cria";

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

export function NewVideoForm({ produto, musicas, marcas, vozesEl, favoritas: favIniciais, estilosSalvos = [], motion, estilos = [], estiloInicial = null }: {
  produto: string; musicas: Record<string, number>; vozesEl: VozEl[]; favoritas: string[];
  marcas: MarcaResumo[]; estilosSalvos?: EstiloSalvo[];
  /** aba Motion: animação Livre sem narração por padrão, em 2D (GSAP) ou 3D (Three.js) */
  motion?: boolean;
  /** biblioteca (Studio → Estilos) e o estilo que veio escolhido de lá (?estilo=) */
  estilos?: CardEstilo[]; estiloInicial?: string | null;
}) {
  const inicial = estilos.find((e) => e.id === estiloInicial) ?? null;
  const [estilo, setEstilo] = useState<CardEstilo | null>(inicial);
  const [anexos, setAnexos] = useState<AnexosValor>(() => anexosComEstilo({ assets: [], links: [] }, null, inicial));
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({
    produto, objetivo: "", descricao: "", publico: "", cta: "", estilo: "premium, moderno, tipografia forte", cores: "",
    duracao: 15, formato: "9:16", voz: motion ? "none" : "pf_dora", vozNome: "", musica: "auto", efeitos: true, orientacao: "", estiloVisual: (motion || inicial ? "livre" : "hud") as Estilo, legendas: true,
    estiloSalvo: null as string | null, cortarPausas: true, tresD: !!motion && (inicial ? inicial.familia === "3d" : true),
  });
  const [minhaVoz, setMinhaVoz] = useState<VozGravada | null>(null);
  const propria = f.voz === "propria";
  // narrar com a minha voz: já gravado (o roteiro sai da fala) ou gravar depois lendo o roteiro da IA
  const [lerDepois, setLerDepois] = useState(false);
  const gravada = propria && !lerDepois;
  const [salvos, setSalvos] = useState(estilosSalvos);
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
  const falta = gravada ? (!minhaVoz ? "Grave ou envie a sua voz" : !minhaVoz.id ? "Espere o envio do áudio terminar" : f.produto.trim().length < 2 ? "Informe o produto" : null) : faltando(f);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [ouvindo, setOuvindo] = useState<HTMLAudioElement | null>(null);
  const ouvir = (url: string) => { ouvindo?.pause(); const a = new Audio(url); void a.play(); setOuvindo(a); };

  // estilo da biblioteca: a IA escreve do zero seguindo a direção de arte (sem cenas prontas); 3D liga o Three.js
  const escolherEstilo = (e: CardEstilo | null) => {
    setAnexos((v) => anexosComEstilo(v, estilo, e));
    setEstilo(e);
    if (e) setF((x) => ({ ...x, estiloVisual: "livre", estiloSalvo: null, tresD: motion ? e.familia === "3d" : x.tresD }));
  };

  const enviar = () => start(async () => {
    setErro(null);
    // voz própria: a duração é a da fala (a do briefing só precisa ser válida)
    const voz = propria && lerDepois ? { voz: "falas", lerRoteiro: true, audioProprio: null } : { audioProprio: gravada ? minhaVoz?.id ?? null : null };
    const r = await criarVideo({ ...comMarca({ ...f, ...voz, orientacao: orientacaoComEstilo(estilo, f.orientacao) }, marcaId), anexos: paraEnvio(anexos) });
    if (!r.ok) return setErro(r.error);
    toast.ok("Na fila: primeiro vem o roteiro para você aprovar");
    router.push(`/studio/${r.data}`);
  });

  const nomeVoz = propria ? "sua voz" : f.voz === "none" ? "sem voz" : f.voz.startsWith("el:") ? f.vozNome || "ElevenLabs" : VOZES.find((x) => x.v === f.voz)?.l ?? "";
  const nomeMusica = MUSICAS.find(([v]) => v === f.musica)?.[1] ?? "";
  const fmt = FORMATOS.find((x) => x.v === f.formato)!;

  return (
    <div className="cria">
      <div className="cria-faixa"><FaixaEstilos estilos={estilos} familias={motion ? (f.tresD ? ["3d", "2d"] : ["2d", "3d"]) : ["video", "2d", "3d"]} valor={estilo} onChange={escolherEstilo} /></div>

      <div className="cria-main">
        <Passo n={2} titulo="Descreva a ideia">
          <textarea id="orientacao" className="input cria-ideia" rows={6} maxLength={3200} aria-label="Ideia do vídeo"
            placeholder={motion
              ? "Ex.: Logo da Domus se montando em peças 3D que giram e encaixam; depois a frase “Sites que vendem” e o site no fim. Ritmo rápido, câmera orbitando."
              : "Ex.: Professor que perde horas no SIAP descobre que a plataforma faz tudo em minutos. Comece com a dor, mostre a tela do sistema (anexei o print) e termine com o teste grátis."}
            value={f.orientacao} onChange={(e) => set("orientacao", e.target.value)} />
          <div className="cria-linha">
            <Campo id="produto" label="Produto ou marca" valor={f.produto} on={(v) => set("produto", v)} max={120} />
            <Campo id="cta" label="Chamada para ação" valor={f.cta} on={(v) => set("cta", v)} max={120} ph="Ex.: Teste grátis por 24 horas" />
          </div>
        </Passo>

        <Passo n={3} titulo="Logo, prints ou referências" extra={<span className="subtle caption tabular">{anexos.assets.length + anexos.links.length}/12</span>}>
          <Anexos embutido valor={anexos} onChange={setAnexos} marca={marcas.find((m) => m.id === marcaId) ?? null} />
        </Passo>

        <Dobra titulo="Mais detalhes para a IA" resumo="objetivo, argumentos, público, cores" icone={<FileText aria-hidden />}>
          <Campo id="objetivo" label="Objetivo do vídeo" valor={f.objetivo} on={(v) => set("objetivo", v)} max={300} ph="Ex.: vender o SIAPLUS para professores da rede estadual de Goiás" />
          <div className="field">
            <label className="label" htmlFor="descricao">Argumentos (o que a IA pode afirmar)</label>
            <textarea id="descricao" className="input" rows={3} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={2000}
              placeholder="Benefícios, diferenciais, oferta… A IA usa só fatos daqui: não inventa preço, prazo ou estatística."
              value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>
          <div className="cria-linha">
            <Campo id="publico" label="Público" valor={f.publico} on={(v) => set("publico", v)} max={300} ph="Ex.: professores de 25 a 50 anos" />
            <Campo id="cores" label="Cores" valor={f.cores} on={(v) => set("cores", v)} max={200} ph="vazio = cores da marca" />
          </div>
          {!estilo && <Campo id="estilo" label="Tom visual" valor={f.estilo} on={(v) => set("estilo", v)} max={300} />}
        </Dobra>
      </div>

      <aside className="cria-lado">
        <section className="panel cria-bloco">
          <Palco w={fmt.w} h={fmt.h} numero={gravada ? Math.round(minhaVoz?.dur ?? 0) : f.duracao} unidade="s" legenda={`${f.formato} · ${nomeVoz}`} />
          {motion && (
            <Escolha valor={f.tresD ? "3d" : "2d"} raio={999} variante="pilula" className="cluster cria-seg">
              <button type="button" data-opt="2d" className="chip" data-active={!f.tresD} onClick={() => set("tresD", false)}>2D (GSAP)</button>
              <button type="button" data-opt="3d" className="chip" data-active={f.tresD} onClick={() => set("tresD", true)}>3D (Three.js)</button>
            </Escolha>
          )}
          <div className="cria-rotulo">Formato</div>
          <Escolha valor={f.formato} raio={999} variante="pilula" className="cluster cria-chips">
            {FORMATOS.map((x) => <button key={x.v} data-opt={x.v} type="button" className="chip" data-active={f.formato === x.v} onClick={() => set("formato", x.v)} title={x.d}>{x.v}</button>)}
          </Escolha>
          {gravada ? <p className="subtle caption">Duração: a da sua fala, já sem as pausas.</p> : <>
            <div className="cria-rotulo">Duração</div>
            <Escolha valor={f.duracao} raio={999} variante="pilula" className="cluster cria-chips">
              {DURACOES.map((d) => <button key={d} data-opt={d} type="button" className="chip" data-active={f.duracao === d} onClick={() => set("duracao", d)}>{d} s</button>)}
            </Escolha>
          </>}
        </section>

        <Identidade marcas={marcas} valor={marcaId} onChange={setMarcaId} />

        <Dobra titulo="Narração e música" resumo={`${nomeVoz} · ${nomeMusica}`} icone={<Mic aria-hidden />}>
          <button type="button" className="panel spotlight" aria-pressed={propria} onClick={() => set("voz", propria ? "pf_dora" : "propria")}
            style={{ padding: "12px 14px", textAlign: "left", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", borderColor: propria ? "rgb(var(--c-brand) / 0.7)" : undefined }}>
            <UserRound size={18} aria-hidden />
            <span><b style={{ fontWeight: 650 }}>Narrar com a minha voz</b><br /><span className="subtle" style={{ fontSize: 11.5 }}>grave agora ou depois, lendo o roteiro que a IA escrever</span></span>
          </button>
          <Revelar aberto={propria}>
            <div className="stack" style={{ gap: 10, paddingTop: 2 }}>
              <div className="seg-mini" role="radiogroup" aria-label="Quando gravar">
                <button type="button" role="radio" aria-checked={lerDepois} onClick={() => setLerDepois(true)}>Gravar depois, lendo o roteiro</button>
                <button type="button" role="radio" aria-checked={!lerDepois} onClick={() => setLerDepois(false)}>Já tenho a gravação</button>
              </div>
              {lerDepois
                ? <p className="subtle caption">Na aprovação você grava lendo o roteiro; o AdPilot corta silêncios, tira o chiado e iguala o volume.</p>
                : <GravarVoz valor={minhaVoz} onChange={setMinhaVoz} />}
              <button type="button" role="switch" aria-checked={f.cortarPausas} className="chave" onClick={() => set("cortarPausas", !f.cortarPausas)}>
                <span className="chave-trilho"><span className="chave-bola" /></span><Scissors aria-hidden /> Cortar pausas e respiros
              </button>
            </div>
          </Revelar>
          {!propria && <>
            <div className="cria-rotulo"><Mic aria-hidden /> Voz local (sem custo)</div>
            <Escolha valor={f.voz} raio={999} variante="pilula" className="cluster cria-chips">
              {VOZES.map((x) => (
                <button key={x.v} data-opt={x.v} type="button" className="chip" data-active={f.voz === x.v} onClick={() => set("voz", x.v)} title={x.d}>
                  {x.v === "none" ? <MicOff aria-hidden /> : null}{x.l}
                </button>
              ))}
            </Escolha>
            {vozesEl.length > 0 && <>
              <div className="cria-rotulo"><AudioLines aria-hidden /> ElevenLabs</div>
              <Escolha valor={f.voz} raio={999} variante="pilula" className="cluster" style={{ gap: 6, maxHeight: 150, overflowY: "auto" }}>
                {vozesOrdem.map((x) => (
                  <span key={x.id} data-opt={`el:${x.id}`} className="chip" data-active={f.voz === `el:${x.id}`} style={{ paddingLeft: 4, paddingRight: x.preview ? 4 : undefined }}>
                    <button type="button" className="btn btn-ghost btn-xs" style={{ height: 22, padding: "0 4px" }} onClick={() => void favoritar(x.id)}
                      aria-pressed={favoritas.includes(x.id)} aria-label={`${favoritas.includes(x.id) ? "Desfavoritar" : "Favoritar"} ${x.nome}`}>
                      <Star aria-hidden style={favoritas.includes(x.id) ? { fill: "#F5B70A", color: "#F5B70A" } : { opacity: 0.45 }} />
                    </button>
                    <button type="button" onClick={() => setF((o) => ({ ...o, voz: `el:${x.id}`, vozNome: x.nome.slice(0, 80) }))} style={{ all: "unset", cursor: "pointer" }}
                      title={x.categoria === "cloned" ? "Voz clonada" : x.categoria}>{x.nome}</button>
                    {x.preview && <button type="button" className="btn btn-ghost btn-xs" style={{ height: 22, padding: "0 6px" }} onClick={() => ouvir(x.preview!)} aria-label={`Ouvir ${x.nome}`}><Play aria-hidden /></button>}
                  </span>
                ))}
              </Escolha>
            </>}
          </>}
          <button type="button" role="switch" aria-checked={f.legendas} className="chave" onClick={() => set("legendas", !f.legendas)} disabled={f.voz === "none"}>
            <span className="chave-trilho"><span className="chave-bola" /></span> Legenda da narração
          </button>
          <div className="cria-rotulo"><Music2 aria-hidden /> Música</div>
          <Escolha valor={f.musica} raio={999} variante="pilula" className="cluster cria-chips">
            {MUSICAS.map(([v, l]) => (
              <button key={v} data-opt={v} type="button" className="chip" data-active={f.musica === v} onClick={() => set("musica", v)}
                title={v === "auto" ? "A IA escolhe o clima" : v !== "none" && !musicas[v] ? "Sem música da biblioteca nesta tag: uma trilha original é composta" : undefined}>
                {l}{!!musicas[v] && <span className="subtle" style={{ fontSize: 10.5 }}>{musicas[v]}</span>}
              </button>
            ))}
          </Escolha>
          <button type="button" role="switch" aria-checked={f.efeitos} className="chave" onClick={() => set("efeitos", !f.efeitos)}>
            <span className="chave-trilho"><span className="chave-bola" /></span>{f.efeitos ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />} Efeitos sonoros
          </button>
        </Dobra>

        {!motion && !estilo && (
          <Dobra titulo="Cenas prontas" resumo={f.estiloSalvo ? "estilo salvo" : f.estiloVisual === "livre" ? "IA escreve do zero" : f.estiloVisual.toUpperCase()} icone={<Wand2 aria-hidden />}>
            <EstiloPicker valor={f.estiloVisual} onChange={(v) => set("estiloVisual", v)} salvos={salvos} salvo={f.estiloSalvo} onSalvo={(id) => set("estiloSalvo", id)}
              onApagar={async (id) => {
                if (!(await confirmar("Apagar este estilo salvo? Os vídeos já feitos com ele não mudam."))) return;
                const r = await apagarEstilo(id);
                if (!r.ok) return toast.err(r.error);
                setSalvos((x) => x.filter((e) => e.id !== id));
                if (f.estiloSalvo === id) set("estiloSalvo", null);
              }} />
            <p className="subtle caption">Cenas testadas (texto nunca sai da tela) ou um vídeo seu salvo como estilo. Escolher um estilo da biblioteca acima substitui isto.</p>
          </Dobra>
        )}

        <div className="cria-acao">
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <button className="btn btn-primary btn-lg" onClick={enviar} disabled={pend || !!falta} title={falta ?? undefined}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Sparkles aria-hidden /> Criar roteiro <ArrowRight className="seta" aria-hidden /></>}
          </button>
          <p className="subtle caption" role="status" style={falta ? { color: "rgb(var(--c-warning))" } : undefined}>
            {falta ? `Para liberar: ${falta.toLowerCase()}` : "Você aprova o roteiro antes; depois, 3 a 8 min no worker."}
          </p>
        </div>
      </aside>
    </div>
  );
}
