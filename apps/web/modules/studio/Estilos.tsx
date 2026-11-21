"use client";

import { Check, Copy, ImagePlus, Loader2, Plus, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { FAMILIAS, type Familia } from "@domus-ads/core/estilos";
import type { CardEstilo } from "@/lib/estilos";
import { enviarArquivo } from "../creatives/upload";
import { Dialog } from "../shell/Dialog";
import { confirmar } from "../shell/confirmar";
import { toast } from "../shell/toast";
import { apagarMeuEstilo, gerarPrevias, salvarEstilo } from "./estilos-actions";

type Aba = "todos" | "3d" | "meus";
/** Para onde "Usar" leva cada família. */
const DESTINO: Record<Familia, string> = { "2d": "motion", "3d": "motion", video: "video", post: "post", stories: "imagem", banner: "imagem", arte: "imagem" };
const usar = (e: CardEstilo) => `/studio/novo?tipo=${DESTINO[e.familia]}&estilo=${e.id}`;
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Biblioteca de estilos do Studio: prontos (com amostra renderizada) e os do workspace (com referências no Drive). */
export function Estilos({ estilos, podeEditar, admin }: { estilos: CardEstilo[]; podeEditar: boolean; admin: boolean }) {
  const [aba, setAba] = useState<Aba>("todos");
  const [familia, setFamilia] = useState<Familia | "">("");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<CardEstilo | "novo" | null>(null);
  const [pend, start] = useTransition();
  const router = useRouter();

  const meus = estilos.filter((e) => !e.pronto);
  const lista = useMemo(() => {
    const t = sem(q.trim());
    return estilos.filter((e) =>
      (aba === "meus" ? !e.pronto : aba === "3d" ? e.familia === "3d" : true)
      && (!familia || e.familia === familia)
      && (!t || sem([e.nome, e.resumo, e.tags.join(" "), FAMILIAS[e.familia]].join(" ")).includes(t)));
  }, [estilos, aba, familia, q]);
  const semPrevia = estilos.filter((e) => e.pronto && !e.previa && e.previaStatus !== "GERANDO");

  const copiar = async (e: CardEstilo) => {
    await navigator.clipboard.writeText(e.prompt);
    toast.ok(`Prompt de “${e.nome}” copiado`);
  };
  const gerar = (chaves: string[]) => start(async () => {
    const r = await gerarPrevias(chaves);
    if (!r.ok) return toast.err(r.error);
    toast.ok(r.data ? `${r.data} amostra(s) na fila do worker` : "Já estão na fila");
    router.refresh();
  });

  return (
    <>
      <div className="est-barra" data-enter>
        <div className="est-abas" role="tablist">
          {([["todos", "Estilos", estilos.length], ["3d", "3D", estilos.filter((e) => e.familia === "3d").length], ["meus", "Meus estilos", meus.length]] as const).map(([v, l, n]) => (
            <button key={v} role="tab" aria-selected={aba === v} data-active={aba === v} onClick={() => setAba(v)}>{l} <span>{n}</span></button>
          ))}
          {podeEditar && <button className="est-novo" onClick={() => setEditando("novo")}><Plus aria-hidden /> Novo estilo</button>}
        </div>
        <div className="est-filtros">
          <select className="input" value={familia} onChange={(e) => setFamilia(e.target.value as Familia | "")} aria-label="Família">
            <option value="">Todas as famílias</option>
            {Object.entries(FAMILIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="est-busca"><Search aria-hidden /><input className="input" placeholder="Buscar estilo" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
      </div>

      {admin && semPrevia.length > 0 && (
        <div className="est-aviso">
          <Sparkles aria-hidden /> {semPrevia.length} estilo(s) pronto(s) sem amostra em vídeo.
          <button className="btn btn-sm" disabled={pend} onClick={() => gerar(semPrevia.map((e) => e.id))}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />} Gerar amostras no worker</button>
        </div>
      )}

      {!lista.length ? (
        <div className="empty" style={{ padding: 48 }}>
          {aba === "meus" && !meus.length ? <>Você ainda não tem estilos. Crie um com as suas referências: elas ficam guardadas no seu Google Drive.
            {podeEditar && <div style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={() => setEditando("novo")}><Plus aria-hidden /> Novo estilo</button></div>}</>
            : "Nenhum estilo com esse filtro."}
        </div>
      ) : (
        <div className="est-grade">
          {lista.map((e, i) => (
            <article key={e.id} className="est-card" data-enter>
              <div className="est-thumb" data-familia={e.familia}>
                <Previa e={e} />
                <div className="est-acoes">
                  <button onClick={() => copiar(e)} title="Copiar o prompt do estilo"><Copy aria-hidden /> Copiar</button>
                  {!e.pronto && podeEditar && <button onClick={() => setEditando(e)} title="Editar">Editar</button>}
                  {e.pronto && admin && e.previaStatus !== "GERANDO" && <button onClick={() => gerar([e.id])} title="Renderizar a amostra de novo"><Wand2 aria-hidden /></button>}
                </div>
                <Link className="est-usar" href={usar(e)}><Plus aria-hidden /> Usar este estilo</Link>
              </div>
              <div className="est-info">
                <div className="est-linha">
                  <strong>{e.nome}</strong>
                  <span className="est-selo" data-meu={!e.pronto}>{e.pronto ? "Do estúdio" : "Seu"}</span>
                  <span className="est-num">{String(i + 1).padStart(3, "0")}</span>
                </div>
                <p>{e.resumo || FAMILIAS[e.familia]}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {editando && <EditarEstilo inicial={editando === "novo" ? null : editando} onClose={() => setEditando(null)} />}
    </>
  );
}

/** Amostra: vídeo renderizado (toca ao passar o mouse), 1ª referência do estilo, ou um cartaz com o nome. */
function Previa({ e }: { e: CardEstilo }) {
  const v = useRef<HTMLVideoElement>(null);
  if (e.previa) return (
    <video ref={v} src={`${e.previa}#t=1.5`} muted loop playsInline preload="metadata"
      onMouseEnter={() => void v.current?.play().catch(() => {})} onMouseLeave={() => v.current?.pause()} />
  );
  const ref = e.refs[0];
  if (ref) return ref.type === "VIDEO"
    ? <video src={`/api/creatives/${ref.id}/file#t=0.5`} muted playsInline preload="metadata" />
    : <img src={`/api/creatives/${ref.id}/file`} alt="" loading="lazy" />;
  return (
    <div className="est-cartaz">
      <span>{FAMILIAS[e.familia]}</span>
      <b>{e.nome}</b>
      {e.previaStatus === "GERANDO" && <em><Loader2 className="animate-spin" aria-hidden /> renderizando amostra…</em>}
      {e.previaStatus === "FALHOU" && <em title={e.previaErro ?? ""}>amostra falhou</em>}
    </div>
  );
}

function EditarEstilo({ inicial, onClose }: { inicial: CardEstilo | null; onClose: () => void }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [f, setF] = useState({ nome: inicial?.nome ?? "", familia: (inicial?.familia ?? "2d") as Familia, resumo: inicial?.resumo ?? "", prompt: inicial?.prompt ?? "", tags: inicial?.tags.join(", ") ?? "" });
  const [refs, setRefs] = useState(inicial?.refs ?? []);
  const [subindo, setSubindo] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const subir = async (files: FileList | null) => {
    const lista = Array.from(files ?? []).filter((x) => /^(image|video)\//.test(x.type)).slice(0, 12 - refs.length);
    setSubindo((n) => n + lista.length);
    await Promise.all(lista.map(async (file) => {
      try {
        const r = await enviarArquivo(file);
        setRefs((x) => [...x, { id: r.id, name: r.name, type: r.type }]);
      } catch (e) { toast.err((e as Error).message); } finally { setSubindo((n) => n - 1); }
    }));
    if (input.current) input.current.value = "";
  };
  const salvar = () => start(async () => {
    const r = await salvarEstilo({ ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), referencias: refs.map((x) => x.id) }, inicial?.id);
    if (!r.ok) return toast.err(r.error);
    toast.ok(refs.length ? "Estilo salvo; as referências vão para o seu Drive" : "Estilo salvo");
    onClose();
    router.refresh();
  });
  const apagar = () => start(async () => {
    if (!inicial || !(await confirmar(`Apagar o estilo “${inicial.nome}”? As referências continuam em Arquivos.`))) return;
    const r = await apagarMeuEstilo(inicial.id);
    if (!r.ok) return toast.err(r.error);
    onClose();
    router.refresh();
  });

  return (
    <Dialog open onClose={onClose} title={inicial ? "Editar estilo" : "Novo estilo"} largo>
      <div className="stack" style={{ gap: 14 }}>
        <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="stack" style={{ gap: 6 }}><span className="label">Nome</span><input className="input" maxLength={60} value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Lançamento neon" /></label>
          <label className="stack" style={{ gap: 6 }}><span className="label">Categoria</span>
            <select className="input" value={f.familia} onChange={(e) => set("familia", e.target.value as Familia)}>
              {Object.entries(FAMILIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="stack" style={{ gap: 6 }}><span className="label">Resumo (aparece no card)</span><input className="input" maxLength={140} value={f.resumo} onChange={(e) => set("resumo", e.target.value)} placeholder="Ex.: fundo preto, verde neon, cortes rápidos" /></label>
        <label className="stack" style={{ gap: 6 }}><span className="label">Direção de arte (o prompt que vai para a IA)</span>
          <textarea className="input" rows={6} maxLength={4000} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} value={f.prompt} onChange={(e) => set("prompt", e.target.value)}
            placeholder="Cores, formas, tipografia, textura, câmera e ritmo do movimento. Quanto mais concreto, mais fiel." />
        </label>
        <label className="stack" style={{ gap: 6 }}><span className="label">Tags (separadas por vírgula)</span><input className="input" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="neon, tech, lançamento" /></label>
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Referências ({refs.length}/12) · imagens ou vídeos que mostram o estilo; ficam no seu Google Drive</span>
          <div className="est-refs">
            {refs.map((r) => (
              <div key={r.id} className="thumb-card" style={{ width: 84, height: 84, position: "relative" }}>
                {r.type === "VIDEO" ? <video src={`/api/creatives/${r.id}/file#t=0.5`} muted preload="metadata" /> : <img src={`/api/creatives/${r.id}/file`} alt={r.name} />}
                <button className="est-ref-x" aria-label={`Tirar ${r.name}`} onClick={() => setRefs((x) => x.filter((y) => y.id !== r.id))}><X aria-hidden /></button>
              </div>
            ))}
            {refs.length < 12 && (
              <button className="est-ref-add" onClick={() => input.current?.click()} disabled={subindo > 0}>
                {subindo ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}<span>{subindo ? "Enviando…" : "Adicionar"}</span>
              </button>
            )}
            <input ref={input} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => void subir(e.target.files)} />
          </div>
        </div>
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          {inicial ? <button className="btn btn-ghost" onClick={apagar} disabled={pend}><Trash2 aria-hidden /> Apagar</button> : <span />}
          <button className="btn btn-primary" onClick={salvar} disabled={pend || subindo > 0}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Salvar estilo</button>
        </div>
      </div>
    </Dialog>
  );
}
