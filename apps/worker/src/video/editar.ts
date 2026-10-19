import {
  aplicarCorrecoes, baixarArquivo, briefEdicaoSchema, cortarPausas, db, duracaoEditada, ENTRADAS, EFEITOS_VIDEO, ESTILOS_LEGENDA, FORMATOS, MAX_FONTE_S, MUSICA_TAGS,
  overlaySchema, paraEditado, paraOriginal, planoEdicaoSchema, REDES, SFX_CATEGORIAS, TIPOS_OVERLAY, zonasPara, type BriefEdicao, type Json, type Palavra, type PlanoEdicao,
} from "@domus-ads/core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { bloco, perguntarIA } from "../ai/ask";
import { contextoCriativo, type ContextoCriativo } from "./contexto";
import { EDICAO_JS } from "./kit/edicao-runtime";
import { montarEdicao } from "./kit/edicao";
import { gerarTrilha } from "./music";
import { lint, mixar, salvarVideo, type Ctx, type VideoPayload } from "./pipeline";
import { revisarComposicao } from "./qa";
import { arquivoMusica, arquivoSfx } from "./sfx";
import { ffmpeg, FFPROBE, hyperframes, rodar } from "./tools";
import { analisar, type Analise } from "./whisper";

/**
 * EDITAR MEU VÍDEO, no PC do worker (pasta .worker-data/videos/<id>):
 * full: baixa o vídeo → transcreve (Whisper local) e acha rostos → corta as pausas → a IA corrige a transcrição e planeja
 *       as animações → REVIEW (o usuário confere legenda e animações).
 * render/rerender: plano aprovado → vídeo cortado e enquadrado (ffmpeg) → composição (vídeo + animações + legenda) → render → mix.
 * adjust: pedido em texto ("zoom quando falo X", "som de whoosh no título", "corta as pausas menores") → a IA mexe só no plano
 *       (sem transcrever de novo) → render.
 */
type Etapa = "SCRIPTING" | "COMPOSING" | "RENDERING" | "MIXING" | "UPLOADING";
const PROGRESSO: Record<Etapa, number> = { SCRIPTING: 8, COMPOSING: 35, RENDERING: 45, MIXING: 88, UPLOADING: 94 };

