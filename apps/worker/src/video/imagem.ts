import { apagarArquivo, briefImagemSchema, ESTILOS, db, FORMATOS_IMAGEM, guardarArquivo, planoImagemSchema, r2Key, type BriefImagem, type ConceitoImagem, type Json, type PlanoImagem } from "@domus-ads/core";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { bloco, perguntarIA } from "../ai/ask";
import { promptCorrecao, REGRAS_CONTEXTO, violacoes } from "./compose";
import { contextoCriativo } from "./contexto";
import { hyperframes } from "./tools";

export interface ImagemPayload { projectId: string; mode?: "full" | "mais" | "render" | "adjust" | "manual"; html?: string; creativeId?: string; instruction?: string; quantidade?: number }
interface Ctx { signal: AbortSignal; log: (m: string) => Promise<void>; progress: (p: number) => Promise<void> }

function sistemaImagem(b: BriefImagem): string {
  const [w, h] = FORMATOS_IMAGEM[b.formato];
  return `Você é diretor de arte sênior de anúncios estáticos (Meta Ads, Instagram, Google Display), em português do Brasil.
Cada arte é um documento HTML/CSS que a HyperFrames captura como PNG de ${w}×${h}.

ESTRUTURA OBRIGATÓRIA de cada documento:
- <html lang="pt-BR">, <meta name="viewport" content="width=${w}, height=${h}">, html/body com width:${w}px; height:${h}px; overflow:hidden; margin:0.
- <div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="${w}" data-height="${h}">
  com UMA cena: <section id="arte" class="clip" data-start="0" data-duration="1" data-track-index="0"> (.clip { position:absolute; inset:0 }).
- <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script> e
  window.__timelines = window.__timelines || {}; window.__timelines["main"] = gsap.timeline({ paused: true });
  A arte é estática: tudo já visível no tempo 0 (sem animação de entrada).
- PROIBIDO: Math.random, Date, fetch/XMLHttpRequest/WebSocket, import(), eval, iframe, @keyframes/animation/transition,
  scripts externos além do GSAP, imagens externas. Fontes: Google Fonts (<link> para fonts.googleapis.com) ou do sistema.
  Formas, gradientes, ícones e ilustrações em CSS/SVG inline.

DIREÇÃO DE ARTE:
- Um ponto focal claro, hierarquia forte: headline curta e grande, apoio curto, CTA com cara de botão. Pouco texto.
- Margem de segurança de 6%. ${b.formato === "9:16" ? "Deixe livres os 14% de cima e de baixo (interface do Stories/Reels)." : ""}
  ${b.formato === "1.91:1" ? "Formato horizontal de anúncio com link: composição em duas colunas (texto | visual)." : ""}
- Contraste alto e legível no celular. Visual premium, não genérico de banco de imagens.
- Cores: ${b.cores || "as da identidade visual, se houver; senão, uma paleta premium coerente com o estilo"}. Estilo: ${b.estilo || "premium e moderno"}.
${b.estiloVisual !== "livre" ? `- ESTILO VISUAL OBRIGATÓRIO: ${ESTILOS[b.estiloVisual].nome}. ${ESTILOS[b.estiloVisual].descricao} Traduza isso em CSS.
  Claymorphism: volumes "inflados" com várias box-shadow (externa suave + interna clara em cima e escura embaixo), cantos bem redondos, pastel.
  Editorial: fundo claro de papel, serifada grande, fios finos de 1px, uma única cor de destaque. Tech HUD: fundo escuro, grade sutil, neon, vidro.` : ""}
${REGRAS_CONTEXTO}
- Nome do produto SEMPRE escrito exatamente “${b.produto}”. Para colorir parte do nome, divida sem repetir letras.
- Use só fatos do briefing; não invente preço, prazo, estatística ou promessa.`;
}

const briefingTexto = (b: BriefImagem) => `<briefing>
Produto: ${b.produto}
Objetivo: ${b.objetivo}
Descrição: ${b.descricao || "-"}
Público: ${b.publico || "-"}
CTA: ${b.cta || "-"}
Texto obrigatório na arte: ${b.texto || "(livre)"}
Formato: ${b.formato}${b.tipo === "carrossel" ? `\nPeça: CARROSSEL do Instagram com ${b.slides} slides` : ""}
</briefing>`;

