import { brandSchema, db, LIMITES_IG, lerArquivo, type Json } from "@domus-ads/core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bloco, perguntarIA } from "../ai/ask";
import { DATA_DIR } from "../env";
import { ffmpeg } from "../video/tools";

export interface LegendaPayload { postId: string; dica?: string }

const SISTEMA = `Você é social media sênior no Brasil e escreve legendas de Instagram em português do Brasil.
Responda APENAS com um bloco \`\`\`json no formato: {"legenda": "texto da legenda SEM hashtags", "hashtags": ["#exemplo", "..."]}

Regras:
- Primeira linha é o gancho: curta, forte, faz parar o scroll (é o que aparece antes do "mais").
- Corpo em parágrafos curtos, com quebras de linha; emojis com moderação, se combinarem com o tom da marca.
- Termine com uma chamada para ação clara (comentar, salvar, compartilhar, link na bio, chamar no direct).
- Reels: legenda mais curta e direta. Carrossel: convide a deslizar até o fim.
- Hashtags: 8 a 15, misturando nicho, local (cidade/estado, se fizer sentido) e marca; nada genérico demais (#love, #instagood).
  Todas começam com #, sem espaços nem acentos. Máximo ${LIMITES_IG.hashtags}.
- A legenda inteira (com as hashtags) precisa caber em ${LIMITES_IG.legenda} caracteres.
- Use só fatos da marca, das mídias e do pedido. Não invente preço, prazo, número, depoimento ou garantia.`;

/** Gera legenda + hashtags para uma publicação (vendo as próprias imagens) e grava em instagram_posts.sugestao. */
export async function gerarLegenda(payload: LegendaPayload, c: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  const sql = db();
  const [p] = await sql<{ id: string; workspace_id: string; tipo: string; legenda: string; midias: { creativeId: string }[]; username: string; nome: string | null; bio: string | null; brand: unknown }[]>`
    select p.id, p.workspace_id, p.tipo, p.legenda, p.midias, a.username, a.nome, a.bio, w.brand
    from ads.instagram_posts p join ads.instagram_accounts a on a.id = p.ig_account_id join ads.workspaces w on w.id = p.workspace_id
    where p.id = ${payload.postId}`;
  if (!p) throw new Error("Publicação não encontrada");
  const pasta = join(DATA_DIR, "instagram", `legenda-${p.id}`);
  mkdirSync(pasta, { recursive: true });
  try {
    const ids = p.midias.map((m) => m.creativeId);
    const midias = await sql<{ id: string; name: string; type: string; storage: string; r2_key: string | null; thumbnail_key: string | null; arquivado: boolean; metadata: Record<string, unknown> }[]>`
      select id, name, type, storage, r2_key, thumbnail_key, arquivado, metadata from ads.creatives where id = any(${ids}::uuid[]) and workspace_id = ${p.workspace_id}`;
    // até 4 imagens pequenas para a IA olhar (vídeo: a miniatura)
    const imagens: string[] = [];
    for (const [i, m] of midias.slice(0, 4).entries()) {
      const key = m.type === "VIDEO" ? m.thumbnail_key : m.r2_key;
      if (!key) continue;
      try {
        const orig = join(pasta, `o${i}`);
        writeFileSync(orig, await lerArquivo({ storage: m.storage, r2_key: key, arquivado: m.arquivado }));
        const r = await ffmpeg(["-i", orig, "-vf", "scale=768:-2", "-frames:v", "1", "-q:v", "4", join(pasta, `m${i}.jpg`)], { timeoutMs: 60_000 });
        if (r.code === 0) imagens.push(`m${i}.jpg`);
      } catch { /* sem a imagem a IA escreve pelo contexto */ }
    }
    const brand = brandSchema.safeParse(p.brand ?? {});
    const b = brand.success ? brand.data : null;
    const contexto = [
      `Perfil: @${p.username}${p.nome ? ` (${p.nome})` : ""}${p.bio ? `\nBio: ${p.bio}` : ""}`,
      b?.sobre && `Sobre a marca: ${b.sobre}`, b?.tom && `Tom de voz: ${b.tom}`, b?.regras && `Regras da marca: ${b.regras}`,
      `Tipo de publicação: ${p.tipo}`,
      `<midias>\n${midias.map((m) => `- ${m.type} “${m.name}”${m.metadata?.brief ? ` · briefing: ${JSON.stringify(m.metadata.brief).slice(0, 800)}` : ""}${m.metadata?.conceito ? ` · conceito: ${String(m.metadata.conceito).slice(0, 400)}` : ""}`).join("\n")}\n</midias>`,
      imagens.length ? `As imagens da publicação estão nos arquivos: ${imagens.join(", ")} (abra e olhe antes de escrever).` : "",
      p.legenda.trim() ? `<rascunho_atual>\n${p.legenda}\n</rascunho_atual>` : "",
      payload.dica?.trim() ? `<pedido>\n${payload.dica.trim()}\n</pedido>` : "",
    ].filter(Boolean).join("\n\n");

    const r = await perguntarIA({ workspaceId: p.workspace_id, sistema: SISTEMA, prompt: contexto, cwd: pasta, signal: c.signal, log: c.log, imagens: imagens.length ? imagens : undefined });
    const j = JSON.parse(bloco(r.text, "json")) as { legenda?: string; hashtags?: string[] };
    const hashtags = [...new Set((j.hashtags ?? []).map((h) => `#${String(h).replace(/^#+/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}_]/gu, "")}`).filter((h) => h.length > 2))].slice(0, LIMITES_IG.hashtags);
    const sugestao = { legenda: String(j.legenda ?? "").trim(), hashtags, geradoEm: new Date().toISOString() };
    if (!sugestao.legenda) throw new Error("A IA não devolveu a legenda");
    await sql`update ads.instagram_posts set sugestao = ${sql.json(sugestao as unknown as Json)}, updated_at = now() where id = ${p.id}`;
    return { hashtags: hashtags.length };
  } catch (e) {
    await sql`update ads.instagram_posts set sugestao = ${sql.json({ erro: (e as Error).message.slice(0, 500) })}, updated_at = now() where id = ${p.id}`;
    throw e;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}
