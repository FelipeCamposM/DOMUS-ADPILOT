import { chaveElevenLabs, creditosElevenLabs, db, vozesElevenLabs, type CreditosElevenLabs } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { workerOnline } from "@/lib/queries";
import type { Detectada } from "@/modules/settings/AiAccounts";
import { Settings, type ContaIA, type Membro } from "@/modules/settings/Settings";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const sql = db();
  const membros = await sql<Membro[]>`
    select m.user_id, u.email, m.role from ads.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = ${ctx.workspace.id} order by array_position(array['owner','admin','editor','viewer'], m.role), u.email`;
  const contas = await sql<(Omit<ContaIA, "limited_until" | "last_used_at"> & { config_dir: string; limited_until: Date | null; last_used_at: Date | null })[]>`
    select a.id, a.provider, a.name, a.email, a.plan, a.config_dir, a.status, a.priority, a.limited_until, a.last_used_at, a.last_error, a.usage,
      coalesce(u.turnos, 0)::int as turnos, coalesce(u.tokens, 0)::text as tokens, u.custo::text as custo
    from ads.ai_accounts a
    left join (select ai_account_id, count(*) as turnos, sum(input_tokens + output_tokens) as tokens, sum(cost_usd) as custo
               from ads.ai_usage where created_at > now() - interval '30 days' group by ai_account_id) u on u.ai_account_id = a.id
    order by a.priority, a.created_at`;
  const w = await workerOnline();
  const chaveEl = await chaveElevenLabs();
  const elevenlabs = {
    configurada: !!chaveEl, vozes: null as number | null, erro: null as string | null,
    creditos: null as CreditosElevenLabs | null, erroCreditos: null as string | null,
  };
  if (chaveEl) await Promise.all([
    vozesElevenLabs(chaveEl).then((v) => { elevenlabs.vozes = v.length; }, (e: Error) => { elevenlabs.erro = e.message; }),
    creditosElevenLabs(chaveEl).then((c) => { elevenlabs.creditos = c; }, (e: Error) => { elevenlabs.erroCreditos = e.message; }),
  ]);
  // gasto por geração neste workspace (o saldo acima é da conta inteira)
  const usoVoz = await sql<{ id: string; created_at: Date; voice_name: string | null; characters: number; credits: number; titulo: string | null; video_project_id: string | null }[]>`
    select u.id::text, u.created_at, u.voice_name, u.characters, u.credits, v.title as titulo, u.video_project_id
    from ads.tts_usage u left join ads.video_projects v on v.id = u.video_project_id
    where u.workspace_id = ${ctx.workspace.id} order by u.created_at desc limit 30`;
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  // contas que o worker achou logadas no PC e ainda não foram importadas (o caminho fica no servidor)
  const achadas = ((w.info.detected ?? []) as (Detectada & { config_dir: string })[])
    .filter((d) => !contas.some((c) => c.provider === d.provider && c.config_dir === d.config_dir))
    .map(({ key, provider, name, email, plan }) => ({ key, provider, name, email, plan }));
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Configurações</h1>
        </div>
      </div>
      <Settings
        ws={ctx.workspace}
        membros={membros}
        eu={ctx.user.id}
        contas={contas.map(({ config_dir: _, ...c }) => ({ ...c, limited_until: iso(c.limited_until), last_used_at: iso(c.last_used_at) }))}
        detectadas={achadas}
        elevenlabs={elevenlabs}
        usoVoz={usoVoz.map((u) => ({ ...u, created_at: u.created_at.toISOString() }))}
        podeOwnerIA={isPlatformAdmin(ctx)}
        worker={{ online: w.online, lastSeen: iso(w.lastSeen), info: { ...w.info, detected: undefined } }}
      />
    </div>
  );
}