export async function runEdicao(payload: VideoPayload, c: Ctx) {
  const sql = db();
  const [p] = await sql<{ id: string; workspace_id: string; title: string; brief: unknown; storyboard: unknown; creative_id: string | null }[]>`
    select id, workspace_id, title, brief, storyboard, creative_id from ads.video_projects where id = ${payload.projectId} and kind = 'edit'`;
  if (!p) throw new Error("Projeto de edição não encontrado");
  const brief = briefEdicaoSchema.parse(p.brief);
  const [w, h] = FORMATOS[brief.formato];
  const pasta = join(DATA_DIR, "videos", p.id);
  mkdirSync(join(pasta, "assets"), { recursive: true });
  const etapa = async (e: Etapa, detalhe: string) => {
    await sql`update ads.video_projects set status = ${e}, step_detail = ${detalhe}, error = null, updated_at = now() where id = ${p.id}`;
    await c.progress(PROGRESSO[e]);
    await c.log(detalhe);
  };
  const modo = payload.mode ?? "full";

  try {
    await etapa("SCRIPTING", modo === "full" ? "Baixando o seu vídeo…" : "Preparando…");
    const ctx = await contextoCriativo(p.id, p.workspace_id, pasta, c.log);
    const fonte = await prepararFonte(p.workspace_id, brief, pasta, c);
    const ia = (sistema: string, prompt: string, imagens: string[]) => perguntarIA({ workspaceId: p.workspace_id, projetoId: p.id, sistema, prompt, cwd: pasta, signal: c.signal, log: c.log, imagens });

    let plano: PlanoEdicao;
    if (modo === "full" || !p.storyboard) {
      await etapa("SCRIPTING", fonte.audio ? "Transcrevendo a fala (Whisper na GPU) e achando o rosto…" : "Analisando o vídeo (sem áudio)…");
      const an = await analiseDe(fonte, pasta, brief, ctx, c);
      const pausa = brief.cortarPausas && an.palavras.length ? 0.45 : null;
      const cortado = pausa ? cortarPausas(an.palavras, fonte.dur, { pausa }) : { cortes: [{ de: 0, ate: +fonte.dur.toFixed(3) }], palavras: an.palavras.map(({ w, s, e }) => ({ w, s, e })) };
      const dur = duracaoEditada(cortado.cortes);
      await c.log(`${an.palavras.length} palavras transcritas${pausa ? ` · pausas cortadas: ${fonte.dur.toFixed(1)} s → ${dur.toFixed(1)} s` : ""}`);
      const quadros = await quadrosDoVideo(fonte.arquivo, pasta, fonte.dur);

      await etapa("SCRIPTING", "Revisando a transcrição e planejando as animações…");
      const pedido = promptPlano(brief, cortado.palavras, dur, ctx.texto);
      let r = await ia(SISTEMA_PLANO, pedido, [...quadros, ...ctx.imagens].slice(0, 12));
      let bruto: RespostaPlano;
      try { bruto = lerJson(bloco(r.text, "json")); } catch (e) {
        r = await ia(SISTEMA_PLANO, `${pedido}\n\nSua resposta anterior não era um JSON válido (${(e as Error).message}). Responda de novo, só o bloco json.`, quadros);
        bruto = lerJson(bloco(r.text, "json"));
      }
      const palavras = aplicarCorrecoes(cortado.palavras, (bruto.correcoes ?? []).filter((x) => typeof x?.i === "number" && typeof x?.w === "string"));
      const tag = brief.musica === "auto" ? (MUSICA_TAGS as readonly string[]).includes(bruto.music?.tag ?? "") ? bruto.music!.tag : "corporate" : brief.musica;
      plano = planoEdicaoSchema.parse({
        title: (typeof bruto.title === "string" && bruto.title.trim() ? bruto.title.trim() : brief.produto).slice(0, 120),
        duration: dur, cortes: cortado.cortes, pausa, palavras: palavras.filter((x) => x.e > x.s || x.w),
        rostos: an.rostos.map((x) => ({ ...x, t: paraEditado(cortado.cortes, x.t) })).slice(0, 800),
        overlays: brief.animacoes ? validos(bruto.overlays, dur) : [],
        music: tag === "none" ? null : { tag, volume: 0.12 },
      });
      await sql`update ads.video_projects set storyboard = ${sql.json(plano as unknown as Json)}, title = ${plano.title}, status = 'REVIEW',
        step_detail = 'Legenda e animações prontas: revise e aprove para gerar o vídeo', error = null, updated_at = now() where id = ${p.id}`;
      await c.progress(100);
      return { revisao: true, palavras: plano.palavras.length, animacoes: plano.overlays.length };
    }

    plano = planoEdicaoSchema.parse(p.storyboard);
    if (modo === "adjust") {
      await etapa("SCRIPTING", "Aplicando o pedido…");
      const pedido = promptAjusteEdicao(plano, payload.instruction ?? "", brief);
      const r = await ia(SISTEMA_AJUSTE, pedido, (await quadrosDoVideo(fonte.arquivo, pasta, fonte.dur)).slice(0, 4));
      plano = await aplicarAjuste(plano, lerJson(bloco(r.text, "json")), fonte, pasta, brief, ctx, c);
      await sql`update ads.video_projects set storyboard = ${sql.json(plano as unknown as Json)}, updated_at = now() where id = ${p.id}`;
    }

    // ── Render ──
    await etapa("COMPOSING", plano.cortes.length > 1 ? "Cortando as pausas e enquadrando o vídeo…" : "Enquadrando o vídeo…");
    await prepararBase(fonte, plano.cortes, w, h, pasta, c.signal);
    writeFileSync(join(pasta, "assets", "edicao.js"), EDICAO_JS, "utf8");
    await etapa("COMPOSING", "Montando a legenda e as animações…");
    const logo = readdirSync(join(pasta, "assets")).find((a) => a.startsWith("logo."));
    const html = montarEdicao({ plano, brief, brand: ctx.brand, w, h, logo: logo ? `assets/${logo}` : null, video: "assets/base.mp4" });
    const erros = await lint(pasta, html);
    if (erros.length) throw new Error(`A composição da edição tem erros: ${erros.slice(0, 3).join("; ")}`);
    await c.log("Conferindo legenda e animações quadro a quadro (fora das áreas da interface, sem sobrepor)…");
    const avisos = await revisarComposicao(pasta, { w, h, total: plano.duration, zonas: zonasPara(brief.rede, brief.formato) })
      .catch(async (e: Error) => { await c.log(`QA indisponível: ${e.message}`); return [] as string[]; });
    if (avisos.length) await c.log(`QA: ${avisos.join(" | ")}`);
    await sql`update ads.video_projects set composition = ${html}, updated_at = now() where id = ${p.id}`;

    await etapa("RENDERING", `Renderizando ${plano.duration.toFixed(0)} s de vídeo…`);
    const mudo = join(pasta, "render.mp4");
    const r = await hyperframes(["render", pasta, "-o", mudo, "-q", "standard", "-f", "30", "--quiet"], { cwd: pasta, timeoutMs: 3_600_000, signal: c.signal });
    if (r.code !== 0 || !existsSync(mudo)) throw new Error(`Falha no render: ${(r.err || r.out).trim().split("\n").filter(Boolean).at(-1) ?? r.code}`);

    await etapa("MIXING", "Mixando o áudio original com efeitos e música…");
    const sfx = await Promise.all(plano.sfx.map(async (e, i) => ({ ...e, file: await arquivoSfx(p.workspace_id, e.effect, i, pasta) })));
    let musica: { file: string; volume: number; nome: string } | null = null;
    if (plano.music) {
      const lib = await arquivoMusica(p.workspace_id, plano.music.tag, pasta);
      const tr = lib ? null : gerarTrilha(plano.music.tag, plano.duration, join(pasta, "trilha.wav"), p.id.charCodeAt(0) + p.id.charCodeAt(1));
      musica = lib ? { file: lib.file, volume: plano.music.volume, nome: lib.name } : { file: tr!.file, volume: plano.music.volume, nome: `Trilha original (${plano.music.tag})` };
    }
    const final = join(pasta, "final.mp4");
    await mixar({ video: mudo, saida: final, duracao: plano.duration, vozes: fonte.audio ? [{ file: join(pasta, "assets", "base.mp4"), start: 0 }] : [], sfx, musica, signal: c.signal });

    await etapa("UPLOADING", "Enviando para o armazenamento…");
    const res = await salvarVideo({ p, pasta, final, titulo: plano.title, w, h, thumbEm: Math.min(plano.duration - 0.1, 1.2),
      meta: { projectId: p.id, edicao: true, brief, music: musica?.nome ?? null, avisos: avisos.slice(0, 3) } });
    await c.progress(100);
    return res;
  } catch (e) {
    await sql`update ads.video_projects set status = 'FAILED', error = ${(e as Error).message.slice(0, 1000)}, updated_at = now() where id = ${p.id}`;
    throw e;
  }
}

