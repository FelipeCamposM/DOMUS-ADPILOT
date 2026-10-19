"use client";

import { MAX_FONTE_MB, MAX_FONTE_S, type EstiloLegenda, type Rede } from "@domus-ads/core/edicao";
import { ArrowRight, CalendarDays, Captions, Eye, EyeOff, Film, Loader2, MessageSquareText, Music2, Scissors, Sparkles, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { MarcaResumo } from "@/lib/marcas";
import { enviarArquivo } from "../../creatives/upload";
import { Escolha } from "../../motion/Escolha";
import { toast } from "../../shell/toast";
import { criarEdicao } from "../actions";
import { comMarca, Identidade } from "../Identidade";
import { EscolhaLegenda, EscolhaRede, ZonasRede } from "./Zonas";

const FORMATOS = [{ v: "9:16", l: "Vertical", r: 9 / 16 }, { v: "4:5", l: "Retrato", r: 4 / 5 }, { v: "1:1", l: "Quadrado", r: 1 }, { v: "16:9", l: "Paisagem", r: 16 / 9 }] as const;
type Formato = (typeof FORMATOS)[number]["v"];
const MUSICAS: [string, string][] = [["none", "Sem música"], ["auto", "Automática"], ["corporate", "Corporativa"], ["technology", "Tecnologia"], ["energetic", "Energética"], ["premium", "Premium"], ["minimal", "Minimalista"], ["emotional", "Emocional"]];

/** Formato mais perto da proporção do vídeo enviado (o vídeo é enquadrado sem distorcer). */
const formatoDe = (w: number, h: number): Formato => FORMATOS.reduce((a, b) => (Math.abs(b.r - w / h) < Math.abs(a.r - w / h) ? b : a)).v;

/**
 * Editar meu vídeo: envia o vídeo (até 3 min), escolhe rede, estilo da legenda e o que a IA faz.
 * O worker transcreve no PC (Whisper), corta as pausas e planeja as animações; você revisa antes do render.
 */
export function NewEditForm({ marcas, item }: { marcas: MarcaResumo[]; item: { id: string; tema: string; quando: string } | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pend, start] = useTransition();
  const [video, setVideo] = useState<{ id: string | null; url: string; nome: string; pct: number; w: number; h: number } | null>(null);
  const [verZonas, setVerZonas] = useState(true);
  const [marcaId, setMarcaId] = useState<string | null>(marcas[0]?.id ?? null);
  const [f, setF] = useState({
    produto: item?.tema.slice(0, 120) ?? "", orientacao: "", formato: "9:16" as Formato, rede: (item ? "instagram" : "todas") as Rede,
    legendas: true, estiloLegenda: "karaoke" as EstiloLegenda, cortarPausas: true, animacoes: true, musica: "none",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const escolher = async (arq: File | undefined) => {
    if (!arq) return;
    if (!/^video\/(mp4|webm|quicktime)$/.test(arq.type)) return toast.err("Envie um vídeo MP4, MOV ou WEBM");
    if (arq.size > MAX_FONTE_MB * 1048576) return toast.err(`Vídeo acima de ${MAX_FONTE_MB / 1024} GB`);
    const url = URL.createObjectURL(arq);
    const meta = await new Promise<{ d: number; w: number; h: number }>((ok) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => ok({ d: v.duration, w: v.videoWidth, h: v.videoHeight });
      v.onerror = () => ok({ d: 0, w: 9, h: 16 });
      v.src = url;
    });
    if (meta.d > MAX_FONTE_S + 1) { URL.revokeObjectURL(url); return toast.err(`O vídeo tem ${Math.round(meta.d)} s: o limite é ${MAX_FONTE_S / 60} minutos`); }
    if (video) URL.revokeObjectURL(video.url);
    setVideo({ id: null, url, nome: arq.name, pct: 0, w: meta.w || 9, h: meta.h || 16 });
    set("formato", formatoDe(meta.w || 9, meta.h || 16));
    if (!f.produto) set("produto", arq.name.replace(/\.[^.]+$/, "").slice(0, 120));
    try {
      const e = await enviarArquivo(arq, { onProgresso: (pct) => setVideo((x) => (x?.url === url ? { ...x, pct } : x)) });
      setVideo((x) => (x?.url === url ? { ...x, id: e.id, pct: 100 } : x));
    } catch (err) {
      toast.err((err as Error).message);
      setVideo((x) => (x?.url === url ? null : x));
    }
    if (input.current) input.current.value = "";
  };

  const falta = !video ? "Envie o vídeo" : !video.id ? "Espere o envio terminar" : f.produto.trim().length < 2 ? "Dê um título ao vídeo" : null;
  const enviar = () => start(async () => {
    const r = await criarEdicao({ ...comMarca({ ...f, videoId: video!.id }, marcaId), calendarioItemId: item?.id ?? null });
    if (!r.ok) return toast.err(r.error);
    toast.ok("Na fila: primeiro a transcrição e as animações para você revisar");
    router.push(`/studio/${r.data}`);
  });
  const prop = FORMATOS.find((x) => x.v === f.formato)!.r;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="studio-form">
      <div className="stack" style={{ gap: 16 }}>
        {item && (
          <div className="panel" data-enter style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", borderColor: "rgb(var(--c-brand) / 0.5)" }}>
            <CalendarDays size={16} aria-hidden />
            <span className="small">Este vídeo vai para o Reels <b>{item.tema}</b> ({item.quando}) do calendário. Pronto, ele vai para a sua aprovação no WhatsApp.</span>
          </div>
        )}
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Film size={15} aria-hidden /> Seu vídeo</div>
          <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm" onChange={(e) => void escolher(e.target.files?.[0])} />
          {!video ? (
            <button type="button" className="solta-quadro" onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void escolher(e.dataTransfer.files[0]); }}>
              <span className="solta-quadro-icone"><UploadCloud size={26} aria-hidden /></span>
              <b style={{ fontWeight: 650, fontSize: 15 }}>Arraste o vídeo aqui ou clique para escolher</b>
              <span className="subtle caption">MP4, MOV ou WEBM · até {MAX_FONTE_S / 60} minutos e {MAX_FONTE_MB / 1024} GB · falando para a câmera ou não</span>
            </button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 220px) 1fr", gap: 16, alignItems: "start" }}>
              <div className="edicao-video" style={{ aspectRatio: String(prop), width: "100%" }}>
                <video src={video.url} muted playsInline controls={false} autoPlay loop />
                {verZonas && <ZonasRede rede={f.rede} formato={f.formato} />}
                {video.pct < 100 && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgb(0 0 0 / 0.55)", zIndex: 3 }}>
                    <b className="tabular" style={{ fontSize: 22 }}>{video.pct}%</b>
                  </div>
                )}
              </div>
              <div className="stack" style={{ gap: 10 }}>
                <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.nome}</b>
                <span className="subtle caption">{video.pct < 100 ? `Enviando… ${video.pct}%` : "Enviado"} · {video.w}×{video.h}</span>
                <div className="cluster" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => setVerZonas((v) => !v)}>{verZonas ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {verZonas ? "Esconder" : "Mostrar"} áreas bloqueadas</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => { URL.revokeObjectURL(video.url); setVideo(null); }}><X aria-hidden /> Trocar vídeo</button>
                </div>
                <p className="subtle caption">Em vermelho: onde a interface da rede cobre o vídeo (perfil, descrição, botões). A legenda e as animações ficam sempre fora daí.</p>
              </div>
            </div>
          )}
        </div>

        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label className="label" htmlFor="ed-titulo">Título ou assunto</label>
            <input id="ed-titulo" className="input" maxLength={120} value={f.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex.: Como o DOMUS cria vídeos sozinho" />
          </div>
          <div className="field">
            <label className="label" htmlFor="ed-orient" style={{ display: "flex", gap: 6, alignItems: "center" }}><MessageSquareText size={14} aria-hidden /> Orientações para a IA (opcional)</label>
            <textarea id="ed-orient" className="input" rows={4} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={4000} value={f.orientacao} onChange={(e) => set("orientacao", e.target.value)}
              placeholder="Ex.: Meu nome é Felipe, sou dono da DOMUS. Destaque o teste grátis no final. Escreva certo: DOMUS AdPilot, SIAPLUS." />
            <span className="subtle caption">Nomes e marcas escritos aqui ajudam a transcrição a acertar a grafia.</span>
          </div>
        </div>
      </div>

      <div className="stack studio-lateral" style={{ gap: 16 }}>
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel-title">Onde vai ser postado</div>
          <EscolhaRede valor={f.rede} onChange={(r) => set("rede", r)} />
          <div className="panel-title" style={{ marginTop: 4 }}>Formato final</div>
          <Escolha valor={f.formato} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
            {FORMATOS.map((x) => <button key={x.v} data-opt={x.v} type="button" className="chip" data-active={f.formato === x.v} onClick={() => set("formato", x.v)}>{x.l} · {x.v}</button>)}
          </Escolha>
          <p className="subtle caption">Proporção diferente da do vídeo: ele entra inteiro, sobre ele mesmo desfocado.</p>
        </div>
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Captions size={15} aria-hidden /> Legenda</div>
          <button type="button" role="switch" aria-checked={f.legendas} className="chave" onClick={() => set("legendas", !f.legendas)}>
            <span className="chave-trilho"><span className="chave-bola" /></span> Legenda automática {f.legendas ? "ligada" : "desligada"}
          </button>
          {f.legendas && <EscolhaLegenda valor={f.estiloLegenda} onChange={(e) => set("estiloLegenda", e)} />}
        </div>
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Sparkles size={15} aria-hidden /> O que a IA faz</div>
          <button type="button" role="switch" aria-checked={f.cortarPausas} className="chave" onClick={() => set("cortarPausas", !f.cortarPausas)}>
            <span className="chave-trilho"><span className="chave-bola" /></span><Scissors aria-hidden /> Cortar as pausas {f.cortarPausas ? "ligado" : "desligado"}
          </button>
          <button type="button" role="switch" aria-checked={f.animacoes} className="chave" onClick={() => set("animacoes", !f.animacoes)}>
            <span className="chave-trilho"><span className="chave-bola" /></span><Sparkles aria-hidden /> Títulos e destaques animados (3D) {f.animacoes ? "ligados" : "desligados"}
          </button>
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}><Music2 size={15} aria-hidden /> Música de fundo</div>
          <Escolha valor={f.musica} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
            {MUSICAS.map(([v, l]) => <button key={v} data-opt={v} type="button" className="chip" data-active={f.musica === v} onClick={() => set("musica", v)}>{l}</button>)}
          </Escolha>
          <p className="subtle caption">Zoom, efeitos sonoros, inclinação 3D e outros efeitos você pede depois, em texto, só onde quiser.</p>
        </div>
        <Identidade marcas={marcas} valor={marcaId} onChange={setMarcaId} />
        <button className="btn btn-primary btn-lg" onClick={enviar} disabled={pend || !!falta} title={falta ?? undefined} data-enter>
          {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Sparkles aria-hidden /> Transcrever e planejar <ArrowRight className="seta" aria-hidden /></>}
        </button>
        {falta && <p className="subtle caption" role="status" style={{ textAlign: "center", color: "rgb(var(--c-warning))" }}>Para liberar: {falta.toLowerCase()}</p>}
        <p className="subtle caption" style={{ textAlign: "center" }}>Transcrição no PC (GPU) em segundos; você revisa a legenda e as animações antes do render.</p>
      </div>
    </div>
  );
}
