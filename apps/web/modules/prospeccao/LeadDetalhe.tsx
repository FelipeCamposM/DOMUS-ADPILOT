"use client";

import { defaultMessage, whatsappNumber, whatsappUrl, type Lead, type LeadStage, type SocialNetwork } from "@domus-ads/core/prospeccao";
import {
  AlertTriangle, ArrowRight, Bot, Copy, ExternalLink, Globe, Loader2, Mail, MapPinned, Megaphone, MessageCircle, Phone, RefreshCw, Sparkles, Star, UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "../shell/toast";
import { copiar, mapsUrl, normalizeExternalUrl, ScoreRing, Selo, STATUS } from "./comum";

const SOCIAL_LABEL: Record<SocialNetwork, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", x: "X" };
const copy = (text: string, what: string) => copiar(text).then(() => toast.ok(`${what} copiad${what.endsWith("a") ? "a" : "o"}`));

export function LeadDetalhe({ lead, stages, analisando, iaPronta, onStage, onEdit, onAnalyze, onLead }: {
  lead: Lead; stages: LeadStage[]; analisando: boolean; iaPronta: boolean;
  onStage: (id: string, stageId: string) => void;
  onEdit: (id: string, patch: { notes?: string; tags?: string[]; nextActionAt?: number | null }) => void;
  onAnalyze: (id: string) => void;
  onLead: (id: string, mensagem: string) => Promise<string | null>;
}) {
  const status = STATUS[lead.websiteStatus] ?? STATUS.unknown;
  const site = normalizeExternalUrl(lead.websiteUrl);
  const ai = lead.aiInsight;
  const sugerida = ai?.whatsapp || defaultMessage(lead);
  // a mensagem é editável; volta para a sugestão ao trocar de lead ou quando chega uma análise nova
  const [message, setMessage] = useState(sugerida);
  useEffect(() => setMessage(sugerida), [lead.id, sugerida]);
  const [virando, setVirando] = useState(false);
  const wa = whatsappUrl(lead, message);
  const socials = Object.entries(lead.socials ?? {}).filter(([, url]) => url) as [SocialNetwork, string][];
  const tech = lead.tech ?? {};
  const ads = [tech.fbPixel && "Pixel do Meta", tech.googleAds && "Google Ads", tech.tiktokPixel && "Pixel do TikTok"].filter(Boolean) as string[];
  const temWa = !!whatsappNumber(lead);

  const virar = async () => {
    setVirando(true);
    const numero = await onLead(lead.id, message);
    setVirando(false);
    if (numero) toast.ok("Virou lead: card no funil e conversa pronta em Mensagens");
  };

  return (
    <section className="panel pp-detalhe" aria-label={`Detalhes de ${lead.name}`} key={lead.id}>
      <header className="pp-detalhe-cab">
        <ScoreRing score={lead.score} size={52} />
        <div className="pp-detalhe-id">
          <h2>{lead.name}</h2>
          <p>{lead.category || "Empresa"}</p>
          <div className="pp-selos">
            <Selo tone={status.tone}>{status.label}</Selo>
            {lead.rating != null && <Selo><Star aria-hidden className="pp-estrela" />{lead.rating.toFixed(1).replace(".", ",")} · {lead.reviewCount ?? 0} avaliações</Selo>}
            {lead.distanceKm != null && <Selo>{lead.distanceKm.toFixed(1).replace(".", ",")} km</Selo>}
          </div>
        </div>
        <select className="select pp-etapa" aria-label="Etapa do pipeline" value={lead.stageId} onChange={(e) => onStage(lead.id, e.target.value)}>
          {stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </header>

      {lead.address && <p className="pp-endereco"><MapPinned aria-hidden />{lead.address}</p>}

      {/* transformar em lead: card no funil + conversa em Mensagens com a mensagem abaixo pronta para revisar */}
      {lead.crmNumber ? (
        <Link href={`/crm?c=${lead.crmNumber}`} className="pp-virar pp-virar-ok"><MessageCircle aria-hidden /><span><b>Já é lead no CRM</b><small>Abrir a conversa em Mensagens</small></span><ArrowRight aria-hidden /></Link>
      ) : (
        <button type="button" className="pp-virar" onClick={virar} disabled={!temWa || virando} title={temWa ? undefined : "Sem telefone válido para o WhatsApp"}>
          {virando ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
          <span><b>Transformar em lead</b><small>{temWa ? "Cria o card no funil e a conversa em Mensagens com a mensagem abaixo pronta" : "Este lead não tem telefone válido para o WhatsApp"}</small></span>
          <ArrowRight aria-hidden />
        </button>
      )}

      <div className="pp-acoes">
        {wa && <a className="btn btn-secondary btn-sm" href={wa} target="_blank" rel="noreferrer noopener"><MessageCircle aria-hidden />WhatsApp</a>}
        {lead.phone && <a className="btn btn-secondary btn-sm" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}><Phone aria-hidden />{lead.phone}</a>}
        {lead.email && <button className="btn btn-secondary btn-sm" onClick={() => copy(lead.email, "E-mail")} title="Copiar e-mail"><Mail aria-hidden /><span className="pp-trunc">{lead.email}</span><Copy aria-hidden /></button>}
        {site && <a className="btn btn-secondary btn-sm" href={site} target="_blank" rel="noreferrer noopener"><Globe aria-hidden />Site</a>}
        <a className="btn btn-ghost btn-sm" href={mapsUrl(lead)} target="_blank" rel="noreferrer noopener"><ExternalLink aria-hidden />Ver no Maps</a>
      </div>

      {(socials.length > 0 || ads.length > 0 || tech.cms) && (
        <div className="pp-redes">
          {socials.map(([net, url]) => <a key={net} href={normalizeExternalUrl(url) ?? url} target="_blank" rel="noreferrer noopener">{SOCIAL_LABEL[net]}</a>)}
          {ads.map((a) => <span key={a} className="pp-anuncio"><Megaphone aria-hidden />{a}</span>)}
          {tech.cms && <span className="pp-cms">{tech.cms}</span>}
        </div>
      )}

      {lead.auditFindings.length > 0 && (
        <div className="pp-diag">
          <p className="pp-titulinho">Diagnóstico do site</p>
          <ul aria-label={`Diagnóstico de ${lead.name}`}>
            {lead.auditFindings.map((f, i) => <li key={`${f.code}-${i}`}><AlertTriangle aria-hidden data-grave={f.severity === "critical"} />{f.label}</li>)}
          </ul>
        </div>
      )}

      <div className="pp-ia">
        <div className="pp-ia-cab">
          <p><Sparkles aria-hidden />Análise da IA</p>
          {iaPronta
            ? <button className={`btn ${ai ? "btn-ghost" : "btn-primary"} btn-xs`} disabled={analisando} onClick={() => onAnalyze(lead.id)}>
                {analisando ? <Loader2 className="animate-spin" aria-hidden /> : ai ? <RefreshCw aria-hidden /> : <Bot aria-hidden />}{ai ? "Refazer" : "Analisar lead"}
              </button>
            : <Link className="btn btn-secondary btn-xs" href="/settings"><Bot aria-hidden />Conectar IA</Link>}
        </div>
        {analisando && <p className="pp-ia-pulso">Lendo os dados e escrevendo a abordagem…</p>}
        {ai ? (
          <div className="pp-ia-corpo">
            <p>{ai.resumo}</p>
            {ai.dores.length > 0 && <ul>{ai.dores.map((d) => <li key={d}>{d}</li>)}</ul>}
            {ai.oferta && <p className="pp-ia-oferta"><b>Oferecer: </b>{ai.oferta}</p>}
          </div>
        ) : !analisando && <p className="pp-ia-dica">{iaPronta ? "Gera um resumo, as dores da empresa e mensagens prontas para WhatsApp e e-mail." : "Conecte uma conta de IA para gerar abordagens personalizadas. Até lá, usamos um modelo pronto."}</p>}
        <div className="pp-msg">
          <div className="pp-msg-cab">
            <p className="pp-titulinho">Mensagem de WhatsApp</p>
            <span className="cluster" style={{ gap: 4 }}>
              {message !== sugerida && <button className="btn btn-ghost btn-xs" onClick={() => setMessage(sugerida)} title="Voltar para a sugestão"><RefreshCw aria-hidden /></button>}
              <button className="btn btn-ghost btn-xs" onClick={() => copy(message, "Mensagem")}><Copy aria-hidden />Copiar</button>
            </span>
          </div>
          <textarea className="input pp-msg-txt" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} aria-label="Mensagem de WhatsApp" />
        </div>
        {ai?.emailCorpo && (
          <details className="pp-email">
            <summary>E-mail: {ai.emailAssunto}</summary>
            <p>{ai.emailCorpo}</p>
            <button className="btn btn-ghost btn-xs" onClick={() => copy(`${ai.emailAssunto}\n\n${ai.emailCorpo}`, "E-mail")}><Copy aria-hidden />Copiar e-mail</button>
          </details>
        )}
      </div>

      <div className="pp-notas">
        <textarea className="input" rows={3} aria-label={`Notas de ${lead.name}`} defaultValue={lead.notes} placeholder="Notas comerciais…" maxLength={5000}
          onBlur={(e) => e.target.value !== lead.notes && onEdit(lead.id, { notes: e.target.value })} />
        <div className="pp-duas">
          <input className="input-sm" aria-label={`Tags de ${lead.name}`} defaultValue={lead.tags.join(", ")} placeholder="tags, separadas por vírgula"
            onBlur={(e) => { const tags = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); if (tags.join(",") !== lead.tags.join(",")) onEdit(lead.id, { tags }); }} />
          <input className="input-sm" type="datetime-local" aria-label={`Próxima ação de ${lead.name}`} title="Próxima ação"
            defaultValue={lead.nextActionAt ? new Date(lead.nextActionAt - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""}
            onBlur={(e) => onEdit(lead.id, { nextActionAt: e.target.value ? new Date(e.target.value).getTime() : null })} />
        </div>
      </div>
    </section>
  );
}
