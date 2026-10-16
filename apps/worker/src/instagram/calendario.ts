import {
  brandSchema, briefImagemSchema, briefSchema, configCalendario, db, enqueueJob, FORMATOS_CAL, hashtagsSchema, instagramDaConexao, itemCalSchema,
  LIMITES_IG, roteiroSchema, type Brand, type ConfigCal, type CampoRefazer, type FormatoCal, type Json, type Roteiro,
} from "@domus-ads/core";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bloco, perguntarIA } from "../ai/ask";
import { DATA_DIR } from "../env";
import { lerPagina } from "../video/contexto";
import { avisar } from "../whatsapp";
import { limparHashtags } from "./legenda";

/**
 * Calendário de conteúdo. A IA planeja o período numa chamada só (plano) e depois refaz só o que o usuário pedir
 * (um post ou um campo), com o mínimo de contexto, para gastar poucos tokens. A automação (automatizarCalendario)
 * gera a arte perto da hora, agenda a publicação e avisa no WhatsApp.
 */
export type CalendarioPayload = { calendarioId: string } | { itemId: string; campo: CampoRefazer; dica?: string };

const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const ROTEIROS = `Roteiro por formato (campo "roteiro"):
- FEED (1 imagem 4:5): {"headline": texto grande da arte, até 60 caracteres, "apoio": até 140, "cta": até 40, "visual": composição da arte, até 300}
- CARROSSEL (slides 4:5): {"slides": [{"headline": até 70, "apoio": até 160, "visual": até 250}] com 4 a 8 slides (1º = gancho, último = chamada), "cta": até 40}
- REELS (vídeo 9:16 narrado): {"narracao": o texto falado, 35–45 palavras para 15 s ou 70–85 para 30 s, com gancho nos 2 primeiros segundos, "duracao": 15 ou 30, "visual": até 300, "cta": até 40}`;

const REGRAS = `- Legenda: gancho forte na 1ª linha, parágrafos curtos, chamada para ação no fim, SEM hashtags dentro. Reels: legenda mais curta.
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
${REGRAS}`;

const SISTEMA_AJUSTE = `Você é social media sênior no Brasil e ajusta UM post de um calendário de Instagram já planejado.
Responda APENAS com um bloco \`\`\`json no formato pedido.

${ROTEIROS}

${REGRAS}`;

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
      `Refaça ${p.campo === "item" ? "o post inteiro com outra ideia" : `só o campo "${p.campo}", coerente com o resto do post`}. Responda: ${formato}`,
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

// ───────────── Automação: gerar perto da hora, agendar, acompanhar ─────────────

interface Pronto { id: string; workspace_id: string; ig_account_id: string; brand_id: string | null; data_hora: Date; formato: FormatoCal; tema: string; objetivo: string; roteiro: Roteiro; legenda: string; hashtags: string[]; marca: string | null; ws_nome: string }