// ───────────── Vídeo de origem ─────────────

interface Fonte { arquivo: string; dur: number; audio: boolean; largura: number; altura: number }

/** Baixa o vídeo enviado (uma vez por projeto) e mede: duração, áudio, tamanho já com a rotação do celular. */
async function prepararFonte(workspaceId: string, brief: BriefEdicao, pasta: string, c: Ctx): Promise<Fonte> {
  const [v] = await db()<{ storage: string; r2_key: string; arquivado: boolean; mime: string | null }[]>`
    select storage, r2_key, arquivado, mime from ads.creatives where id = ${brief.videoId} and workspace_id = ${workspaceId} and type = 'VIDEO' and status = 'READY' and r2_key is not null`;
  if (!v) throw new Error("O vídeo enviado não existe mais. Envie de novo.");
  const arquivo = join(pasta, `fonte.${v.mime === "video/quicktime" ? "mov" : v.mime === "video/webm" ? "webm" : "mp4"}`);
  if (!existsSync(arquivo)) {
    await baixarArquivo(v, `${arquivo}.parcial`);
    renameSync(`${arquivo}.parcial`, arquivo); // só vira "fonte" quando chegou inteiro
  }
  const r = await rodar(FFPROBE, ["-v", "error", "-show_streams", "-show_format", "-of", "json", arquivo]);
  const j = JSON.parse(r.out || "{}") as { streams?: { codec_type: string; width?: number; height?: number; side_data_list?: { rotation?: number }[] }[]; format?: { duration?: string } };
  const vid = j.streams?.find((s) => s.codec_type === "video");
  const dur = Number(j.format?.duration);
  if (!vid?.width || !Number.isFinite(dur)) throw new Error("Não consegui ler o vídeo enviado (arquivo corrompido ou formato sem suporte)");
  if (dur > MAX_FONTE_S + 1) throw new Error(`O vídeo tem ${Math.round(dur)} s: o limite é ${MAX_FONTE_S / 60} minutos`);
  const deitado = Math.abs(vid.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0) % 180 === 90;
  await c.log(`vídeo: ${dur.toFixed(1)} s, ${vid.width}×${vid.height}${deitado ? " (girado)" : ""}`);
  return { arquivo, dur, audio: !!j.streams?.some((s) => s.codec_type === "audio"), largura: deitado ? vid.height! : vid.width, altura: deitado ? vid.width : vid.height! };
}

