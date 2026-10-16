"use client";

import { confirmar } from "../shell/confirmar";
import { ArrowDownToLine, ArrowUpToLine, BoxSelect, Copy, Loader2, Redo2, RotateCcw, Save, Trash2, Type, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { salvarEdicao } from "./actions";
import { EDITOR_SCRIPT, EDITOR_STYLE } from "./editor-script";

export interface AssetEmbutido { caminho: string; dados: string }
interface Sel { tag: string; texto: string; temTexto: boolean; fonte: number; cor: string; opacidade: number; rotacao: number; escala: number; pai: boolean }

const NOMES: Record<string, string> = { h1: "Título", h2: "Título", h3: "Título", p: "Texto", span: "Texto", img: "Imagem", svg: "Ilustração", button: "Botão", a: "Botão", div: "Bloco", section: "Seção" };

/**
 * Editor visual da arte: a composição HTML original roda num iframe isolado (sandbox sem allow-same-origin) e o
 * script do editor mexe direto nela. Salvar manda o HTML editado para o worker, que gera o PNG de novo, sem IA.
 */
export function ArtEditor({ projectId, creativeId, html, assets, w, h }: { projectId: string; creativeId: string; html: string; assets: AssetEmbutido[]; w: number; h: number }) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.4);
  const [sel, setSel] = useState<Sel | null>(null);
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [sujo, setSujo] = useState(false);
  const [pend, start] = useTransition();

  // anexos embutidos (o iframe isolado não tem cookie para buscar /api) + script do editor
  const srcDoc = useMemo(() => {
    let doc = html;
    for (const a of [...assets].sort((x, y) => y.caminho.length - x.caminho.length)) doc = doc.split(a.caminho).join(a.dados);
    const extra = `<style id="__ed_style">${EDITOR_STYLE}</style><script id="__ed_script">${EDITOR_SCRIPT}</script>`;
    return doc.includes("</body>") ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/, `${extra}</body>`) : doc + extra;
  }, [html, assets]);

  // escala para caber na tela
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(Math.min(el.clientWidth / w, el.clientHeight / h, 1)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  const cmd = (c: string, kk?: string, v?: unknown) => frame.current?.contentWindow?.postMessage({ __editor: true, cmd: c, k: kk, v }, "*");

  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__editor) return;
      const d = e.data as { t: string; sel?: Sel | null; undo?: boolean; redo?: boolean; html?: string };
      if (d.t === "sel") { setSel(d.sel ?? null); setHist({ undo: !!d.undo, redo: !!d.redo }); if (d.undo) setSujo(true); }
      if (d.t === "html" && d.html) {
        let out = d.html;
        for (const a of assets) out = out.split(a.dados).join(a.caminho); // volta para assets/…, como o worker espera
        start(async () => {
          const r = await salvarEdicao(projectId, creativeId, out);
          if (!r.ok) return toast.err(r.error);
          setSujo(false);
          toast.ok("Salvo: o PC está gerando o PNG novo");
          router.push(`/studio/${projectId}`);
        });
      }
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [assets, creativeId, projectId, router]);

  useEffect(() => {
    if (!sujo) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 16, alignItems: "start" }} className="studio-view">
      <div className="panel" data-enter style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="cluster" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-xs" disabled={!hist.undo} onClick={() => cmd("undo")} title="Desfazer (Ctrl+Z)"><Undo2 aria-hidden /> Desfazer</button>
          <button className="btn btn-ghost btn-xs" disabled={!hist.redo} onClick={() => cmd("redo")} title="Refazer (Ctrl+Shift+Z)"><Redo2 aria-hidden /> Refazer</button>
          <button className="btn btn-secondary btn-xs" onClick={() => cmd("texto")}><Type aria-hidden /> Adicionar texto</button>
          <span style={{ flex: 1 }} />
          <span className="subtle caption tabular">{w}×{h} · {Math.round(k * 100)}%</span>
          <button className="btn btn-ghost btn-xs" onClick={async () => (!sujo || (await confirmar("Sair sem salvar as mudanças?"))) && router.push(`/studio/${projectId}`)}><X aria-hidden /> Cancelar</button>
          <button className="btn btn-primary btn-sm" disabled={pend || !sujo} onClick={() => cmd("exportar")}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Save aria-hidden /> Salvar e gerar PNG</>}
          </button>
        </div>
        <div ref={area} style={{ height: "calc(100vh - 260px)", minHeight: 360, display: "grid", placeItems: "center", background: "rgb(var(--c-bg-inset))", borderRadius: 12, overflow: "hidden",
          backgroundImage: "linear-gradient(45deg, rgb(255 255 255 / 0.03) 25%, transparent 25%, transparent 75%, rgb(255 255 255 / 0.03) 75%), linear-gradient(45deg, rgb(255 255 255 / 0.03) 25%, transparent 25%, transparent 75%, rgb(255 255 255 / 0.03) 75%)",
          backgroundSize: "24px 24px", backgroundPosition: "0 0, 12px 12px" }}>
          <div style={{ width: w * k, height: h * k, boxShadow: "0 20px 60px -20px rgb(0 0 0 / 0.8), 0 0 0 1px rgb(var(--c-border))" }}>
            <iframe ref={frame} title="Arte em edição" srcDoc={srcDoc} sandbox="allow-scripts"
              style={{ width: w, height: h, border: 0, transform: `scale(${k})`, transformOrigin: "0 0", display: "block", background: "#000" }} />
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 12, position: "sticky", top: 16 }}>
        <div className="panel" data-enter style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {!sel ? (
            <>
              <div className="panel-title">Nada selecionado</div>
              <p className="subtle small">Clique em qualquer elemento da arte para selecionar e arraste para mover. A alça roxa no canto muda o tamanho.</p>
            </>
          ) : (
            <>
              <div>
                <div className="panel-title">{NOMES[sel.tag] ?? "Elemento"}</div>
                {sel.texto && <div className="subtle caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{sel.texto}”</div>}
              </div>
              <div className="cluster" style={{ gap: 6 }}>
                <button className="btn btn-ghost btn-xs" disabled={!sel.pai} onClick={() => cmd("pai")} title="Selecionar o grupo em volta (Esc)"><BoxSelect aria-hidden /> Grupo</button>
                <button className="btn btn-ghost btn-xs" onClick={() => cmd("frente")} title="Trazer para frente"><ArrowUpToLine aria-hidden /></button>
                <button className="btn btn-ghost btn-xs" onClick={() => cmd("tras")} title="Enviar para trás"><ArrowDownToLine aria-hidden /></button>
                <button className="btn btn-ghost btn-xs" onClick={() => cmd("duplicar")} title="Duplicar (Ctrl+D)"><Copy aria-hidden /></button>
                <button className="btn btn-ghost btn-xs" onClick={() => cmd("resetar")} title="Voltar posição, tamanho e rotação originais"><RotateCcw aria-hidden /></button>
                <button className="btn btn-ghost btn-xs" onClick={() => cmd("apagar")} title="Apagar (Delete)" style={{ color: "rgb(var(--c-error))" }}><Trash2 aria-hidden /></button>
              </div>
              <Faixa label="Tamanho" valor={sel.escala} min={0.2} max={3} passo={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onMarco={() => cmd("marco")} on={(v) => cmd("live", "escala", v)} />
              <Faixa label="Rotação" valor={sel.rotacao} min={-180} max={180} passo={1} fmt={(v) => `${v}°`} onMarco={() => cmd("marco")} on={(v) => cmd("live", "rotacao", v)} />
              <Faixa label="Opacidade" valor={sel.opacidade} min={0} max={1} passo={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onMarco={() => cmd("marco")} on={(v) => cmd("live", "opacidade", v)} />
              {sel.temTexto && (
                <div className="cluster" style={{ gap: 10 }}>
                  <label className="subtle caption" style={{ display: "grid", gap: 4 }}>Fonte (px)
                    <input className="input-sm tabular" type="number" min={6} max={600} value={sel.fonte} style={{ width: 90 }} onChange={(e) => cmd("prop", "fonte", Number(e.target.value))} />
                  </label>
                  <label className="subtle caption" style={{ display: "grid", gap: 4 }}>Cor do texto
                    <input type="color" value={sel.cor} onChange={(e) => cmd("prop", "cor", e.target.value)} />
                  </label>
                </div>
              )}
            </>
          )}
        </div>
        <div className="panel" data-enter style={{ padding: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>Atalhos</div>
          <ul className="subtle small" style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 4 }}>
            <li><b>Duplo clique</b> num texto: editar no lugar</li>
            <li><b>Setas</b>: mover 1 px (<b>Shift</b>: 10 px)</li>
            <li><b>Esc</b>: selecionar o grupo em volta</li>
            <li><b>Delete</b>: apagar · <b>Ctrl+D</b>: duplicar</li>
            <li><b>Ctrl+Z</b> / <b>Ctrl+Shift+Z</b>: desfazer / refazer</li>
            <li>Ao arrastar, a linha rosa aparece no centro do quadro</li>
          </ul>
          <p className="subtle caption" style={{ marginTop: 10 }}>Salvar gera o PNG de novo no PC, sem usar a IA. “Ajustar com IA” depois continua a partir desta versão.</p>
        </div>
      </div>
    </div>
  );
}

function Faixa({ label, valor, min, max, passo, fmt, on, onMarco }: { label: string; valor: number; min: number; max: number; passo: number; fmt: (v: number) => string; on: (v: number) => void; onMarco: () => void }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <label className="subtle caption" style={{ display: "grid", gap: 4 }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>{label}<b className="tabular">{fmt(v)}</b></span>
      <input type="range" min={min} max={max} step={passo} value={v} onPointerDown={onMarco} onChange={(e) => { const n = Number(e.target.value); setV(n); on(n); }} style={{ "--pct": `${((v - min) / (max - min)) * 100}%` } as React.CSSProperties} />
    </label>
  );
}
