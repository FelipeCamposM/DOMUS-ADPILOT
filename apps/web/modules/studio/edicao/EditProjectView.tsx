"use client";

import { blocosLegenda, ESTILOS_LEGENDA, REDES, type BriefEdicao, type EstiloLegenda, type PlanoEdicao, type Rede } from "@domus-ads/core/edicao";
import { Captions, Check, ClipboardCheck, Download, Eye, EyeOff, Film, Loader2, Mic, Rocket, Scissors, Sparkles, Square, Trash2, Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BotaoPublicar } from "../../instagram/BotaoPublicar";
import { confirmar } from "../../shell/confirmar";
import { toast } from "../../shell/toast";
import { ajustarComIA, apagarVideo, aprovarEdicao, cancelarVideo } from "../actions";
import { EscolhaLegenda, EscolhaRede, ZonasRede } from "./Zonas";

export interface EdicaoView {
  id: string; status: string; step_detail: string | null; error: string | null; progress: number | null;
  brief: BriefEdicao; plano: PlanoEdicao | null;
  creative: { id: string; duration_ms: number | null; size_bytes: string | null; avisos: string[] } | null;
}

const ETAPAS = [
  { k: "SCRIPTING", l: "Transcrição (Whisper) e plano das animações", i: Mic },
  { k: "COMPOSING", l: "Cortes, legenda e animações", i: Scissors },
  { k: "RENDERING", l: "Render", i: Film },
  { k: "MIXING", l: "Áudio, efeitos e música", i: Sparkles },
  { k: "UPLOADING", l: "Armazenamento", i: Upload },
] as const;
const PARADO = ["NEW", "REVIEW", "READY", "FAILED"];
const TIPO: Record<string, string> = { titulo: "Título", destaque: "Destaque", lista: "Lista", numero: "Número", cta: "CTA", nome: "Nome", emoji: "Emoji" };
const ENTRADA: Record<string, string> = { flip: "vira em 3D", orbita: "órbita 3D", profundidade: "vem do fundo", dobra: "desdobra", pop: "pop", deslize: "desliza" };
const PEDIDOS = ["Zoom de soco quando eu falar a palavra mais importante", "Som de whoosh na entrada de cada título", "Inclina o vídeo em 3D no começo", "Corta as pausas mais secas", "Flash branco na troca de assunto", "Preto e branco nos primeiros 2 segundos"];
const seg = (n: number) => `${n.toFixed(1).replace(".", ",")} s`;
const textoDe = (p: PlanoEdicao["palavras"], i0: number, i1: number) => p.slice(i0, i1 + 1).map((w) => w.w).join(" ");

