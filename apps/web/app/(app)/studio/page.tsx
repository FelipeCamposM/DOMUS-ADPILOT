import { ArrowRight, Clapperboard, ImageIcon, Send } from "lucide-react";
import Link from "next/link";
import { can, requireCtx } from "@/lib/ctx";
import { ago } from "@/lib/format";
import { projetos } from "@/lib/video";
import { Busca } from "@/modules/shell/Busca";
import { StudioRefresh } from "@/modules/studio/StudioRefresh";
import { VideoCard } from "@/modules/studio/VideoCard";

export const metadata = { title: "Studio" };

const CRIAR = [
  { href: "/studio/novo?tipo=post", icone: Send, titulo: "Novo post", sub: "Instagram · imagem ou vídeo", desc: "A IA escreve arte, legenda e hashtags. Você aprova no WhatsApp e ele publica sozinho no horário.", destaque: true },
  { href: "/studio/novo?tipo=imagem", icone: ImageIcon, titulo: "Imagem avulsa", sub: "Anúncio · teste A/B · carrossel", desc: "Conceitos para você aprovar e PNGs prontos para baixar ou usar em campanhas." },
  { href: "/studio/novo", icone: Clapperboard, titulo: "Vídeo avulso", sub: "Anúncio · Reels · Stories", desc: "Roteiro, narração, música e animação. Você aprova o roteiro e recebe o MP4." },
] as const;

const FILTROS = [["todos", "Todos"], ["voce", "Esperando você"], ["producao", "Em produção"], ["prontos", "Prontos"], ["falhas", "Com erro"]] as const;
const grupo = (s: string) => (s === "READY" ? "prontos" : s === "FAILED" ? "falhas" : s === "REVIEW" || s === "NEW" ? "voce" : "producao");

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const ctx = await requireCtx();
  const { q, f = "todos" } = await searchParams;
  const todos = await projetos(ctx.workspace.id, q);
  const lista = f === "todos" ? todos : todos.filter((p) => grupo(p.status) === f);
  const contagem = Object.fromEntries(FILTROS.map(([k]) => [k, k === "todos" ? todos.length : todos.filter((p) => grupo(p.status) === k).length]));
  const rodando = todos.some((p) => grupo(p.status) === "producao");
  const editor = can(ctx, "editor");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Studio</h1>
          <p className="page-sub" data-enter>Onde a IA cria: você descreve, aprova cada etapa e ela produz. O que fica pronto vai para <Link href="/creatives">Criativos</Link>.</p>
        </div>
      </div>
      {editor && (
        <div className="studio-criar" data-enter>
          {CRIAR.map(({ href, icone: I, titulo, sub, desc, ...o }) => (
            <Link key={href} href={href} className="studio-criar-card spotlight" data-destaque={"destaque" in o || undefined}>
              <span className="studio-criar-icone"><I size={20} aria-hidden /></span>
              <span className="studio-criar-txt"><b>{titulo}</b><small>{sub}</small><span>{desc}</span></span>
              <ArrowRight className="studio-criar-seta" size={18} aria-hidden />
            </Link>
          ))}
        </div>
      )}
      {rodando && <StudioRefresh />}
      <div className="studio-barra" data-enter>
        <h2 className="h3">Projetos</h2>
        <div className="cluster" role="tablist" style={{ gap: 4, padding: 3, borderRadius: 12, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-bg-surface))" }}>
          {FILTROS.filter(([k]) => k === "todos" || contagem[k]).map(([k, l]) => (
            <Link key={k} href={`/studio?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} role="tab" aria-selected={f === k} className="chip" data-active={f === k} style={{ height: 30, border: 0 }}>
              {l} <span className="subtle tabular" style={{ fontSize: 11 }}>{contagem[k]}</span>
            </Link>
          ))}
        </div>
      </div>
      <Busca placeholder="Buscar por título, produto ou marca" />
      {lista.length === 0 ? (
        <div className="panel"><div className="empty">{q ? `Nada encontrado para “${q}”.` : f !== "todos" ? "Nenhum projeto neste filtro." : "Nenhum projeto ainda. Escolha acima o que criar."}</div></div>
      ) : (
        <div className="studio-grid">
          {lista.map((p) => (
            <VideoCard key={p.id} href={`/studio/${p.id}`} creativeId={p.creative_id} thumb={p.thumb} titulo={p.title} status={p.status} progress={p.progress}
              formato={p.brief.formato} kind={p.kind}
              sub={p.kind === "image" ? `Imagem · ${p.brief.formato.replace(".", ",")} · ${ago(p.updated_at)}` : `Vídeo · ${p.brief.formato} · ${p.brief.duracao} s · ${ago(p.updated_at)}`} />
          ))}
        </div>
      )}
    </div>
  );
}
