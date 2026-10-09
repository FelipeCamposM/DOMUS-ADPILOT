import { writeFileSync } from "node:fs";
import type { MUSICA_TAGS } from "@domus-ads/core";

/**
 * Trilhas de fundo originais, sintetizadas aqui (sem samples nem músicas de terceiros: zero problema de licença).
 * Cada clima tem BPM, tonalidade, progressão e arranjo próprios. Devolve também o tempo das batidas, para os cortes
 * do vídeo caírem no ritmo. Estrutura: 1º compasso só pad (entrada), bateria entra no 2º, fade nos últimos segundos.
 */
type Tag = (typeof MUSICA_TAGS)[number];
interface Preset {
  bpm: number; raiz: number; acordes: number[][]; // acordes em semitons a partir da raiz (MIDI)
  pad: number; baixo: "pulso" | "oitavas" | "longo" | null; kick: "4x4" | "1e3" | "esparso" | null;
  caixa: boolean; hat: "off" | "16" | "esparso" | null; arp: "16" | "8" | "pluck" | null; pump: number; brilho: number;
}

const m = (n: number) => 440 * 2 ** ((n - 69) / 12);
const P: Record<Tag, Preset> = {
  corporate: { bpm: 100, raiz: 60, acordes: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], pad: .55, baixo: "oitavas", kick: "1e3", caixa: false, hat: "off", arp: "8", pump: .15, brilho: .5 },
  technology: { bpm: 118, raiz: 57, acordes: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], pad: .45, baixo: "pulso", kick: "4x4", caixa: false, hat: "16", arp: "16", pump: .55, brilho: .7 },
  dark: { bpm: 88, raiz: 50, acordes: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]], pad: .7, baixo: "longo", kick: "esparso", caixa: false, hat: "esparso", arp: null, pump: .2, brilho: .25 },
  energetic: { bpm: 128, raiz: 52, acordes: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], pad: .45, baixo: "pulso", kick: "4x4", caixa: true, hat: "16", arp: "16", pump: .7, brilho: .85 },
  emotional: { bpm: 76, raiz: 55, acordes: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], pad: .6, baixo: "longo", kick: "esparso", caixa: false, hat: null, arp: "pluck", pump: 0, brilho: .4 },
  minimal: { bpm: 110, raiz: 57, acordes: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]], pad: .25, baixo: "pulso", kick: "1e3", caixa: false, hat: "esparso", arp: "pluck", pump: .3, brilho: .55 },
  premium: { bpm: 96, raiz: 60, acordes: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 21]], pad: .6, baixo: "oitavas", kick: "1e3", caixa: false, hat: "off", arp: "8", pump: .25, brilho: .45 },
};

export interface Trilha { file: string; bpm: number; batidas: number[]; compassos: number[] }

