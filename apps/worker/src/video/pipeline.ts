import { apagarArquivo, briefSchema, db, FORMATOS, guardarArquivo, r2Key, retimeScenes, tempoLeitura, type Brief, type Json, type Storyboard } from "@domus-ads/core";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { bloco, perguntarIA } from "../ai/ask";
import { lerStoryboard, promptAjuste, promptComposicao, promptCorrecao, promptRoteiro, SISTEMA_ROTEIRO, sistemaAjusteCenas, sistemaComposicao, violacoes } from "./compose";
import { contextoCriativo } from "./contexto";
import { arquivoMusica, arquivoSfx } from "./sfx";
import { duracao, ffmpeg, hyperframes } from "./tools";
import { montarComposicao } from "./kit/cenas";
import { CENAS_JS } from "./kit/cenas-runtime";
import { MOTION_KIT_JS } from "./kit/motion-kit";
import { revisarComposicao } from "./qa";
import { gerarTrilha } from "./music";
import { ttsPara } from "./tts";

type Etapa = "SCRIPTING" | "VOICE" | "COMPOSING" | "RENDERING" | "MIXING" | "UPLOADING" | "READY";
interface Ctx { signal: AbortSignal; log: (m: string) => Promise<void>; progress: (p: number) => Promise<void> }
export interface VideoPayload { projectId: string; mode?: "full" | "rerender" | "adjust"; instruction?: string }

const PROGRESSO: Record<Etapa, number> = { SCRIPTING: 5, VOICE: 20, COMPOSING: 32, RENDERING: 50, MIXING: 85, UPLOADING: 93, READY: 100 };

/**
 * Pipeline do Video Studio (spec §16), no PC do worker, numa pasta só deste projeto (.worker-data/videos/<id>).
 * full: roteiro → voz → composição → render → mix → R2 → criativo.
 * rerender: storyboard editado pelo usuário → voz → composição nova → …
 * adjust: pedido em texto → a IA ajusta a composição atual → render → …
 */
