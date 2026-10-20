"use client";

import { MUSICA_TAGS, PROMPT_MUSICA, PROMPT_SFX, SFX_CATEGORIAS } from "@domus-ads/core/video";
import { ChevronDown, Loader2, Music2, Pause, Pencil, Play, Sparkles, Star, Trash2, Upload, Waves } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { confirmar } from "../shell/confirmar";
import { toast } from "../shell/toast";
import { apagarCriativo, editarAudio, gerarAudioIA } from "./actions";
import { enviarArquivo } from "./upload";

export interface AudioItem { id: string; name: string; tags: string[]; license: string | null; duration_ms: number | null; origem: string | null; favorita: boolean; prompt: string | null }
type Tipo = "MUSIC" | "SFX";

const rotulo = (tipo: Tipo, tag: string) => (tipo === "MUSIC" ? PROMPT_MUSICA[tag as keyof typeof PROMPT_MUSICA]?.nome : PROMPT_SFX[tag as keyof typeof PROMPT_SFX]?.nome) ?? tag;
const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Biblioteca de áudio: músicas por clima e efeitos por categoria (é assim que os vídeos escolhem). Um player só (tocar
 * um para o outro), barra para avançar, favorita por clima (a que os vídeos usam primeiro), renomear e mover de categoria.
 * Falta algo? "Gerar com ElevenLabs" (fica salvo aqui) ou enviar um arquivo licenciado.
 */
