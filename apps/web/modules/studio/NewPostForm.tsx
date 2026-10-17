"use client";

import { ArrowRight, CalendarClock, Clapperboard, GalleryHorizontal, Image as ImageIco, Loader2, PenLine, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { MarcaResumo } from "@/lib/marcas";
import { novoPostIA } from "../calendario/actions";
import { Escolha, Revelar } from "../motion/Escolha";
import { toast } from "../shell/toast";
import { Palco } from "./Palco";

type Midia = "imagem" | "video";
type Formato = "FEED" | "CARROSSEL" | "REELS";

/** Próximo horário de bom alcance (12:00 ou 18:30) com pelo menos 40 min de folga, em hora local, no formato do datetime-local. */
function proximoHorario() {
  const d = new Date();
  const alvo = [[12, 0], [18, 30]].map(([h, m]) => { const x = new Date(d); x.setHours(h!, m!, 0, 0); return x; }).find((x) => x.getTime() > Date.now() + 40 * 60_000);
  const x = alvo ?? (() => { const t = new Date(d); t.setDate(t.getDate() + 1); t.setHours(12, 0, 0, 0); return t; })();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

const ETAPAS = [
  { t: "A IA escreve", d: "Arte, legenda e hashtags com a identidade da marca" },
  { t: "Você revisa", d: "Abre em Conteúdos: edite o que quiser e aprove" },
  { t: "Publica sozinho", d: "Perto do horário a arte é gerada e vai para o Instagram" },
];

/** Novo post do Instagram: escolhe imagem ou vídeo, diz o assunto e o horário; a IA escreve e, aprovado, a plataforma gera e publica. */
export function NewPostForm({ contas, marcas }: { contas: { id: string; username: string }[]; marcas: MarcaResumo[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [midia, setMidia] = useState<Midia>("imagem");
  const [formato, setFormato] = useState<Formato>("FEED");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const daConta = (id: string) => { const u = contas.find((c) => c.id === id)?.username.toLowerCase() ?? ""; return marcas.find((m) => u.includes(m.nome.toLowerCase().replace(/\s+/g, "")))?.id; };
  const [marcaId, setMarcaId] = useState<string | null>(daConta(contas[0]?.id ?? "") ?? marcas[0]?.id ?? null);
  const [tema, setTema] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [quando, setQuando] = useState("");
  useEffect(() => setQuando(proximoHorario()), []); // hora local só existe no navegador

  const escolherMidia = (m: Midia) => { setMidia(m); setFormato(m === "video" ? "REELS" : "FEED"); };
  const trocarConta = (id: string) => { setContaId(id); const m = daConta(id); if (m) setMarcaId(m); };
  const falta = !contas.length ? "Conecte um perfil do Instagram" : tema.trim().length < 3 ? "Diga sobre o que é o post" : !quando ? "Escolha o horário" : null;

  const enviar = () => start(async () => {
    setErro(null);
    const r = await novoPostIA({ contaId, marcaId, formato, tema, detalhes, dataHora: new Date(quando).toISOString() });
    if (!r.ok) return setErro(r.error);
    toast.ok("A IA está escrevendo o post. Revise e aprove em Conteúdos");
    router.push(`/conteudos?conta=${r.data.conta}&mes=${r.data.mes}&item=${r.data.id}`);
  });

  if (!contas.length) {
    return (
      <div className="panel" data-enter="scale">
        <div className="empty">
          <span className="icon-tile"><ImageIco aria-hidden /></span>
          <h2 className="h3">Conecte o Instagram primeiro</h2>
          <p className="muted" style={{ maxWidth: 440 }}>O post é publicado num perfil do Instagram conectado à plataforma.</p>
          <Link href="/instagram" className="btn btn-primary" style={{ marginTop: 8 }}>Conectar Instagram</Link>
        </div>
      </div>
    );
  }

  const palco = formato === "REELS" ? { w: 18, h: 32 } : { w: 24, h: 30 };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="studio-form">
      <div className="stack" style={{ gap: 16 }}>
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel-title">O que vai ser publicado</div>
          <Escolha valor={midia} className="kpis" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["imagem", "Imagem", "Post único ou carrossel no feed", ImageIco], ["video", "Vídeo", "Reels narrado, com música e legenda", Clapperboard]] as const).map(([v, l, d, I]) => (
              <button key={v} data-opt={v} type="button" className="panel post-midia" aria-pressed={midia === v} onClick={() => escolherMidia(v)}>
                <span className="post-midia-icone"><I size={20} aria-hidden /></span>
                <span><b>{l}</b><small>{d}</small></span>
              </button>
            ))}
          </Escolha>
          <Revelar aberto={midia === "imagem"}><div style={{ paddingTop: 2 }}>
            <Escolha valor={formato} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
              {([["FEED", "Post único", Square], ["CARROSSEL", "Carrossel", GalleryHorizontal]] as const).map(([v, l, I]) => (
                <button key={v} data-opt={v} type="button" className="chip" data-active={formato === v} onClick={() => setFormato(v)}><I aria-hidden /> {l}</button>
              ))}
            </Escolha>
          </div></Revelar>
          <div className="field">
            <label className="label" htmlFor="post-tema">Sobre o que é o post</label>
            <input id="post-tema" className="input" value={tema} onChange={(e) => setTema(e.target.value)} maxLength={160}
              placeholder={midia === "video" ? "Ex.: 3 sinais de que o seu site está perdendo clientes" : "Ex.: Por que um site sob medida vende mais que um template"} />
          </div>
          <div className="field">
            <label className="label" htmlFor="post-detalhes" style={{ display: "flex", gap: 6, alignItems: "center" }}><PenLine size={14} aria-hidden /> Detalhes para a IA (opcional)</label>
            <textarea id="post-detalhes" className="input" rows={4} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={320}
              placeholder="Oferta, público, tom, o que não pode faltar… A IA usa só fatos daqui e do cadastro da marca."
              value={detalhes} onChange={(e) => setDetalhes(e.target.value)} />
            <span className="subtle caption" style={{ textAlign: "right" }}>{detalhes.length}/320</span>
          </div>
        </div>
        <div className="panel post-etapas" data-enter>
          {ETAPAS.map((e, i) => (
            <div key={e.t} className="post-etapa"><span className="post-etapa-n">{i + 1}</span><span><b>{e.t}</b><small>{e.d}</small></span></div>
          ))}
        </div>
      </div>

      <div className="stack studio-lateral" style={{ gap: 16 }}>
        <div className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Palco w={palco.w} h={palco.h} numero={formato === "CARROSSEL" ? 5 : 1} unidade={formato === "CARROSSEL" ? " slides" : formato === "REELS" ? " Reels" : " post"}
            legenda={`${formato === "REELS" ? "9:16" : "4:5"} · ${contas.find((c) => c.id === contaId)?.username ? `@${contas.find((c) => c.id === contaId)!.username}` : ""}`}
            camadas={formato === "CARROSSEL" ? 4 : 0} leque={formato === "CARROSSEL"} />
          <div className="field">
            <label className="label" htmlFor="post-conta">Perfil</label>
            <select id="post-conta" className="input" value={contaId} onChange={(e) => trocarConta(e.target.value)}>
              {contas.map((c) => <option key={c.id} value={c.id}>@{c.username}</option>)}
            </select>
          </div>
          <div className="panel-title" style={{ marginTop: 2 }}>Marca (logo e cores da arte)</div>
          <Escolha valor={marcaId ?? "sem"} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
            {[...marcas.map((m) => ({ v: m.id, l: m.nome, cores: m.cores })), { v: "sem", l: "Sem marca", cores: [] as MarcaResumo["cores"] }].map((o) => (
              <button key={o.v} data-opt={o.v} type="button" className="chip" data-active={(marcaId ?? "sem") === o.v} onClick={() => setMarcaId(o.v === "sem" ? null : o.v)}>
                {o.cores.length > 0 && <span aria-hidden className="post-cores">{o.cores.slice(0, 3).map((c, i) => <i key={i} style={{ background: c.hex }} />)}</span>}
                {o.l}
              </button>
            ))}
          </Escolha>
          <div className="field">
            <label className="label" htmlFor="post-quando" style={{ display: "flex", gap: 6, alignItems: "center" }}><CalendarClock size={14} aria-hidden /> Quando publicar</label>
            <input id="post-quando" className="input" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
          </div>
        </div>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <button className="btn btn-primary btn-lg" onClick={enviar} disabled={pend || !!falta} title={falta ?? undefined} data-enter>
          {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><Sparkles aria-hidden /> Escrever post com IA <ArrowRight className="seta" aria-hidden /></>}
        </button>
        {falta && <p className="subtle caption" role="status" style={{ textAlign: "center", color: "rgb(var(--c-warning))" }}>Para liberar: {falta.toLowerCase()}</p>}
        <p className="subtle caption" style={{ textAlign: "center" }}>Nada é publicado antes de você aprovar em Conteúdos.</p>
      </div>
    </div>
  );
}
