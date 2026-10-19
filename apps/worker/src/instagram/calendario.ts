import {
  brandSchema, briefImagemSchema, briefSchema, chaveElevenLabs, configCalendario, db, enqueueJob, FORMATOS_CAL, hashtagsSchema, instagramDaConexao, itemCalSchema,
  lerArquivo, LIMITES_IG, roteiroSchema, vozesElevenLabs, type Brand, type ConfigCal, type CampoRefazer, type FormatoCal, type Json, type Roteiro,
} from "@domus-ads/core";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bloco, perguntarIA } from "../ai/ask";
import { DATA_DIR } from "../env";
import { lerPagina } from "../video/contexto";
import { ffmpeg } from "../video/tools";
import { avisar, enviarMidia } from "../whatsapp";
import { limparHashtags, TEXTO_HUMANO } from "./legenda";

/**
 * Calendário de conteúdo. A IA planeja o período numa chamada só (plano) e depois refaz só o que o usuário pedir
 * (um post ou um campo), com o mínimo de contexto, para gastar poucos tokens. A automação (automatizarCalendario)
 * gera a arte assim que o post é aprovado, manda para você aprovar no WhatsApp e só então agenda a publicação.
 */
export type CalendarioPayload = { calendarioId: string } | { itemId: string; campo: CampoRefazer; dica?: string };

const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const ROTEIROS = `Roteiro por formato (campo "roteiro"):
- FEED (1 imagem 4:5): {"headline": texto grande da arte, até 60 caracteres, "apoio": até 140, "cta": até 40, "visual": composição da arte, até 300}
- CARROSSEL (slides 4:5): {"slides": [{"headline": até 70, "apoio": até 160, "visual": até 250}] com 4 a 8 slides (1º = gancho, último = chamada), "cta": até 40}
- REELS (vídeo 9:16 narrado): {"narracao": o texto falado, 35–45 palavras para 15 s ou 70–85 para 30 s, com gancho nos 2 primeiros segundos, "duracao": 15 ou 30, "visual": até 300, "cta": até 40}
- "visual" descreve um layout limpo e plano: tipografia grande, blocos de cor da marca, a logo oficial, ícones de linha simples,
  mockup simples de tela (site/celular) com cantos retos ou levemente arredondados. NUNCA peça 3D, clay, inflado, isométrico, vidro,
  objetos "realistas" desenhados (portas, casas, mãos, pessoas) nem ícone/símbolo inventado para a marca. Texto nunca sobreposto por ilustração.
- Quando o post mostrar um site, sistema ou produto real (case, portfólio, o próprio site), escreva no "visual" o endereço dele
  (ex.: "print de cliente.com.br no celular"): a arte e o vídeo usam o print real dessa página, nunca uma imitação.`;

export const REGRAS_POST = `- Legenda: gancho na 1ª linha, parágrafos curtos, uma chamada no fim, SEM hashtags dentro.
${TEXTO_HUMANO}
- Hashtags: 8 a 15 por post (nicho + local, se fizer sentido + marca), sem acento nem espaço.
- Use só fatos da marca, do site e do pedido. Não invente preço, prazo, número, depoimento nem garantia.
- Tudo em português do Brasil.`;

const SISTEMA_PLANO = `Você é estrategista de conteúdo e social media sênior no Brasil. Planeja o calendário de Instagram de uma marca e escreve cada post pronto para produção.
Responda APENAS com um bloco \`\`\`json no formato {"itens": [{"data": "AAAA-MM-DD", "hora": "HH:MM", "formato": "FEED" | "CARROSSEL" | "REELS", "tema": "...", "objetivo": "...", "roteiro": {...}, "legenda": "...", "hashtags": ["#..."]}]}

${ROTEIROS}

Regras:
- Exatamente a quantidade pedida de cada formato. Espalhe pelos dias (evite 2 posts no mesmo dia) e use horários de bom alcance no horário de Brasília (ex.: 07:30–09:00, 11:30–13:30, 18:00–21:00), variando.
- Datas comemorativas do período no Brasil que combinem com o nicho viram temas, sem forçar.
- Os posts de melhor desempenho mostram o que o público gosta (assunto, formato, gancho): use como pista, sem copiar.
- Varie os pilares: educar, inspirar, provar (bastidores, cases), vender e engajar. Não repita temas já planejados.
- "objetivo" diz o que o post quer causar (ex.: salvar, comentar, clicar no link da bio).
${REGRAS_POST}`;

const SISTEMA_AJUSTE = `Você é social media sênior no Brasil e ajusta UM post de um calendário de Instagram já planejado.
Responda APENAS com um bloco \`\`\`json no formato pedido.

${ROTEIROS}

${REGRAS_POST}`;

interface Contexto { workspace_id: string; ig_account_id: string; username: string; bio: string | null; marca: string | null; brand: Brand | null; credentials_enc: string; ig_user_id: string }