export function EditProjectView({ p, podeEditar }: { p: EdicaoView; podeEditar: boolean }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [st, setSt] = useState({ status: p.status, step: p.step_detail, error: p.error, progress: p.progress });
  const [verZonas, setVerZonas] = useState(false);
  const [pedido, setPedido] = useState("");
  const [estilo, setEstilo] = useState<EstiloLegenda>(p.brief.estiloLegenda);
  const [rede, setRede] = useState<Rede>(p.brief.rede);
  const [ligadas, setLigadas] = useState(p.brief.legendas);
  // a legenda é editada em trechos fixos (4 palavras), independentes do estilo escolhido
  const trechos = useMemo(() => (p.plano ? blocosLegenda(p.plano.palavras, "karaoke") : []), [p.plano]);
  const [textos, setTextos] = useState(() => trechos.map((b) => textoDe(p.plano!.palavras, b.i0, b.i1)));
  const ovIniciais = () => (p.plano?.overlays ?? []).map((o) => ({ texto: o.texto, sub: o.sub ?? "", itens: o.itens, remover: false }));
  const [ovs, setOvs] = useState(ovIniciais);
  const rodando = !PARADO.includes(st.status);
  const revisao = st.status === "REVIEW";

  useEffect(() => setSt({ status: p.status, step: p.step_detail, error: p.error, progress: p.progress }), [p.status, p.step_detail, p.error, p.progress]);
  useEffect(() => { setTextos(trechos.map((b) => textoDe(p.plano!.palavras, b.i0, b.i1))); setOvs(ovIniciais()); }, [trechos]); // eslint-disable-line react-hooks/exhaustive-deps
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
        if (s.status === "READY") toast.ok("Vídeo pronto"); else if (s.status === "REVIEW") toast.ok("Legenda e animações prontas: revise e aprove"); else if (s.error !== "Cancelado") toast.err(s.error ?? "A edição falhou");
      }
    }, 2000);
    return () => { vivo = false; clearInterval(t); };
  }, [rodando, p.id, router]);

  const mudou = estilo !== p.brief.estiloLegenda || rede !== p.brief.rede || ligadas !== p.brief.legendas
    || textos.some((t, k) => t.trim() !== textoDe(p.plano?.palavras ?? [], trechos[k]!.i0, trechos[k]!.i1))
    || JSON.stringify(ovs) !== JSON.stringify(ovIniciais());
  const fila = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, depois?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast.err(r.error ?? "Erro");
    toast.ok(msg);
    depois?.();
    setSt((s) => ({ ...s, status: "QUEUED", step: "Na fila do worker…", error: null, progress: 0 }));
    router.refresh();
  });
  const aprovar = () => fila(() => aprovarEdicao(p.id, {
    legendas: trechos.flatMap((b, k) => (textos[k]!.trim() !== textoDe(p.plano!.palavras, b.i0, b.i1) ? [{ i0: b.i0, i1: b.i1, texto: textos[k]! }] : [])),
    overlays: ovs, estiloLegenda: estilo, rede, legendasLigadas: ligadas,
  }), revisao ? "Aprovado: gerando o vídeo" : "Gerando com as mudanças");

  const prop = p.brief.formato === "16:9" ? 16 / 9 : p.brief.formato === "1:1" ? 1 : p.brief.formato === "4:5" ? 0.8 : 9 / 16;
  const fonte = !p.creative || revisao;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.8fr) minmax(0, 1.2fr)", gap: 16, alignItems: "start" }} className="studio-view">
      <div className="stack" style={{ gap: 12, position: "sticky", top: 16 }}>
        <div className="panel" data-enter="scale" style={{ padding: 12 }}>
          <div className="edicao-video" style={{ aspectRatio: String(prop), maxHeight: "68vh", maxWidth: `calc(68vh * ${prop})`, width: "100%" }}>
            {rodando ? <Etapas status={st.status} step={st.step} progress={st.progress} />
              : st.status === "FAILED" && !p.creative ? <Etapas status="FAILED" step={null} progress={null} error={st.error} />
              : <video key={fonte ? "fonte" : p.creative!.id + (p.creative!.size_bytes ?? "")} src={`/api/creatives/${fonte ? p.brief.videoId : p.creative!.id}/file`}
                  poster={fonte ? undefined : `/api/creatives/${p.creative!.id}/file?kind=thumb`} controls playsInline style={{ objectFit: "contain" }} />}
            {verZonas && !rodando && <ZonasRede rede={rede} formato={p.brief.formato} />}
          </div>
          <div className="cluster" style={{ marginTop: 10, justifyContent: "space-between", gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => setVerZonas((v) => !v)} disabled={rodando}>{verZonas ? <EyeOff aria-hidden /> : <Eye aria-hidden />} Áreas bloqueadas ({REDES[rede]})</button>
            {p.creative && !revisao && (
              <div className="cluster" style={{ gap: 6 }}>
                <BotaoPublicar tipo="REELS" midias={[p.creative.id]} rotulo="Publicar Reels" />
                <a className="btn btn-secondary btn-xs" href={`/api/creatives/${p.creative.id}/file?download=1`}><Download aria-hidden /> Baixar MP4</a>
              </div>
            )}
          </div>
          {revisao && <p className="subtle caption" style={{ marginTop: 8 }}>Este é o seu vídeo original. A legenda e as animações entram quando você aprovar.</p>}
          {p.plano && <p className="subtle caption" style={{ marginTop: 6 }}>{seg(p.plano.duration)}{p.plano.cortes.length > 1 ? ` · ${p.plano.cortes.length - 1} pausa(s) cortada(s)` : ""} · {p.plano.palavras.length} palavras · legenda {ESTILOS_LEGENDA[p.brief.estiloLegenda].nome}</p>}
          {p.creative?.avisos.map((a) => <p key={a} className="small" style={{ color: "rgb(var(--c-warning))", marginTop: 8 }}>{a}</p>)}
        </div>
        {podeEditar && (
          <div className="cluster" data-enter>
            {rodando && <button className="btn btn-secondary btn-sm" disabled={pend} onClick={() => fila(() => cancelarVideo(p.id), "Edição cancelada")}><Square aria-hidden /> Cancelar</button>}
            <button className="btn btn-ghost btn-sm" disabled={pend || rodando} onClick={async () => (await confirmar("Apagar esta edição e o vídeo final? O vídeo original continua na biblioteca.")) && start(async () => {
              const r = await apagarVideo(p.id);
              if (!r.ok) return toast.err(r.error);
              toast.ok("Edição apagada");
              router.push("/studio");
            })}><Trash2 aria-hidden /> Apagar</button>
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {podeEditar && p.creative && !revisao && (
          <div className="panel" data-enter style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Wand2 size={15} aria-hidden /> Pedir um efeito à IA</div>
            <span className="subtle caption">Só o que você pedir muda; legenda, cortes e o resto ficam como estão. Diga o momento pela fala (“quando eu falo X”) ou pelo tempo.</span>
            <textarea className="input" rows={2} style={{ height: "auto", paddingBlock: 10, resize: "vertical" }} maxLength={2000} value={pedido} onChange={(e) => setPedido(e.target.value)} disabled={rodando}
              placeholder="Ex.: zoom no meu rosto quando eu falar “resultado”, com um som de impacto" />
            <div className="cluster" style={{ gap: 6 }}>
              {PEDIDOS.map((s) => <button key={s} type="button" className="chip" style={{ height: 28 }} disabled={rodando} onClick={() => setPedido((x) => (x ? `${x}; ${s.toLowerCase()}` : s))}>{s}</button>)}
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" disabled={pend || rodando || pedido.trim().length < 3} onClick={() => fila(() => ajustarComIA(p.id, pedido), "Pedido na fila", () => setPedido(""))}>
                {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Wand2 aria-hidden /> Aplicar</>}
              </button>
            </div>
          </div>
        )}

        <div className={revisao ? "panel surge" : "panel"} data-enter style={revisao ? { borderColor: "rgb(var(--c-brand) / 0.6)", boxShadow: "0 0 0 3px rgb(var(--c-brand) / 0.12), 0 0 32px -8px rgb(var(--c-brand) / 0.6)" } : undefined}>
          <div className="panel-head">
            <div>
              <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>{revisao && <ClipboardCheck size={15} aria-hidden />}{revisao ? "Revise a legenda e as animações" : "Legenda e animações"}</div>
              <div className="subtle caption">{!p.plano ? "Aparece quando a transcrição ficar pronta." : revisao ? "Corrija o que a transcrição errou e ajuste as animações. O render só começa quando você aprovar." : "Mude o estilo, a rede ou o texto e gere de novo (sem transcrever outra vez)."}</div>
            </div>
            {podeEditar && p.plano && (
              <button className={revisao ? "btn btn-primary btn-sm" : "btn btn-primary btn-xs"} disabled={pend || rodando || (!revisao && !mudou)} onClick={aprovar}>
                {revisao ? <><Check aria-hidden /> Aprovar e gerar vídeo</> : <><Rocket aria-hidden /> Salvar e gerar</>}
              </button>
            )}
          </div>
          {p.plano && (
            <div className="stack" style={{ padding: 14, gap: 14 }}>
              <div className="stack" style={{ gap: 8 }}>
                <b className="small">Onde vai ser postado</b>
                <EscolhaRede valor={rede} onChange={setRede} disabled={!podeEditar || rodando} />
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <button type="button" role="switch" aria-checked={ligadas} className="chave" disabled={!podeEditar || rodando} onClick={() => setLigadas(!ligadas)}>
                  <span className="chave-trilho"><span className="chave-bola" /></span><Captions aria-hidden /> Legenda {ligadas ? "ligada" : "desligada"}
                </button>
                {ligadas && <EscolhaLegenda valor={estilo} onChange={setEstilo} disabled={!podeEditar || rodando} />}
              </div>

              {ovs.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <b className="small">Animações ({ovs.filter((o) => !o.remover).length})</b>
                  {p.plano.overlays.map((o, i) => (
                    <div key={i} className="panel" style={{ padding: 10, display: "grid", gap: 6, background: "rgb(var(--c-bg-elevated) / 0.5)", opacity: ovs[i]?.remover ? 0.5 : 1 }}>
                      <div className="cluster" style={{ gap: 8 }}>
                        <span className="badge badge-brand">{TIPO[o.tipo] ?? o.tipo}</span>
                        <span className="subtle caption tabular">{seg(o.start)} → {seg(o.end)} · {ENTRADA[o.entrada] ?? o.entrada}</span>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="btn btn-ghost btn-xs" disabled={!podeEditar || rodando} onClick={() => setOvs((x) => x.map((y, j) => (j === i ? { ...y, remover: !y.remover } : y)))}>{ovs[i]?.remover ? "Manter" : "Tirar"}</button>
                      </div>
                      {!ovs[i]?.remover && <>
                        <input className="input-sm" style={{ fontWeight: 650 }} maxLength={90} value={ovs[i]?.texto ?? ""} disabled={!podeEditar || rodando} aria-label={`Texto da animação ${i + 1}`}
                          onChange={(e) => setOvs((x) => x.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)))} />
                        {(o.tipo === "titulo" || o.tipo === "cta" || o.tipo === "nome") && (
                          <input className="input-sm" maxLength={140} value={ovs[i]?.sub ?? ""} placeholder={o.tipo === "nome" ? "Cargo" : "Texto de apoio (opcional)"} disabled={!podeEditar || rodando} aria-label={`Apoio da animação ${i + 1}`}
                            onChange={(e) => setOvs((x) => x.map((y, j) => (j === i ? { ...y, sub: e.target.value } : y)))} />
                        )}
                        {ovs[i]?.itens?.map((it, k) => (
                          <input key={k} className="input-sm" maxLength={60} value={it} disabled={!podeEditar || rodando} aria-label={`Item ${k + 1} da animação ${i + 1}`}
                            onChange={(e) => setOvs((x) => x.map((y, j) => (j === i ? { ...y, itens: y.itens!.map((z, m) => (m === k ? e.target.value : z)) } : y)))} />
                        ))}
                      </>}
                    </div>
                  ))}
                </div>
              )}

              {trechos.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <b className="small">Legenda (transcrição corrigida pela IA)</b>
                  <span className="subtle caption">Edite só o que estiver errado. Apagar um trecho tira ele da legenda (o áudio continua).</span>
                  {trechos.map((b, k) => (
                    <label key={`${b.i0}-${b.i1}`} className="leg-trecho">
                      <span className="subtle caption tabular">{seg(b.s)}</span>
                      <input className="input-sm" maxLength={200} value={textos[k] ?? ""} disabled={!podeEditar || rodando} onChange={(e) => setTextos((x) => x.map((y, j) => (j === k ? e.target.value : y)))} />
                    </label>
                  ))}
                </div>
              )}
              {!trechos.length && <p className="subtle small">Sem fala no vídeo: só as animações entram.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Etapas({ status, step, progress, error }: { status: string; step: string | null; progress: number | null; error?: string | null }) {
  const atual = ETAPAS.findIndex((e) => e.k === status);
  const falhou = status === "FAILED";
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "8%" }}>
      {ETAPAS.map((e, i) => {
        const feito = atual > i && !falhou, agora = i === atual && !falhou, Icon = e.i;
        return (
          <div key={e.k} style={{ display: "flex", alignItems: "center", gap: 10, opacity: feito || agora ? 1 : 0.4 }}>
            <span style={{ width: 28, height: 28, borderRadius: 99, display: "grid", placeItems: "center", flexShrink: 0, background: feito ? "rgb(var(--c-success) / 0.15)" : agora ? "var(--gradient-btn)" : "rgb(var(--c-bg-elevated))", color: feito ? "rgb(var(--c-success))" : "#fff", boxShadow: agora ? "var(--glow-sm)" : "none", animation: agora ? "etapa-pulsa 1.6s var(--ease-in-out) infinite" : undefined }}>
              {feito ? <Check size={14} aria-hidden /> : <Icon size={14} aria-hidden />}
            </span>
            <span className="small" style={{ fontWeight: agora ? 650 : 500 }}>{e.l}</span>
          </div>
        );
      })}
      <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${progress ?? (status === "QUEUED" ? 2 : 0)}%`, background: "var(--gradient-btn)", boxShadow: "0 0 12px rgb(var(--c-brand))" }} /></div>
      <p className={falhou ? "error-text" : "subtle caption"} role={falhou ? "alert" : undefined}>{falhou ? error ?? "A edição falhou" : step ?? "Na fila do worker…"}</p>
    </div>
  );
}
