"use client";

import { ImagePlus, Loader2, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { enviarArquivo } from "../creatives/upload";
import { toast } from "../shell/toast";
import { salvarIdentidade } from "./actions";

export interface BrandValor {
  cores: { nome: string; hex: string }[]; fonteTitulo: string; fonteTexto: string; logoId: string | null;
  tom: string; sobre: string; regras: string; referencias: string[];
}
const FONTES = ["Plus Jakarta Sans", "Inter", "Poppins", "Montserrat", "Manrope", "DM Sans", "Space Grotesk", "Sora", "Outfit", "Urbanist", "Bricolage Grotesque", "Anton", "Bebas Neue", "Playfair Display", "Fraunces", "Instrument Serif", "Archivo Black", "Syne"];

/**
 * Identidade visual do workspace. Tudo que a IA cria no Studio (vídeos e imagens) segue isto: cores, fontes, logo,
 * tom de voz e regras. A prévia ao lado carrega as fontes do Google Fonts para conferir.
 */
export function BrandEditor({ inicial, imagens, podeEditar, nome }: {
  inicial: BrandValor; imagens: { id: string; name: string }[]; podeEditar: boolean; nome: string;
}) {
  const router = useRouter();
  const [b, setB] = useState(inicial);
  const [refs, setRefs] = useState(inicial.referencias.join("\n"));
  const [pend, start] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (v: Partial<BrandValor>) => setB((x) => ({ ...x, ...v }));

  // carrega as fontes escolhidas para a prévia
  useEffect(() => {
    const familias = [...new Set([b.fonteTitulo, b.fonteTexto].filter((f) => /^[\w\s]{2,60}$/.test(f)))];
    if (!familias.length) return;
    const id = "brand-fontes";
    document.getElementById(id)?.remove();
    const l = Object.assign(document.createElement("link"), { id, rel: "stylesheet", href: `https://fonts.googleapis.com/css2?${familias.map((f) => `family=${encodeURIComponent(f)}:wght@400;700;800`).join("&")}&display=swap` });
    document.head.appendChild(l);
  }, [b.fonteTitulo, b.fonteTexto]);

  const salvar = () => start(async () => {
    const r = await salvarIdentidade({ ...b, referencias: refs.split("\n").map((x) => x.trim()).filter(Boolean) });
    if (!r.ok) return toast.err(r.error);
    toast.ok("Identidade visual salva: vale para os próximos vídeos e imagens");
    router.refresh();
  });

  const enviarLogo = async (f: File | undefined) => {
    if (!f) return;
    setEnviando(true);
    try {
      const e = await enviarArquivo(f);
      if (e.type !== "IMAGE") throw new Error("A logo precisa ser uma imagem (PNG/SVG de preferência)");
      set({ logoId: e.id });
      router.refresh();
    } catch (err) { toast.err((err as Error).message); }
    setEnviando(false);
  };

  const cor = (i: number) => b.cores[i]?.hex ?? (i === 0 ? "#0A0A0E" : i === 1 ? "#A855FF" : "#FAFAFC");
  const fundo = cor(0), destaque = cor(1), texto = b.cores[2]?.hex ?? "#FAFAFC";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(260px, 0.8fr)", gap: 18, alignItems: "start" }} className="studio-form">
      <fieldset disabled={!podeEditar} className="stack" style={{ gap: 14, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="field">
          <span className="label">Cores (a 1ª é o fundo, a 2ª o destaque, a 3ª o texto)</span>
          <div className="cluster" style={{ gap: 8 }}>
            {b.cores.map((c, i) => (
              <div key={i} className="panel" style={{ padding: 6, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={c.hex} aria-label={`Cor ${i + 1}`} onChange={(e) => set({ cores: b.cores.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)) })}
                  style={{ width: 30, height: 30, border: 0, background: "none", padding: 0, cursor: "pointer" }} />
                <input className="input-sm mono" style={{ width: 96 }} value={c.hex} maxLength={7} aria-label={`Código da cor ${i + 1}`}
                  onChange={(e) => set({ cores: b.cores.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)) })} />
                <input className="input-sm" style={{ width: 96 }} placeholder="nome" value={c.nome} maxLength={40} aria-label={`Nome da cor ${i + 1}`}
                  onChange={(e) => set({ cores: b.cores.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })} />
                <button type="button" className="btn btn-ghost btn-xs" aria-label="Remover cor" onClick={() => set({ cores: b.cores.filter((_, j) => j !== i) })}><X aria-hidden /></button>
              </div>
            ))}
            {b.cores.length < 10 && <button type="button" className="btn btn-secondary btn-xs" onClick={() => set({ cores: [...b.cores, { nome: "", hex: b.cores.length === 0 ? "#0A0A0E" : b.cores.length === 1 ? "#A855FF" : "#FAFAFC" }] })}><Plus aria-hidden /> Cor</button>}
          </div>
        </div>

        <datalist id="fontes-google">{FONTES.map((f) => <option key={f} value={f} />)}</datalist>
        <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="field"><label className="label" htmlFor="ft">Fonte dos títulos (Google Fonts)</label><input id="ft" className="input-sm" list="fontes-google" value={b.fonteTitulo} maxLength={60} onChange={(e) => set({ fonteTitulo: e.target.value })} placeholder="Ex.: Plus Jakarta Sans" /></div>
          <div className="field"><label className="label" htmlFor="fx">Fonte dos textos</label><input id="fx" className="input-sm" list="fontes-google" value={b.fonteTexto} maxLength={60} onChange={(e) => set({ fonteTexto: e.target.value })} placeholder="Ex.: Inter" /></div>
        </div>

        <div className="field">
          <span className="label">Logo</span>
          <div className="cluster" style={{ gap: 8 }}>
            {imagens.slice(0, 18).map((i) => (
              <button key={i.id} type="button" title={i.name} onClick={() => set({ logoId: b.logoId === i.id ? null : i.id })} className="thumb-card"
                style={{ width: 54, height: 54, padding: 4, cursor: "pointer", border: b.logoId === i.id ? "2px solid rgb(var(--c-brand))" : "1px solid rgb(var(--c-border))", boxShadow: b.logoId === i.id ? "var(--glow-sm)" : "none" }}>
                <img src={`/api/creatives/${i.id}/file`} alt={i.name} style={{ objectFit: "contain" }} />
              </button>
            ))}
            <input ref={input} type="file" hidden accept="image/png,image/svg+xml,image/webp,image/jpeg" onChange={(e) => void enviarLogo(e.target.files?.[0])} />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => input.current?.click()} disabled={enviando}>{enviando ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />} Enviar logo</button>
          </div>
        </div>

        <div className="field"><label className="label" htmlFor="sobre">Sobre a marca (o que faz, para quem)</label>
          <textarea id="sobre" className="input-sm" rows={2} style={{ height: "auto", paddingBlock: 8 }} maxLength={2000} value={b.sobre} onChange={(e) => set({ sobre: e.target.value })} /></div>
        <div className="field"><label className="label" htmlFor="tom">Tom de voz</label>
          <input id="tom" className="input-sm" maxLength={500} value={b.tom} onChange={(e) => set({ tom: e.target.value })} placeholder="Ex.: direto, sem jargão, fala com o professor (você)" /></div>
        <div className="field"><label className="label" htmlFor="regras">Regras da marca (faça / não faça)</label>
          <textarea id="regras" className="input-sm" rows={2} style={{ height: "auto", paddingBlock: 8 }} maxLength={2000} value={b.regras} onChange={(e) => set({ regras: e.target.value })} placeholder="Ex.: verde só em destaque; sem emojis; nunca prometer prazo" /></div>
        <div className="field"><label className="label" htmlFor="refs">Referências (um link por linha)</label>
          <textarea id="refs" className="input-sm mono" rows={2} style={{ height: "auto", paddingBlock: 8 }} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="https://…" /></div>

        {podeEditar && <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={salvar} disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Salvar identidade</button>}
      </fieldset>

      <div className="panel" aria-label="Prévia da identidade" style={{ padding: 0, overflow: "hidden", position: "sticky", top: 16 }}>
        <div style={{ aspectRatio: "1", background: fundo, color: texto, padding: "9%", display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: `'${b.fonteTexto || "Plus Jakarta Sans"}', system-ui, sans-serif` }}>
          {b.logoId ? <img src={`/api/creatives/${b.logoId}/file`} alt="" style={{ height: 34, width: "auto", objectFit: "contain", alignSelf: "flex-start" }} /> : <b style={{ opacity: 0.6 }}>{nome}</b>}
          <div>
            <div style={{ fontFamily: `'${b.fonteTitulo || "Plus Jakarta Sans"}', system-ui, sans-serif`, fontWeight: 800, fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
              Seu anúncio, <span style={{ color: destaque }}>com a sua cara.</span>
            </div>
            <p style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>{b.tom ? b.tom.slice(0, 90) : "Tom de voz e regras da marca entram em todo criativo."}</p>
          </div>
          <span style={{ alignSelf: "flex-start", background: destaque, color: fundo, fontWeight: 800, padding: "10px 18px", borderRadius: 999, boxShadow: `0 0 26px ${destaque}66` }}>Chamada para ação</span>
        </div>
      </div>
    </div>
  );
}
