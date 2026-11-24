// @ts-check
/**
 * Captions with nothing else running: Whisper Large v3 Turbo on this computer (Local services, providers/local.mjs).
 * It is the way out when a transcript has no service to make it (none chosen, Voice Studio not running, an online
 * service down or out of balance). The model (about 1.1 GB) is fetched once, the first time it is needed, unless the
 * person turned it off in Settings → Services → Local services: an off model is never fetched behind their back.
 */
import { modelBytesHere, modelEntry, modelFailed, modelOn, modelReady, setModelOn } from '../../../src/local-models.mjs';
import local from './local.mjs';

export const WHISPER = 'whisper-large-v3-turbo';

/** Whether Whisper can serve now or after a fetch: it is listed and not turned off. */
export function whisperAvailable() {
  const m = modelEntry(WHISPER);
  return Boolean(m && modelOn(m));
}

/** Whether Whisper is on this computer and ready to run. */
export function whisperReady() {
  const m = modelEntry(WHISPER);
  return Boolean(m && modelOn(m) && modelReady(m));
}

const sleep = (/** @type {number} */ ms, /** @type {AbortSignal | undefined} */ signal) => new Promise((done) => {
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); done(undefined); }, { once: true });
});

/**
 * Whisper made ready: fetched now when it is not here, waiting for it (progress through `say`). Returns whether it can run.
 * @param {{ say?: (line: string) => void, signal?: AbortSignal, pollMs?: number, limitMs?: number }} [options]
 */
export async function ensureWhisper({ say, signal, pollMs = 2000, limitMs = 45 * 60_000 } = {}) {
  const m = modelEntry(WHISPER);
  if (!m || !modelOn(m)) return false;
  if (!modelReady(m)) {
    const total = m.files.reduce((n, f) => n + f.bytes, 0);
    say?.(`Fetching Whisper Large v3 Turbo (${Math.round(total / 1e6)} MB, once) so the captions are made on this computer…`);
    setModelOn(true, m);
    const began = Date.now();
    let told = -1;
    while (!modelReady(m)) {
      if (signal?.aborted || modelFailed(m) || Date.now() - began > limitMs) return false;
      await sleep(pollMs, signal);
      const percent = Math.min(99, Math.floor((100 * modelBytesHere(m)) / total / 5) * 5);
      if (percent !== told) { told = percent; say?.(`Whisper: ${percent}%`); }
    }
  }
  await local.refresh?.();
  return local.verbs.includes('asr');
}

/** The transcript made by Whisper here. @param {Parameters<typeof local.run>[1]} args @param {Parameters<typeof local.run>[2]} ctx */
export const runWhisper = (args, ctx) => local.run('asr', args, { ...ctx, model: WHISPER });
