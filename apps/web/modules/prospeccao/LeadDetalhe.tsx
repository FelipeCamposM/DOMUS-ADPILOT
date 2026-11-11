"use client";

import { defaultMessage, whatsappNumber, whatsappUrl, type Lead, type LeadStage, type SocialNetwork } from "@domus-ads/core/prospeccao";
import {
  AlertTriangle, ArrowRight, Bot, Copy, ExternalLink, Globe, Loader2, Mail, MapPinned, Megaphone, MessageCircle, Phone, RefreshCw, Sparkles, Star, UserCheck, UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Seletor } from "../shell/Seletor";
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
    <section className="pp-det" aria-label={`Detalhes de ${lead.name}`} key={lead.id}>
      <header className="pp-det-cab">
        <span className="pp-console-trilha">Lead · <b style={{ color: status.color }}>{status.label}</b></span>
        <div className="pp-det-id">
          <ScoreRing score={lead.score} size={58} />
          <div>
            <h2>{lead.name}</h2>
            <p>{lead.category || "Empresa"}</p>
          </div>
        </div>
        <div className="pp-selos">
          {lead.rating != null && <Selo><Star aria-hidden className="pp-estrela" />{lead.rating.toFixed(1).replace(".", ",")} · {lead.reviewCount ?? 0} avaliações</Selo>}
          {lead.distanceKm != null && <Selo>{lead.distanceKm.toFixed(1).replace(".", ",")} km</Selo>}
          {ads.length > 0 && <Selo tone="accent">Anuncia</Selo>}
        </div>
        <div className="pp-det-etapa">
          <span>Etapa no pipeline</span>
          <Seletor ariaLabel="Etapa do pipeline" valor={lead.stageId} opcoes={stages.map((x) => ({ valor: x.id, rotulo: x.name }))} onChange={(v) => onStage(lead.id, v)} className="seletor-alto pp-det-seletor" />
        </div>
      </header>

      <div className="pp-det-corpo">
        <section className="pp-passo" data-ok>
          <h3 className="pp-passo-tit"><em>01</em>Contato</h3>
          <div className="pp-passo-caixa">
            {lead.address && <p className="pp-endereco"><MapPinned aria-hidden />{lead.address}</p>}
            <div className="pp-det-contatos">
              {wa && <a href={wa} target="_blank" rel="noreferrer noopener"><MessageCircle aria-hidden /><span><b>WhatsApp</b><small>abrir conversa</small></span></a>}
              {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}><Phone aria-hidden /><span><b>Telefone</b><small>{lead.phone}</small></span></a>}
              {lead.email && <button type="button" onClick={() => copy(lead.email, "E-mail")} title="Copiar e-mail"><Mail aria-hidden /><span><b>E-mail</b><small className="pp-trunc">{lead.email}</small></span><Copy aria-hidden /></button>}
              {site && <a href={site} target="_blank" rel="noreferrer noopener"><Globe aria-hidden /><span><b>Site</b><small className="pp-trunc">{site.replace(/^https?:\/\/(www\.)?/, "")}</small></span></a>}
              <a href={mapsUrl(lead)} target="_blank" rel="noreferrer noopener"><ExternalLink aria-hidden /><span><b>Google Maps</b><small>ver a ficha</small></span></a>
            </div>
            {socials.length > 0 && (
              <div className="pp-redes">
                {socials.map(([net, url]) => <a key={net} href={normalizeExternalUrl(url) ?? url} target="_blank" rel="noreferrer noopener">{SOCIAL_LABEL[net]}</a>)}
              </div>
            )}
          </div>
        </section>

        <section className="pp-passo" data-ok={lead.auditFindings.length > 0 || undefined}>
          <h3 className="pp-passo-tit"><em>02</em>Diagnóstico<small>{status.label}</small></h3>
          <div className="pp-passo-caixa">
            {lead.auditFindings.length > 0 ? (
              <ul className="pp-det-diag" aria-label={`Diagnóstico de ${lead.name}`}>
                {lead.auditFindings.map((f, i) => <li key={`${f.code}-${i}`} data-grave={f.severity === "critical" || undefined}><AlertTriangle aria-hidden />{f.label}</li>)}
              </ul>
            ) : <p className="pp-ia-dica">{lead.websiteStatus === "no_site" ? "Sem site: a maior oportunidade de venda." : lead.websiteStatus === "unknown" ? "O site ainda não foi auditado." : "Nenhum problema encontrado no site."}</p>}
            {(ads.length > 0 || tech.cms) && (
              <div className="pp-redes">
                {ads.map((a) => <span key={a} className="pp-anuncio"><Megaphone aria-hidden />{a}</span>)}
                {tech.cms && <span className="pp-cms">{tech.cms}</span>}
              </div>
            )}
          </div>
        </section>

        <section className="pp-passo" data-ok={!!ai || undefined}>
          <h3 className="pp-passo-tit"><em>03</em>Abordagem
            <span className="pp-passo-acao">
              {iaPronta
                ? <button className={`btn ${ai ? "btn-ghost" : "btn-primary"} btn-xs`} disabled={analisando} onClick={() => onAnalyze(lead.id)}>
                    {analisando ? <Loader2 className="animate-spin" aria-hidden /> : ai ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />}{ai ? "Refazer" : "Analisar com IA"}
                  </button>
                : <Link className="btn btn-secondary btn-xs" href="/settings"><Bot aria-hidden />Conectar IA</Link>}
            </span>
          </h3>
          <div className="pp-passo-caixa">
            {analisando && <p className="pp-ia-pulso">Lendo os dados e escrevendo a abordagem…</p>}
            {ai ? (
              <div className="pp-ia-corpo">
                <p>{ai.resumo}</p>
                {ai.dores.length > 0 && <ul>{ai.dores.map((d) => <li key={d}>{d}</li>)}</ul>}
                {ai.oferta && <p className="pp-ia-oferta"><b>Oferecer: </b>{ai.oferta}</p>}
              </div>
            ) : !analisando && <p className="pp-ia-dica">{iaPronta ? "A IA gera um resumo, as dores da empresa e mensagens prontas para WhatsApp e e-mail." : "Conecte uma conta de IA para gerar abordagens personalizadas. Até lá, usamos um modelo pronto."}</p>}
            <div className="pp-msg">
              <div className="pp-msg-cab">
                <span className="pp-rot">Mensagem de WhatsApp</span>
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
        </section>

        <section className="pp-passo">
          <h3 className="pp-passo-tit"><em>04</em>Acompanhamento</h3>
          <div className="pp-passo-caixa">
            <textarea className="input" rows={3} aria-label={`Notas de ${lead.name}`} defaultValue={lead.notes} placeholder="Notas comerciais…" maxLength={5000}
              onBlur={(e) => e.target.value !== lead.notes && onEdit(lead.id, { notes: e.target.value })} />
            <label className="pp-campo"><span className="pp-rot">Tags</span>
              <input className="input-sm" aria-label={`Tags de ${lead.name}`} defaultValue={lead.tags.join(", ")} placeholder="separadas por vírgula"
                onBlur={(e) => { const tags = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); if (tags.join(",") !== lead.tags.join(",")) onEdit(lead.id, { tags }); }} /></label>
            <label className="pp-campo"><span className="pp-rot">Próxima ação</span>
              <input className="input-sm" type="datetime-local" aria-label={`Próxima ação de ${lead.name}`}
                defaultValue={lead.nextActionAt ? new Date(lead.nextActionAt - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""}
                onBlur={(e) => onEdit(lead.id, { nextActionAt: e.target.value ? new Date(e.target.value).getTime() : null })} /></label>
          </div>
        </section>
      </div>

      {/* transformar em lead: card no funil + conversa em Mensagens com a mensagem acima pronta para revisar */}
      <footer className="pp-console-pe">
        {lead.crmNumber ? (
          <Link href={`/crm?c=${lead.crmNumber}`} className="pp-cta pp-cta-ok">
            <span className="pp-cta-ico"><UserCheck aria-hidden /></span><span className="pp-cta-txt">Já é lead · abrir no CRM</span><span className="pp-cta-seta"><ArrowRight aria-hidden /></span>
          </Link>
        ) : (
          <button type="button" className="pp-cta" onClick={virar} disabled={!temWa || virando} title={temWa ? "Cria o card no funil e a conversa em Mensagens com a mensagem acima pronta" : "Sem telefone válido para o WhatsApp"}>
            <span className="pp-cta-ico">{virando ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}</span>
            <span className="pp-cta-txt">{temWa ? "Transformar em lead" : "Sem WhatsApp válido"}</span>
            <span className="pp-cta-seta"><ArrowRight aria-hidden /></span>
          </button>
        )}
      </footer>
    </section>
  );
}
