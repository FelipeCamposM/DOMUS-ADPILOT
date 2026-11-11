"use client";

import { hasAds, OPPORTUNITY, whatsappNumber, type BuscaForm as Form, type Lead, type LeadCampaign, type LeadStage, type ScoreWeights, type WebsiteStatus } from "@domus-ads/core/prospeccao";
import {
  ArrowLeft, Bot, Briefcase, Building2, Download, FolderInput, Globe2, Loader2, Mail, Megaphone, Plus, Radar, Search, SlidersHorizontal, Square, Star, Trash2, TriangleAlert,
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
import { Kpi, Seg, Slider } from "./ui";
import { HeroFx } from "@/modules/shell/HeroFx";

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

  return (
    <div className="page pp" style={{ maxWidth: 1480 }}>
      <header className="pp-topo">
        <HeroFx />
        <div>
          <span className="eyebrow"><Radar aria-hidden /> CRM · Prospecção</span>
          <h1 className="crm-titulo">Prospecção de leads</h1>
        </div>
        <div className="pp-abas" role="tablist" aria-label="Áreas da prospecção">
          {([["search", "Buscar"], ["results", "Resultados"], ["pipeline", "Pipeline"], ["settings", "Configurações"]] as const).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}>
              {l}{v === "results" && stats.total > 0 && <span className="pp-abas-n tabular">{stats.total}</span>}
            </button>
          ))}
        </div>
      </header>

      {tab === "search" && <BuscaForm value={form} onChange={setForm} onSubmit={startSearch} running={running} enviando={enviando} />}

      {tab === "results" && (campanhaId && activeCampaign ? (
        <div className="pp-resultados">
          <section className="panel pp-caixa">
            <div className="pp-res-cab">
              <div className="pp-res-id">
                <button className="btn btn-ghost btn-sm" aria-label="Voltar às buscas" onClick={() => ir(null)}><ArrowLeft aria-hidden /></button>
                <div>
                  <h2 className="pp-trunc">{activeCampaign.name}</h2>
                  <p className="pp-trunc">{activeCampaign.locationLabel} · raio {String(activeCampaign.radiusKm).replace(".", ",")} km · {new Date(activeCampaign.createdAt).toLocaleDateString("pt-BR")}
                    {activeCampaign.status !== "completed" && <> · <b>{CAMPAIGN_STATUS[activeCampaign.status]?.label}</b></>}</p>
                </div>
              </div>
              <div className="cluster" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={exportMd}><Download aria-hidden />Exportar .md</button>
                <button className="btn btn-danger btn-sm" onClick={() => removeCampaign(campanhaId)}><Trash2 aria-hidden />Excluir busca</button>
              </div>
            </div>
            {activeCampaign.status === "failed" && activeCampaign.error && <p className="pp-erro"><TriangleAlert aria-hidden />{activeCampaign.error}</p>}
            {activeCampaign.blocked && <p className="pp-erro" data-tone="warning"><TriangleAlert aria-hidden />O Google limitou as buscas no meio do caminho: os leads achados até ali foram salvos.</p>}
            <div className="pp-kpis">
              <Kpi icon={<Building2 aria-hidden />} label="Leads" value={stats.total} />
              <Kpi icon={<Globe2 aria-hidden />} label="Sem site" value={stats.noSite} tone="error" />
              <Kpi icon={<TriangleAlert aria-hidden />} label="Site com problemas" value={stats.weak} tone="warning" />
              <Kpi icon={<Megaphone aria-hidden />} label="Já anunciam" value={stats.ads} />
              <Kpi icon={<Mail aria-hidden />} label="Com e-mail" value={stats.email} tone="success" />
              <Kpi icon={<Star aria-hidden />} label="Nota média" value={stats.rating} tone="warning" />
            </div>
          </section>

          <section className="panel pp-caixa pp-filtros">
            <div className="pp-filtros-linha">
              <label className="pp-filtro-busca">
                <Search aria-hidden />
                <input className="input-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empresa, categoria, endereço ou nota…" aria-label="Filtrar leads" />
              </label>
              {(Object.keys(TOGGLES) as Toggle[]).map((t) => <button key={t} className="chip" data-active={toggles.has(t)} aria-pressed={toggles.has(t)} onClick={() => flip(t)}>{TOGGLES[t].label}</button>)}
              <button className="chip" data-active={showTrash} aria-pressed={showTrash} onClick={() => { setShowTrash((v) => !v); setSelectedId(undefined); }}><Trash2 aria-hidden />Lixeira</button>
            </div>
            <div className="pp-filtros-linha2">
              <Seg label="Status do site" size="sm" value={status} onChange={setStatus}
                options={[{ value: "opportunities", label: "Oportunidades" }, { value: "no_site", label: "Sem site" }, { value: "broken", label: "Quebrado" }, { value: "weak", label: "Fraco" }, { value: "social_only", label: "Só redes" }, { value: "healthy", label: "Saudável" }, { value: "all", label: "Todos" }]} />
              <Slider label="Score mínimo" value={minScore} min={0} max={100} onChange={setMinScore} />
            </div>
          </section>

          <div className="pp-res-grade">
            <div className="pp-res-lista">
              <div className="pp-res-lista-cab">
                <p>{filtered.length} de {visiveis.length} leads · ordenados por score</p>
                {emLote ? (
                  <div className="pp-lote" role="status">
                    <span className="pp-lote-barra"><span style={{ width: `${analise!.progress}%` }} /></span>
                    Analisando {Math.round((analise!.progress / 100) * analise!.ids.length)}/{analise!.ids.length}…
                    <button className="btn btn-ghost btn-xs" onClick={stopBatch}><Square aria-hidden />Parar</button>
                  </div>
                ) : pending.length > 0 && (
                  iaPronta
                    ? <button className="btn btn-primary btn-sm" onClick={() => analyze(pending.map((l) => l.id))} title="Os melhores da lista atual que ainda não têm análise"><Bot aria-hidden />Analisar {pending.length} com IA</button>
                    : <a className="btn btn-secondary btn-sm" href="/settings"><Bot aria-hidden />Conectar IA para analisar</a>
                )}
              </div>
              <LeadLista leads={filtered} selectedId={selected?.id} trashed={showTrash} onSelect={setSelectedId}
                onTrash={(id) => trash(id, true)} onRestore={(id) => trash(id, false)} onPurge={purge} />
            </div>
            <aside className="pp-res-lado">
              <MapGuard><LeadMap leads={filtered} selectedId={selected?.id} onSelect={setSelectedId} radiusKm={activeCampaign.radiusKm} center={center} /></MapGuard>
              {selected && !showTrash && (
                <LeadDetalhe lead={selected} stages={etapas} iaPronta={iaPronta} analisando={!!analise?.ids.includes(selected.id)}
                  onStage={changeStage} onEdit={editLead} onAnalyze={(id) => analyze([id])} onLead={virarLead} />
              )}
            </aside>
          </div>
        </div>
      ) : (
        <div className="pp-buscas">
          <div className="pp-buscas-cab">
            <h2>Suas buscas</h2>
            <div className="cluster" style={{ gap: 8 }}>
              <input ref={arquivo} type="file" accept=".md,text/markdown" hidden onChange={(e) => void importMd(e.target.files?.[0])} />
              <button className="btn btn-secondary btn-sm" onClick={() => arquivo.current?.click()}><FolderInput aria-hidden />Importar .md</button>
              {newSearch}
            </div>
          </div>
          {campanhas.length > 0
            ? <div className="pp-buscas-grade">{campanhas.map((c) => <CampaignCard key={c.id} c={c} onOpen={() => ir(c.id)} onDelete={() => removeCampaign(c.id)} />)}</div>
            : <Vazio title="Nenhuma busca ainda" text="Escolha um nicho e um ponto no mapa para encontrar empresas." action={newSearch} />}
        </div>
      ))}

      {tab === "pipeline" && (leads.some((l) => !l.deletedAt)
        ? <Pipeline leads={leads.filter((l) => !l.deletedAt && (!campanhaId || l.campaignId === campanhaId))} stages={etapas} onStage={changeStage} onOpen={(l) => { ir(l.campaignId); setSelectedId(l.id); }} />
        : <Vazio title="Nenhum lead no pipeline" text="Faça uma busca ou importe uma base Markdown." action={newSearch} />)}

      {tab === "settings" && (
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
      )}
    </div>
  );
}
