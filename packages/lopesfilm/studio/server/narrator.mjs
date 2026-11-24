// @ts-check
/**
 * Narrador: o que a voz gerada ganha depois de feita (velocidade e tom) e como as pausas escritas no texto viram o
 * que cada serviço entende. Os serviços de voz não têm, em geral, controle de velocidade nem de tom que valha para
 * todos; aqui o som pronto passa por ffmpeg, igual para qualquer voz, local ou de API.
 *
 *   POST /api/narrator/shape { folder, src, speed?, pitch? } → { src, dur } (arquivo novo ao lado do original)
 */
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join } from 'node:path';
import { ffmpeg } from '../../src/shared.mjs';
import { inside } from './files.mjs';

export const SPEED = [0.5, 2];
export const PITCH = [-6, 6];

/** atempo aceita de 0,5 a 2 por etapa: o que passa disso vira etapas em fila. @param {number} factor */
function tempo(factor) {
  const steps = [];
  let f = factor;
  while (f > 2) { steps.push(2); f /= 2; }
  while (f < 0.5) { steps.push(0.5); f /= 0.5; }
  steps.push(f);
  return steps.map((s) => `atempo=${+s.toFixed(5)}`);
}

/**
 * A cadeia de filtros de áudio: o tom em semitons muda a altura sem mudar a duração (rate e tempo se compensam), a
 * velocidade muda a duração sem mudar a altura. null: nada a fazer.
 * @param {{ speed?: number, pitch?: number }} shape @param {number} [rate] taxa de amostragem do arquivo
 */
export function filterFor({ speed = 1, pitch = 0 }, rate = 44100) {
  const s = Math.min(SPEED[1], Math.max(SPEED[0], Number(speed) || 1));
  const p = Math.min(PITCH[1], Math.max(PITCH[0], Number(pitch) || 0));
  if (Math.abs(s - 1) < 0.005 && Math.abs(p) < 0.05) return null;
  const chain = [];
  if (Math.abs(p) >= 0.05) {
    const f = 2 ** (p / 12);
    chain.push(`asetrate=${Math.round(rate * f)}`, `aresample=${rate}`, ...tempo(1 / f));
  }
  if (Math.abs(s - 1) >= 0.005) chain.push(...tempo(s));
  return chain.join(',');
}

/**
 * As pausas do texto, `[pausa]`, `[pausa 2s]`, `[pausa 400ms]`, no que o serviço lê. Sem marca própria no serviço,
 * a pausa vira pontuação (reticências para a curta, ponto e reticências para a longa).
 * @param {string} text @param {string} provider
 */
export function withPauses(text, provider) {
  return text.replace(/\[\s*pausa(?:\s+(\d+(?:[.,]\d+)?)\s*(ms|s))?\s*\]/gi, (_m, n, unit) => {
    const ms = n ? Math.round(Number(String(n).replace(',', '.')) * (unit === 's' ? 1000 : 1)) : 600;
    const clamped = Math.min(5000, Math.max(100, ms));
    if (provider === 'inworld') return `<break time="${clamped}ms" />`;
    if (provider === 'cartesia') return `<break time="${clamped}ms"/>`;
    return clamped >= 1200 ? '. … ' : ' … ';
  });
}

/** @param {string} file */
function lengthOf(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8', windowsHide: true });
  return Number(String(r.stdout).trim()) || 0;
}

/**
 * Um arquivo novo, ao lado do original, com a velocidade e o tom pedidos.
 * @param {string} root a pasta do projeto @param {string} src o arquivo, do projeto @param {{ speed?: number, pitch?: number }} shape
 */
export async function shapeVoice(root, src, shape) {
  const file = inside(root, src);
  const filter = filterFor(shape);
  if (!filter) return { src, dur: lengthOf(file) };
  const out = join(dirname(file), `${basename(file, extname(file))}-narr${extname(file) || '.mp3'}`);
  await ffmpeg(['-i', file, '-af', filter, out], { timeoutMs: 120_000, what: 'a narração' }).done;
  const rel = src.replace(/[^/]+$/, '') + basename(out);
  return { src: rel, dur: lengthOf(out) };
}
