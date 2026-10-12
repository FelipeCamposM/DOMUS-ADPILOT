import { PlugZap } from "lucide-react";
import Link from "next/link";
import { aoVivo, contasInstagram, postsInstagram } from "@/lib/instagram";
import { can, requireCtx } from "@/lib/ctx";
import { InstagramLogo } from "@/modules/connections/Logos";
import { PerfilInstagram } from "@/modules/instagram/Perfil";

export const metadata = { title: "Instagram" };

export default async function InstagramPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const contas = await contasInstagram(ctx.workspace.id);
  if (!contas.length) {
    return (
      <div className="page">
        <div className="panel cn-vazio" data-enter>
          <span className="cn-plat-logo"><InstagramLogo size={34} /></span>
          <h2>Conecte o Instagram</h2>
          <p className="muted small" style={{ maxWidth: 460 }}>Com a conta Profissional conectada, você publica posts, carrosséis, Reels e stories daqui, agenda, gera legenda e hashtags com IA e vê a prévia do feed.</p>
          <Link href="/connections" className="btn btn-primary btn-sm"><PlugZap aria-hidden /> Ir para Conexões</Link>
        </div>
      </div>
    );
  }
  const conta = contas.find((c) => c.id === sp.conta) ?? contas[0]!;
  const [vivo, posts] = await Promise.all([aoVivo(ctx.workspace.id, conta.id), postsInstagram(ctx.workspace.id, conta.id)]);
  return (
    <div className="page" style={{ maxWidth: 975 }}>
      <PerfilInstagram conta={conta} contas={contas} midias={vivo.midias} posts={posts} erroApi={vivo.erro} podeEditar={can(ctx, "editor")} />
    </div>
  );
}
