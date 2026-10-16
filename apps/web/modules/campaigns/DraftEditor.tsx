"use client";

import { confirmar } from "../shell/confirmar";
import { googleSearchSchema, IDIOMAS, LANCES, LIMITES_RSA, palavraParaTexto, textoParaPalavras, type PalavraChave } from "@domus-ads/core/google-search";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Plus, Rocket, Save, ShieldCheck, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ContaGoogle } from "@/lib/contas";
import { Escolha } from "../motion/Escolha";
import { toast } from "../shell/toast";
import { ContaSelect } from "./ContaSelect";
import { LocalPicker } from "./LocalPicker";
import { ajustarComIA, apagarRascunho, publicar, salvarRascunho, validar } from "./rascunhos";

type Anuncio = { titulos: string[]; descricoes: string[]; caminho1: string; caminho2: string };
type Grupo = { nome: string; palavras: string; negativas: string; anuncios: Anuncio[]; cpcMax: string; aberto: boolean };
type Sitelink = { texto: string; descricao1: string; descricao2: string; url: string };
interface Estado {
  nome: string; orcamentoDiario: string; lances: keyof typeof LANCES; cpcMax: string; urlFinal: string; localizacoes: string[]; idiomas: (keyof typeof IDIOMAS)[];
  parceirosPesquisa: boolean; negativas: string; grupos: Grupo[]; sitelinks: Sitelink[]; frasesDestaque: string[];
}
export interface RascunhoView {
  id: string; name: string; status: string; source: string; error: string | null; validated_at: string | null; ad_account_id: string | null; spec: Record<string, unknown>;
}

const txt = (l: unknown) => (Array.isArray(l) ? (l as PalavraChave[]).map(palavraParaTexto).join("\n") : "");
function doSpec(s: Record<string, unknown>): Estado {
  const g = (s.grupos as Record<string, unknown>[] | undefined) ?? [];
  return {
    nome: String(s.nome ?? ""), orcamentoDiario: String(s.orcamentoDiario ?? ""), lances: (s.lances as Estado["lances"]) ?? "MAXIMIZE_CLICKS", cpcMax: String(s.cpcMax ?? ""),
    urlFinal: String(s.urlFinal ?? ""), localizacoes: (s.localizacoes as string[]) ?? ["Brasil"], idiomas: (s.idiomas as Estado["idiomas"]) ?? ["pt"],
    parceirosPesquisa: !!s.parceirosPesquisa, negativas: txt(s.negativas), sitelinks: (s.sitelinks as Sitelink[]) ?? [], frasesDestaque: (s.frasesDestaque as string[]) ?? [],
    grupos: g.length ? g.map((x, i) => ({
      nome: String(x.nome ?? ""), palavras: txt(x.palavras), negativas: txt(x.negativas), cpcMax: String(x.cpcMax ?? ""), aberto: i === 0,
      anuncios: ((x.anuncios as Anuncio[] | undefined) ?? []).map((a) => ({ titulos: a.titulos ?? [], descricoes: a.descricoes ?? [], caminho1: a.caminho1 ?? "", caminho2: a.caminho2 ?? "" })),
    })) : [{ nome: "Grupo 1", palavras: "", negativas: "", cpcMax: "", aberto: true, anuncios: [{ titulos: ["", "", ""], descricoes: ["", ""], caminho1: "", caminho2: "" }] }],
  };
}
function paraSpec(e: Estado) {
  return {
    nome: e.nome, orcamentoDiario: e.orcamentoDiario.replace(",", "."), lances: e.lances, ...(e.cpcMax.trim() ? { cpcMax: e.cpcMax.replace(",", ".") } : {}),
    urlFinal: e.urlFinal, localizacoes: e.localizacoes, idiomas: e.idiomas, parceirosPesquisa: e.parceirosPesquisa, negativas: textoParaPalavras(e.negativas),
    grupos: e.grupos.map((g) => ({
      nome: g.nome, palavras: textoParaPalavras(g.palavras), negativas: textoParaPalavras(g.negativas), ...(g.cpcMax.trim() ? { cpcMax: g.cpcMax.replace(",", ".") } : {}),
      anuncios: g.anuncios.map((a) => ({ titulos: a.titulos.map((t) => t.trim()).filter(Boolean), descricoes: a.descricoes.map((t) => t.trim()).filter(Boolean), caminho1: a.caminho1, caminho2: a.caminho2 })),
    })),
    sitelinks: e.sitelinks, frasesDestaque: e.frasesDestaque.filter(Boolean),
  };
}
/** "grupos.1.anuncios.0.titulos.4" → "Grupo 2 › anúncio 1 › título 5" */
function onde(path: PropertyKey[]): string {
  const nomes: Record<string, string> = { grupos: "Grupo", anuncios: "anúncio", titulos: "título", descricoes: "descrição", palavras: "palavra-chave", negativas: "negativa", sitelinks: "Sitelink", frasesDestaque: "Frase de destaque", localizacoes: "Localização" };
  const partes: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const k = String(path[i]), prox = path[i + 1];
    if (typeof prox === "number") { partes.push(`${nomes[k] ?? k} ${prox + 1}`); i++; } else partes.push(nomes[k] ?? k);
  }
  return partes.join(" › ");
}

