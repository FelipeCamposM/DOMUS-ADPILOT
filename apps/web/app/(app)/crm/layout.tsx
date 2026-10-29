import { db } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { CrmAbas } from "@/modules/mensagens/CrmAbas";

/** CRM: o WhatsApp é o número da plataforma (não é do workspace), então só o admin da plataforma entra. */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return <div className="page"><div className="empty">Só o administrador da plataforma usa o CRM.</div></div>;
  const [n] = await db()<{ novos: number; naoLidas: number }[]>`
    select (select count(*)::int from ads.whatsapp_contatos where etapa = 'NOVO') as novos,
           (select count(*)::int from ads.whatsapp_envios e join ads.whatsapp_contatos c on c.numero = e.para where e.direcao = 'IN' and e.created_at > c.lido_em) as "naoLidas"`;
  return (
    <div className="crm">
      <CrmAbas novos={n?.novos ?? 0} naoLidas={n?.naoLidas ?? 0} />
      <div className="crm-corpo">{children}</div>
    </div>
  );
}