export function gerarTrilha(tag: Tag, duracao: number, arquivo: string, semente = 1): Trilha {
  const p = P[tag];
  const SR = 44100;
  const total = Math.ceil((duracao + 0.5) * SR);
  const L = new Float32Array(total), R = new Float32Array(total);
  let s = semente * 7919 + 13;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const beat = 60 / p.bpm, compasso = beat * 4;
  const acordeEm = (t: number) => p.acordes[Math.floor(t / compasso) % p.acordes.length]!;
  const fade = (t: number) => Math.min(1, t / 1.2) * Math.min(1, Math.max(0, (duracao - t) / 2));
  const bateriaOn = (t: number) => t >= compasso * (p.bpm > 100 ? 1 : 2) - 0.001;
  const pumpEm = (t: number) => (p.pump ? 1 - p.pump * Math.exp(-((t % beat) / beat) * 7) : 1);

  // PAD: osciladores levemente desafinados por nota, ataque lento, filtro passa-baixa (um polo) e estéreo
  let lpL = 0, lpR = 0;
  const corte = 0.04 + p.brilho * 0.08;
  for (let i = 0; i < total; i++) {
    const t = i / SR, ac = acordeEm(t), tc = t % compasso;
    const env = Math.min(1, tc / 0.6) * (1 - 0.25 * Math.max(0, (tc - compasso + 0.4) / 0.4));
    let vl = 0, vr = 0;
    for (const n of ac) {
      const f = m(p.raiz + n);
      const fase = (k: number) => ((t * f * k) % 1) * 2 - 1; // serra
      vl += fase(1.003) * .5 + Math.sin(2 * Math.PI * f * 0.997 * t) * .5;
      vr += fase(0.997) * .5 + Math.sin(2 * Math.PI * f * 1.003 * t) * .5;
    }
    lpL += corte * (vl - lpL); lpR += corte * (vr - lpR);
    const g = p.pad * env * pumpEm(t) * 0.11 * fade(t);
    L[i] += lpL * g; R[i] += lpR * g;
  }

  // BAIXO
  if (p.baixo) for (let i = 0; i < total; i++) {
    const t = i / SR, raiz = acordeEm(t)[0]!, f = m(p.raiz - 24 + raiz);
    let env: number;
    if (p.baixo === "longo") env = Math.min(1, (t % compasso) / 0.3);
    else if (p.baixo === "pulso") { const tt = (t + beat / 2) % (beat / 2); env = Math.exp(-tt * 9) * (((t % beat) >= beat / 2) ? 1 : .55); }
    else {
      const tt = t % (beat / 2), oitava = Math.floor(t / (beat / 2)) % 2;
      const v = Math.sin(2 * Math.PI * f * (oitava ? 2 : 1) * t) * Math.exp(-tt * 6) * 0.22 * fade(t) * pumpEm(t);
      L[i] += v; R[i] += v;
      continue;
    }
    const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env * 0.22 * fade(t) * (p.baixo === "pulso" ? 1 : pumpEm(t));
    L[i] += v; R[i] += v;
  }

  // BATERIA (kick com queda de pitch; caixa/palma de ruído; chimbal de ruído agudo)
  const batidas: number[] = [], compassos: number[] = [];
  for (let b = 0, t = 0; t < duracao; b++, t = b * beat) {
    batidas.push(+t.toFixed(3));
    if (b % 4 === 0) compassos.push(+t.toFixed(3));
    if (!bateriaOn(t)) continue;
    const pos = b % 4;
    const kick = p.kick === "4x4" || (p.kick === "1e3" && (pos === 0 || pos === 2)) || (p.kick === "esparso" && pos === 0);
    if (kick) som(t, 0.45, (tt) => Math.sin(2 * Math.PI * (45 * tt + (130 / 18) * (1 - Math.exp(-tt * 18)))) * Math.exp(-tt * 7) * 0.9);
    if (p.caixa && (pos === 1 || pos === 3)) som(t, 0.25, (tt) => ((rnd() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 190 * tt) * 0.3) * Math.exp(-tt * 18) * 0.5, 0.25);
    const hats = p.hat === "16" ? [0, .25, .5, .75] : p.hat === "off" ? [.5] : p.hat === "esparso" ? (pos % 2 ? [.5] : []) : [];
    for (const h of hats) { let ant = 0; som(t + h * beat, 0.06, (tt) => { const n = rnd() * 2 - 1; const hp = n - ant; ant = n; return hp * Math.exp(-tt * 55) * (h === .5 ? .16 : .09); }, 0.4); }
  }

  // ARPEJO / PLUCK (notas do acorde, envelope curto, filtro que fecha)
  if (p.arp) {
    const passo = p.arp === "16" ? beat / 4 : p.arp === "8" ? beat / 2 : beat;
    for (let k = 0, t = 0; t < duracao; k++, t = k * passo) {
      if (t < compasso * (p.arp === "pluck" ? 0 : 1)) continue;
      const ac = acordeEm(t), n = ac[k % ac.length]! + (k % 8 >= 4 ? 12 : 0), f = m(p.raiz + 12 + n);
      const pan = Math.sin(k * 1.7) * 0.5, dec = p.arp === "pluck" ? 3.2 : 9;
      let lp = 0;
      som(t, p.arp === "pluck" ? 1.2 : 0.35, (tt) => {
        const raw = (((tt * f) % 1) * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * f * tt) * 0.4;
        lp += (0.08 + 0.5 * Math.exp(-tt * 14)) * (raw - lp);
        return lp * Math.exp(-tt * dec) * (p.arp === "pluck" ? 0.16 : 0.1) * p.brilho * 1.4;
      }, pan);
    }
  }

  function som(inicio: number, dur: number, fn: (tt: number) => number, pan = 0) {
    const i0 = Math.floor(inicio * SR), n = Math.floor(dur * SR);
    for (let j = 0; j < n && i0 + j < total; j++) {
      const t = (i0 + j) / SR, v = fn(j / SR) * fade(t);
      L[i0 + j] += v * (1 - Math.max(0, pan)); R[i0 + j] += v * (1 + Math.min(0, pan));
    }
  }

  // master: saturação suave e normalização a -1 dBFS
  let pico = 0;
  for (let i = 0; i < total; i++) { L[i] = Math.tanh(L[i]! * 1.2); R[i] = Math.tanh(R[i]! * 1.2); pico = Math.max(pico, Math.abs(L[i]!), Math.abs(R[i]!)); }
  const ganho = pico > 0 ? 0.89 / pico : 1;
  const buf = Buffer.alloc(44 + total * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + total * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(total * 4, 40);
  for (let i = 0; i < total; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i]! * ganho)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i]! * ganho)) * 32767), 46 + i * 4);
  }
  writeFileSync(arquivo, buf);
  return { file: arquivo, bpm: p.bpm, batidas, compassos };
}