/** Transcrição + rostos do vídeo original (guardada na pasta: ajuste de pausa não transcreve de novo). */
async function analiseDe(f: Fonte, pasta: string, brief: BriefEdicao, ctx: ContextoCriativo, c: Ctx): Promise<Analise> {
  const cache = join(pasta, "analise.json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as Analise;
  let audio: string | null = null;
  if (f.audio) {
    audio = join(pasta, "audio16k.wav");
    const r = await ffmpeg(["-i", f.arquivo, "-vn", "-ac", "1", "-ar", "16000", audio], { timeoutMs: 600_000, signal: c.signal });
    if (r.code !== 0) throw new Error(`Falha ao extrair o áudio: ${r.err.slice(0, 200)}`);
  }
  const glossario = [brief.produto, ctx.marca, ...brief.orientacao.match(/\b[A-ZÀ-Ú][\wÀ-ú]+(?:\s[A-ZÀ-Ú][\wÀ-ú]+)*/g) ?? []].filter(Boolean).join(", ");
  const a = await analisar({ pasta, audio, video: f.arquivo, glossario, signal: c.signal, log: c.log });
  if (a.dispositivo) await c.log(`transcrição: ${a.dispositivo === "cuda" ? "GPU" : "CPU"} · ${a.rostos.length} detecções de rosto`);
  if (audio) rmSync(audio, { force: true });
  return a;
}

/** Alguns quadros (pequenos) para a IA ver o vídeo: quem fala, cenário, onde há espaço. */
async function quadrosDoVideo(arquivo: string, pasta: string, dur: number): Promise<string[]> {
  const out: string[] = [];
  for (const [i, f] of [0.08, 0.35, 0.62, 0.9].entries()) {
    const rel = `assets/quadro-${i + 1}.jpg`;
    if (!existsSync(join(pasta, rel))) await ffmpeg(["-ss", (dur * f).toFixed(2), "-i", arquivo, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", join(pasta, rel)], { timeoutMs: 60_000 });
    if (existsSync(join(pasta, rel))) out.push(rel);
  }
  return out;
}

/**
 * Vídeo-base da composição: só os trechos mantidos (emendas com 10 ms de fade no áudio, sem estalo), 30 fps, no formato
 * de saída. Mesma proporção: preenche (corta as bordas). Proporção diferente: o vídeo inteiro sobre ele mesmo desfocado.
 * Reaproveitado enquanto cortes e formato não mudam.
 */
async function prepararBase(f: Fonte, cortes: { de: number; ate: number }[], w: number, h: number, pasta: string, signal: AbortSignal) {
  const destino = join(pasta, "assets", "base.mp4"), marca = join(pasta, "base.chave");
  const chave = createHash("sha1").update(JSON.stringify({ cortes, w, h, f: f.arquivo })).digest("hex");
  if (existsSync(destino) && existsSync(marca) && readFileSync(marca, "utf8") === chave) return;
  const a = f.audio;
  const linhas = cortes.map((c, i) => {
    const d = (c.ate - c.de).toFixed(3);
    return `[0:v]trim=start=${c.de}:end=${c.ate},setpts=PTS-STARTPTS[v${i}];` + (a ? `[0:a]atrim=start=${c.de}:end=${c.ate},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, +d - 0.01).toFixed(3)}:d=0.01[a${i}];` : "");
  });
  const mesma = Math.abs(f.largura / f.altura - w / h) / (w / h) < 0.15;
  const enquadra = mesma
    ? `[vc]fps=30,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p[vo]`
    : `[vc]fps=30,split=2[f1][f2];[f1]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40:2,eq=brightness=-0.08[fundo];[f2]scale=${w}:${h}:force_original_aspect_ratio=decrease[frente];[fundo][frente]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[vo]`;
  const script = `${linhas.join("\n")}\n${cortes.map((_, i) => `[v${i}]${a ? `[a${i}]` : ""}`).join("")}concat=n=${cortes.length}:v=1:a=${a ? 1 : 0}[vc]${a ? "[ac]" : ""};\n${enquadra}${a ? ";\n[ac]aresample=48000[ao]" : ""}`;
  const arqScript = join(pasta, "cortes.ffscript");
  writeFileSync(arqScript, script, "utf8"); // por arquivo: centenas de cortes não cabem na linha de comando do Windows
  const r = await ffmpeg(["-i", f.arquivo, "-filter_complex_script", arqScript, "-map", "[vo]", ...(a ? ["-map", "[ao]", "-c:a", "aac", "-b:a", "192k"] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-r", "30", "-movflags", "+faststart", destino], { timeoutMs: 1_800_000, signal });
  if (r.code !== 0) throw new Error(`Falha ao cortar/enquadrar o vídeo: ${r.err.trim().split("\n").at(-1)?.slice(0, 300)}`);
  writeFileSync(marca, chave, "utf8");
}

// ───────────── IA: plano e ajuste ─────────────

interface RespostaPlano {
  title?: string; correcoes?: { i: number; w: string }[]; overlays?: unknown[]; music?: { tag?: string } | null;
  zooms?: unknown[]; efeitos?: unknown[]; sfx?: unknown[]; pausa?: number | null;
}

function lerJson(t: string): RespostaPlano {
  const j = JSON.parse(t) as unknown;
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("esperava um objeto JSON");
  return j as RespostaPlano;
}

/** Só as animações válidas, dentro do vídeo e sem duas ao mesmo tempo na mesma posição. */
function validos(lista: unknown[] | undefined, dur: number): PlanoEdicao["overlays"] {
  const ok: PlanoEdicao["overlays"] = [];
  for (const x of lista ?? []) {
    const r = overlaySchema.safeParse(x);
    if (!r.success) continue;
    const o = { ...r.data, start: Math.max(0, r.data.start), end: Math.min(dur, r.data.end) };
    if (o.end - o.start < 0.8) continue;
    if (ok.some((y) => y.posicao === o.posicao && y.start < o.end && o.start < y.end)) continue;
    ok.push(o);
  }
  return ok.slice(0, 40);
}

const transcricao = (ps: Palavra[]) => ps.map((p, i) => `${i}|${p.s.toFixed(2)}|${p.w}`).join("\n");

const SISTEMA_PLANO = `Você é editor de vídeo sênior de Reels/TikTok/Shorts em português do Brasil. Recebe a TRANSCRIÇÃO automática
(Whisper) de um vídeo enviado pelo cliente, já com as pausas cortadas, e quadros do vídeo. Você faz duas coisas:

1. REVISA A TRANSCRIÇÃO (vira a legenda): corrige só erros claros de reconhecimento, grafia, acentos, nomes próprios e
   termos da marca (use o glossário/contexto), maiúsculas e pontuação (ponto, vírgula, interrogação no fim da palavra
   ajudam a quebrar a legenda). NÃO reescreva o que a pessoa disse, não resuma, não troque palavras certas e NUNCA acrescente
   palavra que não foi falada (a legenda é exatamente a fala).
   Cada correção é {"i": índice, "w": "texto novo"}; "w" pode ter 2 palavras (ex.: "AdPilot" → "Ad Pilot") ou "" para
   apagar palavra que o Whisper inventou/duplicou.

2. PLANEJA AS ANIMAÇÕES por cima do vídeo (estilo profissional, com cara de 3D), ligadas ao que está sendo falado:
   - tipos: ${TIPOS_OVERLAY.join(", ")}.
     titulo = frase-chave curta (até 6 palavras, "sub" opcional como chamada pequena acima) ·
     destaque = termo/benefício em pílula (até 4 palavras) · lista = "texto" é o título e "itens" até 4 itens curtos ·
     numero = só números DITOS no vídeo: {"numero": {"valor": 30, "prefixo": "", "sufixo": "%"}} com "texto" de rótulo ·
     cta = chamada final (botão com o texto; "sub" opcional) · nome = nome e cargo de quem fala (só se for dito ou estiver nas orientações) ·
     emoji = um emoji grande que reforça a emoção do momento (no máximo 2 no vídeo).
   - "entrada" (3D): ${ENTRADAS.join(", ")}. Varie.
   - "posicao": topo ou centro. Use "base" só quando NINGUÉM fala naquele trecho (a legenda fica embaixo).
   - Ritmo: uma animação a cada 6–12 s, cada uma com 1,8–4 s, começando no instante em que a palavra é dita (use o tempo
     da transcrição). Nunca duas ao mesmo tempo. O texto da animação reforça a fala, não repete a frase inteira.
   - Vídeo sem fala: guie-se pelas orientações e pelos quadros (o que aparece na tela).
   - Só fatos do vídeo, das orientações e do contexto. Não invente preço, número ou promessa.

Responda APENAS com um bloco \`\`\`json:
{"title": "nome curto do vídeo", "correcoes": [{"i": 0, "w": "Olá,"}],
 "overlays": [{"tipo": "titulo", "start": 1.2, "end": 4, "texto": "…", "sub": "", "entrada": "flip", "posicao": "topo"}],
 "music": {"tag": "uma de ${MUSICA_TAGS.join("|")}"}}`;

function promptPlano(b: BriefEdicao, palavras: Palavra[], dur: number, contexto: string): string {
  return `${contexto ? `${contexto}\n\n` : ""}<pedido>
Título/assunto: ${b.produto}
Orientações do cliente: ${b.orientacao || "(nenhuma)"}
Duração (já sem as pausas): ${dur.toFixed(1)} s
Animações automáticas: ${b.animacoes ? "sim" : "não (devolva overlays: [])"}
Música: ${b.musica === "auto" ? "escolha a tag que combina" : b.musica}
</pedido>

<transcricao formato="índice|início em s|palavra">
${palavras.length ? transcricao(palavras) : "(sem fala)"}
</transcricao>

Os quadros do vídeo estão em assets/quadro-*.jpg: abra e olhe antes de planejar.`;
}

const SISTEMA_AJUSTE = `Você é editor de vídeo sênior. O vídeo do cliente já foi editado (legenda + animações) e ele pediu um ajuste
específico. Mude SÓ o que foi pedido; mantenha todo o resto exatamente igual.

Você pode devolver qualquer destas chaves (as que não vierem ficam como estão):
- "overlays": lista COMPLETA das animações (tipos ${TIPOS_OVERLAY.join(", ")}; entradas 3D ${ENTRADAS.join(", ")}; posicao topo|centro|base).
- "zooms": lista COMPLETA de zooms no vídeo: {"start", "end", "escala" 1.05–1.6, "x" e "y" de 0 a 1 = ponto em foco (rosto: x≈0.5, y≈0.35)}.
  Zoom curto (0,6–1,2 s) = soco de ênfase; longo = aproximação lenta. Nunca dois zooms ao mesmo tempo.
- "efeitos": lista COMPLETA de efeitos no vídeo: {"tipo": ${EFEITOS_VIDEO.join("|")}, "start", "end"}.
  inclinar = o vídeo gira em 3D e vira um cartão flutuando · flash = clarão branco · tremor = chacoalhar · pb = preto e branco ·
  vinheta = escurece as bordas · desfoque = vídeo desfocado (bom com animação no centro).
- "sfx": lista COMPLETA de efeitos sonoros {"time", "effect": ${SFX_CATEGORIAS.join("|")}, "volume" 0–1}.
- "music": {"tag": ${MUSICA_TAGS.join("|")}, "volume": 0.05–0.3} ou null (sem música).
- "pausa": pausa máxima mantida em s (0.2–2; menor = cortes mais secos) ou null para não cortar pausas.
- "correcoes": [{"i", "w"}] na transcrição, se o pedido for sobre a legenda.
Tempos em segundos do vídeo editado (use a transcrição para achar quando cada palavra é dita).
Responda APENAS com um bloco \`\`\`json com as chaves alteradas.`;

function promptAjusteEdicao(p: PlanoEdicao, pedido: string, b: BriefEdicao): string {
  const { palavras, rostos: _r, cortes: _c, ...resto } = p;
  return `<pedido>\n${pedido}\n</pedido>

<estado_atual>
${JSON.stringify(resto, null, 1)}
</estado_atual>

<legenda estilo="${ESTILOS_LEGENDA[b.estiloLegenda].nome}" rede="${REDES[b.rede]}" />

<transcricao formato="índice|início em s|palavra">
${palavras.length ? transcricao(palavras) : "(sem fala)"}
</transcricao>`;
}

/** Aplica o que a IA devolveu; mudança de pausa recorta do original e leva todos os tempos junto. */
async function aplicarAjuste(p: PlanoEdicao, r: RespostaPlano, fonte: Fonte, pasta: string, brief: BriefEdicao, ctx: ContextoCriativo, c: Ctx): Promise<PlanoEdicao> {
  let novo: PlanoEdicao = { ...p };
  if (Array.isArray(r.correcoes)) novo.palavras = aplicarCorrecoes(novo.palavras, r.correcoes.filter((x) => typeof x?.i === "number" && typeof x?.w === "string"));
  if (Array.isArray(r.overlays)) novo.overlays = validos(r.overlays, p.duration);
  const lista = <K extends "zooms" | "efeitos" | "sfx">(k: K): PlanoEdicao[K] => {
    const v = planoEdicaoSchema.shape[k].safeParse(r[k]);
    if (!v.success) return p[k];
    return (v.data as { start?: number; end?: number; time?: number }[]).filter((x) => (x.time ?? x.end ?? 0) <= p.duration + 0.01 && (x.end == null || x.end > (x.start ?? 0))) as PlanoEdicao[K];
  };
  if (r.zooms !== undefined) novo.zooms = lista("zooms");
  if (r.efeitos !== undefined) novo.efeitos = lista("efeitos");
  if (r.sfx !== undefined) novo.sfx = lista("sfx");
  if (r.music !== undefined) {
    const m = planoEdicaoSchema.shape.music.safeParse(r.music);
    if (m.success) novo.music = m.data;
  }
  if (r.pausa !== undefined && r.pausa !== p.pausa && (r.pausa === null || (typeof r.pausa === "number" && r.pausa >= 0.2 && r.pausa <= 2))) {
    const an = await analiseDe(fonte, pasta, brief, ctx, c);
    const cortes = r.pausa && an.palavras.length ? cortarPausas(an.palavras, fonte.dur, { pausa: r.pausa }).cortes : [{ de: 0, ate: +fonte.dur.toFixed(3) }];
    const mover = (t: number) => paraEditado(cortes, paraOriginal(p.cortes, t));
    novo = {
      ...novo, cortes, pausa: r.pausa, duration: duracaoEditada(cortes),
      palavras: novo.palavras.map((x) => ({ ...x, s: mover(x.s), e: mover(x.e) })),
      rostos: novo.rostos.map((x) => ({ ...x, t: mover(x.t) })),
      overlays: novo.overlays.map((x) => ({ ...x, start: mover(x.start), end: mover(x.end) })).filter((x) => x.end - x.start >= 0.5),
      zooms: novo.zooms.map((x) => ({ ...x, start: mover(x.start), end: mover(x.end) })).filter((x) => x.end > x.start),
      efeitos: novo.efeitos.map((x) => ({ ...x, start: mover(x.start), end: mover(x.end) })).filter((x) => x.end > x.start),
      sfx: novo.sfx.map((x) => ({ ...x, time: mover(x.time) })),
    };
    await c.log(`pausas recortadas: ${novo.duration.toFixed(1)} s`);
  }
  return planoEdicaoSchema.parse(novo);
}
