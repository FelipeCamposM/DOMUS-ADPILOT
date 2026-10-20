import { chaveElevenLabs, db, guardarArquivo, PROMPT_MUSICA, PROMPT_SFX, r2Key, type Json, type MUSICA_TAGS, type SFX_CATEGORIAS } from "@domus-ads/core";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { duracao } from "./tools";

/**
 * Música e efeitos sonoros gerados no ElevenLabs (Eleven Music / Sound Effects). Todo áudio gerado vira item da biblioteca
 * do workspace (Criativos → Músicas/Efeitos), com o pedido guardado: é gerado uma vez e reaproveitado nos próximos vídeos.
 */
type Tag = (typeof MUSICA_TAGS)[number];
type Cat = (typeof SFX_CATEGORIAS)[number];
export interface PedidoAudio { tipo: "MUSIC" | "SFX"; tag: string; prompt?: string; duracao?: number; nome?: string }

async function chamar(caminho: string, corpo: Record<string, unknown>, destino: string, timeoutMs: number) {
  const chave = await chaveElevenLabs();
  if (!chave) throw new Error("ElevenLabs sem chave (Configurações → Vozes)");
  const r = await fetch(`https://api.elevenlabs.io${caminho}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": chave, "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(timeoutMs),
  });
  if (r.status === 401) throw new Error("Chave do ElevenLabs sem permissão para gerar música/efeitos (ative Music e Sound Effects na chave)");
  if (r.status === 402) throw new Error("ElevenLabs: o plano atual não inclui esta geração ou acabaram os créditos");
  if (r.status === 429) throw new Error("ElevenLabs: limite de uso atingido, tente mais tarde");
  if (!r.ok) throw new Error(`ElevenLabs respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

/** Gera e guarda na biblioteca. Devolve o id do criativo e o arquivo local (para usar já). */
export async function gerarAudio(workspaceId: string, p: PedidoAudio, log: (m: string) => Promise<void> | void = () => {}): Promise<{ id: string; file: string; name: string }> {
  const dir = join(DATA_DIR, "audio-ia");
  mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();
  const file = join(dir, `${id}.mp3`);
  let prompt: string, nome: string;
  if (p.tipo === "MUSIC") {
    const base = PROMPT_MUSICA[p.tag as Tag];
    if (!base) throw new Error("Clima de música inválido");
    prompt = `${base.prompt}${p.prompt ? `. ${p.prompt}` : ""}. Instrumental only, seamless loopable ending, no vocals.`.slice(0, 1800);
    nome = p.nome || `${base.nome} · ElevenLabs`;
    await log(`gerando música (${base.nome}) no ElevenLabs…`);
    await chamar("/v1/music", { prompt, music_length_ms: Math.round(Math.min(180, Math.max(10, p.duracao ?? 60)) * 1000), force_instrumental: true }, file, 300_000);
  } else {
    const base = PROMPT_SFX[p.tag as Cat];
    if (!base) throw new Error("Categoria de efeito inválida");
    prompt = (p.prompt || base.prompt).slice(0, 600);
    nome = p.nome || `${base.nome} · ElevenLabs`;
    await log(`gerando efeito sonoro (${base.nome}) no ElevenLabs…`);
    await chamar("/v1/sound-generation", { text: prompt, duration_seconds: Math.min(30, Math.max(0.5, p.duracao ?? base.dur)), prompt_influence: 0.5 }, file, 120_000);
  }
  const key = r2Key(workspaceId, p.tipo === "MUSIC" ? "music" : "sfx", `${id}.mp3`);
  const storage = await guardarArquivo(key, file, "audio/mpeg");
  const ms = Math.round((await duracao(file)) * 1000);
  await db()`insert into ads.creatives (id, workspace_id, name, type, status, storage, r2_key, mime, size_bytes, duration_ms, tags, license, metadata)
    values (${id}, ${workspaceId}, ${nome.slice(0, 120)}, ${p.tipo}, 'READY', ${storage}, ${key}, 'audio/mpeg', ${statSync(file).size}, ${ms}, ${[p.tag]},
      'ElevenLabs (gerado na conta do workspace)', ${db().json({ origem: "elevenlabs", prompt } as unknown as Json)})`;
  return { id, file, name: nome };
}
