// @ts-check
/**
 * Voice Studio (https://github.com/debpalash/voicestudio): a voice studio that runs on the person's own computer, free
 * and offline: voice-over (also with a cloned or designed voice), voices to choose from, and transcription timed word
 * by word. It speaks the OpenAI audio API on http://127.0.0.1:3900 (`/v1/audio/speech`, `/v1/audio/voices`,
 * `/v1/audio/transcriptions`), which asks for no key from this computer. It makes whatever engine is active in it:
 * `tts-1` and `whisper-1` are its names for "the active engine".
 *
 * Connected with one click (`keyless`). The address is VoiceStudio's own, or `LOPESFILM_VOICESTUDIO_URL` (another
 * computer with a GPU). A key, when there is one (Voice Studio's `OMNIVOICE_API_KEY`, for a computer on the network), is
 * sent as a bearer token and only over https or to this computer: a key sent in plain text over a network is no key.
 *
 * Being a program of its own (AGPL-3.0), it is only ever talked to over HTTP: nothing of it is part of this one.
 */
import local from './local.mjs';
import { call, landing, needed, notes, number, round, serviceUrl, speechUpload, text, wavSeconds } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Voice Studio';
const MODELS = {
  tts: [{ id: 'tts-1', name: 'Active engine' }],
  asr: [{ id: 'whisper-1', name: 'Active engine' }],
};
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** The voices Voice Studio answers with, as `lopesfilm get voice` lists them (it answers a list, or `{ voices }`, or `{ data }`). @param {any} body */
export function voicesOf(body) {
  const rows = Array.isArray(body) ? body : Array.isArray(body?.voices) ? body.voices : Array.isArray(body?.data) ? body.data : [];
  return rows.flatMap((/** @type {any} */ v) => {
    const id = text(v?.voice_id) || text(v?.id);
    if (!id) return [];
    /* an id always speaks the voice, a name only when it is unique: the id is what `--voice` is given */
    return [{ voiceId: id, id, name: text(v?.name) || id, language: text(v?.language) || null, gender: text(v?.gender) || null, description: text(v?.description) || null }];
  });
}

/** @type {Provider} */
export default {
  id: 'voicestudio',
  name: NAME,
  env: 'OMNIVOICE_API_KEY',
  keysUrl: 'https://github.com/debpalash/voicestudio',
  billingUrl: 'https://github.com/debpalash/voicestudio',
  verbs: ['voice', 'tts', 'asr'],
  models: MODELS,
  keyless: true,
  pricingUrl: 'https://github.com/debpalash/voicestudio',
  async run(verb, args, ctx) {
    const base = serviceUrl('VOICESTUDIO', 'http://127.0.0.1:3900');
    const url = new URL(base);
    if (ctx.key && url.protocol !== 'https:' && !LOOPBACK.has(url.hostname)) {
      throw new Error(`${NAME}: a key is sent only over https or to this computer, and ${url.origin} is neither.`);
    }
    const headers = /** @type {Record<string, string>} */ (ctx.key ? { authorization: `Bearer ${ctx.key}` } : {});
    const unreachable = (/** @type {Error} */ e) => new Error(`${e.message.replace(/ \(.*$/, '')} Start Voice Studio (it listens on ${url.origin}) and try again.`);
    const send = async (/** @type {string} */ path, /** @type {RequestInit} */ init) => {
      try { return await call(NAME, `${base}${path}`, { ...init, headers: { ...headers, ...init.headers } }, ctx); }
      catch (e) { throw /could not be reached/.test(String(/** @type {Error} */ (e).message)) ? unreachable(/** @type {Error} */ (e)) : e; }
    };

    if (verb === 'voice') {
      const all = voicesOf(await (await send('/v1/audio/voices', { method: 'GET' })).json());
      const ignored = ['language', 'gender', 'prompt'].filter((f) => text(args[f])).map((f) => `--${f} does not narrow Voice Studio's voices`);
      const limit = Math.max(1, Math.round(number(args.limit) ?? (all.length || 1)));
      return {
        files: [],
        index: [],
        receipt: { provider: 'voicestudio', voices: all.slice(0, limit).map((/** @type {any} */ v) => ({ voiceId: v.voiceId, name: v.name, language: v.language, gender: v.gender, description: v.description })), ...notes(ignored) },
      };
    }
    if (verb === 'tts') {
      const voice = needed(args, 'voice');
      const said = needed(args, 'text');
      const path = landing('audio/vo', args.out, 'wav');
      const model = ctx.model || MODELS.tts[0].id;
      const bytes = new Uint8Array(await (await send('/v1/audio/speech', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: said, voice, response_format: 'wav' }),
      })).arrayBuffer());
      const dur = wavSeconds(bytes);
      return {
        files: [{ path, bytes }],
        index: [{ src: path, kind: 'audio', ...(dur !== null ? { dur } : {}), text: said, voice, from: { mode: 'synth', text: said, voice, provider: 'voicestudio', model } }],
        receipt: { provider: 'voicestudio', model, src: path, dur, voice, notes: ['made on this computer by Voice Studio: no word timings, subtitles spread the text over the line'] },
      };
    }
    if (verb === 'asr') {
      const src = needed(args, 'src');
      /* Voice Studio is a program of its own, and may not be running: the transcript is then made by the app's own
         Whisper (Local services), when one of its models is installed, so a film can be captioned with nothing else */
      const viaWhisper = async (/** @type {Error} */ why) => {
        try { return await local.run('asr', args, { ...ctx, model: undefined }); }
        catch { throw why; }
      };
      let upload;
      try { upload = await speechUpload(src, ctx); } catch (e) { return viaWhisper(/** @type {Error} */ (e)); }
      const form = new FormData();
      form.set('model', ctx.model || MODELS.asr[0].id);
      form.set('file', upload.blob, upload.name);
      form.set('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      let body;
      try { body = /** @type {any} */ (await (await send('/v1/audio/transcriptions', { method: 'POST', body: form })).json()); }
      catch (e) { if (/Start Voice Studio/.test(String(/** @type {Error} */ (e).message))) return viaWhisper(/** @type {Error} */ (e)); throw e; }
      const words = (Array.isArray(body?.words) ? body.words : [])
        .filter((/** @type {any} */ w) => Number.isFinite(w?.start) && text(w.word))
        .map((/** @type {any} */ w) => ({ token: text(w.word), start: w.start, end: Number.isFinite(w.end) ? w.end : w.start }));
      const said = text(body?.text);
      return {
        files: [],
        index: [{ src, ...(Number.isFinite(body?.duration) ? { dur: round(body.duration) } : {}), text: said, words, transcribed: true }],
        receipt: { provider: 'voicestudio', model: ctx.model || MODELS.asr[0].id, src, text: said, words: words.length, ...(body?.language ? { language: body.language } : {}) },
      };
    }
    throw new Error(`${NAME} does not do ${verb}.`);
  },
};
