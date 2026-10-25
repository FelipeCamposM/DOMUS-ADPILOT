import { aplicarCorrecoes, baixarArquivo, cortarPausas, db, duracaoEditada, legendaEditada, MAX_FONTE_S, MAX_VOZ_S, type Brief, type Palavra, type Storyboard } from "@domus-ads/core";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg, FFPROBE, rodar } from "./tools";
import { analisar } from "./whisper";
import type { Ctx } from "./pipeline";

/**
 * NARRAÇÃO COM A VOZ DO CLIENTE: o áudio gravado/enviado é baixado, transcrito (Whisper local), tem as pausas cortadas
 * e vira voz-propria.wav (a narração do vídeo). O roteiro nasce da transcrição; os tempos das cenas são os da fala.
 * Tudo fica em cache na pasta do projeto (aprovar/ajustar não transcreve de novo).
 */
export interface VozPropria { arquivo: string; dur: number; palavras: Palavra[] }

export async function prepararVozPropria(workspaceId: string, brief: Brief, pasta: string, glossario: string, c: Ctx): Promise<VozPropria> {
  const arquivo = join(pasta, "voz-propria.wav"), cache = join(pasta, "voz-propria.json");
  if (existsSync(arquivo) && existsSync(cache)) {
    const j = JSON.parse(readFileSync(cache, "utf8")) as { audio: string; dur: number; palavras: Palavra[] };
    if (j.audio === brief.audioProprio) return { arquivo, dur: j.dur, palavras: j.palavras };
  }
  const [a] = await db()<{ storage: string; r2_key: string; arquivado: boolean; mime: string | null }[]>`
    select storage, r2_key, arquivado, mime from ads.creatives where id = ${brief.audioProprio} and workspace_id = ${workspaceId} and type = 'VOICE' and status = 'READY' and r2_key is not null`;
  if (!a) throw new Error("O áudio com a sua voz não existe mais. Grave ou envie de novo.");
  const fonte = join(pasta, "voz-fonte");
  if (!existsSync(fonte)) {
    await baixarArquivo(a, `${fonte}.parcial`);
    renameSync(`${fonte}.parcial`, fonte);
  }
  const pr = await rodar(FFPROBE, ["-v", "error", "-show_format", "-of", "json", fonte]);
  const total = Number((JSON.parse(pr.out || "{}") as { format?: { duration?: string } }).format?.duration);
  // gravação do navegador (webm) às vezes não traz a duração no cabeçalho: aí vale o limite depois de cortar
  if (Number.isFinite(total) && total > MAX_FONTE_S + 1) throw new Error(`O áudio tem ${Math.round(total)} s: envie até ${MAX_FONTE_S / 60} minutos`);

  await c.log("Transcrevendo a sua voz (Whisper na GPU)…");
  const wav16 = join(pasta, "voz16k.wav");
  const r = await ffmpeg(["-i", fonte, "-vn", "-ac", "1", "-ar", "16000", wav16], { timeoutMs: 600_000, signal: c.signal });
  if (r.code !== 0) throw new Error(`Não consegui ler o áudio enviado: ${r.err.trim().split("\n").at(-1)?.slice(0, 200)}`);
  const an = await analisar({ pasta, audio: wav16, video: null, glossario, signal: c.signal, log: c.log });
  const durOriginal = Number.isFinite(total) && total > 0 ? total : (an.palavras.at(-1)?.e ?? 0) + 0.5;
  if (!an.palavras.length) throw new Error("Não ouvi fala no áudio. Confira o microfone e grave de novo.");

  const { cortes, palavras } = brief.cortarPausas
    ? cortarPausas(an.palavras, durOriginal, { pausa: 0.45 })
    : { cortes: [{ de: 0, ate: +durOriginal.toFixed(3) }], palavras: an.palavras.map(({ w, s, e }) => ({ w, s, e })) };
  const dur = duracaoEditada(cortes);
  if (dur > MAX_VOZ_S + 1) throw new Error(`Sua fala tem ${Math.round(dur)} s${brief.cortarPausas ? " (já sem as pausas)" : ""}: o limite do vídeo é ${MAX_VOZ_S / 60} minutos`);
  await c.log(`${palavras.length} palavras${brief.cortarPausas ? ` · pausas cortadas: ${durOriginal.toFixed(1)} s → ${dur.toFixed(1)} s` : ""}`);

  // só os trechos com fala, emendas com 10 ms de fade (sem estalo); script por arquivo (muitos cortes)
  const linhas = cortes.map((x, i) => `[0:a]atrim=start=${x.de}:end=${x.ate},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, x.ate - x.de - 0.01).toFixed(3)}:d=0.01[a${i}];`);
  const script = `${linhas.join("\n")}\n${cortes.map((_, i) => `[a${i}]`).join("")}concat=n=${cortes.length}:v=0:a=1,aresample=48000[ao]`;
  writeFileSync(join(pasta, "voz-cortes.ffscript"), script, "utf8");
  const m = await ffmpeg(["-i", fonte, "-filter_complex_script", join(pasta, "voz-cortes.ffscript"), "-map", "[ao]", "-ac", "1", arquivo], { timeoutMs: 600_000, signal: c.signal });
  if (m.code !== 0) throw new Error(`Falha ao cortar as pausas do áudio: ${m.err.trim().split("\n").at(-1)?.slice(0, 200)}`);
  rmSync(wav16, { force: true });
  writeFileSync(cache, JSON.stringify({ audio: brief.audioProprio, dur, palavras }), "utf8");
  return { arquivo, dur, palavras };
}

