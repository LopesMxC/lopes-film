// @ts-check
/**
 * ACE-Step 1.5 (ACE Studio and StepFun, MIT): music made on this computer, from a description. It runs as its own
 * server, which the person starts (`uv run acestep-api` in its folder: https://github.com/ACE-Step/ACE-Step-1.5), at
 * http://127.0.0.1:8001 or LOPESFILM_ACESTEP_URL. On a 6 GB card its default is right: the 2B turbo model, no language
 * model, INT8 and offload. Here: a task is sent (`POST /release_task`), asked after until it is done
 * (`POST /query_result`) and its file downloaded (`GET /v1/audio`). Instrumental: its lyrics are "[Instrumental]".
 */
import { call, clamp, landing, modelOf, needed, number, sleep, text, download } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'ACE-Step';
const MODELS = { music: [{ id: 'acestep-v15-turbo', name: 'ACE-Step 1.5 Turbo' }, { id: 'acestep-v15-sft', name: 'ACE-Step 1.5 SFT (slower, finer)' }] };
/** how often it is asked, and how long it is waited for */
const EVERY_MS = 2000;
const WAIT_MS = 15 * 60 * 1000;
const START = 'Start the ACE-Step server: in its folder run `uv run acestep-api` (port 8001), then try again.';

/** @type {Provider} */
export default {
  id: 'acestep',
  name: 'ACE-Step (local)',
  env: 'ACESTEP_API_KEY',
  keysUrl: 'https://github.com/ACE-Step/ACE-Step-1.5',
  billingUrl: 'https://github.com/ACE-Step/ACE-Step-1.5',
  pricingUrl: 'https://github.com/ACE-Step/ACE-Step-1.5',
  keyless: true,
  verbs: ['music'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'music') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    const path = landing('audio/music', args.out, 'mp3');
    const model = modelOf(MODELS, 'music', ctx);
    const base = (process.env.LOPESFILM_ACESTEP_URL?.trim() || 'http://127.0.0.1:8001').replace(/\/+$/, '');
    const auth = ctx.key ? { authorization: `Bearer ${ctx.key}` } : {};
    const json = { 'content-type': 'application/json', ...auth };
    /* is it running? */
    await call(NAME, `${base}/health`, { headers: auth }, ctx).catch((e) => {
      if (ctx.signal.aborted) throw e;
      throw new Error(/could not be reached/.test(e.message) ? `${NAME} is not running at ${base}. ${START}` : e.message);
    });
    const sec = Math.round(clamp(number(args.sec) ?? 30, 10, 600));
    const sent = /** @type {any} */ (await (await call(NAME, `${base}/release_task`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ prompt, lyrics: '[Instrumental]', audio_duration: sec, thinking: false, inference_steps: 8, audio_format: 'mp3', batch_size: 1, model }),
    }, ctx)).json());
    const id = text(sent?.data?.task_id);
    if (!id) throw new Error(`${NAME} did not accept the task.`);
    const until = Date.now() + WAIT_MS;
    /** @type {string} */
    let file = '';
    while (!file) {
      if (Date.now() > until) throw new Error(`${NAME} took more than ${WAIT_MS / 60000} minutes: it may be out of memory. Try a shorter piece.`);
      await sleep(EVERY_MS, ctx.signal);
      const polled = /** @type {any} */ (await (await call(NAME, `${base}/query_result`, { method: 'POST', headers: json, body: JSON.stringify({ task_id_list: [id] }) }, ctx)).json());
      const entry = Array.isArray(polled?.data) ? polled.data[0] : null;
      if (entry?.status === 2) throw new Error(`${NAME} could not make it. Look at its window for the reason (a card with little memory: a shorter piece, the Turbo model).`);
      if (entry?.status === 1) {
        let results = [];
        try { results = JSON.parse(text(entry.result)); } catch { /* answered something else */ }
        file = text(results?.[0]?.file);
        if (!file) throw new Error(`${NAME} finished without a file.`);
      }
    }
    const got = await download(NAME, file.startsWith('http') ? file : `${base}${file}`, ctx, { headers: auth });
    if (!got.bytes.length) throw new Error(`${NAME} returned an empty file.`);
    return {
      files: [{ path, bytes: got.bytes }],
      index: [{ src: path, kind: 'audio', dur: sec, from: { mode: 'generate', prompt, sec, provider: 'acestep', model } }],
      receipt: { provider: 'acestep', model, src: path, dur: sec, note: 'made on this computer, nothing uploaded' },
    };
  },
};