export async function runVideo(payload: VideoPayload, c: Ctx) {
  const sql = db();
  const [p] = await sql<{ id: string; workspace_id: string; title: string; brief: Brief; storyboard: Storyboard | null; composition: string | null; creative_id: string | null }[]>`
    select id, workspace_id, title, brief, storyboard, composition, creative_id from ads.video_projects where id = ${payload.projectId}`;
  if (!p) throw new Error("Projeto de vídeo não encontrado");
  const brief = briefSchema.parse(p.brief);
  const [w, h] = FORMATOS[brief.formato];
  const pasta = join(DATA_DIR, "videos", p.id);
  mkdirSync(pasta, { recursive: true });
  const etapa = async (e: Etapa, detalhe: string) => {
    await sql`update ads.video_projects set status = ${e}, step_detail = ${detalhe}, error = null, updated_at = now() where id = ${p.id}`;
    await c.progress(PROGRESSO[e]);
    await c.log(detalhe);
  };
  // identidade visual do workspace + anexos e links do projeto (a IA vê as imagens da pasta assets/)
  const ctxCriativo = await contextoCriativo(p.id, p.workspace_id, pasta, c.log);
  const ia = (sistema: string, prompt: string) => perguntarIA({ workspaceId: p.workspace_id, sistema, prompt, cwd: pasta, signal: c.signal, log: c.log, imagens: ctxCriativo.imagens });

  try {
    // 1. Roteiro → storyboard estruturado
    let sb: Storyboard;
    const modo = payload.mode ?? "full";
    if (modo === "full" || !p.storyboard) {
      await etapa("SCRIPTING", "Escrevendo roteiro e storyboard…");
      let r = await ia(SISTEMA_ROTEIRO, promptRoteiro(brief, ctxCriativo.texto));
      try {
        sb = lerStoryboard(bloco(r.text, "json"));
      } catch (e) {
        await c.log(`${(e as Error).message}; pedindo correção`);
        r = await ia(SISTEMA_ROTEIRO, `${promptRoteiro(brief, ctxCriativo.texto)}\n\nSua resposta anterior falhou na validação: ${(e as Error).message}. Responda de novo, só o bloco json válido.`);
        sb = lerStoryboard(bloco(r.text, "json"));
      }
      if (!brief.efeitos) sb.sfx = [];
      if (brief.musica === "none") sb.music = null;
      // tempo de leitura é regra (não pedido à IA): cada cena dura pelo menos o necessário para ler o texto fixo
      sb = retimeScenes(sb, sb.scenes.map(tempoLeitura));
      // pausa para aprovação: voz, animação e render (o que gasta créditos) só depois que o usuário aprovar o roteiro
      await sql`update ads.video_projects set storyboard = ${sql.json(sb as unknown as Json)}, title = ${sb.title}, status = 'REVIEW',
        step_detail = 'Roteiro pronto: revise e aprove para gerar o vídeo', error = null, updated_at = now() where id = ${p.id}`;
      await c.progress(100);
      return { revisao: true, cenas: sb.scenes.length };
    } else {
      sb = p.storyboard;
    }

    // 2. Narração por cena (Kokoro local ou ElevenLabs) e reajuste dos tempos para a voz caber
    const vozes: { file: string; start: number }[] = [];
    const arquivoVoz = (i: number) => [join(pasta, `voz-${i}.mp3`), join(pasta, `voz-${i}.wav`)].find(existsSync);
    if (modo !== "adjust" && brief.voz !== "none") {
      await etapa("VOICE", brief.voz.startsWith("el:") ? "Gravando a narração (ElevenLabs)…" : "Gravando a narração…");
      for (const i of sb.scenes.keys()) for (const f of [`voz-${i}.mp3`, `voz-${i}.wav`]) rmSync(join(pasta, f), { force: true });
      const tts = ttsPara(brief.voz, c.log);
      const minimos: number[] = [];
      const falas: (number | undefined)[] = [];
      const palavras: ({ w: string; start: number }[] | undefined)[] = [];
      let caracteres = 0, creditos = 0;
      try {
        for (const [i, s] of sb.scenes.entries()) {
          if (!s.narration?.trim()) { minimos.push(tempoLeitura(s)); palavras.push(undefined); falas.push(undefined); continue; }
          const v = await tts.generateVoice({ text: s.narration, voice: brief.voz, out: join(pasta, `voz-${i}.wav`) });
          minimos.push(Math.max(v.seconds + 0.6, tempoLeitura(s))); // a fala com respiro, ou o tempo de ler, o que for maior
          falas.push(+v.seconds.toFixed(2));
          palavras.push(v.words);
          caracteres += s.narration.length;
          creditos += v.credits ?? 0;
        }
      } finally {
        // registra o gasto mesmo se uma cena falhar no meio (o que já foi gerado foi cobrado)
        if (creditos > 0) await sql`insert into ads.tts_usage (workspace_id, video_project_id, voice_id, voice_name, characters, credits)
          values (${p.workspace_id}, ${p.id}, ${brief.voz.replace(/^el:/, "")}, ${brief.vozNome || null}, ${caracteres}, ${creditos})`;
      }
      sb = retimeScenes(sb, minimos);
      sb.scenes.forEach((s, i) => {
        const f = arquivoVoz(i);
        s.fala = falas[i];
        if (!s.narration?.trim() || !f) return;
        vozes.push({ file: f, start: s.start + 0.25 });
        // tempo exato de cada palavra (ElevenLabs) para a legenda cinética sincronizar com a fala
        s.words = palavras[i]?.map((p) => ({ w: p.w, start: +(s.start + 0.25 + p.start).toFixed(3) }));
      });
    } else if (modo === "adjust" && brief.voz !== "none") {
      sb.scenes.forEach((s, i) => { const f = arquivoVoz(i); if (s.narration?.trim() && f) vozes.push({ file: f, start: s.start + 0.25 }); });
    } else if (modo !== "adjust") {
      sb = retimeScenes(sb, sb.scenes.map(tempoLeitura)); // sem voz: o tempo é o da leitura (texto editado pode ter crescido)
    }
    await sql`update ads.video_projects set storyboard = ${sql.json(sb as unknown as Json)}, title = ${sb.title}, updated_at = now() where id = ${p.id}`;

    // 3. Trilha: música licenciada da biblioteca (se houver no clima) ou composta aqui, com as batidas para sincronizar
    let musica: { file: string; volume: number; nome: string } | null = null;
    let ritmo: { bpm: number; batidas: number[]; compassos: number[] } | null = null;
    if (sb.music) {
      const lib = await arquivoMusica(p.workspace_id, sb.music.tag, pasta);
      if (lib) musica = { file: lib.file, volume: sb.music.volume, nome: lib.name };
      else {
        const t = gerarTrilha(sb.music.tag, sb.duration, join(pasta, "trilha.wav"), p.id.charCodeAt(0) + p.id.charCodeAt(1));
        musica = { file: t.file, volume: Math.max(sb.music.volume, 0.3), nome: `Trilha original (${sb.music.tag}, ${t.bpm} BPM)` };
        ritmo = t;
      }
    }

    // 4. Composição. Estilos com cenas prontas: montada pelo código (sem IA, qualidade constante).
    //    "Livre": a IA escreve com o Motion Kit. Ajuste: a IA edita a composição atual.
    //    Tudo passa pela barreira de segurança, pelo lint e pelo QA (texto fora do quadro, sobreposto ou curto demais).
    const modelo = brief.estiloVisual !== "livre";
    const porIA = !modelo || modo === "adjust";
    await etapa("COMPOSING", modo === "adjust" ? "Ajustando a animação…" : modelo ? "Montando as cenas…" : "Criando a animação (Motion Kit + GSAP)…");
    mkdirSync(join(pasta, "assets"), { recursive: true });
    writeFileSync(join(pasta, "assets", "motion-kit.js"), MOTION_KIT_JS, "utf8");
    writeFileSync(join(pasta, "assets", "cenas.js"), CENAS_JS, "utf8");
    const deCenas = modo === "adjust" ? !!p.composition?.includes("assets/cenas.js") : modelo;
    const sistema = deCenas ? sistemaAjusteCenas(brief) : sistemaComposicao(brief);
    let html = !porIA
      ? montarComposicao({ sb, brief, brand: ctxCriativo.brand, w, h, assets: readdirSync(join(pasta, "assets")), rotulo: brief.produto })
      : bloco((await ia(sistema, modo === "adjust" && p.composition ? promptAjuste(p.composition, sb, payload.instruction ?? "", ctxCriativo.texto) : promptComposicao(sb, ctxCriativo.texto, ritmo))).text, "html");
    const avisos: string[] = [];
    for (let rodada = 0; ; rodada++) {
      let erros = [...violacoes(html), ...(await lint(pasta, html))];
      if (!erros.length) {
        await c.log("Conferindo o vídeo quadro a quadro (texto fora da tela, sobreposto ou rápido demais)…");
        const qa = await revisarComposicao(pasta, { w, h, total: sb.duration }).catch(async (e: Error) => { await c.log(`QA indisponível: ${e.message}`); return [] as string[]; });
        if (!qa.length) break;
        if (!porIA || rodada === 2) { avisos.push(...qa.slice(0, 3)); await c.log(`QA: ${qa.join(" | ")}`); break; }
        erros = qa.map((q) => `Revisão visual: ${q}`);
      }
      if (rodada === 2) throw new Error(`A composição continuou com erros: ${erros.slice(0, 3).join("; ")}`);
      if (!porIA) throw new Error(`A composição montada tem erros: ${erros.slice(0, 3).join("; ")}`);
      await c.log(`${erros.length} problema(s) na composição; pedindo correção à IA`);
      html = bloco((await ia(sistema, promptCorrecao(html, erros))).text, "html");
    }
    await sql`update ads.video_projects set composition = ${html}, updated_at = now() where id = ${p.id}`;

    // 4. Render (vídeo sem áudio; o áudio é mixado depois no FFmpeg)
    await etapa("RENDERING", "Renderizando o vídeo…");
    const mudo = join(pasta, "render.mp4");
    const r = await hyperframes(["render", pasta, "-o", mudo, "-q", "standard", "-f", "30", "--quiet"], { cwd: pasta, timeoutMs: 1_800_000, signal: c.signal });
    if (r.code !== 0 || !existsSync(mudo)) throw new Error(`Falha no render: ${(r.err || r.out).trim().split("\n").filter(Boolean).at(-1) ?? r.code}`);

    // 5. Mix: voz + efeitos + música (com ducking sob a voz), loudness -16 LUFS, AAC
    await etapa("MIXING", "Mixando voz, efeitos e música…");
    const sfx = await Promise.all(sb.sfx.map(async (e, i) => ({ ...e, file: await arquivoSfx(p.workspace_id, e.effect, i, pasta) })));
    const final = join(pasta, "final.mp4");
    await mixar({ video: mudo, saida: final, duracao: sb.duration, vozes, sfx, musica: musica ? { file: musica.file, volume: musica.volume } : null, signal: c.signal });
    const thumb = join(pasta, "thumb.jpg");
    const t = Math.min(sb.duration - 0.1, Math.max(0.5, (sb.scenes[0]?.end ?? 2) * 0.75));
    await ffmpeg(["-ss", String(t), "-i", final, "-frames:v", "1", "-q:v", "3", thumb]);

    // 6. Armazenamento (PC ou R2, conforme STORAGE) + criativo; o banco guarda só a chave e onde ela está
    await etapa("UPLOADING", "Enviando para o armazenamento…");
    const id = p.creative_id ?? crypto.randomUUID();
    const versao = Date.now().toString(36);
    const kVideo = r2Key(p.workspace_id, "videos", `${id}-${versao}.mp4`);
    const kThumb = r2Key(p.workspace_id, "thumbnails", `${id}-${versao}.jpg`);
    const size = statSync(final).size;
    const [antigo] = p.creative_id ? await sql<{ storage: string; r2_key: string | null; thumbnail_key: string | null }[]>`select storage, r2_key, thumbnail_key from ads.creatives where id = ${p.creative_id}` : [];
    const storage = await guardarArquivo(kVideo, final, "video/mp4");
    if (existsSync(thumb)) await guardarArquivo(kThumb, thumb, "image/jpeg");
    const meta = { projectId: p.id, brief, storyboard: sb, voice: brief.voz, music: musica?.nome ?? null, avisos };
    const dur = Math.round((await duracao(final)) * 1000);
    if (p.creative_id) {
      await sql`update ads.creatives set name = ${sb.title}, storage = ${storage}, r2_key = ${kVideo}, thumbnail_key = ${existsSync(thumb) ? kThumb : null}, size_bytes = ${size},
        width = ${w}, height = ${h}, duration_ms = ${dur}, status = 'READY', metadata = ${sql.json(meta as unknown as Json)}, updated_at = now() where id = ${id}`;
    } else {
      await sql`insert into ads.creatives (id, workspace_id, name, type, status, storage, r2_key, thumbnail_key, mime, size_bytes, width, height, duration_ms, metadata)
        values (${id}, ${p.workspace_id}, ${sb.title}, 'VIDEO', 'READY', ${storage}, ${kVideo}, ${existsSync(thumb) ? kThumb : null}, 'video/mp4', ${size}, ${w}, ${h}, ${dur}, ${sql.json(meta as unknown as Json)})`;
    }
    await sql`update ads.video_projects set status = 'READY', step_detail = ${meta.avisos[0] ?? "Pronto"}, creative_id = ${id}, error = null, updated_at = now() where id = ${p.id}`;
    await c.progress(100);
    // versão anterior deste vídeo (ajuste/novo render) não fica ocupando espaço
    for (const k of [antigo?.r2_key, antigo?.thumbnail_key]) if (antigo && k && k !== kVideo && k !== kThumb) await apagarArquivo(antigo.storage, k).catch(() => {});
    // libera disco: fica só o que serve para ajustar depois (narrações e composição)
    for (const f of ["render.mp4", "final.mp4", "thumb.jpg"]) rmSync(join(pasta, f), { force: true });
    return { creativeId: id, duracao: dur / 1000, tamanho: size };
  } catch (e) {
    await sql`update ads.video_projects set status = 'FAILED', error = ${(e as Error).message.slice(0, 1000)}, updated_at = now() where id = ${p.id}`;
    throw e;
  }
}

