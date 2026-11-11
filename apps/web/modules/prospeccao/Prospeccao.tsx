"use client";

import { hasAds, OPPORTUNITY, whatsappNumber, type BuscaForm as Form, type Lead, type LeadCampaign, type LeadStage, type ScoreWeights, type WebsiteStatus } from "@domus-ads/core/prospeccao";
import {
  ArrowLeft, Bot, Briefcase, Building2, Download, FolderInput, Globe2, KanbanSquare, ListChecks, Loader2, Mail, Megaphone, MousePointerClick, Plus, Radar, Search, Settings2,
  SlidersHorizontal, Square, Star, Trash2, TriangleAlert,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { confirmar } from "../shell/confirmar";
import { toast } from "../shell/toast";
import { usePulso } from "../shell/usePulso";
import {
  analisarLeads, editarLead, excluirCampanha, excluirLeadDeVez, exportarMd, importarMd, iniciarBusca, lixeiraLead, pararAnalise, salvarConfig, transformarEmLead,
} from "./actions";
import { BUSCA_PADRAO, BuscaForm } from "./BuscaForm";
import { ScoreRing, STATUS } from "./comum";
import { LeadDetalhe } from "./LeadDetalhe";
import { LeadLista } from "./LeadLista";
import { MapGuard } from "./MapGuard";
import { Slider } from "./ui";
import { Seletor } from "@/modules/shell/Seletor";

const LeadMap = dynamic(() => import("./Mapas").then((m) => m.LeadMap), { ssr: false, loading: () => <div className="pp-mapa pp-mapa-carregando" style={{ height: 320 }} /> });

export type Aba = "search" | "results" | "pipeline" | "settings";
type StatusFilter = "opportunities" | "all" | WebsiteStatus;
type Toggle = "email" | "whatsapp" | "ads" | "analyzed";
export interface AnaliseTela { jobId: string; ids: string[]; progress: number }

const CAMPAIGN_STATUS: Record<LeadCampaign["status"], { label: string; tone: "brand" | "success" | "danger" | "neutral" }> = {
  running: { label: "Rodando…", tone: "brand" }, completed: { label: "Concluída", tone: "success" },
  failed: { label: "Falhou", tone: "danger" }, cancelled: { label: "Parada", tone: "neutral" },
};
/** Quantos leads o "Analisar com IA" pega por vez (2 rodam juntos no worker). */
const BATCH_SIZE = 10;
const TOGGLES: Record<Toggle, { label: string; test: (l: Lead) => boolean }> = {
  email: { label: "Com e-mail", test: (l) => Boolean(l.email) },
  whatsapp: { label: "Com WhatsApp", test: (l) => Boolean(whatsappNumber(l)) },
  ads: { label: "Já anuncia", test: hasAds },
  analyzed: { label: "Analisados", test: (l) => Boolean(l.aiInsight) },
};
const WEIGHT_LABEL: Record<keyof ScoreWeights, string> = {
  noSite: "Sem site", brokenSite: "Site quebrado", weakSite: "Site fraco", socialOnly: "Só redes sociais",
  instagram: "Ativo nas redes", contact: "Contato disponível", reviews: "Avaliações no Google", distance: "Proximidade", ads: "Já investe em anúncios",
};
const ABAS_NAV = [["search", "Buscar", Radar], ["results", "Resultados", ListChecks], ["pipeline", "Pipeline", KanbanSquare], ["settings", "Ajustes", Settings2]] as const;
const STATUS_OPCOES = [
  { valor: "opportunities", rotulo: "Oportunidades" }, { valor: "no_site", rotulo: "Sem site" }, { valor: "broken", rotulo: "Quebrado" }, { valor: "weak", rotulo: "Fraco" },
  { valor: "social_only", rotulo: "Só redes" }, { valor: "healthy", rotulo: "Saudável" }, { valor: "all", rotulo: "Todos" },
];
const dataCurta = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

/** Um card por busca. `<article>`, não `<button>`: o botão de excluir mora dentro do card. */
function CampaignCard({ c, onOpen, onDelete }: { c: LeadCampaign; onOpen: () => void; onDelete: () => void }) {
  const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.failed;
  return (
    <article onClick={onOpen} className="panel pp-busca-card" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="pp-busca-card-topo">
        <span className="icon-tile"><Building2 aria-hidden /></span>
        <span className="cluster" style={{ gap: 4 }}>
          <span className="pp-selo" data-tone={st.tone === "brand" ? "accent" : st.tone}>{c.status === "running" && <Loader2 className="animate-spin" aria-hidden />}{st.label}</span>
          <button className="btn btn-ghost btn-xs pp-so-hover" aria-label={`Excluir busca ${c.name}`} title="Excluir busca" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 aria-hidden /></button>
        </span>
      </div>
      <div className="pp-busca-card-id">
        <h3 className="pp-trunc">{c.name}</h3>
        <p className="pp-trunc">{c.niches.join(", ")} · {c.locationLabel} · {String(c.radiusKm).replace(".", ",")} km</p>
      </div>
      <div className="pp-busca-card-pe">
        <p><b className="tabular">{c.foundCount}</b> leads</p>
        <span>{dataCurta(c.createdAt)}</span>
      </div>
    </article>
  );
}

function Vazio({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className="panel empty">
      <span className="icon-tile"><Search aria-hidden /></span>
      <div><b>{title}</b><p className="subtle caption" style={{ marginTop: 4 }}>{text}</p></div>
      {action}
    </div>
  );
}

function Pipeline({ leads, stages, onStage, onOpen }: { leads: Lead[]; stages: LeadStage[]; onStage: (id: string, stageId: string) => void; onOpen: (l: Lead) => void }) {
  return (
    <div className="pp-pipeline" aria-label="Pipeline comercial">
      {stages.map((stage) => {
        const items = leads.filter((x) => x.stageId === stage.id);
        return (
          <section key={stage.id} className="panel pp-coluna" style={{ ["--cor" as string]: stage.color }}>
            <header><span>{stage.name}</span><span className="pp-coluna-n tabular">{items.length}</span></header>
            <div className="pp-coluna-lista">
              {items.map((lead) => (
                <article key={lead.id} className="pp-cartao">
                  <button type="button" className="pp-cartao-id" onClick={() => onOpen(lead)} title="Ver nos resultados">
                    <ScoreRing score={lead.score} size={32} />
                    <span>
                      <b className="pp-trunc">{lead.name}</b>
                      <small className="pp-trunc">{(STATUS[lead.websiteStatus] ?? STATUS.unknown).label}{lead.phone ? ` · ${lead.phone}` : ""}</small>
                    </span>
                  </button>
                  <select className="select pp-cartao-etapa" aria-label={`Etapa de ${lead.name}`} value={lead.stageId} onChange={(e) => onStage(lead.id, e.target.value)}>
                    {stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </article>
              ))}
              {!items.length && <p className="pp-coluna-vazia">Nenhum lead nesta etapa.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Prospeccao({ campanhas, campanhaId, leads: leadsServidor, etapas, config, iaPronta, analise, abaInicial }: {
  campanhas: LeadCampaign[]; campanhaId: string | null; leads: Lead[]; etapas: LeadStage[];
  config: { oferta: string; pesos: ScoreWeights }; iaPronta: boolean; analise: AnaliseTela | null; abaInicial: Aba;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Aba>(abaInicial);
  const [form, setForm] = useState<Form>(BUSCA_PADRAO);
  const [enviando, setEnviando] = useState(false);
  // edições otimistas por cima do que veio do servidor (a página recarrega quando algo muda de verdade)
  const [patches, setPatches] = useState<Record<string, Partial<Lead>>>({});
  const leads = useMemo(() => leadsServidor.map((l) => (patches[l.id] ? { ...l, ...patches[l.id] } : l)), [leadsServidor, patches]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("opportunities");
  const [minScore, setMinScore] = useState(0);
  const [toggles, setToggles] = useState<Set<Toggle>>(new Set());
  const [showTrash, setShowTrash] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [offer, setOffer] = useState(config.oferta);
  const [weights, setWeights] = useState<ScoreWeights>(config.pesos);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const running = campanhas.some((c) => c.status === "running");
  // recarrega só quando algo muda (busca terminou, análise gravou um lead); parado quando nada roda
  usePulso("prospeccao", 3000, running || !!analise);

  const activeCampaign = campanhas.find((x) => x.id === campanhaId);
  const visiveis = useMemo(() => leads.filter((l) => !!l.deletedAt === showTrash && (!campanhaId || l.campaignId === campanhaId)), [leads, showTrash, campanhaId]);
  const filtered = useMemo(() => visiveis.filter((lead) => {
    const hay = `${lead.name} ${lead.address} ${lead.category} ${lead.notes}`.toLowerCase();
    const matchesStatus = status === "all" || (status === "opportunities" ? OPPORTUNITY.includes(lead.websiteStatus) : lead.websiteStatus === status);
    return (!query.trim() || hay.includes(query.trim().toLowerCase())) && matchesStatus && lead.score >= minScore && [...toggles].every((t) => TOGGLES[t].test(lead));
  }).sort((a, b) => b.score - a.score), [visiveis, query, status, minScore, toggles]);

  const stats = useMemo(() => {
    const vivos = leads.filter((l) => !l.deletedAt && (!campanhaId || l.campaignId === campanhaId));
    const rated = vivos.filter((l) => l.rating !== undefined);
    return {
      total: vivos.length,
      noSite: vivos.filter((l) => l.websiteStatus === "no_site" || l.websiteStatus === "social_only").length,
      weak: vivos.filter((l) => l.websiteStatus === "weak" || l.websiteStatus === "broken").length,
      ads: vivos.filter(hasAds).length,
      email: vivos.filter((l) => l.email).length,
      rating: rated.length ? (rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length).toFixed(1).replace(".", ",") : "—",
    };
  }, [leads, campanhaId]);

  const selected = filtered.find((l) => l.id === selectedId) ?? (campanhaId ? filtered[0] : undefined);
  const center: [number, number] | undefined = activeCampaign?.centerLat !== undefined && activeCampaign.centerLng !== undefined ? [activeCampaign.centerLat, activeCampaign.centerLng] : undefined;
  const ir = (c: string | null, aba: Aba = "results") => { setSelectedId(undefined); router.push(`/crm/prospeccao?${new URLSearchParams({ ...(c ? { c } : {}), aba })}`); setTab(aba); };

  async function startSearch() {
    if (running) return toast.err("Já existe uma busca em andamento");
    setEnviando(true);
    const r = await iniciarBusca(form);
    setEnviando(false);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Busca enviada para o worker: acompanhe no aviso");
    ir(r.data.id);
  }

  const patch = (id: string, p: Partial<Lead>) => setPatches((x) => ({ ...x, [id]: { ...x[id], ...p } }));
  async function changeStage(id: string, stageId: string) {
    patch(id, { stageId });
    const r = await editarLead(id, { stageId });
    if (!r.ok) toast.err(r.error);
  }
  async function editLead(id: string, p: { notes?: string; tags?: string[]; nextActionAt?: number | null }) {
    patch(id, { ...p, nextActionAt: p.nextActionAt ?? undefined });
    const r = await editarLead(id, p);
    if (!r.ok) toast.err(r.error);
  }
  async function trash(id: string, apagar: boolean) {
    patch(id, { deletedAt: apagar ? Date.now() : undefined });
    const r = await lixeiraLead(id, apagar);
    if (!r.ok) toast.err(r.error);
  }
  async function purge(id: string) {
    if (!(await confirmar("Excluir este lead permanentemente? Esta ação não pode ser desfeita."))) return;
    const r = await excluirLeadDeVez(id);
    if (!r.ok) return toast.err(r.error);
    router.refresh();
  }
  async function removeCampaign(id: string) {
    const name = campanhas.find((x) => x.id === id)?.name ?? "esta busca";
    if (!(await confirmar(`Excluir "${name}" e todos os seus leads? Esta ação não pode ser desfeita.`))) return;
    const r = await excluirCampanha(id);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Busca excluída");
    if (campanhaId === id) ir(null);
    else router.refresh();
  }
  async function exportMd() {
    if (!campanhaId) return;
    const r = await exportarMd(campanhaId);
    if (!r.ok) return toast.err(r.error);
    const url = URL.createObjectURL(new Blob([r.data.texto], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: r.data.nome });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.ok("Base Markdown baixada");
  }
  async function importMd(f: File | undefined) {
    if (arquivo.current) arquivo.current.value = "";
    if (!f) return;
    if (f.size > 15_000_000) return toast.err("Arquivo grande demais");
    const r = await importarMd(await f.text());
    if (!r.ok) return toast.err(r.error);
    toast.ok(`${r.data.importados} leads importados`);
    ir(r.data.campanhaId);
  }
  async function analyze(ids: string[]) {
    const r = await analisarLeads(ids);
    if (!r.ok) return toast.err(r.error);
    router.refresh();
  }
  async function stopBatch() {
    if (!analise) return;
    const r = await pararAnalise(analise.jobId);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Análise interrompida");
    router.refresh();
  }
  async function virarLead(id: string, mensagem: string) {
    const r = await transformarEmLead(id, mensagem);
    if (!r.ok) { toast.err(r.error); return null; }
    patch(id, { crmNumber: r.data });
    return r.data;
  }
  async function saveConfig() {
    setSalvando(true);
    const r = await salvarConfig({ oferta: offer, pesos: weights });
    setSalvando(false);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Configurações salvas: valem para as próximas buscas e análises");
    router.refresh();
  }

  const pending = showTrash || analise ? [] : filtered.filter((l) => !l.aiInsight).slice(0, BATCH_SIZE);
  const flip = (t: Toggle) => setToggles((prev) => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; });
  const newSearch = <button className="btn btn-primary btn-sm" onClick={() => setTab("search")}><Plus aria-hidden />Nova busca</button>;
  const emLote = analise && analise.ids.length > 1;

  // as abas moram no cabeçalho roxo de cada tela (sem o card de título em cima)
  const nav = (
    <nav className="pp-nav" role="tablist" aria-label="Áreas da prospecção">
      {ABAS_NAV.map(([v, l, I]) => (
        <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} aria-label={l} title={l} data-so-icone={v === "settings" || undefined}>
          <I aria-hidden />{v !== "settings" && l}{v === "results" && stats.total > 0 && <span className="pp-nav-n tabular">{stats.total}</span>}
        </button>
      ))}
    </nav>
  );
  const trilha = (onde: string) => <span className="pp-console-trilha"><img src="/domus-logo.png" alt="" width={22} height={22} /> / Prospecção / {onde}</span>;
  const faixa = (titulo: string, onde: string, acoes?: ReactNode) => (
    <header className="pp-faixa" data-enter>
      <div>{trilha(onde)}<h1>{titulo}<i>.</i></h1></div>
      <div className="pp-faixa-dir">{acoes}{nav}</div>
    </header>
  );

  return (
    <div className="page pp pp-cheia">
      {tab === "search" && <BuscaForm value={form} onChange={setForm} onSubmit={startSearch} running={running} enviando={enviando} nav={nav} />}

      {tab === "results" && (campanhaId && activeCampaign ? (
        <section className="pp-console pp-console-res" data-enter>
          <aside className="pp-console-lado">
            <header className="pp-console-cab pp-res-cab">
              {trilha("Resultados")}
              <div className="pp-res-titulo">
                <button type="button" className="pp-voltar" aria-label="Voltar às buscas" title="Voltar às buscas" onClick={() => ir(null)}><ArrowLeft aria-hidden /></button>
                <div>
                  <h2 className="pp-trunc" title={activeCampaign.name}>{activeCampaign.name}</h2>
                  <p className="pp-trunc">{activeCampaign.locationLabel} · {String(activeCampaign.radiusKm).replace(".", ",")} km · {new Date(activeCampaign.createdAt).toLocaleDateString("pt-BR")}
                    {activeCampaign.status !== "completed" && <> · <b>{CAMPAIGN_STATUS[activeCampaign.status]?.label}</b></>}</p>
                </div>
                <span className="pp-res-icones">
                  <button type="button" onClick={exportMd} aria-label="Exportar .md" title="Exportar .md"><Download aria-hidden /></button>
                  <button type="button" onClick={() => removeCampaign(campanhaId)} aria-label="Excluir busca" title="Excluir busca" data-perigo><Trash2 aria-hidden /></button>
                </span>
              </div>
              {nav}
            </header>

            <div className="pp-res-filtros">
              <label className="pp-filtro-busca">
                <Search aria-hidden />
                <input className="input-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Empresa, categoria, endereço ou nota…" aria-label="Filtrar leads" />
              </label>
              <div className="pp-res-chips">
                {(Object.keys(TOGGLES) as Toggle[]).map((t) => <button key={t} className="chip" data-active={toggles.has(t)} aria-pressed={toggles.has(t)} onClick={() => flip(t)}>{TOGGLES[t].label}</button>)}
                <button className="chip" data-active={showTrash} aria-pressed={showTrash} onClick={() => { setShowTrash((v) => !v); setSelectedId(undefined); }}><Trash2 aria-hidden />Lixeira</button>
              </div>
              <div className="pp-res-duas">
                <div className="pp-campo"><span className="pp-rot">Site</span>
                  <Seletor ariaLabel="Status do site" valor={status} onChange={(v) => setStatus(v as StatusFilter)} className="seletor-alto seletor-campo" opcoes={STATUS_OPCOES} /></div>
                <Slider label="Score mínimo" value={minScore} min={0} max={100} onChange={setMinScore} />
              </div>
            </div>

            <div className="pp-res-lista-cab">
              <p><b className="tabular">{filtered.length}</b> de {visiveis.length} · por score</p>
              {emLote ? (
                <div className="pp-lote" role="status">
                  <span className="pp-lote-barra"><span style={{ width: `${analise!.progress}%` }} /></span>
                  {Math.round((analise!.progress / 100) * analise!.ids.length)}/{analise!.ids.length}
                  <button className="btn btn-ghost btn-xs" onClick={stopBatch}><Square aria-hidden />Parar</button>
                </div>
              ) : pending.length > 0 && (
                iaPronta
                  ? <button className="btn btn-primary btn-xs" onClick={() => analyze(pending.map((l) => l.id))} title="Os melhores da lista atual que ainda não têm análise"><Bot aria-hidden />Analisar {pending.length} com IA</button>
                  : <a className="btn btn-secondary btn-xs" href="/settings"><Bot aria-hidden />Conectar IA</a>
              )}
            </div>
            <div className="pp-res-rolagem">
              <LeadLista leads={filtered} selectedId={selected?.id} trashed={showTrash} onSelect={setSelectedId}
                onTrash={(id) => trash(id, true)} onRestore={(id) => trash(id, false)} onPurge={purge} />
            </div>
          </aside>

          <div className="pp-console-mapa">
            <MapGuard><LeadMap leads={filtered} selectedId={selected?.id} onSelect={setSelectedId} radiusKm={activeCampaign.radiusKm} center={center} /></MapGuard>
            <div className="pp-hud-topo">
              <div className="pp-hud pp-hud-kpis">
                {([[Building2, "Leads", stats.total, undefined], [Globe2, "Sem site", stats.noSite, "error"], [TriangleAlert, "Site ruim", stats.weak, "warning"],
                  [Megaphone, "Anunciam", stats.ads, undefined], [Mail, "Com e-mail", stats.email, "success"], [Star, "Nota média", stats.rating, "warning"]] as const).map(([I, l, v, tom]) => (
                  <span key={l} data-tone={tom}><small><I aria-hidden />{l}</small><b className="tabular">{v}</b></span>
                ))}
              </div>
            </div>
            {(activeCampaign.status === "failed" && activeCampaign.error) || activeCampaign.blocked ? (
              <p className="pp-hud pp-hud-aviso" role="status"><TriangleAlert aria-hidden />
                {activeCampaign.status === "failed" && activeCampaign.error ? activeCampaign.error : "O Google limitou as buscas no meio do caminho: os leads achados até ali foram salvos."}</p>
            ) : null}
          </div>

          <aside className="pp-console-detalhe">
            {selected && !showTrash ? (
              <LeadDetalhe lead={selected} stages={etapas} iaPronta={iaPronta} analisando={!!analise?.ids.includes(selected.id)}
                onStage={changeStage} onEdit={editLead} onAnalyze={(id) => analyze([id])} onLead={virarLead} />
            ) : (
              <div className="pp-det-vazio"><span className="pp-hud-ico"><MousePointerClick aria-hidden /></span><b>Escolha um lead</b><small>Clique na lista ou num pino do mapa para ver contato, diagnóstico e abordagem.</small></div>
            )}
          </aside>
        </section>
      ) : (
        <>
          {faixa("Suas buscas", "Resultados", <>
            <input ref={arquivo} type="file" accept=".md,text/markdown" hidden onChange={(e) => void importMd(e.target.files?.[0])} />
            <button className="btn btn-secondary btn-sm" onClick={() => arquivo.current?.click()}><FolderInput aria-hidden />Importar .md</button>
          </>)}
          {campanhas.length > 0
            ? <div className="pp-buscas-grade">{campanhas.map((c) => <CampaignCard key={c.id} c={c} onOpen={() => ir(c.id)} onDelete={() => removeCampaign(c.id)} />)}</div>
            : <Vazio title="Nenhuma busca ainda" text="Escolha um nicho e um ponto no mapa para encontrar empresas." action={newSearch} />}
        </>
      ))}

      {tab === "pipeline" && <>
        {faixa("Pipeline", "Pipeline")}
        {leads.some((l) => !l.deletedAt)
          ? <Pipeline leads={leads.filter((l) => !l.deletedAt && (!campanhaId || l.campaignId === campanhaId))} stages={etapas} onStage={changeStage} onOpen={(l) => { ir(l.campaignId); setSelectedId(l.id); }} />
          : <Vazio title="Nenhum lead no pipeline" text="Faça uma busca ou importe uma base Markdown." action={newSearch} />}
      </>}

      {tab === "settings" && <>
        {faixa("Configurações", "Configurações")}
        <div className="pp-config">
          <section className="panel pp-caixa">
            <header className="pp-cab"><span className="icon-tile"><Briefcase aria-hidden /></span><div><h2>O que você vende</h2><p>A IA usa isto para escolher o argumento e escrever a abordagem de cada lead.</p></div></header>
            <textarea className="input" aria-label="Sua oferta" rows={4} value={offer} maxLength={2000} onChange={(e) => setOffer(e.target.value)} />
            <p className="subtle caption">A análise roda nas contas de IA conectadas em Configurações → Contas de IA.{iaPronta ? "" : " Nenhuma conta ativa agora."}</p>
          </section>
          <section className="panel pp-caixa">
            <header className="pp-cab"><span className="icon-tile"><SlidersHorizontal aria-hidden /></span><div><h2>Pesos do score</h2><p>Quanto cada sinal pesa na nota de 0 a 100. Vale para as próximas buscas.</p></div></header>
            <div className="pp-pesos">
              {(Object.keys(WEIGHT_LABEL) as (keyof ScoreWeights)[]).map((key) => (
                <Slider key={key} label={WEIGHT_LABEL[key]} value={weights[key] ?? 0} min={0} max={50} onChange={(v) => setWeights({ ...weights, [key]: v })} />
              ))}
            </div>
          </section>
          <div className="pp-config-pe">
            <button className="btn btn-primary" onClick={saveConfig} disabled={salvando}>{salvando && <Loader2 className="animate-spin" aria-hidden />}Salvar oferta e pesos</button>
          </div>
        </div>
      </>}
    </div>
  );
}