const carrossel = (b: BriefImagem) => b.tipo === "carrossel";

/** Conceitos de um carrossel: 1 item por slide, numa narrativa só. */
const promptSlides = (b: BriefImagem, contexto: string) => `${contexto ? `${contexto}\n\n` : ""}${briefingTexto(b)}

Planeje um CARROSSEL de exatamente ${b.slides} slides RELACIONADOS, que contam uma história só quando a pessoa desliza:
slide 1 = capa com gancho forte que faz deslizar; meio = desenvolvimento (problema, solução, benefícios, prova, passo a passo,
o que fizer sentido para o objetivo), um ponto por slide e sem repetir; último = fechamento com o CTA.
Pouco texto por slide (headline curta + apoio opcional). Mesma linguagem visual em todos; o "visual" de cada slide diz
o que muda nele (elemento, ilustração, dado), não um estilo novo.
Ainda NÃO escreva HTML. Responda só com um bloco \`\`\`json:
{ "conceitos": [ { "conceito": "papel do slide (ex.: Capa, Problema, Benefício 1, CTA)", "headline": "texto exato",
  "apoio": "texto de apoio (opcional)", "cta": "só se o slide tiver botão (normalmente o último)", "visual": "o que aparece no slide, até 40 palavras" } ] }`;

const REGRAS_CARROSSEL = (n: number) => `É um CARROSSEL de ${n} slides: o mesmo design system em TODOS (fundo, grade, margens, fontes, tamanhos,
cores, cabeçalho e rodapé idênticos), para parecer uma peça só. Em cada slide: indicador discreto "i/${n}"; no slide 1 um sinal de
"arraste" (seta ou "deslize →"); o CTA forte só no último. Continuidade: um elemento (linha, forma, gradiente) pode sair pela borda
direita de um slide e continuar pela borda esquerda do seguinte.`;

/** 1ª fase (barata): só os conceitos, em JSON, para o usuário aprovar/editar antes de desenhar e renderizar. */
const promptConceitos = (b: BriefImagem, n: number, contexto: string, jaFeitas: string[]) => `${contexto ? `${contexto}\n\n` : ""}${briefingTexto(b)}

Proponha ${n} conceito(s) de arte DIFERENTES entre si (ângulo de mensagem, layout e tratamento visual), para teste A/B.
${jaFeitas.length ? `Já existem estes; proponha diferentes: ${jaFeitas.join(" | ")}\n` : ""}Ainda NÃO escreva HTML. Responda só com um bloco \`\`\`json:
{ "conceitos": [ { "conceito": "resumo em até 12 palavras", "headline": "texto exato da headline", "apoio": "texto de apoio (curto, opcional)",
  "cta": "texto do botão", "visual": "layout, elementos, cores e tratamento visual em até 50 palavras" } ] }`;

/** 2ª fase: desenha exatamente os conceitos aprovados. */
const promptArtes = (b: BriefImagem, conceitos: ConceitoImagem[], contexto: string, slide?: { inicio: number; total: number; referencia: string | null }) => `${contexto ? `${contexto}\n\n` : ""}${briefingTexto(b)}
${slide ? `\n${REGRAS_CARROSSEL(slide.total)}\n${slide.referencia ? `\n<slide_1_aprovado>\nReaproveite o MESMO CSS base, estrutura, fontes e elementos fixos deste slide (só o conteúdo muda):\n${slide.referencia}\n</slide_1_aprovado>\n` : ""}` : ""}
O cliente APROVOU ${slide ? "estes slides (numeração dentro do carrossel)" : "estes conceitos"}. Desenhe uma arte para cada um, na mesma ordem, usando os textos exatamente como estão
(headline, apoio e CTA; campo vazio = não usar) e seguindo a descrição visual.
${conceitos.map((c, i) => `${(slide?.inicio ?? 0) + i + 1}. Conceito: ${c.conceito}\n   Headline: ${c.headline}\n   Apoio: ${c.apoio || "-"}\n   CTA: ${c.cta || "-"}\n   Visual: ${c.visual || "-"}`).join("\n")}

Para cada uma, escreva a linha "Conceito: <o conceito acima>" e logo depois um bloco \`\`\`html com o documento completo.`;

