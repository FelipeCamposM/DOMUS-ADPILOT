"use client";

import { Check, ChevronsUpDown, PlugZap } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { ContaGoogle } from "@/lib/contas";
import { ago } from "@/lib/format";
import { Popover } from "../shell/Popover";

const idGoogle = (id: string) => id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
const fuso = (tz: string | null) => (tz ? tz.split("/").pop()!.replace(/_/g, " ") : null);

const G = () => (
  <svg viewBox="0 0 48 48" width="58%" height="58%" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.9l7.9-6.2z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

/** Foto do Google de quem conectou; sem perfil (conexão anterior ao perfil), o logo do Google. */
function Avatar({ c, size = 36 }: { c: ContaGoogle; size?: number }) {
  const [erro, setErro] = useState(false);
  const nome = c.perfil.nome || c.perfil.email;
  if (!nome) return <span className="conta-avatar" data-google style={{ width: size, height: size }} title="Reconecte em Conexões para mostrar a foto de quem conectou"><G /></span>;
  const iniciais = nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span className="conta-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} title={c.perfil.email ?? nome}>
      {c.perfil.foto && !erro
        ? <img src={c.perfil.foto} alt="" referrerPolicy="no-referrer" onError={() => setErro(true)} width={size} height={size} />
        : iniciais}
      <span className="conta-avatar-g" aria-hidden><G /></span>
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
