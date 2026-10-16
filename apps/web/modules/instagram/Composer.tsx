"use client";

import { contarHashtags, LIMITES_IG, problemasPost, STATUS_POST, TIPOS_POST, type TipoPost } from "@domus-ads/core/instagram-regras";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Check, CheckCircle2, ChevronLeft, ExternalLink, Hash, ImagePlus, Loader2, Rocket, Save, Sparkles, Undo2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ContaIG, PostIG } from "@/lib/instagram";
import { BibliotecaModal } from "../arquivos/Biblioteca";
import { DataPicker } from "../shell/DataPicker";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { agendarPublicacao, pedirLegenda, salvarPublicacao, voltarParaRascunho } from "./actions";
import { arquivo, FeedMock, GradeMock, type MidiaPreview, ReelsMock, StoryMock } from "./Mockups";
import { ICONE_TIPO } from "./NovaPublicacao";

export interface ItemBiblioteca extends MidiaPreview { name: string; duration_ms: number | null }

const doisDigitos = (n: number) => String(n).padStart(2, "0");
/** datetime-local no fuso do navegador, daqui a 1 h, arredondado para os próximos 15 min. */
function padraoAgendamento() {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

export function Composer({ post, conta, biblioteca, feed, marcas, podeEditar }: {
  post: PostIG; conta: ContaIG; biblioteca: ItemBiblioteca[]; feed: string[]; marcas: { id: string; nome: string }[]; podeEditar: boolean;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPost>(post.tipo);
  const [ids, setIds] = useState<string[]>(post.midias.map((m) => m.creativeId));
  const [legenda, setLegenda] = useState(post.legenda);
  const [noFeed, setNoFeed] = useState(post.opcoes.compartilharNoFeed !== false);
  const [capaMs, setCapaMs] = useState<number | undefined>(post.opcoes.capaMs);
  const [modo, setModo] = useState<"agora" | "agendar">(post.agendado_para && post.status === "AGENDADO" ? "agendar" : "agora");
  const [data, setData] = useState(() => {
    if (!post.agendado_para) return padraoAgendamento();
    const d = new Date(post.agendado_para);
    return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
  });
  const [status, setStatus] = useState(post.status);
  const [erro, setErro] = useState(post.erro);
  const [permalink, setPermalink] = useState(post.permalink);
  const [sugestao, setSugestao] = useState(post.sugestao);
  const [dica, setDica] = useState("");
  const [marcaId, setMarcaId] = useState(post.brand_id ?? marcas[0]?.id ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [visao, setVisao] = useState<"post" | "grade">("post");
  const [sujo, setSujo] = useState(false);
  const [pend, start] = useTransition();

  const travado = !podeEditar || status === "PUBLICANDO" || status === "PUBLICADO";
  const [extras, setExtras] = useState<ItemBiblioteca[]>([]); // escolhidos no modal que ainda não vieram na lista da página
  const lib = useMemo(() => new Map([...biblioteca, ...extras].map((b) => [b.id, b])), [biblioteca, extras]);
  const midias = ids.map((id) => lib.get(id)).filter((x): x is ItemBiblioteca => !!x);
  const problemas = problemasPost({ tipo, legenda, midias: midias.map((m) => ({ type: m.type, durationMs: m.duration_ms })) });
  const perfil = { username: conta.username, foto: conta.foto, nome: conta.nome };
  const hashtags = contarHashtags(legenda);

  const mudou = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSujo(true); };

  // polling: legenda da IA chegando e a publicação saindo
  const gerando = !!sugestao?.gerando;
  useEffect(() => {
    if (!gerando && status !== "PUBLICANDO" && !(status === "AGENDADO" && modo === "agora")) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/instagram/posts/${post.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const p = (await r.json()) as Pick<PostIG, "status" | "erro" | "permalink" | "sugestao">;
      setSugestao(p.sugestao);
      if (p.sugestao?.hashtags) setTags(p.sugestao.hashtags);
      if (p.status !== status) {
        setStatus(p.status); setErro(p.erro); setPermalink(p.permalink);
        if (p.status === "PUBLICADO") toast.ok("Publicado no Instagram!");
        if (p.status === "FALHOU") toast.err("A publicação falhou");
        router.refresh();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [gerando, status, modo, post.id, router]);

  const dados = () => ({ tipo, legenda, midias: ids.map((creativeId) => ({ creativeId })), opcoes: { compartilharNoFeed: noFeed, ...(capaMs != null ? { capaMs } : {}) } });
  const salvar = (silencioso = false) => new Promise<boolean>((ok) => start(async () => {
    const r = await salvarPublicacao(post.id, dados());
    if (!r.ok) { toast.err(r.error); return ok(false); }
    setSujo(false);
    if (!silencioso) toast.ok("Rascunho salvo");
    ok(true);
  }));

  const enviar = () => start(async () => {
    const s = await salvarPublicacao(post.id, dados());
    if (!s.ok) return toast.err(s.error);
    const quando = modo === "agendar" ? new Date(data).toISOString() : null;
    const r = await agendarPublicacao(post.id, quando);
    setConfirmar(false);
    if (!r.ok) return toast.err(r.error);
    setSujo(false); setErro(null);
    setStatus("AGENDADO");
    toast.ok(quando ? `Agendado para ${new Date(data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Enviando ao Instagram…");
    router.refresh();
  });

  const cancelarAgendamento = () => start(async () => {
    const r = await voltarParaRascunho(post.id);
    if (!r.ok) return toast.err(r.error);
    setStatus("RASCUNHO");
    toast.ok("Voltou para rascunho");
    router.refresh();
  });

  const gerar = () => start(async () => {
    if (sujo && !(await salvar(true))) return;
    const r = await pedirLegenda(post.id, dica, marcaId || null);
    if (!r.ok) return toast.err(r.error);
    setSugestao({ gerando: true });
  });

  const usarSugestao = (comTags: boolean) => {
    if (!sugestao?.legenda) return;
    mudou(setLegenda)(`${sugestao.legenda}${comTags && tags.length ? `\n\n${tags.join(" ")}` : ""}`);
    setSugestao(null);
  };

  const mover = (i: number, d: -1 | 1) => mudou(setIds)(ids.map((x, k) => (k === i ? ids[i + d]! : k === i + d ? ids[i]! : x)));
  const maxMidias = tipo === "CARROSSEL" ? LIMITES_IG.carrosselMax : 1;
  const video = midias[0]?.type === "VIDEO" ? midias[0] : undefined;

  return (
    <div className="ig-composer">
      <div className="ig-composer-topo">
        <Link href={`/instagram?conta=${conta.id}`} className="eyebrow" style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> @{conta.username}</Link>
        <span className="ig-selo inline" data-status={status}>{status === "PUBLICANDO" && <Loader2 size={11} className="animate-spin" />}{STATUS_POST[status]}</span>
      </div>

      <div className="ig-composer-grid">
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          {status === "PUBLICADO" && (
            <div className="ig-aviso ok"><CheckCircle2 aria-hidden /><div><b>Publicado no Instagram</b>{permalink && <a href={permalink} target="_blank" rel="noreferrer">Ver a publicação <ExternalLink size={12} /></a>}</div></div>
          )}
          {status === "PUBLICANDO" && <div className="ig-aviso"><Loader2 className="animate-spin" aria-hidden /><div><b>Publicando…</b><span>Vídeos levam alguns minutos para o Instagram processar.</span></div></div>}
          {status === "AGENDADO" && (
            <div className="ig-aviso"><CalendarClock aria-hidden /><div><b>Agendado para {post.agendado_para ? new Date(post.agendado_para).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" }) : "agora"}</b><span>O worker publica na hora marcada (ele precisa estar ligado).</span></div>
              {podeEditar && <button className="btn btn-ghost btn-xs" onClick={cancelarAgendamento} disabled={pend}><Undo2 aria-hidden /> Cancelar</button>}</div>
          )}
          {status === "FALHOU" && erro && <div className="ig-aviso err"><AlertTriangle aria-hidden /><div><b>A publicação falhou</b><span>{erro}</span></div></div>}

          <section className="panel ig-bloco">
            <div className="ig-bloco-titulo">Tipo</div>
            <div className="ig-tipos-mini">
              {(Object.keys(TIPOS_POST) as TipoPost[]).map((t) => {
                const I = ICONE_TIPO[t];
                return <button key={t} type="button" className="ig-tipo-mini" aria-pressed={tipo === t} disabled={travado} onClick={() => { mudou(setTipo)(t); if (t !== "CARROSSEL" && ids.length > 1) setIds(ids.slice(0, 1)); }}><I size={16} aria-hidden /><b>{TIPOS_POST[t].nome}</b><span>{TIPOS_POST[t].desc}</span></button>;
              })}
            </div>
          </section>

          <section className="panel ig-bloco">
            <div className="ig-bloco-titulo">Mídia{tipo === "CARROSSEL" && <span className="subtle"> · {ids.length}/{LIMITES_IG.carrosselMax}</span>}</div>
            <div className="ig-midias">
              {midias.map((m, i) => (
                <div key={m.id} className="ig-midia">
                  <img src={arquivo(m.id, m.type === "VIDEO")} alt="" />
                  {m.type === "VIDEO" && <span className="ig-midia-dur">{Math.round((m.duration_ms ?? 0) / 1000)}s</span>}
                  {!travado && <div className="ig-midia-acoes">
                    {tipo === "CARROSSEL" && i > 0 && <button type="button" onClick={() => mover(i, -1)} aria-label="Mover para antes"><ArrowUp size={13} style={{ transform: "rotate(-90deg)" }} /></button>}
                    {tipo === "CARROSSEL" && i < ids.length - 1 && <button type="button" onClick={() => mover(i, 1)} aria-label="Mover para depois"><ArrowDown size={13} style={{ transform: "rotate(-90deg)" }} /></button>}
                    <button type="button" onClick={() => mudou(setIds)(ids.filter((x) => x !== m.id))} aria-label="Remover"><X size={13} /></button>
                  </div>}
                  {tipo === "CARROSSEL" && <span className="ig-midia-n">{i + 1}</span>}
                </div>
              ))}
              {!travado && ids.length < maxMidias && (
                <button type="button" className="ig-midia ig-midia-add" onClick={() => setPicker(true)}><ImagePlus size={22} aria-hidden /><span>Adicionar</span></button>
              )}
            </div>
            {tipo === "REELS" && video && (
              <div className="ig-opcoes">
                <label className="ig-switch"><input type="checkbox" checked={noFeed} disabled={travado} onChange={(e) => mudou(setNoFeed)(e.target.checked)} /><span>Mostrar o Reels também no feed do perfil</span></label>
                <div className="field">
                  <label className="label" htmlFor="capa">Capa: segundo {((capaMs ?? 0) / 1000).toFixed(1)}</label>
                  <input id="capa" type="range" min={0} max={video.duration_ms ?? 0} step={100} value={capaMs ?? 0} disabled={travado} onChange={(e) => mudou(setCapaMs)(Number(e.target.value))} />
                </div>
              </div>
            )}
          </section>

          {tipo !== "STORY" && (
            <section className="panel ig-bloco">
              <div className="ig-bloco-titulo">
                Legenda
                <span className="ig-contadores">
                  <span data-alerta={legenda.length > LIMITES_IG.legenda}>{legenda.length}/{LIMITES_IG.legenda}</span>
                  <span data-alerta={hashtags > LIMITES_IG.hashtags}><Hash size={11} />{hashtags}/{LIMITES_IG.hashtags}</span>
                </span>
              </div>
              <textarea className="ig-textarea" value={legenda} disabled={travado} onChange={(e) => mudou(setLegenda)(e.target.value)} rows={8}
                placeholder="Escreva a legenda… (a primeira linha é o gancho que aparece antes do “mais”)" />
              {!travado && (
                <div className="ig-ia">
                  <div className="ig-ia-linha">
                    <Sparkles size={16} aria-hidden style={{ color: "rgb(var(--c-brand))", flexShrink: 0 }} />
                    {marcas.length > 0 && (
                      <select className="select" value={marcaId} onChange={(e) => setMarcaId(e.target.value)} aria-label="Marca (tom de voz e regras da legenda)" title="Marca: a IA segue o tom e as regras dela" style={{ width: 130, height: 32 }}>
                        {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        <option value="">Sem marca</option>
                      </select>
                    )}
                    <input className="input-sm" style={{ flex: 1 }} value={dica} onChange={(e) => setDica(e.target.value)} maxLength={1000}
                      placeholder="Opcional: o que destacar (ex.: teste grátis, tom descontraído, CTA para o link da bio)" onKeyDown={(e) => e.key === "Enter" && gerar()} />
                    <button type="button" className="btn btn-primary btn-sm" onClick={gerar} disabled={pend || gerando || !midias.length} title={!midias.length ? "Escolha a mídia primeiro" : undefined}>
                      {gerando ? <><Loader2 className="animate-spin" aria-hidden /> Gerando…</> : <><Wand2 aria-hidden /> Gerar legenda e #</>}
                    </button>
                  </div>
                  {sugestao?.erro && <p className="error-text small">{sugestao.erro}</p>}
                  {sugestao?.legenda && (
                    <div className="ig-sugestao">
                      <p className="ig-sugestao-txt">{sugestao.legenda}</p>
                      <div className="ig-hashtags">
                        {(sugestao.hashtags ?? []).map((h) => <button key={h} type="button" className="chip" data-active={tags.includes(h)} onClick={() => setTags((t) => (t.includes(h) ? t.filter((x) => x !== h) : [...t, h]))}>{h}</button>)}
                      </div>
                      <div className="cluster" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSugestao(null)}>Descartar</button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => usarSugestao(false)}>Só a legenda</button>
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => usarSugestao(true)}><Check aria-hidden /> Usar legenda + {tags.length} hashtags</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {!travado && (
            <section className="panel ig-bloco">
              <div className="ig-bloco-titulo">Publicação</div>
              <div className="ig-modos">
                <label className="ig-modo" data-on={modo === "agora"}><input type="radio" checked={modo === "agora"} onChange={() => setModo("agora")} /><Rocket size={16} aria-hidden /><span><b>Publicar agora</b><small>Sai em até 1 minuto</small></span></label>
                <label className="ig-modo" data-on={modo === "agendar"}><input type="radio" checked={modo === "agendar"} onChange={() => setModo("agendar")} /><CalendarClock size={16} aria-hidden /><span><b>Agendar</b><small>O worker publica na hora</small></span></label>
              </div>
              {modo === "agendar" && <DataPicker hora value={data} onChange={setData} ariaLabel="Data e hora" />}
              {problemas.length > 0 && <ul className="ig-problemas">{problemas.map((p) => <li key={p}><AlertTriangle size={13} aria-hidden /> {p}</li>)}</ul>}
              <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => void salvar()} disabled={pend || !sujo}><Save aria-hidden /> Salvar rascunho</button>
                <button className="btn btn-primary btn-sm" onClick={() => (modo === "agora" ? setConfirmar(true) : enviar())} disabled={pend || problemas.length > 0}>
                  {pend ? <Loader2 className="animate-spin" aria-hidden /> : modo === "agora" ? <Rocket aria-hidden /> : <CalendarClock aria-hidden />}
                  {modo === "agora" ? "Publicar agora" : status === "AGENDADO" ? "Reagendar" : "Agendar"}
                </button>
              </div>
            </section>
          )}
        </div>

        <aside className="ig-previa">
          {tipo !== "STORY" && tipo !== "REELS" && (
            <div className="ig-previa-abas" role="tablist">
              <button role="tab" aria-selected={visao === "post"} onClick={() => setVisao("post")}>Publicação</button>
              <button role="tab" aria-selected={visao === "grade"} onClick={() => setVisao("grade")}>No perfil</button>
            </div>
          )}
          {tipo === "REELS" && (
            <div className="ig-previa-abas" role="tablist">
              <button role="tab" aria-selected={visao === "post"} onClick={() => setVisao("post")}>Reels</button>
              <button role="tab" aria-selected={visao === "grade"} onClick={() => setVisao("grade")}>No perfil</button>
            </div>
          )}
          <div className="ig-celular">
            {visao === "grade" && tipo !== "STORY" ? <GradeMock perfil={perfil} nova={midias[0] ?? null} existentes={feed} />
              : tipo === "STORY" ? <StoryMock perfil={perfil} midia={midias[0]} />
              : tipo === "REELS" ? <ReelsMock perfil={perfil} midia={midias[0]} legenda={legenda} />
              : <FeedMock perfil={perfil} midias={midias} legenda={legenda} />}
          </div>
          <p className="subtle caption" style={{ textAlign: "center" }}>Prévia aproximada; o Instagram pode cortar a imagem de forma diferente.</p>
        </aside>
      </div>

      <BibliotecaModal open={picker} onClose={() => setPicker(false)} titulo="Escolher mídia" podeEditar={podeEditar} jaTem={ids} max={Math.max(1, maxMidias - ids.length)}
        tipos={tipo === "REELS" ? ["VIDEO"] : tipo === "FEED" ? ["IMAGE"] : ["IMAGE", "VIDEO"]}
        onEscolher={(novos) => { setExtras((x) => [...x, ...novos]); mudou(setIds)([...ids, ...novos.map((n) => n.id)].slice(0, maxMidias)); }} />

      <Dialog open={confirmar} onClose={() => setConfirmar(false)} title="Publicar agora?">
        <p className="muted small">A publicação vai para <b>@{conta.username}</b> em até 1 minuto e fica visível para todos os seguidores. Para tirar depois, só apagando pelo Instagram.</p>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmar(false)}>Revisar</button>
          <button className="btn btn-primary btn-sm" onClick={enviar} disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />} Publicar</button>
        </div>
      </Dialog>
    </div>
  );
}
