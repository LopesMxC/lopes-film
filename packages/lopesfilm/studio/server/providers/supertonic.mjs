// @ts-check
/**
 * The built-in voice: Supertonic 3, a text-to-speech model that runs on this computer's CPU (no GPU, no account, no
 * key, offline once fetched), in 31 languages, Portuguese among them, with ten voices. It is Lopes.Film's own voice-over,
 * made in this process: nothing else has to be running (as Voice Studio does).
 *
 * The model (about 400 MB, Supertone's weights under the OpenRAIL-M licence) is fetched from Hugging Face the first
 * time a voice is made, into `~/.lopesfilm/models/supertonic-3` (`LOPESFILM_SUPERTONIC_DIR`), and kept. Its files are
 * checked by size, and by SHA-256 where Hugging Face publishes one. The engine is supertonic-engine.mjs.
 *
 * A voice is `<style>` (M1–M5, F1–F5; the language is then found by the engine) or `<language>-<style>` (`pt-F3`).
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { landing, needed, notes, number, text } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Lopes.Film voice';
const REPO = 'https://huggingface.co/Supertone/supertonic-3/resolve/main';
/** The files of the model: path, bytes, and the SHA-256 where Hugging Face publishes one. */
export const FILES = /** @type {{ path: string, bytes: number, sha256?: string }[]} */ ([
  { path: 'onnx/duration_predictor.onnx', bytes: 3700147, sha256: 'c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db' },
  { path: 'onnx/text_encoder.onnx', bytes: 36416150, sha256: 'c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff' },
  { path: 'onnx/vector_estimator.onnx', bytes: 256534781, sha256: '883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c' },
  { path: 'onnx/vocoder.onnx', bytes: 101424195, sha256: '085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba' },
  { path: 'onnx/tts.json', bytes: 8253 },
  { path: 'onnx/unicode_indexer.json', bytes: 277676 },
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'].map((v) => ({ path: `voice_styles/${v}.json`, bytes: 0 })),
]);
const STYLES = ['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5'];
/** The languages and their names. */
export const LANGUAGES = /** @type {Record<string, string>} */ ({
  en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch', pl: 'Polish', ru: 'Russian', uk: 'Ukrainian',
  tr: 'Turkish', ar: 'Arabic', hi: 'Hindi', id: 'Indonesian', vi: 'Vietnamese', ja: 'Japanese', ko: 'Korean', bg: 'Bulgarian', hr: 'Croatian',
  cs: 'Czech', da: 'Danish', et: 'Estonian', fi: 'Finnish', el: 'Greek', hu: 'Hungarian', lv: 'Latvian', lt: 'Lithuanian', ro: 'Romanian',
  sk: 'Slovak', sl: 'Slovenian', sv: 'Swedish',
});

/** Where the model is kept. */
export const modelDir = () => process.env.LOPESFILM_SUPERTONIC_DIR || join(homedir(), '.lopesfilm', 'models', 'supertonic-3');
const baseUrl = () => process.env.LOPESFILM_SUPERTONIC_URL || REPO;

/** Whether every file of the model is here, of its size. */
export function installed(dir = modelDir()) {
  return FILES.every((f) => { try { const s = statSync(join(dir, f.path)); return s.isFile() && (f.bytes === 0 ? s.size > 1000 : s.size === f.bytes); } catch { return false; } });
}

/** @param {string} file */
async function sha256(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }

/**
 * Fetch what is missing of the model.
 * @param {string} dir @param {AbortSignal} signal @param {(line: string) => void} say
 */
export async function install(dir, signal, say) {
  let n = 0;
  for (const f of FILES) {
    n += 1;
    const to = join(dir, f.path);
    if (existsSync(to) && (f.bytes === 0 ? statSync(to).size > 1000 : statSync(to).size === f.bytes)) continue;
    mkdirSync(join(to, '..'), { recursive: true });
    say(`fetching the voice model: ${f.path} (${n}/${FILES.length})`);
    const res = await fetch(`${baseUrl()}/${f.path}`, { signal, redirect: 'follow' }).catch((e) => { throw new Error(`${NAME}: could not fetch the model (${e.message}). Check the internet connection and try again; what was fetched is kept.`); });
    if (!res.ok || !res.body) throw new Error(`${NAME}: the model file ${f.path} answered ${res.status}. Try again later.`);
    const part = `${to}.part`;
    await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), createWriteStream(part));
    if (f.bytes && statSync(part).size !== f.bytes) { rmSync(part, { force: true }); throw new Error(`${NAME}: ${f.path} came incomplete. Try again.`); }
    if (f.sha256 && await sha256(part) !== f.sha256) { rmSync(part, { force: true }); throw new Error(`${NAME}: ${f.path} did not match its checksum. Try again.`); }
    renameSync(part, to);
  }
}

