"use client";

import { confirmar } from "../shell/confirmar";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Download, Loader2, MousePointer2, Plus, RefreshCw, Square, Trash2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BotaoPublicar } from "../instagram/BotaoPublicar";
import { toast } from "../shell/toast";
import { ajustarVariacao, apagarVariacao, apagarVideo, aprovarConceitos, cancelarVideo, descartarRevisao, gerarDeNovo, maisVariacoes } from "./actions";

export interface Variacao { id: string; conceito: string; width: number | null; height: number | null; versao: string }
export interface Conceito { conceito: string; headline: string; apoio: string; cta: string; visual: string }
const PARADO = ["NEW", "REVIEW", "READY", "FAILED"];

/** Variações de um projeto de imagem: comparar lado a lado, ajustar uma com IA, gerar mais, baixar. */
export function ImageProjectView({ id, status, step, error, progress, formato, variacoes, conceitos, carrossel, maxSlides, podeEditar }: {
  id: string; status: string; step: string | null; error: string | null; progress: number | null; formato: string; variacoes: Variacao[]; conceitos: Conceito[];
  carrossel: boolean; maxSlides: number; podeEditar: boolean;
}) {
  const router = useRouter();
  const [st, setSt] = useState({ status, step, error, progress });
  const [pend, start] = useTransition();
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [pedido, setPedido] = useState("");
  const rodando = !PARADO.includes(st.status);
  const revisao = st.status === "REVIEW";
  const [plano, setPlano] = useState(conceitos);
  useEffect(() => setSt({ status, step, error, progress }), [status, step, error, progress]);
  useEffect(() => setPlano(conceitos), [conceitos]);
  const muda = (i: number, k: keyof Conceito, v: string) => setPlano((x) => x.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  useEffect(() => {
    if (!rodando) return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await fetch(`/api/studio/${id}`, { cache: "no-store" });
      if (!vivo || !r.ok) return;
      const s = (await r.json()) as { status: string; step_detail: string | null; error: string | null; progress: number | null };
      setSt({ status: s.status, step: s.step_detail, error: s.error, progress: s.progress });
      if (PARADO.includes(s.status)) { router.refresh(); if (s.status === "READY") toast.ok("Imagens prontas"); else if (s.status === "REVIEW") toast.ok("Conceitos prontos: revise e aprove"); else if (s.error !== "Cancelado") toast.err(s.error ?? "Falhou"); }
    }, 2000);
    return () => { vivo = false; clearInterval(t); };
  }, [rodando, id, router]);

  const acao = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, fila = true) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast.err(r.error ?? "Erro");
    toast.ok(msg);
    if (fila) setSt((s) => ({ ...s, status: "QUEUED", step: "Na fila do worker…", error: null, progress: 0 }));
    setAjustando(null); setPedido("");
    router.refresh();
  });
  const ratio = formato === "1.91:1" ? "1200/628" : formato.replace(":", "/");
  const mover = (i: number, d: number) => setPlano((x) => { const y = [...x]; [y[i], y[i + d]] = [y[i + d]!, y[i]!]; return y; });
  // baixa um PNG por vez (o navegador pode pedir permissão para vários downloads)
  const baixarTodos = async () => {
    for (const [i, v] of variacoes.entries()) {
      const a = document.createElement("a");
      a.href = `/api/creatives/${v.id}/file?download=1`;
      a.download = carrossel ? `slide-${String(i + 1).padStart(2, "0")}.png` : `variacao-${String.fromCharCode(65 + i)}.png`;
      a.click();
      await new Promise((ok) => setTimeout(ok, 400));
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="panel" data-enter style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {rodando ? (
          <>
            <Loader2 className="animate-spin" size={18} aria-hidden style={{ color: "rgb(var(--c-glow))" }} />
            <span className="small" style={{ flex: 1 }}>{st.step ?? "Na fila do worker…"}</span>
            <div className="bar" style={{ width: 200 }}><i style={{ width: `${st.progress ?? 2}%`, background: "var(--gradient-btn)", boxShadow: "0 0 12px rgb(var(--c-brand))" }} /></div>
            {podeEditar && <button className="btn btn-secondary btn-xs" disabled={pend} onClick={() => acao(() => cancelarVideo(id), "Cancelado", false)}><Square aria-hidden /> Cancelar</button>}
          </>
        ) : (
          <>
            <span className={st.status === "FAILED" ? "error-text" : "small"} style={{ flex: 1 }} role={st.status === "FAILED" ? "alert" : undefined}>
              {st.status === "FAILED" ? st.error ?? "A geração falhou" : revisao ? (st.step ?? "Esperando sua aprovação") : `${variacoes.length} ${carrossel ? "slide(s) no carrossel" : "variação(ões)"}${st.step && st.step !== "Pronto" ? ` · ${st.step}` : ""}`}
            </span>
            {podeEditar && (
              <>
                {variacoes.length > 1 && <button className="btn btn-secondary btn-xs" onClick={() => void baixarTodos()}><Download aria-hidden /> Baixar {carrossel ? "carrossel" : "todas"}</button>}
                {carrossel && !revisao && variacoes.length > 1 && <BotaoPublicar tipo="CARROSSEL" midias={variacoes.slice(0, 10).map((v) => v.id)} rotulo="Publicar carrossel" />}
                {!revisao && !carrossel && <button className="btn btn-primary btn-xs" disabled={pend} onClick={() => acao(() => maisVariacoes(id, 2), "Pensando em mais 2 conceitos")}><Plus aria-hidden /> Mais 2 variações</button>}
                {!revisao && carrossel && <button className="btn btn-primary btn-xs" disabled={pend} onClick={async () => (await confirmar("Planejar um carrossel novo? O atual continua até você aprovar o novo.")) && acao(() => gerarDeNovo(id), "Planejando outro carrossel")}><RefreshCw aria-hidden /> Outro carrossel</button>}
                <button className="btn btn-ghost btn-xs" disabled={pend} onClick={async () => (await confirmar("Apagar o projeto e todas as imagens?")) && start(async () => {
                  const r = await apagarVideo(id);
                  if (!r.ok) return toast.err(r.error);
                  router.push("/studio");
                })}><Trash2 aria-hidden /> Apagar projeto</button>
              </>
            )}
          </>
        )}
      </div>

      {revisao && plano.length > 0 && (
        <div className="panel surge" style={{ borderColor: "rgb(var(--c-brand) / 0.6)", boxShadow: "0 0 0 3px rgb(var(--c-brand) / 0.12), 0 0 32px -8px rgb(var(--c-brand) / 0.6)" }}>
          <div className="panel-head">
            <div>
              <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><ClipboardCheck size={15} aria-hidden /> {carrossel ? `Aprove o carrossel (${plano.length} slides)` : "Aprove os conceitos"}</div>
              <div className="subtle caption">{carrossel
                ? `Nenhum slide foi desenhado ainda. Edite os textos, reordene, adicione (até ${maxSlides}, o limite do Instagram) ou remova slides e aprove: só então a IA desenha e o PC renderiza.`
                : "Nenhuma imagem foi desenhada ainda. Edite os textos, remova o que não quiser e aprove: só então a IA desenha e o PC renderiza."}</div>
            </div>
            {podeEditar && (
              <div className="cluster" style={{ gap: 6 }}>
                {variacoes.length > 0 && <button className="btn btn-ghost btn-xs" disabled={pend} onClick={() => acao(() => descartarRevisao(id), "Conceitos descartados", false)}><X aria-hidden /> Descartar</button>}
                <button className="btn btn-secondary btn-xs" disabled={pend} onClick={() => acao(() => (variacoes.length && !carrossel ? maisVariacoes(id, plano.length) : gerarDeNovo(id)), carrossel ? "Planejando outro carrossel" : "Pedindo outros conceitos")}><RefreshCw aria-hidden /> {carrossel ? "Outro roteiro" : "Outros conceitos"}</button>
                <button className="btn btn-primary btn-sm" disabled={pend || !plano.length || plano.some((c) => !c.headline.trim() || c.conceito.trim().length < 2)} onClick={() => acao(() => aprovarConceitos(id, plano), carrossel ? "Aprovado: gerando o carrossel" : "Aprovado: gerando as imagens")}>
                  <Check aria-hidden /> {carrossel ? `Aprovar e gerar ${plano.length} slides` : `Aprovar e gerar ${plano.length} ${plano.length === 1 ? "imagem" : "imagens"}`}
                </button>
              </div>
            )}
          </div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {plano.map((c, i) => (
              <div key={`${i}-${plano.length}`} className="panel surge" style={{ padding: 12, display: "grid", gap: 8, background: "rgb(var(--c-bg-elevated) / 0.5)", animationDelay: `${Math.min(i, 10) * 45}ms` }}>
                <div className="cluster" style={{ gap: 8 }}>
                  <span className="badge badge-brand">{carrossel ? `${i + 1}/${plano.length}` : String.fromCharCode(65 + variacoes.length + i)}</span>
                  <input className="input-sm" style={{ flex: 1, fontWeight: 600, minWidth: 0 }} aria-label={`${carrossel ? "Papel do slide" : "Conceito"} ${i + 1}`} value={c.conceito} maxLength={120} disabled={!podeEditar} onChange={(e) => muda(i, "conceito", e.target.value)} />
                  {podeEditar && carrossel && <>
                    <button className="btn btn-ghost btn-xs" aria-label="Mover para antes" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowLeft aria-hidden /></button>
                    <button className="btn btn-ghost btn-xs" aria-label="Mover para depois" disabled={i === plano.length - 1} onClick={() => mover(i, 1)}><ArrowRight aria-hidden /></button>
                  </>}
                  {podeEditar && plano.length > (carrossel ? 2 : 1) && <button className="btn btn-ghost btn-xs" aria-label={carrossel ? "Remover slide" : "Remover conceito"} onClick={() => setPlano((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden /></button>}
                </div>
                <label className="subtle caption">Headline<input className="input-sm" style={{ width: "100%", marginTop: 4, fontWeight: 650 }} value={c.headline} maxLength={120} disabled={!podeEditar} onChange={(e) => muda(i, "headline", e.target.value)} /></label>
                <label className="subtle caption">Apoio<input className="input-sm" style={{ width: "100%", marginTop: 4 }} value={c.apoio} maxLength={200} disabled={!podeEditar} onChange={(e) => muda(i, "apoio", e.target.value)} /></label>
                <label className="subtle caption">CTA<input className="input-sm" style={{ width: "100%", marginTop: 4 }} value={c.cta} maxLength={60} disabled={!podeEditar} onChange={(e) => muda(i, "cta", e.target.value)} /></label>
                <label className="subtle caption">Visual<textarea className="input-sm" rows={3} style={{ width: "100%", marginTop: 4, height: "auto", paddingBlock: 8, resize: "vertical" }} value={c.visual} maxLength={400} disabled={!podeEditar} onChange={(e) => muda(i, "visual", e.target.value)} /></label>
              </div>
            ))}
            {podeEditar && carrossel && plano.length < maxSlides && (
              <button type="button" className="panel" onClick={() => setPlano((x) => [...x.slice(0, -1), { conceito: "Novo slide", headline: "", apoio: "", cta: "", visual: "" }, ...x.slice(-1)])}
                style={{ padding: 12, display: "grid", placeItems: "center", alignContent: "center", gap: 6, minHeight: 160, cursor: "pointer", borderStyle: "dashed", background: "transparent" }}>
                <Plus aria-hidden /> <span className="small">Adicionar slide</span>
                <span className="subtle caption">entra antes do último (CTA) · {plano.length}/{maxSlides}</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div style={carrossel
        ? { display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 8 }
        : { display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${formato === "1.91:1" ? 420 : formato === "9:16" ? 220 : 280}px, 1fr))`, gap: 14 }}>
        {variacoes.map((v, i) => (
          <div key={v.id + v.versao} className="panel spotlight surge" style={{ animationDelay: `${Math.min(i, 10) * 60}ms`, padding: 10, display: "flex", flexDirection: "column", gap: 10, ...(carrossel ? { flex: "0 0 min(300px, 78vw)", scrollSnapAlign: "start" } : {}) }}>
            <a href={`/api/creatives/${v.id}/file?v=${v.versao}`} target="_blank" rel="noopener noreferrer" className="thumb-card" style={{ aspectRatio: ratio }}>
              <img src={`/api/creatives/${v.id}/file?v=${v.versao}`} alt={v.conceito} loading="lazy" style={{ objectFit: "contain" }} />
            </a>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span className="badge badge-brand">{carrossel ? `${i + 1}/${variacoes.length}` : String.fromCharCode(65 + i)}</span>
              <span className="small" style={{ flex: 1 }}>{v.conceito}</span>
            </div>
            {ajustando === v.id ? (
              <div className="stack surge" style={{ gap: 8 }}>
                <textarea className="input-sm" rows={2} autoFocus style={{ height: "auto", paddingBlock: 8 }} maxLength={2000} value={pedido} onChange={(e) => setPedido(e.target.value)}
                  placeholder="Ex.: headline maior, logo no topo, troque o fundo por roxo" />
                <div className="cluster" style={{ justifyContent: "flex-end", gap: 6 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => setAjustando(null)}><X aria-hidden /> Cancelar</button>
                  <button className="btn btn-primary btn-xs" disabled={pend || pedido.trim().length < 3} onClick={() => acao(() => ajustarVariacao(id, v.id, pedido), "Ajuste na fila")}><Wand2 aria-hidden /> Aplicar</button>
                </div>
              </div>
            ) : (
              <div className="cluster" style={{ gap: 6 }}>
                <a className="btn btn-secondary btn-xs" href={`/api/creatives/${v.id}/file?download=1`}><Download aria-hidden /> PNG</a>
                {podeEditar && !carrossel && <BotaoPublicar tipo="FEED" midias={[v.id]} />}
                {podeEditar && !rodando && <Link className="btn btn-ghost btn-xs" href={`/studio/${id}/arte/${v.id}`} title="Arrastar, redimensionar e editar os textos (sem IA)"><MousePointer2 aria-hidden /> Editar</Link>}
                {podeEditar && <button className="btn btn-ghost btn-xs" disabled={rodando} onClick={() => { setAjustando(v.id); setPedido(""); }}><Wand2 aria-hidden /> Ajustar com IA</button>}
                <span style={{ flex: 1 }} />
                {podeEditar && <button className="btn btn-ghost btn-xs" aria-label={carrossel ? "Apagar slide" : "Apagar variação"} disabled={rodando || pend} onClick={async () => (await confirmar(carrossel ? "Apagar este slide do carrossel?" : "Apagar esta variação?")) && acao(() => apagarVariacao(id, v.id), carrossel ? "Slide apagado" : "Variação apagada", false)}><Trash2 aria-hidden /></button>}
              </div>
            )}
          </div>
        ))}
        {variacoes.length === 0 && !rodando && !revisao && <div className="panel"><div className="empty">Nenhuma variação ainda.</div></div>}
      </div>
    </div>
  );
}
