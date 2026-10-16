"use client";

import { confirmar } from "../shell/confirmar";
import { Loader2, Music2, Trash2, Upload, Waves } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { apagarCriativo } from "./actions";
import { enviarArquivo } from "./upload";

const MUSICA = ["corporate", "technology", "dark", "energetic", "emotional", "minimal", "premium"];
const SFX = ["whoosh", "impact", "click", "pop", "notification", "typing", "success", "transition", "bass", "interface"];

export interface ItemLib { id: string; name: string; type: string; tags: string[]; license: string | null; duration_ms: number | null }

/** Biblioteca de áudio licenciado do workspace. A IA escolhe por tag; efeitos sem item próprio usam os padrões sintetizados. */
export function Library({ tipo, itens, podeEditar }: { tipo: "MUSIC" | "SFX"; itens: ItemLib[]; podeEditar: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [licenca, setLicenca] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const opcoes = tipo === "MUSIC" ? MUSICA : SFX;

  const enviar = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      setEnviando(f.name);
      try {
        await enviarArquivo(f, { type: tipo, tags, license: licenca });
        toast.ok(`“${f.name}” enviado`);
      } catch (e) {
        toast.err((e as Error).message);
        break;
      }
    }
    setEnviando(null);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {podeEditar && (
        <div className="panel" data-enter style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel-title">{tipo === "MUSIC" ? "Enviar música licenciada" : "Enviar efeito sonoro"}</div>
          <div className="cluster" style={{ gap: 6 }}>
            <span className="subtle caption">{tipo === "MUSIC" ? "Clima:" : "Categoria:"}</span>
            {opcoes.map((o) => (
              <button key={o} type="button" className="chip" style={{ height: 28 }} data-active={tags.includes(o)}
                onClick={() => setTags((t) => (tipo === "SFX" ? [o] : t.includes(o) ? t.filter((x) => x !== o) : [...t, o]))}>{o}</button>
            ))}
          </div>
          <div className="cluster" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 240 }}>
              <label className="label" htmlFor={`lic-${tipo}`}>Licença / origem (obrigatório)</label>
              <input id={`lic-${tipo}`} className="input-sm" value={licenca} onChange={(e) => setLicenca(e.target.value)} maxLength={200} placeholder="Ex.: Epidemic Sound (assinatura), YouTube Audio Library, autoral" />
            </div>
            <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => void enviar(e.target.files)} />
            <button className="btn btn-primary btn-sm" disabled={!!enviando || !tags.length || licenca.trim().length < 3} onClick={() => input.current?.click()}>
              {enviando ? <><Loader2 className="animate-spin" aria-hidden /> {enviando.slice(0, 24)}</> : <><Upload aria-hidden /> Escolher arquivos</>}
            </button>
          </div>
          <p className="subtle caption">Só envie áudio que você tem direito de usar em anúncios. A plataforma nunca usa música protegida sem licença.</p>
        </div>
      )}
      {itens.length === 0 ? (
        <div className="panel"><div className="empty" style={{ padding: 28 }}>
          {tipo === "MUSIC" ? "Nenhuma música ainda. Sem música na biblioteca, os vídeos saem só com voz e efeitos." : "Nenhum efeito enviado. Os vídeos usam os efeitos padrão (sintetizados, livres de direitos) de cada categoria."}
        </div></div>
      ) : (
        <div className="panel" data-enter>
          <table className="data">
            <thead><tr><th>Nome</th><th>{tipo === "MUSIC" ? "Clima" : "Categoria"}</th><th>Ouvir</th><th>Licença</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td style={{ display: "flex", gap: 8, alignItems: "center" }}>{tipo === "MUSIC" ? <Music2 size={15} aria-hidden /> : <Waves size={15} aria-hidden />}{i.name}
                    {i.duration_ms && <span className="subtle" style={{ fontSize: 11 }}>{(i.duration_ms / 1000).toFixed(0)} s</span>}</td>
                  <td>{i.tags.map((t) => <span key={t} className="badge badge-brand" style={{ marginRight: 4 }}>{t}</span>)}</td>
                  <td><audio controls preload="none" src={`/api/creatives/${i.id}/file`} style={{ height: 30, maxWidth: 220 }} /></td>
                  <td className="subtle" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={i.license ?? ""}>{i.license}</td>
                  <td>{podeEditar && <button className="btn btn-ghost btn-xs" disabled={pend} onClick={async () => (await confirmar(`Apagar “${i.name}”?`)) && start(async () => {
                    const r = await apagarCriativo(i.id);
                    if (r.ok) toast.ok("Apagado"); else toast.err(r.error);
                    router.refresh();
                  })}><Trash2 aria-hidden /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
