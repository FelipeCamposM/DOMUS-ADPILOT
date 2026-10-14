import { notFound } from "next/navigation";
import { z } from "zod";
import { aoVivo, contasInstagram, midiasDaBiblioteca, postsInstagram } from "@/lib/instagram";
import { can, requireCtx } from "@/lib/ctx";
import { marcasDoWorkspace } from "@/lib/marcas";
import { Composer } from "@/modules/instagram/Composer";

export const metadata = { title: "Publicar no Instagram" };

export default async function PublicarPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [post] = await postsInstagram(ctx.workspace.id, null, id.data);
  if (!post) notFound();
  const conta = (await contasInstagram(ctx.workspace.id)).find((c) => c.id === post.ig_account_id);
  if (!conta) notFound();
  const [biblioteca, vivo, marcas] = await Promise.all([midiasDaBiblioteca(ctx.workspace.id), aoVivo(ctx.workspace.id, conta.id), marcasDoWorkspace(ctx.workspace.id)]);
  const feed = vivo.midias.filter((m) => m.media_product_type !== "STORY").map((m) => m.thumbnail_url ?? m.media_url ?? m.children?.data[0]?.media_url ?? "").filter(Boolean);
  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <Composer key={post.updated_at} post={post} conta={conta} feed={feed} marcas={marcas.map(({ id, nome }) => ({ id, nome }))} podeEditar={can(ctx, "editor")}
        biblioteca={biblioteca.map((b) => ({ id: b.id, name: b.name, type: b.type, width: b.width, height: b.height, duration_ms: b.duration_ms }))} />
    </div>
  );
}
