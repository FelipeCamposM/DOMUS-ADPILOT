"use client";

import { confirmar } from "../shell/confirmar";
import { gsap } from "gsap";
import { AudioLines, Bookmark, Check, ClipboardCheck, Palette, Clapperboard, Download, FileCode2, Film, Loader2, PenLine, RefreshCw, Rocket, Square, Trash2, Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Escolha } from "../motion/Escolha";
import { BotaoPublicar } from "../instagram/BotaoPublicar";
import { toast } from "../shell/toast";
import { ajustarComIA, apagarVideo, cancelarVideo, gerarDeNovo, regerarComStoryboard, salvarEstilo, trocarVoz } from "./actions";

interface Cena { start: number; end: number; headline: string; subtext?: string; narration?: string; animation?: string; tipo?: string; itens?: string[] }
const TIPO: Record<string, string> = { abertura: "Abertura", titulo: "Título", lista: "Lista", numero: "Número", comparacao: "Antes/depois", produto: "Produto", citacao: "Depoimento", cta: "CTA" };
const editavel = (s: Cena) => ({ headline: s.headline, subtext: s.subtext ?? "", narration: s.narration ?? "", ...(s.itens ? { itens: [...s.itens] } : {}) });
export interface ProjetoView {
  id: string; title: string; status: string; step_detail: string | null; error: string | null; progress: number | null;
  brief: { formato: string; duracao: number; voz: string; vozNome?: string; musica: string; produto: string; estiloVisual?: string };
  storyboard: { scenes: Cena[]; duration: number; music: { tag: string } | null } | null;
  creative: { id: string; duration_ms: number | null; size_bytes: string | null; width: number | null; height: number | null; arquivado: boolean; avisos: string[]; music: string | null } | null;
  thumb: boolean;
  paleta: Paleta | null;
}
interface Paleta { origem: "marca" | "referencias" | "estilo" | "usuario"; marca: string | null; cores: string[]; fonteTitulo: string; fonteTexto: string }
const PAPEIS = ["Fundo", "Destaque", "Texto", "Destaque 2"];

const ETAPAS = [
  { k: "SCRIPTING", l: "Roteiro e storyboard", i: PenLine },
  { k: "VOICE", l: "Narração", i: AudioLines },
  { k: "COMPOSING", l: "Animação (HTML + GSAP)", i: FileCode2 },
  { k: "RENDERING", l: "Render", i: Film },
  { k: "MIXING", l: "Voz, efeitos e música", i: Clapperboard },
  { k: "UPLOADING", l: "Armazenamento", i: Upload },
] as const;
const PARADO = ["NEW", "REVIEW", "READY", "FAILED"];
const MUSICAS: [string, string][] = [["none", "Sem música"], ["corporate", "Corporativa"], ["technology", "Tecnologia"], ["energetic", "Energética"], ["premium", "Premium"], ["minimal", "Minimalista"], ["emotional", "Emocional"], ["dark", "Dark"]];
const VOZ: Record<string, string> = { pf_dora: "Dora", pm_alex: "Alex", pm_santa: "Santa", none: "sem voz" };
const seg = (n: number) => `${n.toFixed(1).replace(".", ",")} s`;