export function DraftEditor({ d, contas, moeda, podeEditar, podePublicar }: { d: RascunhoView; contas: ContaGoogle[]; moeda: string; podeEditar: boolean; podePublicar: boolean }) {
  const router = useRouter();
  const [e, setE] = useState<Estado>(() => doSpec(d.spec));
  const [conta, setConta] = useState(d.ad_account_id ?? contas[0]?.id ?? "");
  const [sujo, setSujo] = useState(false);
  const [pend, start] = useTransition();
  const [pedido, setPedido] = useState("");
  const [frase, setFrase] = useState("");
  const [grupoPrevia, setGrupoPrevia] = useState(0);
  const gerando = d.status === "GENERATING", publicado = d.status === "PUBLISHED", bloqueado = !podeEditar || gerando || publicado || d.status === "PUBLISHING";
  const muda = (f: (x: Estado) => Estado) => { setE(f); setSujo(true); };
  const grupo = (i: number, f: (g: Grupo) => Grupo) => muda((x) => ({ ...x, grupos: x.grupos.map((g, j) => (j === i ? f(g) : g)) }));
  const anuncio = (i: number, f: (a: Anuncio) => Anuncio) => grupo(i, (g) => ({ ...g, anuncios: g.anuncios.map((a, k) => (k === 0 ? f(a) : a)) }));

  // enquanto a IA escreve, a página se atualiza sozinha
  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [gerando, router]);

  const spec = useMemo(() => paraSpec(e), [e]);
  const val = useMemo(() => googleSearchSchema.safeParse(spec), [spec]);
  const problemas = val.success ? [] : val.error.issues.slice(0, 30).map((i) => `${onde(i.path)}: ${i.message}`);
  const palavras = spec.grupos.reduce((a, g) => a + g.palavras.length, 0);

  const salvar = async () => {
    const r = await salvarRascunho(d.id, spec, conta);
    if (!r.ok) { toast.err(r.error); return false; }
    setSujo(false);
    return true;
  };
  const acao = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, depois?: () => void) => start(async () => {
    if (sujo && !(await salvar())) return;
    const r = await fn();
    if (!r.ok) return toast.err(r.error ?? "Erro");
    toast.ok(msg); depois?.(); router.refresh();
  });

  if (gerando) return (
    <div className="panel surge" style={{ padding: 40, display: "grid", placeItems: "center", gap: 14, textAlign: "center", maxWidth: 760 }}>
      <span className="icon-tile" style={{ width: 56, height: 56, boxShadow: "var(--glow-sm)" }}><Sparkles size={26} aria-hidden className="animate-pulse" /></span>
      <b style={{ fontSize: 18 }}>A IA está montando a campanha…</b>
      <span className="subtle small">Lendo o site, separando os grupos por intenção, escolhendo palavras-chave e escrevendo os anúncios dentro dos limites do Google. Leva cerca de 1 minuto.</span>
      <div className="stack" style={{ gap: 8, width: "100%", maxWidth: 420 }}>{[80, 60, 70].map((w, i) => <div key={i} className="skeleton" style={{ height: 12, width: `${w}%`, borderRadius: 6 }} />)}</div>
    </div>
  );

  const g0 = e.grupos[Math.min(grupoPrevia, e.grupos.length - 1)];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }} className="studio-view">
      <div className="stack" style={{ gap: 16 }}>
        {d.error && <div className="panel surge" role="alert" style={{ padding: 14, borderColor: "rgb(var(--c-error) / 0.5)", display: "flex", gap: 10 }}><AlertTriangle size={18} aria-hidden style={{ color: "rgb(var(--c-error))", flex: "none" }} /><span className="small">{d.error}</span></div>}
        {publicado && <div className="panel surge" style={{ padding: 14, borderColor: "rgb(var(--c-success) / 0.5)", display: "flex", gap: 10 }}><CheckCircle2 size={18} aria-hidden style={{ color: "rgb(var(--c-success))" }} /><span className="small">Publicada no Google Ads (pausada). Ative na lista de Campanhas quando quiser que ela rode.</span></div>}

        <section className="panel" data-enter style={{ padding: 18, display: "grid", gap: 14 }}>
          <div className="panel-title">Campanha</div>
          <div className="kpis" style={{ gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Campo label="Nome" valor={e.nome} on={(v) => muda((x) => ({ ...x, nome: v }))} max={120} off={bloqueado} />
            <Campo label={`Orçamento diário (${moeda})`} valor={e.orcamentoDiario} on={(v) => muda((x) => ({ ...x, orcamentoDiario: v }))} max={12} off={bloqueado} dica={e.orcamentoDiario ? `≈ ${(Number(e.orcamentoDiario.replace(",", ".")) * 30.4 || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${moeda}/mês` : undefined} />
          </div>
          <div className="kpis" style={{ gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Campo label="URL final (página de destino)" valor={e.urlFinal} on={(v) => muda((x) => ({ ...x, urlFinal: v }))} max={2000} off={bloqueado} />
            <div className="field">
              <label className="label" htmlFor="conta-google">Conta do Google Ads</label>
              <ContaSelect id="conta-google" contas={contas} valor={conta} disabled={bloqueado} onChange={(v) => { setConta(v); setSujo(true); }} />
            </div>
          </div>
          <div className="field">
            <span className="label">Estratégia de lances</span>
            <div className="cluster" style={{ gap: 10 }}>
              <Escolha valor={e.lances} raio={999} variante="pilula" className="cluster" style={{ gap: 6 }}>
                {(Object.keys(LANCES) as Estado["lances"][]).map((k) => <button key={k} data-opt={k} type="button" className="chip" data-active={e.lances === k} disabled={bloqueado} onClick={() => muda((x) => ({ ...x, lances: k }))}>{LANCES[k]}</button>)}
              </Escolha>
              {e.lances !== "MAXIMIZE_CONVERSIONS" && <input className="input-sm" style={{ width: 150 }} placeholder={e.lances === "MANUAL_CPC" ? "CPC padrão" : "Teto de CPC (opcional)"} value={e.cpcMax} disabled={bloqueado} onChange={(ev) => muda((x) => ({ ...x, cpcMax: ev.target.value }))} />}
            </div>
            <span className="subtle caption">{e.lances === "MAXIMIZE_CONVERSIONS" ? "Use só se as conversões já são medidas na conta." : e.lances === "MANUAL_CPC" ? "Você define o lance por clique (por grupo ou o padrão ao lado)." : "Bom para começar: o Google busca o máximo de cliques dentro do orçamento."}</span>
          </div>
          <div className="field">
            <span className="label">Onde mostrar</span>
            <LocalPicker valor={e.localizacoes} disabled={bloqueado} onChange={(v) => muda((x) => ({ ...x, localizacoes: v }))} />
          </div>
          <div className="cluster" style={{ gap: 16 }}>
            <div className="cluster" style={{ gap: 6 }}>
              <span className="label" style={{ marginRight: 4 }}>Idiomas</span>
              {(Object.keys(IDIOMAS) as Estado["idiomas"]).map((k) => <button key={k} type="button" className="chip" data-active={e.idiomas.includes(k)} disabled={bloqueado}
                onClick={() => muda((x) => ({ ...x, idiomas: x.idiomas.includes(k) ? x.idiomas.filter((y) => y !== k) : [...x.idiomas, k] }))}>{IDIOMAS[k].nome}</button>)}
            </div>
            <button type="button" role="switch" aria-checked={e.parceirosPesquisa} className="chave" disabled={bloqueado} onClick={() => muda((x) => ({ ...x, parceirosPesquisa: !x.parceirosPesquisa }))}>
              <span className="chave-trilho"><span className="chave-bola" /></span> Parceiros de pesquisa do Google
            </button>
          </div>
        </section>

        {e.grupos.map((g, i) => {
          const a = g.anuncios[0] ?? { titulos: [], descricoes: [], caminho1: "", caminho2: "" };
          const nKw = textoParaPalavras(g.palavras).length;
          return (
            <section key={i} className="panel surge" style={{ animationDelay: `${i * 50}ms` }}>
              <button type="button" className="panel-head" onClick={() => grupo(i, (x) => ({ ...x, aberto: !x.aberto }))} style={{ width: "100%", background: "none", border: 0, color: "inherit", cursor: "pointer", textAlign: "left" }}>
                <div><div className="panel-title">Grupo {i + 1}: {g.nome || "sem nome"}</div><div className="subtle caption">{nKw} palavras-chave · {a.titulos.filter(Boolean).length} títulos · {a.descricoes.filter(Boolean).length} descrições</div></div>
                <ChevronDown size={18} aria-hidden style={{ transform: g.aberto ? "rotate(180deg)" : "none", transition: "transform .3s" }} />
              </button>
              {g.aberto && (
                <div className="surge" style={{ padding: "0 18px 18px", display: "grid", gap: 14 }}>
                  <div className="kpis" style={{ gridTemplateColumns: e.lances === "MANUAL_CPC" ? "2fr 1fr" : "1fr", gap: 12 }}>
                    <Campo label="Nome do grupo" valor={g.nome} on={(v) => grupo(i, (x) => ({ ...x, nome: v }))} max={120} off={bloqueado} />
                    {e.lances === "MANUAL_CPC" && <Campo label="CPC do grupo" valor={g.cpcMax} on={(v) => grupo(i, (x) => ({ ...x, cpcMax: v }))} max={12} off={bloqueado} />}
                  </div>
                  <div className="kpis" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                    <Lista label={`Palavras-chave (${nKw})`} valor={g.palavras} on={(v) => grupo(i, (x) => ({ ...x, palavras: v }))} off={bloqueado} dica={'Uma por linha: [exata], "frase" ou ampla'} />
                    <Lista label="Negativas do grupo" valor={g.negativas} on={(v) => grupo(i, (x) => ({ ...x, negativas: v }))} off={bloqueado} dica="Buscas onde este grupo não deve aparecer" />
                  </div>
                  <div className="field">
                    <span className="label">Títulos ({a.titulos.filter(Boolean).length}/{LIMITES_RSA.maxTitulos}) · o Google combina até 3 por vez</span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
                      {a.titulos.map((t, k) => <Contado key={k} valor={t} max={LIMITES_RSA.titulo} off={bloqueado} on={(v) => anuncio(i, (x) => ({ ...x, titulos: x.titulos.map((y, m) => (m === k ? v : y)) }))}
                        remover={a.titulos.length > LIMITES_RSA.minTitulos ? () => anuncio(i, (x) => ({ ...x, titulos: x.titulos.filter((_, m) => m !== k) })) : undefined} ph={`Título ${k + 1}`} />)}
                      {!bloqueado && a.titulos.length < LIMITES_RSA.maxTitulos && <button type="button" className="btn btn-ghost btn-xs" onClick={() => anuncio(i, (x) => ({ ...x, titulos: [...x.titulos, ""] }))}><Plus aria-hidden /> Título</button>}
                    </div>
                  </div>
                  <div className="field">
                    <span className="label">Descrições ({a.descricoes.filter(Boolean).length}/{LIMITES_RSA.maxDescricoes})</span>
                    <div className="stack" style={{ gap: 8 }}>
                      {a.descricoes.map((t, k) => <Contado key={k} valor={t} max={LIMITES_RSA.descricao} off={bloqueado} on={(v) => anuncio(i, (x) => ({ ...x, descricoes: x.descricoes.map((y, m) => (m === k ? v : y)) }))}
                        remover={a.descricoes.length > LIMITES_RSA.minDescricoes ? () => anuncio(i, (x) => ({ ...x, descricoes: x.descricoes.filter((_, m) => m !== k) })) : undefined} ph={`Descrição ${k + 1}`} />)}
                      {!bloqueado && a.descricoes.length < LIMITES_RSA.maxDescricoes && <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => anuncio(i, (x) => ({ ...x, descricoes: [...x.descricoes, ""] }))}><Plus aria-hidden /> Descrição</button>}
                    </div>
                  </div>
                  <div className="cluster" style={{ gap: 8 }}>
                    <span className="label">Caminho exibido</span>
                    <span className="subtle small">{dominio(e.urlFinal)} /</span>
                    <Contado valor={a.caminho1} max={LIMITES_RSA.caminho} off={bloqueado} on={(v) => anuncio(i, (x) => ({ ...x, caminho1: v }))} ph="caminho1" largura={170} />
                    <span className="subtle">/</span>
                    <Contado valor={a.caminho2} max={LIMITES_RSA.caminho} off={bloqueado} on={(v) => anuncio(i, (x) => ({ ...x, caminho2: v }))} ph="caminho2" largura={170} />
                    <span style={{ flex: 1 }} />
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setGrupoPrevia(i)}>Ver na prévia</button>
                    {!bloqueado && e.grupos.length > 1 && <button type="button" className="btn btn-ghost btn-xs" onClick={async () => (await confirmar(`Remover o grupo “${g.nome}”?`)) && muda((x) => ({ ...x, grupos: x.grupos.filter((_, j) => j !== i) }))}><Trash2 aria-hidden /> Remover grupo</button>}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        {!bloqueado && e.grupos.length < 10 && (
          <button type="button" className="panel" onClick={() => muda((x) => ({ ...x, grupos: [...x.grupos.map((g) => ({ ...g, aberto: false })), { nome: `Grupo ${x.grupos.length + 1}`, palavras: "", negativas: "", cpcMax: "", aberto: true, anuncios: [{ titulos: ["", "", ""], descricoes: ["", ""], caminho1: "", caminho2: "" }] }] }))}
            style={{ padding: 14, borderStyle: "dashed", background: "transparent", cursor: "pointer", display: "flex", gap: 8, justifyContent: "center" }}><Plus aria-hidden /> Adicionar grupo de anúncios</button>
        )}

        <section className="panel" data-enter style={{ padding: 18, display: "grid", gap: 14 }}>
          <div className="panel-title">Negativas e extensões</div>
          <Lista label="Palavras negativas da campanha" valor={e.negativas} on={(v) => muda((x) => ({ ...x, negativas: v }))} off={bloqueado} dica="Ex.: vagas, gratis pdf, download — buscas que não compram" />
          <div className="field">
            <span className="label">Frases de destaque ({e.frasesDestaque.length}/10)</span>
            <div className="cluster" style={{ gap: 6 }}>
              {e.frasesDestaque.map((t, k) => <span key={k} className="chip" data-active>{t}{!bloqueado && <button type="button" aria-label="Remover" onClick={() => muda((x) => ({ ...x, frasesDestaque: x.frasesDestaque.filter((_, m) => m !== k) }))} style={{ all: "unset", cursor: "pointer", display: "inline-flex" }}><X size={13} /></button>}</span>)}
              {!bloqueado && e.frasesDestaque.length < 10 && <input className="input-sm" style={{ width: 220 }} maxLength={25} placeholder="Ex.: Suporte humano + Enter" value={frase} onChange={(ev) => setFrase(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter" && frase.trim()) { ev.preventDefault(); const v = frase.trim(); muda((x) => ({ ...x, frasesDestaque: [...x.frasesDestaque, v] })); setFrase(""); } }} />}
            </div>
          </div>
          <div className="field">
            <span className="label">Sitelinks ({e.sitelinks.length}/8)</span>
            <div className="stack" style={{ gap: 8 }}>
              {e.sitelinks.map((s, k) => (
                <div key={k} className="kpis surge" style={{ gridTemplateColumns: "1fr 1fr 1fr 1.4fr auto", gap: 6 }}>
                  <Contado valor={s.texto} max={25} off={bloqueado} ph="Texto do link" on={(v) => muda((x) => ({ ...x, sitelinks: x.sitelinks.map((y, m) => (m === k ? { ...y, texto: v } : y)) }))} />
                  <Contado valor={s.descricao1} max={35} off={bloqueado} ph="Descrição 1" on={(v) => muda((x) => ({ ...x, sitelinks: x.sitelinks.map((y, m) => (m === k ? { ...y, descricao1: v } : y)) }))} />
                  <Contado valor={s.descricao2} max={35} off={bloqueado} ph="Descrição 2" on={(v) => muda((x) => ({ ...x, sitelinks: x.sitelinks.map((y, m) => (m === k ? { ...y, descricao2: v } : y)) }))} />
                  <input className="input-sm" value={s.url} disabled={bloqueado} placeholder="https://…" onChange={(ev) => muda((x) => ({ ...x, sitelinks: x.sitelinks.map((y, m) => (m === k ? { ...y, url: ev.target.value } : y)) }))} />
                  {!bloqueado && <button type="button" className="btn btn-ghost btn-xs" aria-label="Remover sitelink" onClick={() => muda((x) => ({ ...x, sitelinks: x.sitelinks.filter((_, m) => m !== k) }))}><Trash2 aria-hidden /></button>}
                </div>
              ))}
              {!bloqueado && e.sitelinks.length < 8 && <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => muda((x) => ({ ...x, sitelinks: [...x.sitelinks, { texto: "", descricao1: "", descricao2: "", url: x.urlFinal }] }))}><Plus aria-hidden /> Sitelink</button>}
            </div>
          </div>
        </section>
      </div>

      <div className="stack" style={{ gap: 12, position: "sticky", top: 16 }}>
        <div className="panel" data-enter style={{ padding: 16, display: "grid", gap: 10 }}>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span className="badge">{({ DRAFT: "Rascunho", FAILED: "Com erro", PUBLISHING: "Publicando…", PUBLISHED: "Publicada" } as Record<string, string>)[d.status] ?? d.status}</span>
            <span className="subtle caption">{d.source === "AI" ? "Proposta da IA" : "Manual"}{sujo ? " · alterações não salvas" : d.validated_at ? " · validada no Google" : ""}</span>
          </div>
          <div className="subtle small">{spec.grupos.length} grupo(s) · {palavras} palavras-chave · {e.localizacoes.join(", ") || "sem localização"}</div>
          {!bloqueado && (
            <div className="stack" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={pend || !sujo} onClick={() => start(async () => { if (await salvar()) { toast.ok("Rascunho salvo"); router.refresh(); } })}><Save aria-hidden /> Salvar</button>
              <button className="btn btn-secondary btn-sm" disabled={pend || !val.success} onClick={() => acao(() => validar(d.id), "O Google conferiu tudo: pode publicar")} title="O Google confere a campanha inteira sem criar nada">
                {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><ShieldCheck aria-hidden /> Validar no Google</>}
              </button>
              {podePublicar && <button className="btn btn-primary btn-sm" disabled={pend || !val.success} onClick={async () => (await confirmar("Criar esta campanha no Google Ads? Ela nasce PAUSADA: nada é gasto até você ativar em Campanhas.")) && acao(() => publicar(d.id), "Campanha criada no Google (pausada)", () => router.push("/campaigns"))}>
                <Rocket aria-hidden /> Publicar (pausada)
              </button>}
              {!podePublicar && <span className="subtle caption">Só Admin/Owner publica.</span>}
            </div>
          )}
          {problemas.length > 0 && (
            <div className="stack" style={{ gap: 4, maxHeight: 220, overflowY: "auto" }}>
              <span className="small" style={{ color: "rgb(var(--c-warning))", display: "flex", gap: 6, alignItems: "center" }}><AlertTriangle size={14} aria-hidden /> {problemas.length} ajuste(s) antes de publicar</span>
              {problemas.map((p) => <span key={p} className="subtle caption">• {p}</span>)}
            </div>
          )}
        </div>

        <div className="panel" data-enter style={{ padding: 16, display: "grid", gap: 10 }}>
          <div className="panel-title">Prévia na busca</div>
          {g0 && <Previa url={e.urlFinal} a={g0.anuncios[0]} sitelinks={e.sitelinks} />}
          {e.grupos.length > 1 && <div className="cluster" style={{ gap: 4 }}>{e.grupos.map((g, i) => <button key={i} type="button" className="chip" style={{ height: 26, fontSize: 11 }} data-active={grupoPrevia === i} onClick={() => setGrupoPrevia(i)}>{g.nome || `Grupo ${i + 1}`}</button>)}</div>}
        </div>

        {!bloqueado && (
          <div className="panel" data-enter style={{ padding: 16, display: "grid", gap: 8 }}>
            <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Wand2 size={15} aria-hidden /> Ajustar com IA</div>
            <textarea className="input-sm" rows={3} style={{ height: "auto", paddingBlock: 8 }} maxLength={2000} value={pedido} onChange={(ev) => setPedido(ev.target.value)} placeholder="Ex.: mais palavras de cauda longa; um grupo só para Goiânia; títulos com o teste grátis" />
            <button className="btn btn-secondary btn-sm" disabled={pend || pedido.trim().length < 3} onClick={() => acao(() => ajustarComIA(d.id, pedido), "A IA está ajustando a proposta", () => setPedido(""))}><Sparkles aria-hidden /> Pedir ajuste</button>
          </div>
        )}
        {podeEditar && !publicado && d.status !== "PUBLISHING" && (
          <button className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={async () => (await confirmar("Apagar este rascunho?")) && start(async () => { const r = await apagarRascunho(d.id); if (!r.ok) return toast.err(r.error); router.push("/campaigns"); })}><Trash2 aria-hidden /> Apagar rascunho</button>
        )}
      </div>
    </div>
  );
}

const dominio = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "seusite.com.br"; } };

/** Como o anúncio aparece no Google: títulos giram de 3 em 3 (o Google combina sozinho). */
function Previa({ url, a, sitelinks }: { url: string; a?: Anuncio; sitelinks: Sitelink[] }) {
  const [n, setN] = useState(0);
  const titulos = (a?.titulos ?? []).filter(Boolean);
  useEffect(() => { if (titulos.length <= 3) return; const t = setInterval(() => setN((x) => x + 1), 2800); return () => clearInterval(t); }, [titulos.length]);
  const tres = titulos.length ? [0, 1, 2].map((k) => titulos[(n * 3 + k) % titulos.length]).filter((v, i, l) => l.indexOf(v) === i) : ["Seu título aparece aqui"];
  const desc = (a?.descricoes ?? []).filter(Boolean).slice(0, 2).join(" ") || "As descrições aparecem aqui.";
  return (
    <div style={{ background: "#fff", color: "#202124", borderRadius: 12, padding: 14, fontFamily: "Arial, sans-serif", display: "grid", gap: 4 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#f1f3f4", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#5f6368" }}>{dominio(url)[0]?.toUpperCase()}</span>
        <span><b style={{ fontWeight: 700 }}>Patrocinado</b><br /><span style={{ color: "#4d5156" }}>{dominio(url)}{a?.caminho1 ? ` › ${a.caminho1}` : ""}{a?.caminho1 && a?.caminho2 ? ` › ${a.caminho2}` : ""}</span></span>
      </div>
      <div key={n} className="surge" style={{ color: "#1a0dab", fontSize: 18, lineHeight: 1.3, animationDuration: ".45s" }}>{tres.join(" | ")}</div>
      <div style={{ fontSize: 13, color: "#4d5156", lineHeight: 1.45 }}>{desc}</div>
      {sitelinks.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 13, color: "#1a0dab", marginTop: 2 }}>{sitelinks.slice(0, 4).map((s, i) => <span key={i}>{s.texto || "Sitelink"}</span>)}</div>}
    </div>
  );
}

function Campo({ label, valor, on, max, off, dica }: { label: string; valor: string; on: (v: string) => void; max: number; off?: boolean; dica?: string }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input" value={valor} maxLength={max} disabled={off} onChange={(ev) => on(ev.target.value)} />
      {dica && <span className="subtle caption">{dica}</span>}
    </div>
  );
}

function Lista({ label, valor, on, off, dica }: { label: string; valor: string; on: (v: string) => void; off?: boolean; dica: string }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <textarea className="input" rows={7} value={valor} disabled={off} onChange={(ev) => on(ev.target.value)} style={{ fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13 }} />
      <span className="subtle caption">{dica}</span>
    </div>
  );
}

/** Campo com contador de caracteres (fica vermelho ao passar do limite do Google). */
function Contado({ valor, on, max, off, remover, ph, largura }: { valor: string; on: (v: string) => void; max: number; off?: boolean; remover?: () => void; ph?: string; largura?: number }) {
  const n = valor.length, passou = n > max;
  return (
    <div style={{ position: "relative", display: "flex", gap: 4, width: largura }}>
      <input className="input-sm" aria-invalid={passou} value={valor} disabled={off} placeholder={ph} onChange={(ev) => on(ev.target.value)} style={{ flex: 1, minWidth: 0, paddingRight: 46 }} />
      <span className="tabular" style={{ position: "absolute", right: remover && !off ? 38 : 10, top: "50%", transform: "translateY(-50%)", fontSize: 10.5, color: passou ? "rgb(var(--c-error))" : n > max * 0.85 ? "rgb(var(--c-warning))" : "rgb(var(--c-text-tertiary))", pointerEvents: "none" }}>{n}/{max}</span>
      {remover && !off && <button type="button" className="btn btn-ghost btn-xs" aria-label="Remover" onClick={remover} style={{ padding: "0 6px" }}><X aria-hidden /></button>}
    </div>
  );
}