export const SISTEMA_ROTEIRO_VOZ = `A NARRAÇÃO JÁ EXISTE: é a voz do próprio cliente, gravada por ele. Você recebe a TRANSCRIÇÃO com o tempo de cada
palavra (já sem as pausas). O vídeo inteiro acompanha essa fala:
- "duration" = a duração da fala informada. A 1ª cena começa em 0 e a última termina em "duration".
- Divida a fala em cenas pelas ideias: cada cena começa no instante (s) da palavra que abre a ideia (use os tempos da
  transcrição) e termina onde a próxima começa. Cenas de no mínimo 2 s.
- NÃO escreva "narration": o worker preenche com a fala real de cada trecho. Pode omitir o campo.
- headline/subtext/itens reforçam o que está sendo dito naquele trecho (não copie a frase inteira); a última cena é o CTA
  se a fala terminar chamando para a ação.
- A duração pedida no briefing não vale: manda a fala.
- Revise a transcrição (vira a legenda): em "correcoes" corrija só erros claros de reconhecimento, grafia, acentos,
  nomes e termos da marca, maiúsculas e pontuação. NUNCA reescreva nem acrescente palavra que não foi falada.
  Cada correção é {"i": índice, "w": "texto novo"}; "w" pode ter 2 palavras ou "" para apagar palavra inventada/duplicada.
  Junte ao JSON do storyboard a chave "correcoes": [...].`;

export const promptVoz = (v: VozPropria) => `<fala_do_cliente duracao="${v.dur.toFixed(2)} s" formato="índice|início em s|palavra">
${v.palavras.map((p, i) => `${i}|${p.s.toFixed(2)}|${p.w}`).join("\n")}
</fala_do_cliente>`;

/** Correções da IA na transcrição (lidas do mesmo JSON do storyboard). */
export function corrigir(v: VozPropria, json: string): VozPropria {
  let lista: unknown;
  try { lista = (JSON.parse(json) as { correcoes?: unknown }).correcoes; } catch { return v; }
  if (!Array.isArray(lista)) return v;
  const ok = lista.filter((x): x is { i: number; w: string } => typeof x?.i === "number" && typeof x?.w === "string");
  return { ...v, palavras: aplicarCorrecoes(v.palavras, ok) };
}

/**
 * Encaixa as cenas da IA na fala: inícios grudados na palavra mais perto, cenas contínuas de 0 até o fim do áudio,
 * cenas curtas (< 1,2 s) somem dentro da anterior; narração e tempo de cada palavra vêm da transcrição.
 */
const FIM = 0.8;
export function encaixarNaFala(sb: Storyboard, v: VozPropria): Storyboard {
  const ps = v.palavras.filter((p) => p.w);
  const cola = (t: number) => ps.reduce((a, p) => (Math.abs(p.s - t) < Math.abs(a - t) ? p.s : a), ps[0]?.s ?? 0);
  const ordem = [...sb.scenes].sort((a, b) => a.start - b.start);
  const inicios: number[] = [];
  const cenas: Storyboard["scenes"] = [];
  ordem.forEach((s, i) => {
    const ini = i === 0 ? 0 : Math.max(0, cola(s.start) - 0.08);
    if (i > 0 && ini - inicios.at(-1)! < 1.2) return; // curta demais (ou colou no mesmo ponto)
    if (v.dur - ini < 1.2 && i > 0) return;
    inicios.push(+ini.toFixed(2));
    cenas.push(s);
  });
  // respiro depois da última palavra: a legenda final fica no ar para ler e o CTA não corta seco
  const total = +(v.dur + FIM).toFixed(2);
  const scenes = cenas.map((s, i) => {
    const start = inicios[i]!, end = i < cenas.length - 1 ? inicios[i + 1]! : total;
    const minhas = ps.filter((p) => p.s >= start - 0.001 && (i === cenas.length - 1 || p.s < end));
    const ultima = minhas.at(-1);
    return {
      ...s, start, end,
      narration: minhas.map((p) => p.w).join(" ").slice(0, 600),
      words: minhas.length ? minhas.slice(0, 200).map((p) => ({ w: p.w, start: +p.s.toFixed(3) })) : undefined,
      fala: ultima ? +Math.max(0.5, ultima.e - start - 0.25).toFixed(2) : undefined,
    };
  });
  return { ...sb, scenes, duration: total, sfx: sb.sfx.filter((e) => e.time < total) };
}

/** Texto revisado pelo cliente: o áudio não muda, a legenda acompanha a edição (ver legendaEditada). */
export const legendaRevisada = (sb: Storyboard): Storyboard => ({
  ...sb, scenes: sb.scenes.map((s) => ({ ...s, words: legendaEditada(s.narration ?? "", s.words) })),
});
