"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ago } from "@/lib/format";
import type { UsoContaIA } from "@/lib/queries";
import { ClaudeLogo, OpenAILogo } from "../connections/Logos";
import { Popover } from "./Popover";

type Janela = { pct: number; resets_at: string | null };
const COR = { claude: "#D97757", codex: "#10A37F" } as const;
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const nivel = (pct: number) => (pct >= 100 ? "cheio" : pct >= 80 ? "alto" : "ok");

function Medidor({ rotulo, w, cor }: { rotulo: string; w?: Janela; cor: string }) {
  const pct = w ? Math.min(100, Math.max(0, w.pct)) : 0;
  return (
    <div className="ia-medidor" data-nivel={w ? nivel(w.pct) : "vazio"} style={{ "--cor": cor } as CSSProperties}>
      <div className="ia-medidor-topo">
        <span>{rotulo}</span>
        <b className="tabular">{w ? `${Math.round(w.pct)}%` : "—"}</b>
      </div>
      <div className="ia-trilho"><i style={{ width: `${pct}%` }} /></div>
      <span className="ia-reset" suppressHydrationWarning title={w?.resets_at ? hora(w.resets_at) : undefined}>
        {w?.resets_at ? `renova ${ago(w.resets_at)}` : w ? "" : "sem leitura ainda"}
      </span>
    </div>
  );
}

/** Botão no topo com o uso das assinaturas de IA (5 h e semana, lido no Claude/ChatGPT) e o gasto da plataforma em 24 h. */
export function UsoIA({ contas, aberto, onToggle, onClose }: { contas: UsoContaIA[]; aberto: boolean; onToggle: () => void; onClose: () => void }) {
  const limitada = (c: UsoContaIA) => !!c.limited_until && new Date(c.limited_until) > new Date();
  const ativas = contas.filter((c) => c.status === "ACTIVE");
  const livres = ativas.filter((c) => !limitada(c));
  // um número por provedor: o da conta que a IA usa agora (a 1ª livre na ordem de prioridade; contas já vêm ordenadas)
  const emUso = (["claude", "codex"] as const).map((pv) => ({ pv, c: livres.find((c) => c.provider === pv) ?? null, tem: ativas.some((c) => c.provider === pv) })).filter((x) => x.tem);
  const pctDe = (c: UsoContaIA | null) => c?.usage?.five_hour?.pct;
  const pior = Math.max(...emUso.map((x) => (x.c ? pctDe(x.c) ?? 0 : 100)), 0);
  const estado = !livres.length ? "cheio" : pior >= 80 ? "alto" : "ok";
  const lida = contas.map((c) => c.usage?.observed_at).filter(Boolean).sort().at(-1);

  return (
    <div style={{ position: "relative" }}>
      <button className="chip ia-botao" data-nivel={estado} onClick={onToggle} aria-haspopup="menu" aria-expanded={aberto} title="Uso das contas de IA">
        {!emUso.length ? <><ClaudeLogo size={16} /> IA</> : emUso.map(({ pv, c }) => {
          const pct = pctDe(c);
          return (
            <span key={pv} className="ia-seg" data-nivel={!c ? "cheio" : nivel(pct ?? 0)} title={c ? `${pv === "codex" ? "ChatGPT" : "Claude"} em uso: ${c.name} · janela de 5 h` : "Todas as contas no limite"}>
              {pv === "codex" ? <OpenAILogo size={15} /> : <ClaudeLogo size={16} />}
              <span className="tabular">{!c ? "limite" : pct != null ? `${Math.round(pct)}%` : "—"}</span>
            </span>
          );
        })}
      </button>
      <Popover open={aberto} onClose={onClose} align="right" width={400} className="ia-menu">
        <div className="ia-cabeca">
          <div>
            <b>Uso das assinaturas</b>
            <span suppressHydrationWarning>{lida ? `Lido no Claude e no ChatGPT ${ago(lida)}` : "Aguardando a primeira leitura do worker"}</span>
          </div>
          <span className="ia-resumo" data-nivel={estado}>{livres.length}/{ativas.length} livre{livres.length === 1 ? "" : "s"}</span>
        </div>

        {!contas.length && <div className="empty" style={{ padding: 24 }}>Nenhuma conta de IA conectada.</div>}
        <div className="ia-lista">
          {contas.map((c) => {
            const cor = COR[c.provider as keyof typeof COR] ?? COR.claude;
            const status = c.status !== "ACTIVE" ? ["off", "Desativada"] : limitada(c) ? ["cheio", `Volta ${ago(c.limited_until!)}`] : emUso.some((x) => x.c?.id === c.id) ? ["ok", "Em uso"] : ["livre", "Na reserva"];
            const [nome, apelido] = c.name.split(" · ");
            return (
              <div key={c.id} className="ia-conta" data-off={c.status !== "ACTIVE"}>
                <div className="ia-conta-topo">
                  <span className="ia-tile" style={{ "--cor": cor } as CSSProperties}>{c.provider === "codex" ? <OpenAILogo size={20} /> : <ClaudeLogo size={20} />}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ia-nome">{apelido ?? (c.provider === "codex" ? "ChatGPT" : "Claude")}{c.plan && <em>{c.plan}</em>}</div>
                    <div className="ia-email">{c.email ?? nome}</div>
                  </div>
                  <span className="ia-status" data-s={status[0]} suppressHydrationWarning>{status[1]}</span>
                </div>
                <div className="ia-medidores">
                  <Medidor rotulo="5 horas" w={c.usage?.five_hour} cor={cor} />
                  <Medidor rotulo="Semana" w={c.usage?.seven_day} cor={cor} />
                </div>
                {c.chamadas24h > 0 && (
                  <div className="ia-24h">
                    Plataforma em 24 h: <b className="tabular">{c.chamadas24h}</b> chamada{c.chamadas24h === 1 ? "" : "s"} · <b className="tabular">{Number(c.tokens24h).toLocaleString("pt-BR")}</b> tokens
                    {c.custo24h ? <> · ≈ <b className="tabular">US$ {Number(c.custo24h).toFixed(2)}</b></> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Link href="/settings#ia" className="ia-rodape" onClick={onClose}>Gerenciar contas de IA <ArrowUpRight size={14} aria-hidden /></Link>
      </Popover>
    </div>
  );
}