/** Marca e perfil. completo: também o texto do site e os posts de melhor desempenho (só no plano do período). */
async function contexto(calendarioId: string, completo: boolean, log: (m: string) => Promise<void>): Promise<{ ctx: Contexto; texto: string }> {
  const [c] = await db()<(Omit<Contexto, "brand"> & { brand: unknown })[]>`
    select c.workspace_id, c.ig_account_id, a.username, a.bio, a.ig_user_id, k.credentials_enc, b.nome as marca, b.brand
    from ads.calendarios c join ads.instagram_accounts a on a.id = c.ig_account_id join ads.ad_connections k on k.id = a.connection_id
    left join ads.brands b on b.id = c.brand_id and b.workspace_id = c.workspace_id
    where c.id = ${calendarioId}`;
  if (!c) throw new Error("Planejamento não encontrado");
  const p = brandSchema.safeParse(c.brand ?? {});
  const brand = c.brand && p.success ? p.data : null;
  const partes = [
    `Perfil: @${c.username}${c.bio ? `\nBio: ${c.bio}` : ""}`,
    c.marca && `Marca: ${c.marca}`,
    brand?.sobre && `Sobre a marca: ${completo ? brand.sobre : brand.sobre.slice(0, 600)}`,
    brand?.tom && `Tom de voz: ${brand.tom}`,
    brand?.regras && `Regras da marca: ${completo ? brand.regras : brand.regras.slice(0, 400)}`,
  ];
  if (completo && brand?.site) {
    try { partes.push(`<site url="${brand.site}">\n${(await lerPagina(brand.site)).slice(0, 5000)}\n</site>`); } catch (e) { await log(`site não lido: ${(e as Error).message}`); }
  }
  if (completo) {
    try {
      const midias = await instagramDaConexao(c.credentials_enc).midias(c.ig_user_id, 36);
      const top = midias.map((m) => ({ m, nota: (m.like_count ?? 0) + 3 * (m.comments_count ?? 0) })).sort((a, b) => b.nota - a.nota).slice(0, 6);
      if (top.length) partes.push(`<melhores_posts>\n${top.map(({ m }) => `- ${m.media_product_type === "REELS" ? "REELS" : m.media_type === "CAROUSEL_ALBUM" ? "CARROSSEL" : "FEED"} · ${m.like_count ?? 0} curtidas · ${m.comments_count ?? 0} comentários · ${(m.caption ?? "").replace(/\s+/g, " ").slice(0, 220)}`).join("\n")}\n</melhores_posts>`);
    } catch (e) { await log(`posts do perfil não lidos: ${(e as Error).message}`); }
  }
  return { ctx: { ...c, brand }, texto: partes.filter(Boolean).join("\n") };
}

/** "2026-10-20" + "12:30" no horário de Brasília (sem horário de verão desde 2019). */
const dataBrasilia = (d: string, h: string) => new Date(`${d}T${/^\d{2}:\d{2}$/.test(h) ? h : "12:00"}:00-03:00`);

/** Item da IA → campos validados (ou o motivo de ter sido descartado). */
function lerItem(x: Record<string, unknown>, fixo?: { dataHora: string; formato: FormatoCal }) {
  const dataHora = fixo?.dataHora ?? dataBrasilia(String(x.data ?? ""), String(x.hora ?? "")).toISOString();
  return itemCalSchema.safeParse({
    dataHora, formato: fixo?.formato ?? x.formato, tema: x.tema, objetivo: x.objetivo ?? "",
    roteiro: x.roteiro ?? {}, legenda: x.legenda ?? "", hashtags: limparHashtags(x.hashtags),
  });
}