/** Separa a resposta em pares (conceito, html). */
function variacoesDe(texto: string): { conceito: string; html: string }[] {
  const out: { conceito: string; html: string }[] = [];
  const re = /(?:Conceito:\s*([^\n]+)\n[\s\S]*?)?```html\s*\n([\s\S]*?)```/gi;
  for (const m of texto.matchAll(re)) out.push({ conceito: (m[1] ?? `Variação ${out.length + 1}`).trim().slice(0, 120), html: m[2]!.trim() });
  return out;
}

/**
 * Imagens do Studio: a IA desenha N variações em HTML/CSS (com identidade visual e anexos), cada uma passa pela barreira
 * de segurança e pelo lint, e a HyperFrames captura o PNG. Cada variação vira um criativo IMAGE (a composição fica no
 * metadata para ajustes). Modos: full (primeiras variações), mais (acrescenta), adjust (refaz uma variação com um pedido).
 */
export async function runImagem(payload: ImagemPayload, c: Ctx) {
  const sql = db();
  const [p] = await sql<{ id: string; workspace_id: string; brief: BriefImagem }[]>`
    select id, workspace_id, brief from ads.video_projects where id = ${payload.projectId} and kind = 'image'`;
  if (!p) throw new Error("Projeto de imagem não encontrado");
  const b = briefImagemSchema.parse(p.brief);
  const [w, h] = FORMATOS_IMAGEM[b.formato];
  const pasta = join(DATA_DIR, "videos", p.id);
  mkdirSync(pasta, { recursive: true });
  const etapa = async (status: string, detalhe: string, prog: number) => {
    await sql`update ads.video_projects set status = ${status}, step_detail = ${detalhe}, error = null, updated_at = now() where id = ${p.id}`;
    await c.progress(prog);
    await c.log(detalhe);
  };

  try {
    const ctx = await contextoCriativo(p.id, p.workspace_id, pasta, c.log);
    const sistema = sistemaImagem(b);
    const ia = (prompt: string) => perguntarIA({ workspaceId: p.workspace_id, sistema, prompt, cwd: pasta, signal: c.signal, log: c.log, imagens: ctx.imagens });
    const modo = payload.mode ?? "full";

    if (modo === "full" || modo === "mais") {
      // fase de aprovação: só conceitos e textos; nada é desenhado nem renderizado antes do OK do usuário
      await etapa("SCRIPTING", "Pensando nos conceitos…", 15);
      const ja = modo === "mais" ? (await sql<{ c: string }[]>`select metadata->>'conceito' as c from ads.creatives where metadata->>'projectId' = ${p.id} and type = 'IMAGE'`).map((x) => x.c) : [];
      const n = carrossel(b) ? b.slides : modo === "mais" ? Math.min(4, Math.max(1, payload.quantidade ?? 2)) : b.variacoes;
      let plano: PlanoImagem | null = null;
      for (let t = 0; !plano; t++) {
        const r = await ia((carrossel(b) ? promptSlides(b, ctx.texto) : promptConceitos(b, n, ctx.texto, ja)) + (t ? "\n\nA resposta anterior não veio num JSON válido nesse formato. Responda só o bloco json." : ""));
        try { plano = planoImagemSchema.parse(JSON.parse(bloco(r.text, "json"))); } catch (e) { if (t === 1) throw new Error(`Os conceitos não vieram no formato esperado: ${(e as Error).message.slice(0, 200)}`); }
      }
      plano.conceitos = plano.conceitos.slice(0, n);
      await sql`update ads.video_projects set storyboard = ${sql.json(plano as unknown as Json)}, status = 'REVIEW',
        step_detail = ${carrossel(b) ? "Slides prontos: revise e aprove para gerar o carrossel" : "Conceitos prontos: revise e aprove para gerar as imagens"}, error = null, updated_at = now() where id = ${p.id}`;
      await c.progress(100);
      return { revisao: true, conceitos: plano.conceitos.length };
    }

    let alvo: { id: string | null; conceito: string; html: string; ordem?: number; antigo?: { storage: string; key: string } }[] = [];
    let substituir: { id: string; storage: string; r2_key: string | null }[] = [];
    await etapa("COMPOSING", modo === "manual" ? "Aplicando a sua edição…" : modo === "adjust" ? "Ajustando a arte…" : "Criando as artes (HTML + CSS)…", 15);
    if (modo === "adjust" || modo === "manual") {
      const [cr] = await sql<{ id: string; storage: string; r2_key: string; metadata: { composition?: string; conceito?: string; ordem?: number } }[]>`
        select id, storage, r2_key, metadata from ads.creatives where id = ${payload.creativeId!} and workspace_id = ${p.workspace_id} and type = 'IMAGE'`;
      if (!cr?.metadata.composition) throw new Error("Variação não encontrada");
      // edição manual (editor visual): o HTML editado é renderizado como está, sem IA
      const html = modo === "manual" ? (payload.html ?? "")
        : variacoesDe((await ia(`${ctx.texto ? `${ctx.texto}\n\n` : ""}Ajuste esta arte conforme o pedido e devolva o documento completo (só o bloco \`\`\`html).\n\n<pedido>\n${payload.instruction}\n</pedido>\n\n<index.html>\n${cr.metadata.composition}\n</index.html>`)).text)[0]?.html ?? "";
      alvo = [{ id: cr.id, conceito: cr.metadata.conceito ?? "Variação", ordem: cr.metadata.ordem, html, antigo: { storage: cr.storage, key: cr.r2_key } }];
    } else {
      // render: os conceitos que o usuário aprovou (e talvez editou)
      const [row] = await sql<{ storyboard: unknown }[]>`select storyboard from ads.video_projects where id = ${p.id}`;
      const plano = planoImagemSchema.parse(row?.storyboard);
      if (!carrossel(b)) {
        const r = await ia(promptArtes(b, plano.conceitos, ctx.texto));
        alvo = variacoesDe(r.text).slice(0, plano.conceitos.length).map((v, i) => ({ id: null, ...v, conceito: plano.conceitos[i]?.conceito ?? v.conceito }));
      } else {
        // carrossel: lotes de 4 slides; do 2º lote em diante a IA recebe o slide 1 como referência de design
        const total = plano.conceitos.length;
        for (let ini = 0; ini < total; ini += 4) {
          await etapa("COMPOSING", `Desenhando os slides ${ini + 1}–${Math.min(total, ini + 4)} de ${total}…`, 15 + Math.round((ini / total) * 15));
          const lote = plano.conceitos.slice(ini, ini + 4);
          const r = await ia(promptArtes(b, lote, ctx.texto, { inicio: ini, total, referencia: alvo[0]?.html ?? null }));
          variacoesDe(r.text).slice(0, lote.length).forEach((v, j) => alvo.push({ id: null, ...v, conceito: lote[j]!.conceito, ordem: ini + j + 1 }));
        }
        // o carrossel novo substitui o anterior (apagado só depois que o novo ficar pronto)
        substituir = await sql<{ id: string; storage: string; r2_key: string | null }[]>`
          select id, storage, r2_key from ads.creatives where metadata->>'projectId' = ${p.id} and type = 'IMAGE' and workspace_id = ${p.workspace_id}`;
      }
      if (!alvo.length) throw new Error("A IA não devolveu nenhuma arte em HTML");
    }

    const prontas: string[] = [];
    for (const [i, v] of alvo.entries()) {
      // barreira + lint, com até 2 correções pela IA
      let html = v.html;
      for (let rodada = 0; ; rodada++) {
        const erros = [...violacoes(html), ...(await lint(pasta, html))];
        if (!erros.length) break;
        if (modo === "manual") throw new Error(`A edição não passou na verificação: ${erros.slice(0, 2).join("; ")}`);
        if (rodada === 2) { await c.log(`variação ${i + 1} descartada: ${erros.slice(0, 2).join("; ")}`); html = ""; break; }
        await c.log(`variação ${i + 1}: ${erros.length} problema(s); pedindo correção`);
        html = variacoesDe((await ia(promptCorrecao(html, erros))).text)[0]?.html ?? "";
      }
      if (!html) continue;

      await etapa("RENDERING", `Gerando a imagem ${i + 1} de ${alvo.length}…`, 30 + Math.round((i / alvo.length) * 55));
      const png = await capturar(pasta, html, c.signal);
      const id = v.id ?? crypto.randomUUID();
      const key = r2Key(p.workspace_id, "images", `${id}-${Date.now().toString(36)}.png`);
      const storage = await guardarArquivo(key, png, "image/png");
      const meta = { projectId: p.id, conceito: v.conceito, composition: html, brief: b, ...(v.ordem ? { ordem: v.ordem, carrossel: true } : {}) };
      if (v.id) {
        await sql`update ads.creatives set storage = ${storage}, r2_key = ${key}, size_bytes = ${statSync(png).size}, metadata = ${sql.json(meta as unknown as Json)}, updated_at = now() where id = ${id}`;
        if (v.antigo && v.antigo.key !== key) await apagarArquivo(v.antigo.storage, v.antigo.key).catch(() => {});
      } else {
        await sql`insert into ads.creatives (id, workspace_id, name, type, status, storage, r2_key, mime, size_bytes, width, height, metadata)
          values (${id}, ${p.workspace_id}, ${(v.ordem ? `${b.produto} · slide ${v.ordem} · ${v.conceito}` : `${b.produto} · ${v.conceito}`).slice(0, 120)}, 'IMAGE', 'READY', ${storage}, ${key}, 'image/png', ${statSync(png).size}, ${w}, ${h}, ${sql.json(meta as unknown as Json)})`;
      }
      rmSync(png, { force: true });
      prontas.push(id);
    }
    if (!prontas.length) throw new Error("Nenhuma variação passou na verificação. Tente de novo.");
    const descartadas = alvo.length - prontas.length;
    for (const o of substituir) {
      if (o.r2_key) await apagarArquivo(o.storage, o.r2_key).catch(() => {});
      await sql`delete from ads.creatives where id = ${o.id}`;
    }
    await sql`update ads.video_projects set status = 'READY', step_detail = ${descartadas ? `${prontas.length} pronta(s), ${descartadas} descartada(s) por erro` : "Pronto"},
      creative_id = ${substituir.length ? prontas[0]! : sql`coalesce(creative_id, ${prontas[0]!})`}, error = null, updated_at = now() where id = ${p.id}`;
    await c.progress(100);
    return { imagens: prontas.length, descartadas };
  } catch (e) {
    await sql`update ads.video_projects set status = 'FAILED', error = ${(e as Error).message.slice(0, 1000)}, updated_at = now() where id = ${p.id}`;
    throw e;
  }
}