/** Grava o index.html e roda o lint da HyperFrames; devolve só os erros (avisos não travam o render). */
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

async function mixar(m: {
  video: string; saida: string; duracao: number; signal: AbortSignal;
  vozes: { file: string; start: number }[]; sfx: { file: string; time: number; volume: number }[]; musica: { file: string; volume: number } | null;
}) {
  const entradas: string[] = ["-i", m.video];
  const filtros: string[] = [];
  let n = 1;
  const voz: string[] = [], fx: string[] = [];
  for (const v of m.vozes) { entradas.push("-i", v.file); filtros.push(`[${n}:a]aresample=48000,adelay=${Math.round(v.start * 1000)}:all=1[v${n}]`); voz.push(`[v${n}]`); n++; }
  for (const e of m.sfx) { entradas.push("-i", e.file); filtros.push(`[${n}:a]aresample=48000,volume=${e.volume.toFixed(2)},adelay=${Math.round(e.time * 1000)}:all=1[s${n}]`); fx.push(`[s${n}]`); n++; }
  if (!voz.length && !fx.length && !m.musica) {
    const r = await ffmpeg(["-i", m.video, "-c", "copy", "-movflags", "+faststart", m.saida], { signal: m.signal });
    if (r.code !== 0) throw new Error(`Falha ao finalizar: ${r.err.slice(0, 300)}`);
    return;
  }
  const d = m.duracao.toFixed(2);
  const partes: string[] = [];
  if (voz.length) { filtros.push(`${voz.join("")}amix=inputs=${voz.length}:normalize=0,apad,atrim=0:${d}[voz0]`); }
  if (fx.length) { filtros.push(`${fx.join("")}amix=inputs=${fx.length}:normalize=0,apad,atrim=0:${d}[fx]`); partes.push("[fx]"); }
  if (m.musica) {
    entradas.push("-stream_loop", "-1", "-i", m.musica.file);
    const fadeOut = Math.max(0, m.duracao - 1.5).toFixed(2);
    filtros.push(`[${n}:a]aresample=48000,atrim=0:${d},volume=${m.musica.volume.toFixed(2)},afade=t=in:d=0.8,afade=t=out:st=${fadeOut}:d=1.5[mus0]`);
    if (voz.length) {
      // ducking: a música abaixa enquanto a voz fala
      filtros.push(`[voz0]asplit=2[voz][vozsc]`, `[mus0][vozsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[mus]`);
    } else filtros.push(`[mus0]anull[mus]`);
    partes.push("[mus]");
    n++;
  }
  if (voz.length && !m.musica) filtros.push(`[voz0]anull[voz]`);
  if (voz.length) partes.unshift("[voz]");
  filtros.push(`${partes.join("")}amix=inputs=${partes.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:${d}[a]`);
  const r = await ffmpeg([...entradas, "-filter_complex", filtros.join(";"), "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", d, "-movflags", "+faststart", m.saida], { signal: m.signal, timeoutMs: 600_000 });
  if (r.code !== 0) throw new Error(`Falha na mixagem: ${r.err.slice(0, 400)}`);
}
