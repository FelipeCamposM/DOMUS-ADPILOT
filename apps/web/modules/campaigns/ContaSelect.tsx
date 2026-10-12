"use client";

import { Check, ChevronsUpDown, PlugZap } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { ContaGoogle } from "@/lib/contas";
import { ago } from "@/lib/format";
import { Popover } from "../shell/Popover";

const idGoogle = (id: string) => id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
const fuso = (tz: string | null) => (tz ? tz.split("/").pop()!.replace(/_/g, " ") : null);

/** Foto do Google de quem conectou; sem foto (conexão antiga), as iniciais. */
function Avatar({ c, size = 36 }: { c: ContaGoogle; size?: number }) {
  const [erro, setErro] = useState(false);
  const nome = c.perfil.nome || c.perfil.email || c.conexao;
  const iniciais = nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span className="conta-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} title={c.perfil.email ?? c.conexao}>
      {c.perfil.foto && !erro
        ? <img src={c.perfil.foto} alt="" referrerPolicy="no-referrer" onError={() => setErro(true)} width={size} height={size} />
        : iniciais}
      <span className="conta-avatar-g" aria-hidden>G</span>
    </span>
  );
}

function Linha({ c }: { c: ContaGoogle }) {
  return (
    <span className="conta-info">
      <span className="conta-nome">{c.name}{c.status !== "ACTIVE" && <span className="badge badge-warning" style={{ marginLeft: 6 }}>{c.status}</span>}</span>
      <span className="conta-meta">
        <span className="mono">{idGoogle(c.external_id)}</span>
        <span>{c.currency}</span>
        {fuso(c.timezone) && <span>{fuso(c.timezone)}</span>}
        <span>{c.campanhas} campanha{c.campanhas === 1 ? "" : "s"}</span>
      </span>
    </span>
  );
}

/** Seletor de conta do Google Ads: foto de quem conectou, ID, moeda, fuso, campanhas e última sincronização. */
export function ContaSelect({ contas, valor, onChange, disabled, id }: {
  contas: ContaGoogle[]; valor: string; onChange: (id: string) => void; disabled?: boolean; id?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  const atual = contas.find((c) => c.id === valor);

  if (!contas.length) {
    return (
      <Link href="/connections" className="conta-vazia">
        <PlugZap size={18} aria-hidden />
        <span><b>Nenhuma conta do Google Ads</b><small>Conecte em Conexões e clique em Sincronizar</small></span>
      </Link>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <button id={id} type="button" className="conta-trigger" onClick={() => setAberto((a) => !a)} disabled={disabled} aria-haspopup="listbox" aria-expanded={aberto}>
        {atual ? <><Avatar c={atual} /><Linha c={atual} /></> : <span className="conta-info"><span className="conta-nome subtle">Escolha uma conta</span></span>}
        <ChevronsUpDown size={16} aria-hidden style={{ flexShrink: 0, color: "rgb(var(--c-text-tertiary))" }} />
      </button>
      <Popover open={aberto} onClose={fechar} width={420} className="conta-menu">
        <div role="listbox" aria-label="Contas do Google Ads">
          {contas.map((c) => (
            <button key={c.id} type="button" role="option" aria-selected={c.id === valor} className="conta-opcao" data-active={c.id === valor}
              onClick={() => { onChange(c.id); setAberto(false); }}>
              <Avatar c={c} size={34} />
              <span className="conta-info">
                <Linha c={c} />
                <span className="conta-quem">
                  {c.perfil.email ?? c.conexao} · sincronizada {ago(c.last_synced_at)}
                </span>
              </span>
              {c.id === valor && <Check size={16} aria-hidden style={{ color: "rgb(var(--c-brand))", flexShrink: 0 }} />}
            </button>
          ))}
        </div>
        <Link href="/connections" className="conta-gerenciar"><PlugZap size={14} aria-hidden /> Gerenciar conexões</Link>
      </Popover>
    </div>
  );
}
