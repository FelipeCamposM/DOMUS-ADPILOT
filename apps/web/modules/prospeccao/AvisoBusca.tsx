"use client";

import { Check, ChevronDown, Loader2, Radar, Square, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "../shell/toast";
import { pararBusca } from "./actions";

interface Andamento { status: string; progresso: number; etapa_texto: string; encontrados: number; a_auditar: number; auditar: boolean; bloqueado: boolean; erro: string | null; nome: string; fila: boolean }

/** Em que etapa a busca está. O Python reserva 0–60% para o Maps e 60–100% para a auditoria. */
function etapaDe(s: Andamento): number {
  if (s.progresso >= 100) return 3;
  if (s.a_auditar > 0 || s.progresso >= 60) return 2;
  if (s.etapa_texto && !s.fila && s.etapa_texto !== "Abrindo o navegador" && s.etapa_texto !== "Na fila do worker") return 1;
  return 0;
}

/**
 * Prospecção em andamento (em todas as telas do CRM): pílula discreta no canto com anel de progresso e a etapa;
 * clique abre o painel com nome, barra e as 4 etapas. Pergunta o andamento
 * a cada 2 s (consulta mínima) e, quando a busca termina, avisa e recarrega a página uma vez.
 */
export function AvisoBusca({ campanhaId }: { campanhaId: string | null }) {
  const router = useRouter();
  const [s, setS] = useState<Andamento | null>(null);
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const [parando, setParando] = useState(false);

  useEffect(() => {
    if (!campanhaId) return;
    let vivo = true;
    let antes: string | null = null;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/prospeccao/andamento?c=${campanhaId}`, { cache: "no-store" });
        if (!r.ok || !vivo) return;
        const a = (await r.json()) as Andamento;
        setS(a);
        if (antes === "running" && a.status !== "running") {
          if (a.status === "completed") {
            if (a.bloqueado) toast.err("O Google limitou as buscas no meio do caminho. Os leads já encontrados foram salvos; tente de novo mais tarde ou use o ritmo Cauteloso.");
            toast.ok(`“${a.nome}” concluída: ${a.encontrados} oportunidades${a.auditar ? " auditadas" : ""}. Veja em Resultados.`);
          } else if (a.status === "failed") toast.err(`“${a.nome}” não terminou: ${a.erro ?? "erro desconhecido"}`);
          else if (a.status === "cancelled") toast.ok(`Busca parada: ${a.encontrados} empresas guardadas (sem auditoria)`);
          router.refresh();
        }
        antes = a.status;
      } catch { /* sem rede: tenta no próximo */ }
    };
    void tick();
    const t = setInterval(tick, 2000);
    const voltou = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", voltou);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", voltou); };
  }, [campanhaId, router]);

  // fecha o painel ao clicar fora ou no Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  if (!campanhaId || !s || s.status !== "running") return null;
  const etapa = etapaDe(s);
  const area = s.etapa_texto.match(/área \d+ de \d+/)?.[0];
  const auditados = Math.max(0, Math.min(s.a_auditar, Math.round(((s.progresso - 60) / 40) * s.a_auditar)));
  const etapas = [
    { label: "Abrindo o navegador", detail: s.fila ? "Na fila do worker" : "Prepara uma janela invisível do Edge" },
    { label: "Buscando no Google Maps", detail: `${s.encontrados} encontrada${s.encontrados === 1 ? "" : "s"}${area ? ` · ${area}` : ""}` },
    s.auditar
      ? { label: "Auditando os sites", detail: s.a_auditar ? `${auditados} de ${s.a_auditar} · e-mail, redes, anúncios e problemas` : "Separando as melhores oportunidades" }
      : { label: "Calculando prioridades", detail: "Separando as melhores oportunidades" },
    { label: "Ordenando e salvando", detail: "Guarda tudo na base de prospecção" },
  ];
  const parar = async () => {
    setParando(true);
    const r = await pararBusca(campanhaId);
    if (!r.ok) { toast.err(r.error); setParando(false); }
  };

  const R = 15, C = 2 * Math.PI * R;
  const curta = etapa === 2 && s.auditar && s.a_auditar ? `Auditando ${auditados}/${s.a_auditar}` : etapas[etapa]!.label;

  return (
    <div className="pp-flut" ref={raiz} data-aberto={aberto || undefined}>
      {aberto && (
        <div className="pp-aviso" role="dialog" aria-label="Andamento da prospecção">
          <div className="pp-aviso-cab">
            <div className="pp-aviso-id">
              <span>Prospecção em andamento</span>
              <Link href={`/crm/prospeccao?c=${campanhaId}`} className="pp-trunc" onClick={() => setAberto(false)}>{s.nome}</Link>
            </div>
            <b className="tabular">{s.progresso}%</b>
          </div>
          <div className="pp-aviso-barra"><span style={{ width: `${Math.max(3, s.progresso)}%` }} /></div>
          <ol className="pp-aviso-etapas">
            {etapas.map((st, i) => {
              const done = i < etapa, active = i === etapa;
              return (
                <li key={st.label} data-estado={done ? "feito" : active ? "agora" : "depois"}>
                  <span className="pp-aviso-bola">{done ? <Check aria-hidden /> : active ? <Loader2 className="animate-spin" aria-hidden /> : null}</span>
                  <span className="pp-aviso-txt"><b>{st.label}</b>{(active || done) && <small className="pp-trunc">{st.detail}</small>}</span>
                </li>
              );
            })}
          </ol>
          {s.etapa_texto.includes("limitou") && <p className="pp-aviso-alerta"><TriangleAlert aria-hidden />O Google limitou as buscas: seguindo com o que já foi achado.</p>}
          <button className="btn btn-secondary btn-xs pp-aviso-parar" onClick={parar} disabled={parando}>
            {parando ? <Loader2 className="animate-spin" aria-hidden /> : <Square aria-hidden />} Parar e guardar o que já achou
          </button>
        </div>
      )}
      <button className="pp-pilula" onClick={() => setAberto((x) => !x)} aria-expanded={aberto} role="status" aria-live="polite"
        title={aberto ? "Esconder detalhes" : "Ver o andamento da prospecção"}>
        <span className="pp-pilula-anel" aria-hidden>
          <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r={R} className="pp-anel-trilho" />
            <circle cx="18" cy="18" r={R} className="pp-anel-arco" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.03, s.progresso / 100))} /></svg>
          <Radar />
        </span>
        <span className="pp-pilula-txt"><b className="tabular">{s.progresso}%</b><small className="pp-trunc">{curta}</small></span>
        <ChevronDown className="pp-pilula-seta" aria-hidden />
      </button>
    </div>
  );
}
