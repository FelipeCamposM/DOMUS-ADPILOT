"use client";

import { CORES_ETAPA, ETAPA_ENTRADA, etapaCrmSchema, type EtapaCrm, type TipoEtapa } from "@domus-ads/core/mensagens";
import { ChevronDown, ChevronUp, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { apagarEtapa, ordenarEtapas, salvarEtapa } from "./actions";
import { corEtapa } from "./etapas";

type Linha = Omit<EtapaCrm, "ordem" | "chave" | "dica"> & { chave: string | null; dica: string; id: string };
const ROTULO_TIPO: Record<TipoEtapa, string> = { ABERTO: "Em andamento", GANHO: "Fechou (ganho)", PERDIDO: "Perdeu" };

/** Colunas do funil: nome, cor, tipo, descrição e ordem. Salva tudo de uma vez. */
export function EditarFunil({ etapas, contagem, fechar }: { etapas: EtapaCrm[]; contagem: Record<string, number>; fechar: () => void }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() => etapas.map((e) => ({ ...e, dica: e.dica ?? "", id: e.chave })));
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const mudar = (id: string, p: Partial<Linha>) => { setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))); setErro(null); };
  const mexer = (i: number, d: -1 | 1) => setLinhas((ls) => { const n = [...ls]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; return n; });
  const nova = () => setLinhas((ls) => {
    const cor = CORES_ETAPA.find((c) => !ls.some((l) => l.cor === c)) ?? CORES_ETAPA[0];
    const fim = ls.findIndex((l) => l.tipo !== "ABERTO");
    const l: Linha = { id: crypto.randomUUID(), chave: null, nome: "", cor, tipo: "ABERTO", dica: "" };
    return fim < 0 ? [...ls, l] : [...ls.slice(0, fim), l, ...ls.slice(fim)];
  });
  const apagadas = etapas.filter((e) => !linhas.some((l) => l.chave === e.chave));
  const entrada = etapas.find((e) => e.chave === ETAPA_ENTRADA)?.nome ?? "Novo";

  const salvar = () => start(async () => {
    for (const l of linhas) {
      const v = etapaCrmSchema.safeParse(l);
      if (!v.success) return setErro(`${l.nome || "Coluna sem nome"}: ${v.error.issues[0]?.message}`);
    }
    if (!linhas.some((l) => l.tipo === "GANHO")) return setErro("Deixe pelo menos uma coluna do tipo “Fechou (ganho)”: é ela que conta a conversão.");
    const leadsMovidos = apagadas.reduce((s, e) => s + (contagem[e.chave] ?? 0), 0);
    if (apagadas.length && !(await confirmar(`Apagar ${apagadas.map((e) => `“${e.nome}”`).join(", ")}?${leadsMovidos ? ` ${leadsMovidos} lead(s) vão para “${entrada}”.` : ""}`))) return;
    for (const e of apagadas) { const r = await apagarEtapa(e.chave, ETAPA_ENTRADA); if (!r.ok) return setErro(r.error); }
    const chaves: string[] = [];
    for (const l of linhas) {
      const orig = etapas.find((e) => e.chave === l.chave);
      const mudou = !orig || orig.nome !== l.nome.trim() || orig.cor !== l.cor || orig.tipo !== l.tipo || (orig.dica ?? "") !== l.dica.trim();
      if (!mudou) { chaves.push(l.chave!); continue; }
      const r = await salvarEtapa(l.chave, { nome: l.nome, cor: l.cor, tipo: l.tipo, dica: l.dica });
      if (!r.ok) return setErro(r.error);
      chaves.push(r.data);
    }
    const r = await ordenarEtapas(chaves);
    if (!r.ok) return setErro(r.error);
    toast.ok("Funil atualizado");
    fechar();
    router.refresh();
  });

  return (
    <Dialog open onClose={fechar} title="Colunas do funil">
      <>
        <div className="crm-previa" aria-hidden>
          {linhas.map((l) => <span key={l.id} style={corEtapa({ ...l, chave: l.chave ?? "", ordem: 0, dica: null })}>{l.nome || "…"}</span>)}
        </div>
        <ol className="crm-etapas-ed">
          {linhas.map((l, i) => {
            const fixa = l.chave === ETAPA_ENTRADA;
            return (
              <li key={l.id} style={corEtapa({ ...l, chave: l.chave ?? "", ordem: 0, dica: null })}>
                <div className="crm-ed-ordem">
                  <button type="button" className="btn btn-ghost btn-xs" disabled={!i} onClick={() => mexer(i, -1)} aria-label="Subir"><ChevronUp aria-hidden /></button>
                  <button type="button" className="btn btn-ghost btn-xs" disabled={i === linhas.length - 1} onClick={() => mexer(i, 1)} aria-label="Descer"><ChevronDown aria-hidden /></button>
                </div>
                <div className="crm-ed-campos">
                  <div className="crm-ed-linha">
                    <input className="input" value={l.nome} maxLength={30} placeholder="Nome da coluna" onChange={(e) => mudar(l.id, { nome: e.target.value })} aria-label="Nome da coluna" autoFocus={!l.chave} />
                    <select className="select" value={l.tipo} disabled={fixa} onChange={(e) => mudar(l.id, { tipo: e.target.value as TipoEtapa })} aria-label="Tipo"
                      title={fixa ? "Coluna de entrada: recebe os leads novos" : "Fechou/Perdeu contam na conversão"}>
                      {Object.entries(ROTULO_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {fixa ? <span className="crm-ed-fixa" title="Coluna de entrada: os leads novos chegam aqui"><Lock aria-hidden /></span>
                      : <button type="button" className="btn btn-ghost btn-xs" onClick={() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))} aria-label={`Apagar ${l.nome}`}
                          title={l.chave && contagem[l.chave] ? `${contagem[l.chave]} lead(s) vão para “${entrada}”` : "Apagar coluna"}><Trash2 aria-hidden /></button>}
                  </div>
                  <input className="input crm-ed-dica" value={l.dica} maxLength={80} placeholder="Descrição curta (opcional)" onChange={(e) => mudar(l.id, { dica: e.target.value })} aria-label="Descrição" />
                  <div className="crm-cores" role="radiogroup" aria-label="Cor">
                    {CORES_ETAPA.map((c) => <button key={c} type="button" role="radio" aria-checked={l.cor === c} aria-label={c} style={{ background: c }} onClick={() => mudar(l.id, { cor: c })} />)}
                    <label className="crm-cor-livre" title="Outra cor" style={{ background: CORES_ETAPA.includes(l.cor as (typeof CORES_ETAPA)[number]) ? undefined : l.cor }}>
                      <input type="color" value={l.cor} onChange={(e) => mudar(l.id, { cor: e.target.value })} aria-label="Outra cor" /><Plus aria-hidden />
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" className="crm-modelo crm-modelo-novo" style={{ minHeight: 44 }} disabled={linhas.length >= 12} onClick={nova}><Plus aria-hidden /> Nova coluna</button>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={salvar} disabled={pend}>{pend && <Loader2 className="animate-spin" aria-hidden />} Salvar funil</button>
        </div>
      </>
    </Dialog>
  );
}