export function AudioLibrary({ tipo, itens, podeEditar, gerando }: { tipo: Tipo; itens: AudioItem[]; podeEditar: boolean; gerando: { tag: string }[] }) {
  const router = useRouter();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const [pend, start] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const tags = (tipo === "MUSIC" ? MUSICA_TAGS : SFX_CATEGORIAS) as readonly string[];
  const [ger, setGer] = useState({ tag: tags[0]!, prompt: "", duracao: 60 });

  // enquanto o worker gera, a lista se atualiza sozinha
  useEffect(() => {
    if (!gerando.length) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [gerando.length, router]);
  useEffect(() => () => audio.current?.pause(), []);

  const tocar = (id: string) => {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.addEventListener("timeupdate", () => setPos({ t: audio.current!.currentTime, d: audio.current!.duration || 0 }));
      audio.current.addEventListener("ended", () => setTocando(null));
    }
    const a = audio.current;
    if (tocando === id) { a.pause(); setTocando(null); return; }
    a.src = `/api/creatives/${id}/file`;
    setPos({ t: 0, d: 0 });
    void a.play().catch(() => toast.err("Não deu para tocar este arquivo"));
    setTocando(id);
  };
  const acao = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast.err(r.error ?? "Erro");
    if (msg) toast.ok(msg);
    router.refresh();
  });
  const gerar = (tag: string, prompt = "", duracao?: number) => acao(() => gerarAudioIA({ tipo, tag, prompt, ...(tipo === "MUSIC" ? { duracao: duracao ?? 60 } : {}) }),
    `Gerando ${tipo === "MUSIC" ? "a música" : "o efeito"} no ElevenLabs: aparece aqui em instantes`);

  const grupos = tags.map((t) => ({ tag: t, lista: itens.filter((i) => i.tags[0] === t || (tipo === "MUSIC" && i.tags.includes(t) && !tags.includes(i.tags[0]!))) }));
  const semGrupo = itens.filter((i) => !i.tags.some((t) => tags.includes(t)));

  return (
    <div className="stack" style={{ gap: 14 }}>
      {podeEditar && (
        <div className="panel" data-enter style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Sparkles size={15} aria-hidden /> Gerar com ElevenLabs</div>
          <div className="cluster" style={{ gap: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ minWidth: 160 }}>
              <label className="label" htmlFor={`g-tag-${tipo}`}>{tipo === "MUSIC" ? "Clima" : "Categoria"}</label>
              <select id={`g-tag-${tipo}`} className="select" value={ger.tag} onChange={(e) => setGer({ ...ger, tag: e.target.value })}>
                {tags.map((t) => <option key={t} value={t}>{rotulo(tipo, t)}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label className="label" htmlFor={`g-p-${tipo}`}>Como deve soar (opcional)</label>
              <input id={`g-p-${tipo}`} className="input-sm" maxLength={400} value={ger.prompt} onChange={(e) => setGer({ ...ger, prompt: e.target.value })}
                placeholder={tipo === "MUSIC" ? "Ex.: leve e divertida, com marimba e palmas" : "Ex.: papel sendo colado na mesa"} />
            </div>
            {tipo === "MUSIC" && (
              <div className="field" style={{ width: 110 }}>
                <label className="label" htmlFor="g-dur">Duração</label>
                <select id="g-dur" className="select" value={ger.duracao} onChange={(e) => setGer({ ...ger, duracao: Number(e.target.value) })}>
                  {[30, 60, 90, 120].map((d) => <option key={d} value={d}>{d} s</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-primary btn-sm" disabled={pend} onClick={() => gerar(ger.tag, ger.prompt, ger.duracao)}><Sparkles aria-hidden /> Gerar</button>
          </div>
          <p className="subtle caption">Usa os créditos da sua conta ElevenLabs. {tipo === "MUSIC" ? "A música fica salva e os vídeos com esse clima passam a usá-la (a favorita primeiro)." : "Os vídeos sorteiam entre os efeitos de cada categoria."} Se faltar algo na hora de gerar um vídeo, ele gera e salva aqui sozinho.</p>
          {gerando.length > 0 && <div className="cluster small" style={{ gap: 8 }}><Loader2 size={14} className="animate-spin" aria-hidden /> Gerando: {gerando.map((g) => rotulo(tipo, g.tag)).join(", ")}</div>}
        </div>
      )}

      {[...grupos, ...(semGrupo.length ? [{ tag: "", lista: semGrupo }] : [])].map(({ tag, lista }) => (
        <div key={tag || "outros"} className="panel audio-grupo" data-enter>
          <div className="audio-grupo-topo">
            {tipo === "MUSIC" ? <Music2 size={15} aria-hidden /> : <Waves size={15} aria-hidden />}
            <b>{tag ? rotulo(tipo, tag) : "Sem categoria"}</b>
            <span className="subtle caption">{lista.length ? `${lista.length} ${lista.length === 1 ? "item" : "itens"}` : tipo === "SFX" ? "vazio: os vídeos geram um no ElevenLabs na primeira vez" : "vazio: os vídeos geram uma no ElevenLabs na primeira vez"}</span>
            <span style={{ flex: 1 }} />
            {podeEditar && tag && <button className="btn btn-ghost btn-xs" disabled={pend || gerando.some((g) => g.tag === tag)} onClick={() => gerar(tag)}><Sparkles aria-hidden /> Gerar {lista.length ? "outro" : ""}</button>}
          </div>
          {lista.map((i) => {
            const on = tocando === i.id;
            return (
              <div key={i.id} className="audio-item" data-tocando={on}>
                <button type="button" className="audio-play" onClick={() => tocar(i.id)} aria-label={on ? `Pausar ${i.name}` : `Tocar ${i.name}`}>{on ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}</button>
                <div className="audio-meio">
                  {editando === i.id ? (
                    <input className="input-sm" autoFocus maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)}
                      onBlur={() => { setEditando(null); if (nome.trim() && nome.trim() !== i.name) acao(() => editarAudio(i.id, { nome: nome.trim() })); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditando(null); }} />
                  ) : (
                    <div className="audio-nome">
                      <b title={i.prompt ?? undefined}>{i.name}</b>
                      {i.origem === "elevenlabs" ? <span className="badge badge-brand">ElevenLabs</span> : <span className="badge">Enviado</span>}
                      {i.favorita && <span className="badge" style={{ color: "#F5B70A" }}>Favorita</span>}
                    </div>
                  )}
                  <div className="audio-barra" role="slider" aria-label="Posição" aria-valuemin={0} aria-valuemax={100} aria-valuenow={on && pos.d ? Math.round((pos.t / pos.d) * 100) : 0} tabIndex={on ? 0 : -1}
                    onClick={(e) => { if (!on || !audio.current || !pos.d) return; const r = e.currentTarget.getBoundingClientRect(); audio.current.currentTime = ((e.clientX - r.left) / r.width) * pos.d; }}>
                    <i style={{ width: on && pos.d ? `${(pos.t / pos.d) * 100}%` : "0%" }} />
                  </div>
                </div>
                <span className="subtle caption tabular audio-tempo">{on && pos.d ? `${tempo(pos.t)} / ` : ""}{i.duration_ms ? tempo(i.duration_ms / 1000) : "–"}</span>
                {podeEditar && (
                  <div className="cluster" style={{ gap: 2, flexWrap: "nowrap" }}>
                    {tipo === "MUSIC" && <button type="button" className="btn btn-ghost btn-xs" title={i.favorita ? "Favorita do clima (os vídeos usam esta)" : "Marcar como favorita do clima"} aria-pressed={i.favorita} onClick={() => acao(() => editarAudio(i.id, { favorita: !i.favorita }))}>
                      <Star aria-hidden style={i.favorita ? { fill: "#F5B70A", color: "#F5B70A" } : { opacity: 0.5 }} /></button>}
                    <button type="button" className="btn btn-ghost btn-xs" aria-label="Renomear" onClick={() => { setEditando(i.id); setNome(i.name); }}><Pencil aria-hidden /></button>
                    <label className="audio-mover" title="Mover para outra categoria">
                      <ChevronDown size={13} aria-hidden />
                      <select aria-label="Mover para" value={i.tags[0] ?? ""} onChange={(e) => acao(() => editarAudio(i.id, { tags: [e.target.value] }), "Movido")}>
                        {tags.map((t) => <option key={t} value={t}>{rotulo(tipo, t)}</option>)}
                      </select>
                    </label>
                    <button type="button" className="btn btn-ghost btn-xs" aria-label={`Apagar ${i.name}`} disabled={pend} onClick={async () => (await confirmar(`Apagar “${i.name}”?`)) && acao(() => apagarCriativo(i.id), "Apagado")}><Trash2 aria-hidden /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {podeEditar && <Envio tipo={tipo} tags={tags} />}
    </div>
  );
}

/** Enviar áudio próprio (com licença): fica recolhido, o caminho principal é gerar. */
function Envio({ tipo, tags }: { tipo: Tipo; tags: readonly string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [tag, setTag] = useState(tags[0]!);
  const [licenca, setLicenca] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const enviar = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      setEnviando(f.name);
      try { await enviarArquivo(f, { type: tipo, tags: [tag], license: licenca }); toast.ok(`“${f.name}” enviado`); } catch (e) { toast.err((e as Error).message); break; }
    }
    setEnviando(null);
    if (input.current) input.current.value = "";
    router.refresh();
  };
  return (
    <details className="panel" style={{ padding: 16 }}>
      <summary className="panel-title" style={{ cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}><Upload size={15} aria-hidden /> Enviar {tipo === "MUSIC" ? "música licenciada" : "efeito sonoro"}</summary>
      <div className="cluster" style={{ gap: 8, alignItems: "flex-end", marginTop: 12 }}>
        <select className="select" aria-label="Categoria" value={tag} onChange={(e) => setTag(e.target.value)}>{tags.map((t) => <option key={t} value={t}>{rotulo(tipo, t)}</option>)}</select>
        <input className="input-sm" style={{ flex: 1, minWidth: 220 }} value={licenca} onChange={(e) => setLicenca(e.target.value)} maxLength={200} placeholder="Licença / origem (ex.: Epidemic Sound, autoral)" aria-label="Licença" />
        <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => void enviar(e.target.files)} />
        <button className="btn btn-secondary btn-sm" disabled={!!enviando || licenca.trim().length < 3} onClick={() => input.current?.click()}>
          {enviando ? <><Loader2 className="animate-spin" aria-hidden /> {enviando.slice(0, 24)}</> : <><Upload aria-hidden /> Escolher arquivos</>}
        </button>
      </div>
      <p className="subtle caption" style={{ marginTop: 8 }}>Só envie áudio que você tem direito de usar em anúncios.</p>
    </details>
  );
}
