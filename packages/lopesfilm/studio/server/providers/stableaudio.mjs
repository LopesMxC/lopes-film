// @ts-check
/**
 * Stable Audio Open 1.0 (Stability AI): sound effects made on this computer, from a description. It runs as its own small
 * server (tools/sfx-server: `INICIAR.bat`), at http://127.0.0.1:8002 or LOPESFILM_SFX_URL; it fits a 6 GB card with
 * offload. The model asks for its licence to be accepted on Hugging Face once. `POST /generate {prompt, seconds}` answers
 * a WAV. Nothing leaves the computer. Sounds of up to 47 seconds; effects are a few.
 */
import { call, clamp, landing, needed, number } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Stable Audio Open';
const MODELS = { sfx: [{ id: 'stable-audio-open-1.0', name: 'Stable Audio Open 1.0' }] };
const START = 'Start the effects server: run tools/sfx-server/INICIAR.bat (port 8002), then try again.';

/** The seconds of a WAV from its header (PCM: byte rate and data size); null when it is not one. @param {Uint8Array} b */
export function wavSeconds(b) {
  if (b.length < 44 || String.fromCharCode(...b.slice(0, 4)) !== 'RIFF') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const rate = v.getUint32(28, true);
  return rate ? Math.round(((b.length - 44) / rate) * 100) / 100 : null;
}

/** @type {Provider} */
export default {
  id: 'stableaudio',
  name: 'Stable Audio Open (local)',
  env: 'STABLEAUDIO_API_KEY',
  keysUrl: 'https://huggingface.co/stabilityai/stable-audio-open-1.0',
  billingUrl: 'https://huggingface.co/stabilityai/stable-audio-open-1.0',
  pricingUrl: 'https://huggingface.co/stabilityai/stable-audio-open-1.0',
  keyless: true,
  verbs: ['sfx'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'sfx') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    const path = landing('audio/sfx', args.out, 'wav');
    const base = (process.env.LOPESFILM_SFX_URL?.trim() || 'http://127.0.0.1:8002').replace(/\/+$/, '');
    await call(NAME, `${base}/health`, {}, ctx).catch((e) => {
      if (ctx.signal.aborted) throw e;
      throw new Error(/could not be reached/.test(e.message) ? `${NAME} is not running at ${base}. ${START}` : e.message);
    });
    const sec = Math.round(clamp(number(args.sec) ?? 4, 1, 47) * 10) / 10;
    const res = await call(NAME, `${base}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, seconds: sec }) }, ctx);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) throw new Error(`${NAME} returned an empty file.`);
    const dur = wavSeconds(bytes) ?? sec;
    return {
      files: [{ path, bytes }],
      index: [{ src: path, kind: 'audio', dur, from: { mode: 'generate', prompt, sec, provider: 'stableaudio', model: MODELS.sfx[0].id } }],
      receipt: { provider: 'stableaudio', model: MODELS.sfx[0].id, src: path, dur, note: 'made on this computer, nothing uploaded' },
    };
  },
};
