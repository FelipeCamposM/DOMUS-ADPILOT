import { db, whatsappAvisos } from "@domus-ads/core";
import { MessageCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import { workerOnline } from "@/lib/queries";
import { Modelos, Travas } from "@/modules/mensagens/Config";
import type { Modelo } from "@/modules/mensagens/Mensagens";
import { Whatsapp, type EstadoWhatsapp } from "@/modules/settings/Whatsapp";

export const metadata = { title: "CRM · Configurações" };

export default async function CrmConfigPage() {
  const [modelos, avisos, w] = await Promise.all([
    db()<Modelo[]>`select id, nome, texto from ads.whatsapp_templates order by nome`,
    whatsappAvisos(),
    workerOnline(),
  ]);
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <section className="panel" data-enter>
        <header className="panel-head"><span className="panel-title cluster" style={{ gap: 8 }}><MessageCircle size={16} aria-hidden /> WhatsApp</span>
          <span className="subtle caption">Número que conversa com os leads e manda os avisos</span></header>
        <div style={{ padding: 18 }}>
          <Whatsapp estado={(w.info.whatsapp as EstadoWhatsapp | undefined) ?? null} qr={(w.info.whatsappQr as string | null | undefined) ?? null}
            erro={(w.info.whatsappErro as string | null | undefined) ?? null} avisos={avisos} podeAdmin workerOnline={w.online} />
        </div>
      </section>
      <section className="panel" data-enter>
        <header className="panel-head"><span className="panel-title cluster" style={{ gap: 8 }}><MessageSquareText size={16} aria-hidden /> Modelos de mensagem</span>
          <span className="subtle caption">Use no botão de modelos ao escrever</span></header>
        <div className="stack" style={{ padding: 18, gap: 12 }}><Modelos modelos={modelos} /></div>
      </section>
      <section className="panel" data-enter>
        <header className="panel-head"><span className="panel-title cluster" style={{ gap: 8 }}><ShieldCheck size={16} aria-hidden /> Proteção contra ban</span>
          <span className="subtle caption">Sempre ligada</span></header>
        <div style={{ padding: 18 }}><Travas /></div>
      </section>
    </div>
  );
}