async function lint(pasta: string, html: string): Promise<string[]> {
  writeFileSync(join(pasta, "index.html"), html, "utf8");
  const r = await hyperframes(["lint", pasta, "--json"], { cwd: pasta, timeoutMs: 120_000 });
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf("{"))) as { findings?: { severity: string; message: string; fixHint?: string }[] };
    return (j.findings ?? []).filter((f) => f.severity === "error").map((f) => `${f.message}${f.fixHint ? ` (correção: ${f.fixHint})` : ""}`);
  } catch {
    return r.code === 0 ? [] : [`lint falhou: ${(r.err || r.out).slice(0, 300)}`];
  }
}

/** PNG da arte (instante 0,5 s da composição de 1 s, já com fontes e anexos carregados). */
async function capturar(pasta: string, html: string, signal: AbortSignal): Promise<string> {
  writeFileSync(join(pasta, "index.html"), html, "utf8");
  const saida = join(pasta, "snap");
  rmSync(saida, { recursive: true, force: true });
  const r = await hyperframes(["snapshot", pasta, "--at", "0.5", "--no-end", "-o", saida, "--describe", "false"], { cwd: pasta, timeoutMs: 180_000, signal });
  const arq = existsSync(saida) ? readdirSync(saida).find((f) => f.endsWith(".png")) : undefined;
  if (r.code !== 0 || !arq) throw new Error(`Falha ao gerar a imagem: ${(r.err || r.out).trim().split("\n").filter(Boolean).at(-1) ?? r.code}`);
  return join(saida, arq);
}
