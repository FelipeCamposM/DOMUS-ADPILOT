import { chaveElevenLabs } from "@domus-ads/core";
import { writeFileSync } from "node:fs";
import { duracao, garantirKokoro, hyperframes } from "./tools";

/** Provider de voz trocável (spec §19): local (Kokoro, sem custo) ou ElevenLabs (vozes premium, com tempo por palavra). */
export interface AudioResult { file: string; seconds: number; words?: { w: string; start: number }[]; credits?: number }
export interface TTSProvider { generateVoice(input: { text: string; voice: string; out: string }): Promise<AudioResult> }

export function localTTS(log: (m: string) => Promise<void>): TTSProvider {
  return {
    async generateVoice({ text, voice, out }) {
      await garantirKokoro(log);
      // texto vai por arquivo: nunca vira argumento/opção de linha de comando
      const txt = out.replace(/\.wav$/i, ".txt");
      writeFileSync(txt, text, "utf8");
      const r = await hyperframes(["tts", txt, "-v", voice, "-l", "pt-br", "-o", out, "--json"], { timeoutMs: 300_000 });
      if (r.code !== 0) throw new Error(`Falha na narração: ${(r.err || r.out).trim().split("\n").at(-1)}`);
      return { file: out, seconds: await duracao(out) };
    },
  };
}

/** ElevenLabs (multilíngue v2). Usa /with-timestamps para saber quando cada palavra é falada (legenda sincronizada). */
export function elevenLabsTTS(): TTSProvider {
  return {
    async generateVoice({ text, voice, out }) {
      const chave = await chaveElevenLabs();
      if (!chave) throw new Error("Voz do ElevenLabs escolhida, mas a chave não está configurada (Configurações → Vozes)");
      const id = voice.replace(/^el:/, "");
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": chave, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } }),
        signal: AbortSignal.timeout(120_000),
      });
      if (r.status === 401) throw new Error("Chave do ElevenLabs inválida ou sem permissão de \"Text to Speech\"");
      if (r.status === 402) throw new Error("ElevenLabs: essa voz exige plano pago (vozes da Voice Library não funcionam na API no plano grátis). Use uma voz padrão ou a voz local.");
      if (r.status === 429) throw new Error("ElevenLabs: limite de uso atingido. Tente de novo mais tarde ou use a voz local.");
      if (!r.ok) throw new Error(`ElevenLabs respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[] } };
      const mp3 = out.replace(/\.wav$/i, ".mp3");
      writeFileSync(mp3, Buffer.from(j.audio_base64, "base64"));
      // créditos cobrados nesta chamada (sem o header, estima pelos caracteres: 1 crédito por caractere no multilingual v2)
      const credits = Number(r.headers.get("character-cost") ?? text.length) || text.length;
      return { file: mp3, seconds: await duracao(mp3), words: palavrasDe(j.alignment), credits };
    },
  };
}

/** Converte o alinhamento por caractere em início de cada palavra. */
export function palavrasDe(a?: { characters: string[]; character_start_times_seconds: number[] }): { w: string; start: number }[] | undefined {
  if (!a?.characters?.length) return undefined;
  const out: { w: string; start: number }[] = [];
  let atual = "", inicio = 0;
  a.characters.forEach((c, i) => {
    if (/\s/.test(c)) { if (atual) out.push({ w: atual, start: inicio }); atual = ""; return; }
    if (!atual) inicio = a.character_start_times_seconds[i] ?? inicio;
    atual += c;
  });
  if (atual) out.push({ w: atual, start: inicio });
  return out;
}

export const ttsPara = (voz: string, log: (m: string) => Promise<void>) => (voz.startsWith("el:") ? elevenLabsTTS() : localTTS(log));
