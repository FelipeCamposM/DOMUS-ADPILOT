"use client";

import { hasAds, whatsappNumber, type Lead } from "@domus-ads/core/prospeccao";
import { Globe, Mail, MessageCircle, Phone, RotateCcw, Star, Trash2, UserCheck } from "lucide-react";
import { ScoreRing, Selo, STATUS } from "./comum";

interface Props {
  leads: Lead[]; selectedId?: string; trashed?: boolean;
  onSelect: (id: string) => void; onTrash: (id: string) => void; onRestore: (id: string) => void; onPurge: (id: string) => void;
}

function LeadRow({ lead, selected, trashed, onSelect, onTrash, onRestore, onPurge }: Omit<Props, "leads" | "selectedId"> & { lead: Lead; selected: boolean }) {
  const status = STATUS[lead.websiteStatus] ?? STATUS.unknown;
  return (
    <article onClick={() => onSelect(lead.id)} aria-current={selected || undefined} className="pp-linha" data-selected={selected}
      tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onSelect(lead.id); }}>
      <span className="pp-linha-faixa" style={{ background: status.color }} aria-hidden />
      <ScoreRing score={lead.score} />
      <div className="pp-linha-meio">
        <h3 className="pp-trunc">{lead.name}</h3>
        <p className="pp-trunc">{lead.category || "Empresa"}{lead.distanceKm != null ? ` · ${lead.distanceKm.toFixed(1).replace(".", ",")} km` : ""}</p>
        <div className="pp-selos">
          <Selo tone={status.tone}>{status.label}</Selo>
          {lead.rating != null && <span className="pp-nota"><Star aria-hidden />{lead.rating.toFixed(1).replace(".", ",")}{lead.reviewCount ? <small>({lead.reviewCount})</small> : null}</span>}
          {hasAds(lead) && <Selo tone="accent">Anuncia</Selo>}
          {lead.aiInsight && <Selo tone="success">Analisado</Selo>}
          {lead.crmNumber && <Selo tone="success" title="Já está no CRM (Mensagens)"><UserCheck aria-hidden />No CRM</Selo>}
        </div>
      </div>
      <div className="pp-linha-fim">
        <span className="pp-contatos" aria-label="Contatos disponíveis">
          {lead.phone && <Phone aria-label="Telefone" />}
          {whatsappNumber(lead) && <MessageCircle aria-label="WhatsApp" />}
          {lead.email && <Mail aria-label="E-mail" />}
          {lead.websiteUrl && <Globe aria-label="Site" />}
        </span>
        {trashed ? (
          <span className="pp-contatos">
            <button className="btn btn-ghost btn-xs" aria-label={`Restaurar ${lead.name}`} title="Restaurar" onClick={(e) => { e.stopPropagation(); onRestore(lead.id); }}><RotateCcw aria-hidden /></button>
            <button className="btn btn-danger btn-xs" aria-label={`Excluir permanentemente ${lead.name}`} title="Excluir de vez" onClick={(e) => { e.stopPropagation(); onPurge(lead.id); }}><Trash2 aria-hidden /></button>
          </span>
        ) : (
          <button className="btn btn-ghost btn-xs pp-so-hover" aria-label={`Mover ${lead.name} para a lixeira`} title="Mover para a lixeira" onClick={(e) => { e.stopPropagation(); onTrash(lead.id); }}><Trash2 aria-hidden /></button>
        )}
      </div>
    </article>
  );
}

export function LeadLista({ leads, selectedId, ...rest }: Props) {
  if (!leads.length) return <div className="panel pp-vazio-lista">Nenhum lead corresponde aos filtros atuais.</div>;
  return <div className="pp-lista" aria-label="Lista de leads">{leads.map((lead) => <LeadRow key={lead.id} lead={lead} selected={lead.id === selectedId} {...rest} />)}</div>;
}
