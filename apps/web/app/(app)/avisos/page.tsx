import { db, FORMATOS_CAL, whatsappAvisos } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { Avisos, type Andamento, type MsgAviso } from "@/modules/avisos/Avisos";
import { HeroFx } from "@/modules/shell/HeroFx";

export const metadata = { title: "Avisos e aprovações" };

/** O que cada estado do post quer dizer, do pedido no WhatsApp até agendar. */
function etapa(a: { status: string; aprovacao: string | null; refazendo: string | null; p_status: string | null; step: string | null }) {
  if (a.status === "APROVADO" && a.refazendo) return "A IA está reescrevendo o post com o seu pedido";
  if (a.status === "APROVADO") return "Na fila para gerar a arte";
  if (a.status === "GERANDO") return a.step ?? (a.p_status === "QUEUED" ? "Na fila do worker" : "Gerando a arte");
  if (a.aprovacao === "ENVIADO") return "Arte pronta: esperando o seu SIM ou o que mudar";
  if (a.aprovacao === "MUDANCA") return "Esperando você dizer o que mudar";
  if (a.aprovacao === "APROVADA") return "Aprovado: agendando";
  return "Arte pronta: na fila para ir para a sua aprovação";
}

export default async function AvisosPage() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return <div className="page"><div className="empty">Só o administrador da plataforma vê os avisos.</div></div>;
  const sql = db();
  const avisos = await whatsappAvisos();
  const [msgs, andamento, worker] = await Promise.all([
    avisos ? sql<(Omit<MsgAviso, "created_at"> & { created_at: Date })[]>`
      select * from (select id, created_at, texto, status, erro, direcao, tipo, (midia_key is not null) as midia, autor
        from ads.whatsapp_envios where para = ${avisos} and direcao <> 'NOTA' order by created_at desc limit 300) x order by created_at` : [],
    sql<{ id: string; tema: string; formato: keyof typeof FORMATOS_CAL; data_hora: Date; status: string; aprovacao: string | null; refazendo: string | null; pedido_arte: string | null;
      p_status: string | null; step: string | null; progresso: number | null; job: string | null; updated_at: Date }[]>`
      select i.id, i.tema, i.formato, i.data_hora, i.status, i.aprovacao, i.refazendo, i.pedido_arte, i.updated_at,
        p.status as p_status, p.step_detail as step, j.progress as progresso, j.status as job
      from ads.calendario_itens i left join ads.video_projects p on p.id = i.project_id
      left join lateral (select progress, status from ads.jobs where payload->>'projectId' = p.id::text or payload->>'itemId' = i.id::text order by created_at desc limit 1) j on true
      where i.status in ('APROVADO', 'GERANDO', 'REVISAO') order by i.data_hora limit 20`,
    sql<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`,
  ]);
  const posts: Andamento[] = andamento.map((a) => ({
    id: a.id, tema: a.tema, formato: FORMATOS_CAL[a.formato] ?? a.formato, quando: a.data_hora.toISOString(), etapa: etapa(a),
    pedido: a.pedido_arte, atualizado: a.updated_at.toISOString(),
    progresso: a.job === "RUNNING" || a.job === "PENDING" ? a.progresso ?? 0 : null,
    esperandoVoce: a.status === "REVISAO" && (a.aprovacao === "ENVIADO" || a.aprovacao === "MUDANCA"),
  }));
  return (
    <div className="page">
      <div className="page-head">
        <HeroFx />
        <div>
          <div className="eyebrow" data-enter>WhatsApp dos avisos</div>
          <h1 className="page-title" data-enter>Avisos e aprovações</h1>
          <p className="page-sub" data-enter>A mesma conversa do WhatsApp: aprove, peça ajustes e acompanhe cada post sendo refeito, sem sair da plataforma.</p>
        </div>
      </div>
      <Avisos
        mensagens={msgs.map((m) => ({ ...m, created_at: m.created_at.toISOString() }))}
        posts={posts} configurado={!!avisos} online={!!worker[0]?.ok} />
    </div>
  );
}