/** 16-bit mono WAV bytes of float samples. @param {ArrayLike<number>} samples @param {number} rate */
export function wavOf(samples, rate) {
  const data = samples.length * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return new Uint8Array(b);
}

/** A voice id → { language, style }. @param {string} id */
export function parseVoice(id) {
  const m = /^(?:([a-z]{2})-)?([MF][1-5])$/i.exec(id.trim());
  if (!m) throw new Error(`${NAME}: the voice is ${STYLES.join(', ')}, or <language>-<voice> such as pt-F3. \`lopesfilm get voice\` lists them.`);
  const language = m[1]?.toLowerCase() ?? 'na';
  if (language !== 'na' && !LANGUAGES[language]) throw new Error(`${NAME}: no language ${language}; there is ${Object.keys(LANGUAGES).join(', ')}.`);
  return { language, style: m[2].toUpperCase() };
}

/** @type {Promise<any> | null} */
let loaded = null;
/** @type {string | null} */
let loadedDir = null;
const engine = (/** @type {string} */ dir) => {
  if (!loaded || loadedDir !== dir) { loadedDir = dir; loaded = import('./supertonic-engine.mjs').then((m) => m.loadTextToSpeech(join(dir, 'onnx'))); loaded.catch(() => { loaded = null; }); }
  return loaded;
};

/** @type {Provider} */
export default {
  id: 'supertonic',
  name: NAME,
  env: '',
  keysUrl: 'https://huggingface.co/Supertone/supertonic-3',
  billingUrl: 'https://huggingface.co/Supertone/supertonic-3',
  pricingUrl: 'https://huggingface.co/Supertone/supertonic-3',
  verbs: ['voice', 'tts'],
  models: { tts: [{ id: 'supertonic-3', name: 'Supertonic 3 (31 languages, on this computer)' }] },
  keyless: true,
  async run(verb, args, ctx) {
    if (verb === 'voice') {
      const want = text(args.language).toLowerCase();
      const gender = text(args.gender).toLowerCase();
      const langs = Object.entries(LANGUAGES).filter(([code, name]) => !want || code === want || name.toLowerCase() === want);
      const rows = langs.flatMap(([code, name]) => STYLES
        .filter((s) => !gender || s[0].toLowerCase() === gender)
        .map((s) => ({ voiceId: `${code}-${s}`, name: `${name} ${s}`, language: code, gender: s[0] === 'F' ? 'f' : 'm', description: `Built-in voice ${s}, ${name}` })));
      const limit = Math.max(1, Math.round(number(args.limit) ?? 5));
      return { files: [], index: [], receipt: { provider: 'supertonic', voices: rows.slice(0, limit), total: rows.length, ...notes(text(args.prompt) ? ['--prompt does not narrow these voices'] : []) } };
    }
    if (verb !== 'tts') throw new Error(`${NAME} does not do ${verb}.`);
    const { language, style } = parseVoice(needed(args, 'voice'));
    const said = needed(args, 'text');
    const dir = modelDir();
    if (!installed(dir)) await install(dir, ctx.signal, ctx.say);
    const tts = await engine(dir);
    const { loadVoiceStyle } = await import('./supertonic-engine.mjs');
    const voiceStyle = loadVoiceStyle([join(dir, 'voice_styles', `${style}.json`)]);
    const { wav, duration } = await tts.call(said, language, voiceStyle, 8, 1.05);
    const samples = Math.min(wav.length, Math.floor(tts.sampleRate * duration[0]));
    const bytes = wavOf(wav.slice(0, samples), tts.sampleRate);
    const path = landing('audio/vo', args.out, 'wav');
    const dur = Math.round((samples / tts.sampleRate) * 100) / 100;
    return {
      files: [{ path, bytes }],
      index: [{ src: path, kind: 'audio', dur, text: said, voice: `${language}-${style}`, from: { mode: 'synth', text: said, voice: `${language}-${style}`, provider: 'supertonic', model: 'supertonic-3' } }],
      receipt: { provider: 'supertonic', model: 'supertonic-3', src: path, dur, voice: `${language}-${style}`, notes: ['made on this computer by the built-in voice: no word timings, subtitles spread the text over the line'] },
    };
  },
};