async function pedir(workspaceId: string, sistema: string, prompt: string, c: { signal: AbortSignal; log: (m: string) => Promise<void> }, pasta: string) {
  mkdirSync(pasta, { recursive: true });
  try {
    const r = await perguntarIA({ workspaceId, sistema, prompt, cwd: pasta, signal: c.signal, log: c.log });
    return JSON.parse(bloco(r.text, "json")) as Record<string, unknown>;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

/** Job AI_CALENDARIO: o período inteiro (calendarioId) ou só um post/campo (itemId + campo). */
export async function gerarCalendario(payload: CalendarioPayload, c: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  return "calendarioId" in payload ? planejar(payload.calendarioId, c) : refazer(payload, c);
}

async function planejar(id: string, c: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  const sql = db();
  const [cal] = await sql<{ inicio: string; fim: string; objetivo: string; mix: Record<FormatoCal, number>; ig_account_id: string }[]>`
    select inicio::text, fim::text, objetivo, mix, ig_account_id from ads.calendarios where id = ${id}`;
  if (!cal) throw new Error("Planejamento não encontrado");
  try {
    const { ctx, texto } = await contexto(id, true, c.log);
    // refazer o período: as sugestões não aprovadas saem; as aprovadas ficam e a IA planeja em volta delas
    await sql`delete from ads.calendario_itens where calendario_id = ${id} and status = 'SUGERIDO'`;
    const dias = Math.round((Date.parse(cal.fim) - Date.parse(cal.inicio)) / 86_400_000) + 1;
    const ja = await sql<{ data_hora: Date; formato: FormatoCal; tema: string }[]>`
      select data_hora, formato, tema from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id
      where k.ig_account_id = ${cal.ig_account_id} and i.data_hora between ${cal.inicio}::date - 14 and ${cal.fim}::date + 14 order by data_hora`;
    const fixos = await sql<{ formato: FormatoCal; n: number }[]>`select formato, count(*)::int n from ads.calendario_itens where calendario_id = ${id} group by formato`;
    const total = (f: FormatoCal) => Math.max(0, (cal.mix[f] ? Math.max(1, Math.round((cal.mix[f] * dias) / 7)) : 0) - (fixos.find((x) => x.formato === f)?.n ?? 0));
    const pedido = (Object.keys(FORMATOS_CAL) as FormatoCal[]).filter((f) => total(f) > 0).map((f) => `${total(f)} ${f}`).join(", ");
    if (!pedido) { await sql`update ads.calendarios set status = 'PRONTO', erro = null, updated_at = now() where id = ${id}`; return { itens: 0 }; }
    const prompt = [
      `Hoje: ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Período: ${cal.inicio} a ${cal.fim} (${dias} dias).`,
      `Quantidade a planejar: ${pedido}.`,
      `<objetivo_do_periodo>\n${cal.objetivo}\n</objetivo_do_periodo>`,
      texto,
      ja.length ? `<ja_planejados>\n${ja.map((i) => `- ${quando(i.data_hora)} · ${i.formato} · ${i.tema}`).join("\n")}\n</ja_planejados>\n(Não repita esses temas nem use esses horários.)` : "",
    ].filter(Boolean).join("\n\n");
    const j = await pedir(ctx.workspace_id, SISTEMA_PLANO, prompt, c, join(DATA_DIR, "calendario", id));
    const lista = Array.isArray(j.itens) ? (j.itens as Record<string, unknown>[]) : [];
    const ini = Date.parse(`${cal.inicio}T00:00:00-03:00`), fim = Date.parse(`${cal.fim}T23:59:59-03:00`);
    let ok = 0;
    const descartes: string[] = [];
    for (const x of lista) {
      const r = lerItem(x);
      if (!r.success) { descartes.push(r.error.issues[0]?.message ?? "formato inválido"); continue; }
      const t = Date.parse(r.data.dataHora);
      if (t < ini || t > fim || t < Date.now() + 30 * 60_000) { descartes.push("data fora do período"); continue; }
      const i = r.data;
      await sql`insert into ads.calendario_itens (calendario_id, workspace_id, data_hora, formato, tema, objetivo, roteiro, legenda, hashtags)
        values (${id}, ${ctx.workspace_id}, ${i.dataHora}, ${i.formato}, ${i.tema}, ${i.objetivo}, ${sql.json(i.roteiro as unknown as Json)}, ${i.legenda}, ${i.hashtags})`;
      ok++;
    }
    if (!ok) throw new Error(`A IA não devolveu nenhum post válido${descartes[0] ? ` (${descartes[0]})` : ""}`);
    await sql`update ads.calendarios set status = 'PRONTO', erro = ${descartes.length ? `${descartes.length} sugestão(ões) descartada(s): ${descartes[0]}` : null}, updated_at = now() where id = ${id}`;
    return { itens: ok, descartados: descartes.length };
  } catch (e) {
    await sql`update ads.calendarios set status = 'ERRO', erro = ${(e as Error).message.slice(0, 500)}, updated_at = now() where id = ${id}`;
    throw e;
  }
}

async function refazer(p: { itemId: string; campo: CampoRefazer; dica?: string }, c: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  const sql = db();
  const [it] = await sql<{ id: string; calendario_id: string; data_hora: Date; formato: FormatoCal; tema: string; objetivo: string; roteiro: Roteiro; legenda: string; hashtags: string[]; cal_objetivo: string }[]>`
    select i.id, i.calendario_id, i.data_hora, i.formato, i.tema, i.objetivo, i.roteiro, i.legenda, i.hashtags, k.objetivo as cal_objetivo
    from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id where i.id = ${p.itemId}`;
  if (!it) throw new Error("Post do calendário não encontrado");
  try {
    const { ctx, texto } = await contexto(it.calendario_id, false, c.log);
    const vizinhos = await sql<{ tema: string }[]>`select tema from ads.calendario_itens where calendario_id = ${it.calendario_id} and id <> ${it.id} order by data_hora limit 40`;
    const atual = { formato: it.formato, tema: it.tema, objetivo: it.objetivo, roteiro: it.roteiro, legenda: it.legenda, hashtags: it.hashtags };
    const formato = p.campo === "item" ? `{"tema": "...", "objetivo": "...", "roteiro": {...}, "legenda": "...", "hashtags": ["#..."]} (o post inteiro, novo, no mesmo formato ${it.formato})`
      : p.campo === "roteiro" ? `{"roteiro": {...}} (formato ${it.formato})` : p.campo === "hashtags" ? `{"hashtags": ["#..."]}` : `{"${p.campo}": "..."}`;
    const prompt = [
      texto,
      `Objetivo do período: ${it.cal_objetivo}`,
      `Outros temas do calendário (não repita): ${vizinhos.map((v) => v.tema).join(" · ").slice(0, 1500)}`,
      `<post_atual data="${quando(it.data_hora)}">\n${JSON.stringify(atual)}\n</post_atual>`,
      `Refaça ${p.campo === "item" ? (p.dica?.trim() ? "o post seguindo o pedido do usuário (o que ele não pediu para mudar, mantenha)" : "o post inteiro com outra ideia") : `só o campo "${p.campo}", coerente com o resto do post`}. Responda: ${formato}`,
      p.dica?.trim() ? `<pedido_do_usuario>\n${p.dica.trim()}\n</pedido_do_usuario>` : "",
    ].filter(Boolean).join("\n\n");
    const j = await pedir(ctx.workspace_id, SISTEMA_AJUSTE, prompt, c, join(DATA_DIR, "calendario", it.id));
    if (p.campo === "item") {
      const r = lerItem(j, { dataHora: it.data_hora.toISOString(), formato: it.formato });
      if (!r.success) throw new Error(`A IA devolveu um post inválido: ${r.error.issues[0]?.message}`);
      await sql`update ads.calendario_itens set tema = ${r.data.tema}, objetivo = ${r.data.objetivo}, roteiro = ${sql.json(r.data.roteiro as unknown as Json)},
        legenda = ${r.data.legenda}, hashtags = ${r.data.hashtags}, refazendo = null, erro = null, updated_at = now() where id = ${it.id}`;
    } else if (p.campo === "roteiro") {
      const r = roteiroSchema.parse(j.roteiro ?? {});
      await sql`update ads.calendario_itens set roteiro = ${sql.json(r as unknown as Json)}, refazendo = null, erro = null, updated_at = now() where id = ${it.id}`;
    } else if (p.campo === "hashtags") {
      const h = hashtagsSchema.parse(limparHashtags(j.hashtags));
      await sql`update ads.calendario_itens set hashtags = ${h}, refazendo = null, erro = null, updated_at = now() where id = ${it.id}`;
    } else {
      const v = itemCalSchema.shape[p.campo].parse(String(j[p.campo] ?? ""));
      if (p.campo === "tema") await sql`update ads.calendario_itens set tema = ${v}, refazendo = null, erro = null, updated_at = now() where id = ${it.id}`;
      else await sql`update ads.calendario_itens set legenda = ${v}, refazendo = null, erro = null, updated_at = now() where id = ${it.id}`;
    }
    return { campo: p.campo };
  } catch (e) {
    await sql`update ads.calendario_itens set refazendo = null, erro = ${`Não deu para refazer: ${(e as Error).message}`.slice(0, 500)}, updated_at = now() where id = ${it.id}`;
    throw e;
  }
}

// ───────────── Automação: gerar, aprovar no WhatsApp, agendar, acompanhar ─────────────

interface Pronto { id: string; workspace_id: string; ig_account_id: string; brand_id: string | null; data_hora: Date; formato: FormatoCal; tema: string; objetivo: string; roteiro: Roteiro; legenda: string; hashtags: string[]; marca: string | null; ws_nome: string }

/** Voz dos Reels: a favorita do ElevenLabs (a última marcada, do dono primeiro); sem favorita ou sem chave, a voz local da config. */
async function vozDosReels(workspaceId: string, padrao: string) {
  const [m] = await db()<{ id: string }[]>`select vozes_favoritas[cardinality(vozes_favoritas)] as id from ads.workspace_members
    where workspace_id = ${workspaceId} and cardinality(vozes_favoritas) > 0 order by case role when 'owner' then 0 when 'admin' then 1 else 2 end, created_at limit 1`;
  const chave = m ? await chaveElevenLabs() : null;
  if (!m || !chave) return { voz: padrao, vozNome: "" };
  return { voz: `el:${m.id}`, vozNome: (await vozesElevenLabs(chave).catch(() => [])).find((v) => v.id === m.id)?.nome ?? "" };
}

/** Cria o projeto do Studio já com o conteúdo aprovado (sem revisão) e põe na fila. */
async function iniciar(i: Pronto, cfg: ConfigCal) {
  const sql = db();
  const r = roteiroSchema.parse(i.roteiro);
  const produto = (i.marca ?? i.ws_nome).slice(0, 120).padEnd(2, ".");
  const objetivo = (i.objetivo || i.tema).slice(0, 300);
  let projeto: { id: string } | undefined;
  if (i.formato === "REELS") {
    const brief = briefSchema.parse({
      produto, objetivo, duracao: r.duracao, formato: "9:16", cta: r.cta, identidade: "workspace", estiloVisual: cfg.estiloVideo, ...(await vozDosReels(i.workspace_id, cfg.voz)), musica: "auto",
      orientacao: `Tema: ${i.tema}\n\nRoteiro da narração (aprovado pelo cliente; mantenha as ideias e ajuste só para caber no tempo):\n${r.narracao}${r.visual ? `\n\nVisual: ${r.visual}` : ""}`.slice(0, 4000),
    });
    [projeto] = await sql<{ id: string }[]>`insert into ads.video_projects (workspace_id, brand_id, title, brief, status, step_detail)
      values (${i.workspace_id}, ${i.brand_id}, ${i.tema.slice(0, 120)}, ${sql.json(brief as unknown as Json)}, 'QUEUED', 'Calendário: na fila do worker…') returning id`;
    await enqueueJob(sql, { workspaceId: i.workspace_id, type: "GENERATE_VIDEO", payload: { projectId: projeto!.id, mode: "full" }, maxAttempts: 1 });
  } else {
    const carrossel = i.formato === "CARROSSEL";
    const conceitos = carrossel
      ? r.slides.map((s, n) => ({ conceito: `Slide ${n + 1}`, headline: s.headline, apoio: s.apoio, cta: n === r.slides.length - 1 ? r.cta : "", visual: s.visual }))
      : [{ conceito: i.tema.slice(0, 120), headline: r.headline, apoio: r.apoio, cta: r.cta, visual: r.visual }];
    const brief = briefImagemSchema.parse({
      produto, objetivo, orientacao: i.tema, tipo: carrossel ? "carrossel" : "avulsa", slides: Math.max(2, conceitos.length), formato: "4:5",
      variacoes: 1, cta: r.cta, identidade: "workspace",
    });
    [projeto] = await sql<{ id: string }[]>`insert into ads.video_projects (workspace_id, brand_id, kind, title, brief, storyboard, status, step_detail)
      values (${i.workspace_id}, ${i.brand_id}, 'image', ${i.tema.slice(0, 120)}, ${sql.json(brief as unknown as Json)}, ${sql.json({ conceitos } as unknown as Json)}, 'QUEUED', 'Calendário: na fila do worker…')
      returning id`;
    await enqueueJob(sql, { workspaceId: i.workspace_id, type: "GENERATE_IMAGE", payload: { projectId: projeto!.id, mode: "render" }, maxAttempts: 1 });
  }
  if (!projeto) throw new Error("Projeto não foi criado");
  await sql`update ads.calendario_itens set project_id = ${projeto.id}, erro = null, updated_at = now() where id = ${i.id}`;
}

async function falhar(id: string, motivo: string, i: { formato: FormatoCal; data_hora: Date; tema: string }) {
  await db()`update ads.calendario_itens set status = 'FALHOU', aprovacao = null, erro = ${motivo.slice(0, 1000)}, updated_at = now() where id = ${id}`;
  await avisar(`❌ ${FORMATOS_CAL[i.formato]} de ${quando(i.data_hora)} não vai sair\n${i.tema}\nMotivo: ${motivo.slice(0, 300)}\nVeja em Instagram → Calendário.`);
}

let rodando = false; // a passada também é chamada pela resposta do WhatsApp: nunca duas ao mesmo tempo

/** Passada de 1 em 1 minuto: gera a arte do que foi aprovado, manda para aprovação no WhatsApp, agenda o aprovado e marca atrasos. */
export async function automatizarCalendario() {
  if (rodando) return;
  rodando = true;
  try { await passada(); } finally { rodando = false; }
}

async function passada() {
  const sql = db();
  const cfg = await configCalendario();
  const tolerancia = cfg.toleranciaH * 3_600_000;

  // 1. aprovado (e a IA não está refazendo): gera já, para sobrar tempo de conferir a arte no WhatsApp
  const aprovados = await sql<Pronto[]>`
    select i.id, i.workspace_id, k.ig_account_id, b.id as brand_id, i.data_hora, i.formato, i.tema, i.objetivo, i.roteiro, i.legenda, i.hashtags, b.nome as marca, w.name as ws_nome
    from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id join ads.workspaces w on w.id = i.workspace_id
    join ads.instagram_accounts a on a.id = k.ig_account_id
    -- calendário sem marca: a marca cujo nome está no @ do perfil (senão a mais antiga), para a arte nunca sair sem logo e cores
    left join lateral (select b.id, b.nome from ads.brands b where b.workspace_id = i.workspace_id and (k.brand_id is null or b.id = k.brand_id)
      order by position(lower(replace(b.nome, ' ', '')) in lower(a.username)) = 0, b.created_at limit 1) b on true
    where i.status = 'APROVADO' and i.refazendo is null`;
  for (const i of aprovados) {
    if (Date.now() > i.data_hora.getTime() + tolerancia) { await falhar(i.id, `Passou ${cfg.toleranciaH} h do horário sem gerar (o PC estava desligado?)`, i); continue; }
    // trava: só um passe pega o item
    const [ok] = await sql`update ads.calendario_itens set status = 'GERANDO', updated_at = now() where id = ${i.id} and status = 'APROVADO' returning id`;
    if (!ok) continue;
    try { await iniciar(i, cfg); } catch (e) { await falhar(i.id, `Não deu para começar a geração: ${(e as Error).message}`, i); }
  }

  // 2. em geração: vídeo parou na revisão do roteiro → aprova sozinho; pronto → vai para a sua aprovação; falhou → avisa
  const gerando = await sql<(Pronto & { project_id: string; p_status: string | null; p_kind: string; p_erro: string | null; creative_id: string | null; ocupado: boolean })[]>`
    select i.id, i.workspace_id, k.ig_account_id, k.brand_id, i.data_hora, i.formato, i.tema, i.legenda, i.hashtags, i.project_id,
      p.status as p_status, p.kind as p_kind, p.error as p_erro, p.creative_id,
      exists (select 1 from ads.jobs j where j.type in ('GENERATE_VIDEO','GENERATE_IMAGE') and j.status in ('PENDING','RUNNING') and j.payload->>'projectId' = p.id::text) as ocupado
    from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id left join ads.video_projects p on p.id = i.project_id
    where i.status = 'GERANDO' and i.project_id is not null`;
  for (const i of gerando) {
    if (i.ocupado) continue;
    if (i.p_status === "REVIEW" && i.p_kind !== "image") {
      // vídeo: roteiro aprovado sozinho · vídeo do cliente (edição): legenda e animações aprovadas sozinhas (a arte pronta vai para a aprovação)
      const [ok] = await sql`update ads.video_projects set status = 'QUEUED', step_detail = 'Calendário: aprovado, gerando o vídeo…', updated_at = now() where id = ${i.project_id} and status = 'REVIEW' returning id`;
      if (ok) await enqueueJob(sql, { workspaceId: i.workspace_id, type: "GENERATE_VIDEO", payload: { projectId: i.project_id, mode: i.p_kind === "edit" ? "render" : "rerender" }, maxAttempts: 1 });
    } else if (i.p_status === "FAILED" || !i.p_status) {
      await falhar(i.id, i.p_erro ?? "A geração da arte falhou", i);
    } else if (i.p_status === "READY") {
      await sql`update ads.calendario_itens set status = 'REVISAO', aprovacao = null, erro = null, updated_at = now() where id = ${i.id} and status = 'GERANDO'`;
    }
  }

  // 3. arte pronta esperando você: aprovado → agenda; sem resposta até passar da tolerância → não sai; e manda o próximo para o WhatsApp
  const revisao = await sql<(Pronto & { project_id: string; creative_id: string | null; aprovacao: string | null; erro: string | null; updated_at: Date; username: string })[]>`
    select i.id, i.workspace_id, k.ig_account_id, k.brand_id, i.data_hora, i.formato, i.tema, i.legenda, i.hashtags, i.project_id, i.aprovacao, i.erro, i.updated_at,
      p.creative_id, a.username
    from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id join ads.instagram_accounts a on a.id = k.ig_account_id
    left join ads.video_projects p on p.id = i.project_id
    where i.status = 'REVISAO' order by i.data_hora`;
  const esperando: (typeof revisao)[number][] = [];
  for (const i of revisao) {
    if (i.aprovacao === "APROVADA") {
      const quandoPost = await agendar(i, i.project_id, i.creative_id);
      if (quandoPost) await avisar(`✅ Agendado: ${FORMATOS_CAL[i.formato].toLowerCase()} sai ${quandoPost.getTime() <= Date.now() + 60_000 ? "agora" : quando(quandoPost)}.\n${i.tema}`);
    } else if (Date.now() > i.data_hora.getTime() + tolerancia) {
      await falhar(i.id, `Ficou sem aprovação até passar ${cfg.toleranciaH} h do horário`, i);
    } else esperando.push(i);
  }
  // um por vez, o mais próximo do horário primeiro: assim "sim" e "não" nunca ficam ambíguos.
  // Se o envio falhou (WhatsApp fora), tenta de novo em 15 min; dá para aprovar pela tela enquanto isso.
  const proximo = esperando.find((i) => !i.aprovacao && (!i.erro || i.updated_at.getTime() < Date.now() - 15 * 60_000));
  if (proximo && !esperando.some((i) => i.aprovacao === "ENVIADO" || i.aprovacao === "MUDANCA")) await pedirAprovacao(proximo, esperando.length - 1);

  // 4. o que já foi para o Instagram acompanha o status da publicação
  await sql`update ads.calendario_itens i set status = p.status, erro = p.erro, updated_at = now()
    from ads.instagram_posts p where i.post_id = p.id and i.status = 'AGENDADO' and p.status in ('PUBLICADO', 'FALHOU')`;
}

/** Ids das mídias prontas da arte, na ordem dos slides. */
async function midiasDaArte(formato: FormatoCal, projectId: string, creativeId: string | null) {
  if (formato === "REELS") return creativeId ? [creativeId] : [];
  return (await db()<{ id: string }[]>`select id from ads.creatives where metadata->>'projectId' = ${projectId} and type = 'IMAGE' and status = 'READY'
    order by (metadata->>'ordem')::int nulls last, created_at limit ${formato === "FEED" ? 1 : LIMITES_IG.carrosselMax}`).map((x) => x.id);
}

/** Arte aprovada: vira publicação AGENDADO no horário (ou já, se o horário passou dentro da tolerância). Devolve quando sai. */
async function agendar(i: Pronto, projectId: string, creativeId: string | null): Promise<Date | null> {
  const sql = db();
  const ids = await midiasDaArte(i.formato, projectId, creativeId);
  if (!ids.length || (i.formato === "CARROSSEL" && ids.length < LIMITES_IG.carrosselMin)) { await falhar(i.id, "A arte ficou pronta sem as imagens necessárias", i); return null; }
  const [trava] = await sql`update ads.calendario_itens set status = 'AGENDADO', aprovacao = null, erro = null, updated_at = now() where id = ${i.id} and status = 'REVISAO' returning id`;
  if (!trava) return null;
  const legenda = [i.legenda, i.hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, LIMITES_IG.legenda);
  const quandoPost = new Date(Math.max(i.data_hora.getTime(), Date.now()));
  const [post] = await sql<{ id: string }[]>`
    insert into ads.instagram_posts (workspace_id, ig_account_id, brand_id, tipo, legenda, midias, status, agendado_para)
    values (${i.workspace_id}, ${i.ig_account_id}, ${i.brand_id}, ${i.formato}, ${legenda}, ${sql.json(ids.map((creativeId) => ({ creativeId })))}, 'AGENDADO', ${quandoPost})
    returning id`;
  await sql`update ads.calendario_itens set post_id = ${post!.id} where id = ${i.id}`;
  return quandoPost;
}

const MAX_VIDEO_WHATSAPP = 15 * 1024 * 1024; // o WhatsApp recusa vídeo acima de 16 MB

/** Manda a arte (imagens ou o vídeo) e o texto do post para o WhatsApp dos avisos e fica esperando o sim ou não. */
async function pedirAprovacao(i: Pronto & { project_id: string; creative_id: string | null; username: string }, naFila: number) {
  const sql = db();
  const [trava] = await sql`update ads.calendario_itens set aprovacao = 'ENVIADO', erro = null, updated_at = now() where id = ${i.id} and status = 'REVISAO' and aprovacao is null returning id`;
  if (!trava) return;
  const pasta = join(DATA_DIR, "calendario", `whatsapp-${i.id}`);
  mkdirSync(pasta, { recursive: true });
  try {
    const ids = await midiasDaArte(i.formato, i.project_id, i.creative_id);
    const midias = await sql<{ id: string; type: string; storage: string; r2_key: string; thumbnail_key: string | null; arquivado: boolean; size_bytes: number | null }[]>`
      select id, type, storage, r2_key, thumbnail_key, arquivado, size_bytes from ads.creatives where id = any(${ids}::uuid[]) and workspace_id = ${i.workspace_id}`;
    let videoGrande = false;
    for (const [n, m] of ids.map((id) => midias.find((x) => x.id === id)).filter((x) => !!x).entries()) {
      if (m.type === "VIDEO" && (m.size_bytes ?? Infinity) <= MAX_VIDEO_WHATSAPP) {
        await enviarMidia("video", await lerArquivo(m), "video/mp4");
        continue;
      }
      const key = m.type === "VIDEO" ? m.thumbnail_key : m.r2_key;
      if (!key) continue;
      videoGrande ||= m.type === "VIDEO";
      // WhatsApp só aceita PNG/JPEG: tudo vira JPEG leve
      const orig = join(pasta, `o${n}`);
      writeFileSync(orig, await lerArquivo({ storage: m.storage, r2_key: key, arquivado: m.arquivado }));
      const r = await ffmpeg(["-i", orig, "-vf", "scale='min(1080,iw)':-2", "-frames:v", "1", "-q:v", "3", join(pasta, `m${n}.jpg`)], { timeoutMs: 60_000 });
      if (r.code !== 0) throw new Error("não deu para preparar a imagem");
      await enviarMidia("image", readFileSync(join(pasta, `m${n}.jpg`)), "image/jpeg", ids.length > 1 ? `${n + 1}/${ids.length}` : "");
    }
    const tipo = i.formato === "CARROSSEL" ? `Carrossel (${ids.length} slides)` : FORMATOS_CAL[i.formato];
    await avisar([
      `📝 *Post para aprovar* · ${tipo} · @${i.username}`,
      `🗓 ${quando(i.data_hora)}`,
      videoGrande ? "_O vídeo passa do limite do WhatsApp: acima vai a capa. Ele inteiro está em Conteúdos._" : "",
      `*${i.tema}*`,
      i.legenda,
      i.hashtags.join(" "),
      `Responda *SIM* para agendar ou *NÃO* para pedir uma mudança.${naFila > 0 ? `\n(depois deste, mais ${naFila} esperando)` : ""}`,
    ].filter(Boolean).join("\n\n"), true);
  } catch (e) {
    await sql`update ads.calendario_itens set aprovacao = null, erro = ${`Não foi para o WhatsApp (${(e as Error).message.slice(0, 200)}). Aprove por aqui ou espere: tento de novo em 15 min.`}, updated_at = now()
      where id = ${i.id} and aprovacao = 'ENVIADO'`;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ\u{1F3FB}-\u{1F3FF}]/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const SIM = /^(sim|s|ss|si|ok|okay|pode|pode sim|pode postar|pode agendar|aprovo|aprova|aprovado|aprovada|manda|manda ver|bora|isso|beleza|blz|show|perfeito|top|👍|✅|👌)[\s!.]*$/u;
const NAO = /^(nao|n|no|negativo|ainda nao|👎|❌)[\s!.]*$/u;

/** "sim" / "não" / pedido de mudança ("não, muda X" vira o pedido "muda X"). */
export function lerResposta(texto: string): { tipo: "sim" | "nao" } | { tipo: "pedido"; pedido: string } {
  const t = norm(texto);
  if (SIM.test(t)) return { tipo: "sim" };
  if (NAO.test(t)) return { tipo: "nao" };
  return { tipo: "pedido", pedido: texto.replace(/^\s*n(ã|a)o(?![\p{L}\p{N}])[\s,.!:;-]*/iu, "").trim().slice(0, 500) };
}

/** Mensagem do número dos avisos: sim agenda; não pergunta o que mudar; o pedido vai para a IA refazer o post e a arte. */
export async function responderWhatsapp(texto: string) {
  const sql = db();
  const [i] = await sql<{ id: string; workspace_id: string; aprovacao: string; project_id: string | null; editado: boolean }[]>`
    select i.id, i.workspace_id, i.aprovacao, i.project_id, coalesce(p.kind = 'edit', false) as editado
    from ads.calendario_itens i left join ads.video_projects p on p.id = i.project_id
    where i.status = 'REVISAO' and i.aprovacao in ('ENVIADO', 'MUDANCA') order by i.updated_at desc limit 1`;
  if (!i) return avisar("Não tem post esperando resposta agora. Quando a próxima arte ficar pronta, eu mando aqui.");
  const r = lerResposta(texto);
  if (i.aprovacao === "ENVIADO" && r.tipo === "sim") {
    await sql`update ads.calendario_itens set aprovacao = 'APROVADA', updated_at = now() where id = ${i.id} and aprovacao = 'ENVIADO'`;
    return automatizarCalendario(); // agenda e confirma agora (e já manda o próximo)
  }
  if (i.aprovacao === "ENVIADO" && r.tipo === "nao") {
    await sql`update ads.calendario_itens set aprovacao = 'MUDANCA', updated_at = now() where id = ${i.id} and aprovacao = 'ENVIADO'`;
    return avisar("O que você quer mudar? Pode escrever do seu jeito (ex.: título mais curto, falar do app, outra chamada no fim).");
  }
  // esperando o pedido, um "sim" ou "não" solto não é pedido
  const pedido = r.tipo === "pedido" ? r.pedido : "";
  if (pedido.length < 3) return avisar(i.aprovacao === "MUDANCA" ? "Me diga o que mudar no post (ex.: título mais curto, falar do app)." : "Não entendi. Responda *SIM* para agendar ou diga o que mudar no post.");
  if (i.editado && i.project_id) {
    // vídeo enviado pelo cliente: o pedido vira ajuste da edição (o vídeo dele fica; muda legenda, animação, efeito)
    if (!(await ajustarEdicao(i.id, i.project_id, i.workspace_id, pedido))) return;
    return avisar("✍️ Certo! Estou ajustando o seu vídeo com o pedido. Quando ficar pronto, eu mando aqui de novo.");
  }
  const [ok] = await sql`update ads.calendario_itens set status = 'APROVADO', aprovacao = null, project_id = null, refazendo = 'item', erro = null, updated_at = now()
    where id = ${i.id} and status = 'REVISAO' returning id`;
  if (!ok) return;
  await enqueueJob(sql, { workspaceId: i.workspace_id, type: "AI_CALENDARIO", payload: { itemId: i.id, campo: "item", dica: pedido }, maxAttempts: 1 });
  await avisar("✍️ Certo! A IA está refazendo o post com o seu pedido. Quando a arte nova ficar pronta, eu mando aqui de novo.");
}

/** Pedido de mudança num Reels feito do vídeo do cliente: ajusta a edição e o post volta a "gerando" (depois, aprovação de novo). */
export async function ajustarEdicao(itemId: string, projectId: string, workspaceId: string, pedido: string): Promise<boolean> {
  const sql = db();
  return sql.begin(async (tx) => {
    const [ok] = await tx`update ads.calendario_itens set status = 'GERANDO', aprovacao = null, erro = null, updated_at = now() where id = ${itemId} and status = 'REVISAO' returning id`;
    if (!ok) return false;
    const [p] = await tx`update ads.video_projects set status = 'QUEUED', step_detail = 'Calendário: ajustando com o seu pedido…', error = null, updated_at = now()
      where id = ${projectId} and status in ('READY', 'FAILED') returning id`;
    if (!p) throw new Error("O vídeo ainda está sendo gerado");
    await enqueueJob(tx, { workspaceId, type: "GENERATE_VIDEO", payload: { projectId, mode: "adjust", instruction: pedido.slice(0, 2000) }, maxAttempts: 1 });
    return true;
  });
}

/** Publicação agendada que passou da tolerância (PC desligado na hora): não sai atrasada demais; vira FALHOU e avisa. */
export async function expirarAtrasados() {
  const cfg = await configCalendario();
  const velhos = await db()<{ id: string; tipo: string; agendado_para: Date }[]>`
    update ads.instagram_posts set status = 'FALHOU', erro = ${`Não saiu: passou ${cfg.toleranciaH} h do horário marcado (o PC estava desligado?). Reagende se ainda fizer sentido.`}, updated_at = now()
    where status = 'AGENDADO' and agendado_para < now() - make_interval(secs => ${cfg.toleranciaH * 3600})
    returning id, tipo, agendado_para`;
  for (const p of velhos) await avisar(`⏰ ${(FORMATOS_CAL as Record<string, string>)[p.tipo] ?? "Story"} de ${quando(p.agendado_para)} não saiu: passou ${cfg.toleranciaH} h do horário.\nReagende em Instagram → Planejados.`);
}
