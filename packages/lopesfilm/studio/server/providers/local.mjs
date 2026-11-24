// @ts-check
/**
 * Local services as a provider: transcripts (asr) by Whisper and backgrounds taken out of pictures (cutout) by IS-Net,
 * run on this computer, free and offline. It takes no key: it is connected while one of its models is installed and on
 * (Settings → Services → Local services; src/local-models.mjs), and makes only the kinds it has such a model of, with
 * those models. Each run is a process of its own (src/local-run.mjs).
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelEntry, modelOn, modelReady } from '../../../src/local-models.mjs';
import { ffmpeg } from '../../../src/shared.mjs';
import { timedWords } from '../../../src/local-asr.mjs';
import { pyInstalled, runPyTool } from '../pytools.mjs';
import { landing, madePicture, needed, round } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider @typedef {import('./contract.mjs').Verb} Verb */

const NAME = 'Local services';
/** Every model it could run, by kind, the default first. */
const ALL = /** @type {Partial<Record<Verb, { id: string, name: string }[]>>} */ ({
  asr: [{ id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo' }, { id: 'whisper-small', name: 'Whisper Small' }],
  cutout: [{ id: 'isnet-general', name: 'IS-Net' }],
});

/** Whisper's models as faster-whisper names them (it fetches them itself, the first time). */
const FAST = /** @type {Record<string, string>} */ ({ 'whisper-large-v3-turbo': 'large-v3-turbo', 'whisper-small': 'small' });
/** Fast transcription installed (pytools `whisperfast`): the graphics card, or every core, in place of one core. */
const fast = () => { try { return pyInstalled('whisperfast'); } catch { return false; } };

/** The models installed and on, by kind: with fast transcription, each Whisper (it fetches its own). */
function usable() {
  return Object.fromEntries(Object.entries(ALL).map(([verb, models]) => [verb, (models ?? []).filter((m) => {
    if (verb === 'asr' && fast()) return true;
    const entry = modelEntry(m.id);
    return entry && modelReady(entry) && modelOn(entry);
  })]));
}

/**
 * What was said in `wav` by faster-whisper: on the graphics card when it can, else every core. Its words as
 * local-asr's (timedWords: characters of Chinese and Japanese timed one by one, one script).
 * @param {string} wav @param {string} id @param {number} seconds @param {AbortSignal} signal
 */
async function transcribeFast(wav, id, seconds, signal) {
  const out = await runPyTool('whisperfast', [wav, FAST[id] ?? 'large-v3-turbo'], { signal, timeoutMs: 3 * 60 * 60 * 1000 });
  const said = JSON.parse(out.split('\n').at(-1) ?? '{}');
  if (!said.ok) throw new Error(said.error ?? 'the transcription stopped');
  return { ...timedWords(said.chunks ?? [], seconds), language: said.language, device: said.device };
}

/** The kinds with a model. @param {Partial<Record<Verb, unknown[]>>} models */
const kinds = (models) => /** @type {Verb[]} */ (Object.keys(models).filter((verb) => (models[/** @type {Verb} */ (verb)] ?? []).length > 0));

const RUN = fileURLToPath(new URL('../../../src/local-run.mjs', import.meta.url));

/** A model run (local-run.mjs), stopped with `signal`; what it printed, or a sentence saying why it failed. */
export function runLocal(/** @type {string[]} */ args, /** @type {AbortSignal} */ signal) {
  return new Promise((done, fail) => {
    execFile(process.execPath, [RUN, ...args], { signal, maxBuffer: 64 << 20, windowsHide: true, env: process.versions.electron ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env }, (e, stdout) => {
      const line = String(stdout).trim().split('\n').at(-1) ?? '';
      let out = null;
      try { out = JSON.parse(line); } catch { /* it died before it said */ }
      if (out && !out.error) done(out);
      else fail(new Error(out?.error ?? (signal.aborted ? 'stopped' : `the model stopped: ${e?.message ?? 'no answer'}`)));
    });
  });
}

/** @type {Provider} */
export default {
  id: 'local',
  name: NAME,
  env: '',
  keysUrl: '',
  billingUrl: '',
  /* the kinds it has a model of now (refresh), and those models */
  verbs: kinds(usable()),
  models: usable(),
  ready: () => kinds(usable()).length > 0,
  refresh: async function () { this.models = usable(); this.verbs = kinds(this.models); },
  async run(verb, args, ctx) {
    const models = usable()[verb] ?? [];
    const model = models.find((m) => m.id === ctx.model) ?? models[0];
    if (!model) throw new Error(`No local model for ${verb} is installed and on: install one in Studio (Settings → Services → Local services).`);
    const tmp = await mkdtemp(join(tmpdir(), 'lopesfilm-local-'));
    try {
      if (verb === 'asr') {
        const src = needed(args, 'src');
        const samples = join(tmp, 'speech.f32');
        ctx.say(`Transcribing on this computer with ${model.name}…`);
        await ffmpeg(['-i', join(ctx.root, src), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', samples], { what: 'reading the speech' }).done;
        const seconds = (await readFile(samples)).length / 4 / 16000;
        /** @type {{ text: string, words: { token: string, start: number, end: number }[] }} */
        let said;
        if (fast()) {
          const wav = join(tmp, 'speech.wav');
          await ffmpeg(['-f', 'f32le', '-ar', '16000', '-ac', '1', '-i', samples, '-c:a', 'pcm_s16le', wav], { what: 'reading the speech' }).done;
          try { said = await transcribeFast(wav, model.id, seconds, ctx.signal); }
          catch (e) {
            if (ctx.signal.aborted) throw e;
            /* fast transcription failed (a broken install): the Whisper of before, as it always worked */
            ctx.say(`Fast transcription failed (${e instanceof Error ? e.message : e}); transcribing the slow way…`);
            said = await runLocal(['asr', model.id, samples], ctx.signal);
          }
        } else said = await runLocal(['asr', model.id, samples], ctx.signal);
        const { text, words } = said;
        return {
          files: [],
          index: [{ src, dur: round(seconds), text, words, transcribed: true }],
          receipt: { provider: 'local', model: model.id, src, text, words: words.length },
        };
      }
      if (verb === 'cutout') {
        const src = needed(args, 'src');
        const path = landing('image', args.out, 'png');
        const out = join(tmp, 'cutout.png');
        ctx.say(`Taking the background out on this computer with ${model.name}…`);
        const { kept } = /** @type {{ kept: number }} */ (await runLocal(['cutout', model.id, join(ctx.root, src), out], ctx.signal));
        const made = madePicture({ path, bytes: new Uint8Array(await readFile(out)), prompt: '', provider: 'local', model: model.id,
          notes: kept < 0.01 ? ['Almost nothing was kept: the model found no one thing the picture is of.'] : [] });
        return { ...made, index: made.index.map((row) => ({ ...row, from: { mode: 'cutout', src, provider: 'local', model: model.id } })) };
      }
      throw new Error(`${NAME} does not do ${verb}.`);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  },
};