export function ProjectView({ p, podeEditar, vozes }: { p: ProjetoView; podeEditar: boolean; vozes: { id: string; nome: string; fav: boolean }[] }) {
  const router = useRouter();
  const [st, setSt] = useState({ status: p.status, step: p.step_detail, error: p.error, progress: p.progress });
  const [pend, start] = useTransition();
  const [cenas, setCenas] = useState(() => (p.storyboard?.scenes ?? []).map(editavel));
  const [pedido, setPedido] = useState("");
  const [nomeEstilo, setNomeEstilo] = useState("");
  const [novaVoz, setNovaVoz] = useState(() => vozes.find((v) => v.fav && v.id !== p.brief.voz)?.id ?? "");
  const musicaOriginal = p.storyboard?.music?.tag ?? "none";
  const [musica, setMusica] = useState(musicaOriginal);
  const [paleta, setPaleta] = useState(p.paleta);
  const paletaMudou = JSON.stringify(paleta) !== JSON.stringify(p.paleta);
  const paletaOk = !paleta || paleta.cores.every((c) => /^#[0-9a-fA-F]{6}$/.test(c));
  const rodando = !PARADO.includes(st.status);
  const revisao = st.status === "REVIEW";
  const alterado = JSON.stringify(cenas) !== JSON.stringify((p.storyboard?.scenes ?? []).map(editavel));

  useEffect(() => setSt({ status: p.status, step: p.step_detail, error: p.error, progress: p.progress }), [p.status, p.step_detail, p.error, p.progress]);
  useEffect(() => setCenas((p.storyboard?.scenes ?? []).map(editavel)), [p.storyboard]);
  useEffect(() => setMusica(musicaOriginal), [musicaOriginal]);
  useEffect(() => setPaleta(p.paleta), [p.paleta]);

  // Acompanha a geração ao vivo; ao terminar, recarrega os dados (player, storyboard novo).
  useEffect(() => {
    if (!rodando) return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await fetch(`/api/studio/${p.id}`, { cache: "no-store" });
      if (!vivo || !r.ok) return;
      const s = (await r.json()) as { status: string; step_detail: string | null; error: string | null; progress: number | null };
      setSt({ status: s.status, step: s.step_detail, error: s.error, progress: s.progress });
      if (PARADO.includes(s.status)) {
        router.refresh();
        if (s.status === "READY") toast.ok("Vídeo pronto"); else if (s.status === "REVIEW") toast.ok("Roteiro pronto: revise e aprove"); else if (s.error !== "Cancelado") toast.err(s.error ?? "A geração falhou");
      }
    }, 2000);
    return () => { vivo = false; clearInterval(t); };
  }, [rodando, p.id, router]);

  const acao = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, depois?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast.err(r.error ?? "Erro");
    toast.ok(msg);
    depois?.();
    setSt((s) => ({ ...s, status: "QUEUED", step: "Na fila do worker…", error: null, progress: 0 }));
    router.refresh();
  });

  const proporcao = p.creative?.width && p.creative.height ? p.creative.width / p.creative.height : p.brief.formato === "16:9" ? 16 / 9 : p.brief.formato === "1:1" ? 1 : p.brief.formato === "4:5" ? 0.8 : 9 / 16;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.8fr) minmax(0, 1.2fr)", gap: 16, alignItems: "start" }} className="studio-view">
      <div className="stack" style={{ gap: 12, position: "sticky", top: 16 }}>
        <div className="panel" data-enter="scale" style={{ padding: 12 }}>
          <div style={{ position: "relative", width: "100%", maxHeight: "68vh", aspectRatio: String(proporcao), margin: "0 auto", borderRadius: 12, overflow: "hidden", background: "rgb(var(--c-bg-inset))", maxWidth: `calc(68vh * ${proporcao})` }}>
            {revisao && !p.creative ? (
              <div key="revisao" className="surge" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center", gap: 12, padding: "10%", textAlign: "center" }}>
                <span className="icon-tile" style={{ width: 52, height: 52, boxShadow: "var(--glow-sm)" }}><ClipboardCheck size={24} aria-hidden /></span>
                <b>Esperando sua aprovação</b>
                <span className="subtle small">O roteiro está ao lado. Nada de voz, animação ou render foi gerado ainda: só depois que você aprovar.</span>
              </div>
            ) : p.creative && !rodando ? (
              <video key={p.creative.id + (p.creative.size_bytes ?? "")} className="surge" src={`/api/creatives/${p.creative.id}/file`} poster={p.thumb ? `/api/creatives/${p.creative.id}/file?kind=thumb` : undefined}
                controls playsInline style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            ) : (
              <Progresso status={st.status} step={st.step} progress={st.progress} error={st.error} />
            )}
          </div>
          {p.creative?.arquivado && (
            <p className="subtle small" style={{ marginTop: 10 }}>Este vídeo estava arquivado no Drive e está sendo restaurado (o worker do PC precisa estar ligado). Recarregue a página em alguns segundos.</p>
          )}
          {p.creative && (
            <div className="cluster" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <span className="subtle caption">
                {[p.creative.duration_ms && seg(p.creative.duration_ms / 1000), p.creative.width && `${p.creative.width}×${p.creative.height}`, p.creative.size_bytes && `${(Number(p.creative.size_bytes) / 1048576).toFixed(1).replace(".", ",")} MB`, `voz ${VOZ[p.brief.voz] ?? (p.brief.vozNome || p.brief.voz)}`, p.creative.music ? `música: ${p.creative.music}` : null].filter(Boolean).join(" · ")}
              </span>
              <div className="cluster" style={{ gap: 6 }}>
                <BotaoPublicar tipo="REELS" midias={[p.creative.id]} rotulo="Publicar Reels" />
                <a className="btn btn-secondary btn-xs" href={`/api/creatives/${p.creative.id}/file?download=1`}><Download aria-hidden /> Baixar MP4</a>
              </div>
            </div>
          )}
          {p.creative?.avisos.map((a) => <p key={a} className="small" style={{ color: "rgb(var(--c-warning))", marginTop: 8 }}>{a}</p>)}
        </div>
        {podeEditar && (
          <div className="cluster" data-enter>
            {rodando ? (
              <button className="btn btn-secondary btn-sm" disabled={pend} onClick={() => acao(() => cancelarVideo(p.id), "Geração cancelada")}><Square aria-hidden /> Cancelar</button>
            ) : (
              <button className="btn btn-secondary btn-sm" disabled={pend} onClick={async () => (await confirmar("Gerar tudo de novo (roteiro novo)?")) && acao(() => gerarDeNovo(p.id), "Gerando um roteiro novo")}><RefreshCw aria-hidden /> Roteiro novo</button>
            )}
            <button className="btn btn-ghost btn-sm" disabled={pend || rodando} onClick={async () => (await confirmar("Apagar este vídeo e o arquivo final?")) && start(async () => {
              const r = await apagarVideo(p.id);
              if (!r.ok) return toast.err(r.error);
              toast.ok("Vídeo apagado");
              router.push("/studio");
            })}><Trash2 aria-hidden /> Apagar</button>
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {podeEditar && p.creative && !revisao && (
          <div className="panel" data-enter style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Wand2 size={15} aria-hidden /> Ajustar com IA</div>
            <textarea className="input" rows={2} style={{ height: "auto", paddingBlock: 10, resize: "vertical" }} maxLength={2000} value={pedido} onChange={(e) => setPedido(e.target.value)}
              placeholder="Ex.: deixe as transições mais rápidas e o CTA maior; troque o fundo por um gradiente roxo" disabled={rodando} />
            <div className="cluster" style={{ gap: 6 }}>
              {["Transições mais rápidas", "Texto maior e mais contraste", "Mais movimento no fundo", "CTA com mais destaque"].map((s) => (
                <button key={s} type="button" className="chip" style={{ height: 28 }} onClick={() => setPedido((x) => (x ? `${x}; ${s.toLowerCase()}` : s))} disabled={rodando}>{s}</button>
              ))}
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" disabled={pend || rodando || pedido.trim().length < 3} onClick={() => acao(() => ajustarComIA(p.id, pedido), "Ajuste na fila: a narração é mantida", () => setPedido(""))}>
                {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Wand2 aria-hidden /> Aplicar ajuste</>}
              </button>
            </div>
          </div>
        )}

        {podeEditar && p.creative && !revisao && p.brief.estiloVisual === "livre" && (
          <div className="panel" data-enter style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Bookmark size={15} aria-hidden /> Salvar como estilo</div>
            <span className="subtle caption">Gostou do visual? Salve e escolha em Novo vídeo → Estilo visual: a IA repete esta linguagem (texturas, tipografia, movimento) com outro conteúdo e em qualquer formato.</span>
            <div className="cluster" style={{ gap: 6 }}>
              <input className="input-sm" style={{ flex: 1, minWidth: 180 }} maxLength={60} value={nomeEstilo} onChange={(e) => setNomeEstilo(e.target.value)} placeholder="Nome do estilo (ex.: Papel recortado)" disabled={rodando} />
              <button className="btn btn-primary btn-sm" disabled={pend || rodando || nomeEstilo.trim().length < 2} onClick={() => start(async () => {
                const r = await salvarEstilo(p.id, { nome: nomeEstilo });
                if (!r.ok) return toast.err(r.error);
                toast.ok("Estilo salvo: já aparece em Novo vídeo");
                setNomeEstilo("");
              })}><Bookmark aria-hidden /> Salvar estilo</button>
            </div>
          </div>
        )}

        {podeEditar && p.creative && !revisao && vozes.length > 0 && (
          <div className="panel" data-enter style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><AudioLines size={15} aria-hidden /> Trocar só a voz</div>
            <span className="subtle caption">Mesmo roteiro, cores e animação; a narração é regravada e os tempos se ajustam. Agora: {VOZ[p.brief.voz] ?? (p.brief.vozNome || p.brief.voz)}.</span>
            <div className="cluster" style={{ gap: 6 }}>
              <select className="select" style={{ flex: 1, minWidth: 180 }} aria-label="Nova voz" value={novaVoz} onChange={(e) => setNovaVoz(e.target.value)} disabled={rodando}>
                <option value="" disabled>Escolha a voz</option>
                {vozes.map((v) => <option key={v.id} value={v.id} disabled={v.id === p.brief.voz}>{v.fav ? `⭐ ${v.nome}` : v.nome}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" disabled={pend || rodando || !novaVoz || novaVoz === p.brief.voz}
                onClick={() => acao(() => trocarVoz(p.id, novaVoz, novaVoz.startsWith("el:") ? vozes.find((v) => v.id === novaVoz)?.nome ?? "" : ""), "Regravando a narração com a voz nova")}>
                {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><AudioLines aria-hidden /> Trocar voz</>}
              </button>
            </div>
          </div>
        )}

        <div key={revisao ? "rev" : "sb"} className={revisao ? "panel surge" : "panel"} data-enter style={revisao ? { borderColor: "rgb(var(--c-brand) / 0.6)", boxShadow: "0 0 0 3px rgb(var(--c-brand) / 0.12), 0 0 32px -8px rgb(var(--c-brand) / 0.6)" } : undefined}>
          <div className="panel-head">
            <div>
              <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>{revisao && <ClipboardCheck size={15} aria-hidden />}{revisao ? "Aprove o roteiro" : "Storyboard"}</div>
              <div className="subtle caption">{!p.storyboard ? "Aparece quando o roteiro ficar pronto."
                : revisao ? `${p.storyboard.scenes.length} cenas · cerca de ${seg(p.storyboard.duration)}. Edite textos, narração e música se quiser; a geração (voz, animação e render) só começa quando você aprovar.`
                : `${p.storyboard.scenes.length} cenas · ${seg(p.storyboard.duration)}. Edite o texto e gere de novo: voz e tempos se ajustam sozinhos.`}</div>
            </div>
            {podeEditar && p.storyboard && (
              <button className={revisao ? "btn btn-primary btn-sm" : "btn btn-primary btn-xs"} disabled={pend || rodando || !paletaOk || (!revisao && !alterado && !paletaMudou && musica === musicaOriginal)}
                onClick={() => acao(() => regerarComStoryboard(p.id, cenas, musica, paleta && (paletaMudou ? { ...paleta, origem: "usuario" } : paleta)), revisao ? "Aprovado: gerando o vídeo" : "Gerando com o texto novo")}>
                {revisao ? <><Check aria-hidden /> Aprovar e gerar vídeo</> : <><Rocket aria-hidden /> Salvar e gerar</>}
              </button>
            )}
          </div>
          {p.storyboard && (
            <div className="cluster" style={{ padding: "12px 14px 0", gap: 6 }}>
              <span className="subtle caption" style={{ marginRight: 4 }}>Música</span>
              <Escolha valor={musica} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
                {MUSICAS.map(([v, l]) => (
                  <button key={v} data-opt={v} type="button" className="chip" style={{ height: 28 }} data-active={musica === v} disabled={!podeEditar || rodando} onClick={() => setMusica(v)}>{l}</button>
                ))}
              </Escolha>
            </div>
          )}
          {p.storyboard && paleta && <PaletaRevisao valor={paleta} onChange={setPaleta} editavel={podeEditar && !rodando} destaque={revisao} />}
          <div className="stack" style={{ padding: 14, gap: 10 }}>
            {(p.storyboard?.scenes ?? []).map((s, i) => (
              <div key={i} className="panel surge" style={{ padding: 12, display: "grid", gap: 8, background: "rgb(var(--c-bg-elevated) / 0.5)", animationDelay: `${Math.min(i, 10) * 55}ms` }}>
                <div className="cluster" style={{ gap: 8 }}>
                  <span className="badge badge-brand">Cena {i + 1}</span>
                  <span className="subtle caption tabular">{seg(s.start)} → {seg(s.end)}</span>
                  {s.tipo ? <span className="badge">{TIPO[s.tipo] ?? s.tipo}</span> : s.animation && <span className="badge">{s.animation}</span>}
                </div>
                <input className="input-sm" style={{ fontWeight: 650, fontSize: 14 }} aria-label={`Título da cena ${i + 1}`} value={cenas[i]?.headline ?? ""} disabled={!podeEditar || rodando} maxLength={140}
                  onChange={(e) => setCenas((c) => c.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x)))} />
                <input className="input-sm" placeholder="Texto de apoio (opcional)" aria-label={`Apoio da cena ${i + 1}`} value={cenas[i]?.subtext ?? ""} disabled={!podeEditar || rodando} maxLength={220}
                  onChange={(e) => setCenas((c) => c.map((x, j) => (j === i ? { ...x, subtext: e.target.value } : x)))} />
                {cenas[i]?.itens && (
                  <div className="stack" style={{ gap: 6 }}>
                    {cenas[i]!.itens!.map((it, k) => (
                      <input key={k} className="input-sm" aria-label={`Item ${k + 1} da cena ${i + 1}`} value={it} maxLength={90} disabled={!podeEditar || rodando}
                        placeholder={s.tipo === "comparacao" ? ["Como é hoje (ruim)", "Como fica (bom)", "Rótulo do ruim", "Rótulo do bom"][k] : `Item ${k + 1}`}
                        onChange={(e) => setCenas((c) => c.map((x, j) => (j === i ? { ...x, itens: x.itens!.map((y, m) => (m === k ? e.target.value : y)) } : x)))} />
                    ))}
                  </div>
                )}
                {p.brief.voz !== "none" && (
                  <textarea className="input-sm" rows={2} style={{ height: "auto", paddingBlock: 8, resize: "vertical" }} placeholder="Narração" aria-label={`Narração da cena ${i + 1}`}
                    value={cenas[i]?.narration ?? ""} disabled={!podeEditar || rodando} maxLength={600}
                    onChange={(e) => setCenas((c) => c.map((x, j) => (j === i ? { ...x, narration: e.target.value } : x)))} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Etapas do pipeline com a atual brilhando; barra de progresso com o gradiente DOMUS. */
function Progresso({ status, step, progress, error }: { status: string; step: string | null; progress: number | null; error: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const atual = ETAPAS.findIndex((e) => e.k === status);
  useEffect(() => {
    if (!ref.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(ref.current.querySelectorAll("[data-etapa]"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, stagger: 0.06, duration: 0.5, ease: "expo.out" });
  }, []);
  const falhou = status === "FAILED";
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "8%" }}>
      {ETAPAS.map((e, i) => {
        const feito = status === "READY" || (atual > i && !falhou);
        const agora = i === atual && !falhou;
        const Icon = e.i;
        return (
          <div key={e.k} data-etapa style={{ display: "flex", alignItems: "center", gap: 10, opacity: feito || agora ? 1 : 0.4 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 99, display: "grid", placeItems: "center", flexShrink: 0,
              background: feito ? "rgb(var(--c-success) / 0.15)" : agora ? "var(--gradient-btn)" : "rgb(var(--c-bg-elevated))",
              color: feito ? "rgb(var(--c-success))" : "#fff", boxShadow: agora ? "var(--glow-sm)" : "none",
              animation: agora ? "etapa-pulsa 1.6s var(--ease-in-out) infinite" : undefined,
            }}>{feito ? <Check size={14} aria-hidden /> : <Icon size={14} aria-hidden />}</span>
            <span className="small" style={{ fontWeight: agora ? 650 : 500 }}>{e.l}</span>
          </div>
        );
      })}
      <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${progress ?? (status === "QUEUED" ? 2 : 0)}%`, background: "var(--gradient-btn)", boxShadow: "0 0 12px rgb(var(--c-brand))" }} /></div>
      <p className={falhou ? "error-text" : "subtle caption"} role={falhou ? "alert" : undefined}>{falhou ? error ?? "A geração falhou" : step ?? "Na fila do worker…"}</p>
    </div>
  );
}

const ORIGEM: Record<Paleta["origem"], string> = {
  marca: "da marca", referencias: "tirada das referências (links e imagens)", estilo: "padrão do estilo visual (nenhuma marca com cores)", usuario: "ajustada por você",
};

/** Cores e fontes que o vídeo vai usar, conferidas ANTES do render: o que for aprovado aqui é o que entra no vídeo. */
function PaletaRevisao({ valor, onChange, editavel, destaque }: { valor: Paleta; onChange: (p: Paleta) => void; editavel: boolean; destaque: boolean }) {
  const [bg, a, tx] = [valor.cores[0] ?? "#000000", valor.cores[1] ?? "#A855FF", valor.cores[2] ?? "#FFFFFF"];
  const cor = (i: number, hex: string) => onChange({ ...valor, cores: valor.cores.map((c, k) => (k === i ? hex : c)) });
  const alerta = valor.origem !== "marca" && valor.origem !== "usuario";
  const amarelo = "#F5B70A";
  return (
    <div className="panel" style={{ margin: "12px 14px 0", padding: 12, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px", gap: 12, alignItems: "center", ...(destaque && alerta ? { borderColor: amarelo } : {}) }}>
      <div className="stack" style={{ gap: 8, minWidth: 0 }}>
        <div className="small" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Palette size={14} aria-hidden /> <b>Cores do vídeo</b>
          <span className="subtle">· {ORIGEM[valor.origem]}{valor.marca && valor.origem === "marca" ? ` ${valor.marca}` : ""}</span>
        </div>
        {destaque && alerta && <span className="caption" style={{ color: amarelo }}>Não veio de uma marca salva. Confira as cores antes de aprovar.</span>}
        <div className="cluster" style={{ gap: 6 }}>
          {valor.cores.map((c, i) => (
            <label key={i} className="chip" style={{ height: 30, gap: 6, paddingLeft: 4 }} title={PAPEIS[i]}>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#000000"} disabled={!editavel} onChange={(e) => cor(i, e.target.value.toUpperCase())}
                aria-label={`Cor: ${PAPEIS[i]}`} style={{ width: 22, height: 22, border: 0, padding: 0, background: "none", cursor: editavel ? "pointer" : "default" }} />
              <span className="caption subtle">{PAPEIS[i]}</span>
              <input className="mono caption" value={c} maxLength={7} disabled={!editavel} onChange={(e) => cor(i, e.target.value)} aria-label={`Código: ${PAPEIS[i]}`}
                style={{ width: 62, border: 0, background: "none", color: "inherit", outline: "none" }} />
            </label>
          ))}
        </div>
        <div className="cluster caption subtle" style={{ gap: 6 }}>
          Fontes:
          <input className="input-sm" style={{ width: 150, height: 26 }} value={valor.fonteTitulo} maxLength={60} disabled={!editavel} onChange={(e) => onChange({ ...valor, fonteTitulo: e.target.value })} aria-label="Fonte dos títulos" />
          <input className="input-sm" style={{ width: 150, height: 26 }} value={valor.fonteTexto} maxLength={60} disabled={!editavel} onChange={(e) => onChange({ ...valor, fonteTexto: e.target.value })} aria-label="Fonte dos textos" />
        </div>
      </div>
      <div aria-label="Prévia das cores" style={{ aspectRatio: "9 / 12", borderRadius: 10, background: bg, color: tx, padding: 10, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6, border: "1px solid rgb(var(--c-border))" }}>
        <b style={{ fontFamily: `'${valor.fonteTitulo}', system-ui`, fontSize: 13, lineHeight: 1.1 }}>Seu título <span style={{ color: a }}>em destaque</span></b>
        <span style={{ alignSelf: "flex-start", background: a, color: bg, fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999 }}>CTA</span>
      </div>
    </div>
  );
}