/** Cria o projeto do Studio já com o conteúdo aprovado (sem revisão) e põe na fila. */
async function iniciar(i: Pronto, cfg: ConfigCal) {
  const sql = db();
  const r = roteiroSchema.parse(i.roteiro);
  const produto = (i.marca ?? i.ws_nome).slice(0, 120).padEnd(2, ".");
  const objetivo = (i.objetivo || i.tema).slice(0, 300);
  let projeto: { id: string } | undefined;
  if (i.formato === "REELS") {
    const brief = briefSchema.parse({
      produto, objetivo, duracao: r.duracao, formato: "9:16", cta: r.cta, identidade: "workspace", estiloVisual: cfg.estiloVideo, voz: cfg.voz, musica: "auto",
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
  await avisar(`🎨 Gerando ${FORMATOS_CAL[i.formato].toLowerCase()} de ${quando(i.data_hora)}\n${i.tema}\nPublica sozinho no horário.`);
}

async function falhar(id: string, motivo: string, i: { formato: FormatoCal; data_hora: Date; tema: string }) {
  await db()`update ads.calendario_itens set status = 'FALHOU', erro = ${motivo.slice(0, 1000)}, updated_at = now() where id = ${id}`;
  await avisar(`❌ ${FORMATOS_CAL[i.formato]} de ${quando(i.data_hora)} não vai sair\n${i.tema}\nMotivo: ${motivo.slice(0, 300)}\nVeja em Instagram → Calendário.`);
}

/** Passada de 1 em 1 minuto: começa a geração na antecedência certa, agenda o que ficou pronto e marca atrasos. */
export async function automatizarCalendario() {
  const sql = db();
  const cfg = await configCalendario();
  const tolerancia = cfg.toleranciaH * 3_600_000;
  const maxAnt = Math.max(...Object.values(cfg.antecedencia)) * 60_000;

  // 1. aprovados chegando na hora: gera (ou desiste, se o horário passou da tolerância com o PC desligado)
  const aprovados = await sql<Pronto[]>`
    select i.id, i.workspace_id, k.ig_account_id, k.brand_id, i.data_hora, i.formato, i.tema, i.objetivo, i.roteiro, i.legenda, i.hashtags, b.nome as marca, w.name as ws_nome
    from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id join ads.workspaces w on w.id = i.workspace_id
    left join ads.brands b on b.id = k.brand_id
    where i.status = 'APROVADO' and i.data_hora <= now() + make_interval(secs => ${maxAnt / 1000})`;
  for (const i of aprovados) {
    const t = i.data_hora.getTime();
    if (Date.now() > t + tolerancia) { await falhar(i.id, `Passou ${cfg.toleranciaH} h do horário sem gerar (o PC estava desligado?)`, i); continue; }
    if (Date.now() < t - cfg.antecedencia[i.formato] * 60_000) continue;
    // trava: só um passe pega o item
    const [ok] = await sql`update ads.calendario_itens set status = 'GERANDO', updated_at = now() where id = ${i.id} and status = 'APROVADO' returning id`;
    if (!ok) continue;
    try { await iniciar(i, cfg); } catch (e) { await falhar(i.id, `Não deu para começar a geração: ${(e as Error).message}`, i); }
  }

  // 2. em geração: vídeo parou na revisão do roteiro → aprova sozinho; pronto → agenda; falhou → avisa
  const gerando = await sql<(Pronto & { project_id: string; p_status: string | null; p_kind: string; p_erro: string | null; creative_id: string | null; ocupado: boolean })[]>`
    select i.id, i.workspace_id, k.ig_account_id, k.brand_id, i.data_hora, i.formato, i.tema, i.legenda, i.hashtags, i.project_id,
      p.status as p_status, p.kind as p_kind, p.error as p_erro, p.creative_id,
      exists (select 1 from ads.jobs j where j.type in ('GENERATE_VIDEO','GENERATE_IMAGE') and j.status in ('PENDING','RUNNING') and j.payload->>'projectId' = p.id::text) as ocupado
    from ads.calendario_itens i join ads.calendarios k on k.id = i.calendario_id left join ads.video_projects p on p.id = i.project_id
    where i.status = 'GERANDO' and i.project_id is not null`;
  for (const i of gerando) {
    if (i.ocupado) continue;
    if (i.p_status === "REVIEW" && i.p_kind === "video") {
      const [ok] = await sql`update ads.video_projects set status = 'QUEUED', step_detail = 'Calendário: roteiro aprovado, gerando o vídeo…', updated_at = now() where id = ${i.project_id} and status = 'REVIEW' returning id`;
      if (ok) await enqueueJob(sql, { workspaceId: i.workspace_id, type: "GENERATE_VIDEO", payload: { projectId: i.project_id, mode: "rerender" }, maxAttempts: 1 });
    } else if (i.p_status === "FAILED" || !i.p_status) {
      await falhar(i.id, i.p_erro ?? "A geração da arte falhou", i);
    } else if (i.p_status === "READY") {
      await agendar(i, i.project_id, i.creative_id);
    }
  }

  // 3. o que já foi para o Instagram acompanha o status da publicação
  await sql`update ads.calendario_itens i set status = p.status, erro = p.erro, updated_at = now()
    from ads.instagram_posts p where i.post_id = p.id and i.status = 'AGENDADO' and p.status in ('PUBLICADO', 'FALHOU')`;
}

/** Arte pronta: vira publicação AGENDADO no horário (ou já, se a geração atrasou dentro da tolerância). */
async function agendar(i: Pronto, projectId: string, creativeId: string | null) {
  const sql = db();
  const ids = i.formato === "REELS" ? (creativeId ? [creativeId] : [])
    : (await sql<{ id: string }[]>`select id from ads.creatives where metadata->>'projectId' = ${projectId} and type = 'IMAGE' and status = 'READY'
        order by (metadata->>'ordem')::int nulls last, created_at limit ${i.formato === "FEED" ? 1 : LIMITES_IG.carrosselMax}`).map((x) => x.id);
  if (!ids.length || (i.formato === "CARROSSEL" && ids.length < LIMITES_IG.carrosselMin)) return falhar(i.id, "A arte ficou pronta sem as imagens necessárias", i);
  const legenda = [i.legenda, i.hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, LIMITES_IG.legenda);
  const quandoPost = new Date(Math.max(i.data_hora.getTime(), Date.now()));
  const [post] = await sql<{ id: string }[]>`
    insert into ads.instagram_posts (workspace_id, ig_account_id, brand_id, tipo, legenda, midias, status, agendado_para)
    values (${i.workspace_id}, ${i.ig_account_id}, ${i.brand_id}, ${i.formato}, ${legenda}, ${sql.json(ids.map((creativeId) => ({ creativeId })))}, 'AGENDADO', ${quandoPost})
    returning id`;
  await sql`update ads.calendario_itens set status = 'AGENDADO', post_id = ${post!.id}, erro = null, updated_at = now() where id = ${i.id} and status = 'GERANDO'`;
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
