// @ts-check
/**
 * The files of the models that run on this computer (Settings → Services → Local services): each model a list of files of
 * the published library, with their size and sha256, fetched together into the library's cache for every Lopes.Film
 * here (studio/server/library.mjs fetchLibrary), checked, and kept until the person removes them.
 *
 *   library/local-models.json   { models: [{ id, files: [{ path, bytes, sha256 }] }] }, a runtime file shared by
 *                               several listed with each
 *
 * Beside a model's files, in the cache's models/ folder: `<id>.json` while its fetch runs (`{ pid, at }`) or after it
 * failed (`{ failed }`), `<id>.<digest>.ok` once every file checked, and `<id>.off` while it is turned off (kept, not
 * used, and never fetched by itself). A fetch runs in a process of its own (`node src/local-models.mjs fetch <id>`),
 * so it outlives the request that began it.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { builtInRoot, fetchError, fetchLibrary, libraryCache, libraryFile } from '../studio/server/library.mjs';

/** @typedef {{ path: string, bytes: number, sha256: string }} ModelFile */
/** @typedef {{ id: string, files: ModelFile[] }} ModelEntry */

const readJson = (/** @type {string} */ name) => { try { return JSON.parse(readFileSync(join(builtInRoot(), name), 'utf8')); } catch { return null; } };

/** Every model listed. @returns {ModelEntry[]} */
export function modelEntries() {
  const listed = readJson('local-models.json');
  return Array.isArray(listed?.models) ? listed.models : [];
}

/** One model listed, by its id; null for none. */
export const modelEntry = (/** @type {string} */ id) => modelEntries().find((m) => m.id === id) ?? null;

const marks = () => join(libraryCache(), 'models');
/** Where what the fetching knows is kept: `{ pid, at }` while it runs, `{ failed }` after it failed. */
const stateFile = (/** @type {ModelEntry} */ m) => join(marks(), `${m.id}.json`);
/** The mark of a model whose every file was checked, named for what is listed of them. */
const okFile = (/** @type {ModelEntry} */ m) => join(marks(), `${m.id}.${createHash('sha256').update(m.files.map((f) => f.sha256).join()).digest('hex').slice(0, 12)}.ok`);
/** The mark of a model turned off, or removed: not used, and not fetched by itself. */
const offFile = (/** @type {ModelEntry} */ m) => join(marks(), `${m.id}.off`);

/** Whether every file of the model is part of this checkout's library (a source checkout's: it cannot be removed). */
export const modelBuiltIn = (/** @type {ModelEntry} */ m) => m.files.every((f) => libraryFile(f.path)?.startsWith(builtInRoot()));

/** Whether the model can run here: every file of it on this computer, and checked (or part of this checkout's library). */
export function modelReady(/** @type {ModelEntry} */ m) {
  const files = m.files.map((f) => libraryFile(f.path));
  if (files.some((f) => !f)) return false;
  return files.every((f) => f?.startsWith(builtInRoot())) || existsSync(okFile(m));
}

/** Where the model's file `path` is on this computer (it is ready). */
export const modelFile = (/** @type {string} */ path) => /** @type {string} */ (libraryFile(path));

/** Whether the model is to be used: not turned off. */
export const modelOn = (/** @type {ModelEntry} */ m) => !existsSync(offFile(m));

/** How long a failed fetch waits before it is tried by itself again. */
const RETRY_MS = 60 * 60_000;
/** A fetch running longer than this has died. */
const STALE_MS = 2 * 60 * 60_000;

const alive = (/** @type {number} */ pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const stateOf = (/** @type {ModelEntry} */ m) => {
  try { return /** @type {{ pid?: number, at?: number, failed?: number }} */ (JSON.parse(readFileSync(stateFile(m), 'utf8'))); } catch { return {}; }
};

/** Whether the model's fetch is running now (one that died, or failed, is not). */
export function modelFetching(/** @type {ModelEntry} */ m) {
  const state = stateOf(m);
  return Boolean(state.pid && state.at && Date.now() - state.at < STALE_MS && alive(state.pid));
}

/** Why the model's last fetch failed, as it said ('' when it did not say). */
export const modelWhy = (/** @type {ModelEntry} */ m) => String(/** @type {{ why?: string }} */ (stateOf(m)).why ?? '');

/** Whether the model's last fetch failed (in the last hour: it is not tried by itself again until then). */
export const modelFailed = (/** @type {ModelEntry} */ m) => Boolean(stateOf(m).failed && Date.now() - /** @type {number} */ (stateOf(m).failed) < RETRY_MS);

/**
 * Whether the model is coming: 'ready', 'fetching' (begun now, or still running), or 'off' (turned off, or it failed
 * lately). Starts the fetch when it is due: `start` runs it (a process of its own by default).
 * @param {ModelEntry} m @param {{ start?: () => void }} [o]
 * @returns {'ready' | 'fetching' | 'off'}
 */
export function modelState(m, o = {}) {
  if (!modelOn(m)) return 'off';
  if (modelReady(m)) return 'ready';
  if (modelFailed(m)) return 'off';
  if (modelFetching(m)) return 'fetching';
  mkdirSync(marks(), { recursive: true });
  (o.start ?? (() => startFetch(m)))();
  return 'fetching';
}

/** The model turned on (fetched now when it is not here) or off (kept, not used). */
export function setModelOn(/** @type {boolean} */ on, /** @type {ModelEntry} */ m) {
  mkdirSync(marks(), { recursive: true });
  if (on) {
    rmSync(offFile(m), { force: true });
    /* a fetch that failed lately is tried again at once: the person asked for it */
    if (!modelFetching(m)) rmSync(stateFile(m), { force: true });
    modelState(m);
  } else writeFileSync(offFile(m), '');
}

/** The model's fetched files thrown away (a runtime another model still has stays), and the model turned off. */
export function removeModel(/** @type {ModelEntry} */ m) {
  setModelOn(false, m);
  const kept = new Set(modelEntries().filter((o) => o.id !== m.id && modelReady(o)).flatMap((o) => o.files.map((f) => f.path)));
  for (const f of m.files) {
    const file = libraryFile(f.path);
    if (file && !kept.has(f.path) && !file.startsWith(builtInRoot())) rmSync(file, { force: true });
  }
  rmSync(okFile(m), { force: true });
  rmSync(stateFile(m), { force: true });
}

/** How much of the model is on this computer, in bytes: its files here, and what is written of the one coming. */
export function modelBytesHere(/** @type {ModelEntry} */ m) {
  let bytes = 0;
  for (const f of m.files) {
    if (libraryFile(f.path)) { bytes += f.bytes; continue; }
    const at = join(libraryCache(), f.path);
    try {
      for (const name of readdirSync(dirname(at))) if (name.startsWith(`${basename(at)}.part-`)) bytes += statSync(join(dirname(at), name)).size;
    } catch { /* its folder is not made yet */ }
  }
  return bytes;
}

/** The fetch, in a process of its own that outlives what began it. */
function startFetch(/** @type {ModelEntry} */ m) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'fetch', m.id], {
    detached: true, stdio: 'ignore', windowsHide: true,
    /* inside the desktop app process.execPath is the app itself: without this it would open another window, not fetch */
    /* NODE_USE_SYSTEM_CA: the computer's own certificates, as a browser trusts them (an antivirus or a proxy that reads
       HTTPS puts its own in there; Node alone trusts only its bundled ones and says "self signed certificate in chain") */
    env: { ...process.env, NODE_USE_SYSTEM_CA: '1', ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
  });
  /* said at once, so that what asks next finds it coming before it has begun */
  if (child.pid) writeFileSync(stateFile(m), JSON.stringify({ pid: child.pid, at: Date.now() }));
  child.unref();
}

const sha256 = async (/** @type {string} */ file) => {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
};

/**
 * Every file of the model fetched into the library's cache and checked against its list: one that does not check is
 * thrown away. Marks the model checked when all are; says it failed otherwise. Returns whether it is ready.
 */
export async function fetchModel(/** @type {ModelEntry} */ m) {
  mkdirSync(marks(), { recursive: true });
  writeFileSync(stateFile(m), JSON.stringify({ pid: process.pid, at: Date.now() }));
  let why = '';
  try {
    for (const f of m.files) {
      /* a line that drops, or an older copy left in the cache (another list's file of the same name): thrown away and fetched again */
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        const here = libraryFile(f.path);
        if (here && !here.startsWith(builtInRoot()) && statSync(here).size !== f.bytes) rmSync(here, { force: true });
        const file = await fetchLibrary(f.path);
        if (!file) { why = `${f.path}: ${fetchError(f.path) || 'could not be fetched'}`; continue; }
        if (file.startsWith(builtInRoot())) { ok = true; break; }
        if (await sha256(file) === f.sha256) ok = true;
        else { rmSync(file, { force: true }); why = `${f.path} is not what its list says`; }
      }
      if (!ok) throw new Error(why);
    }
    writeFileSync(okFile(m), '');
    rmSync(stateFile(m), { force: true });
    return true;
  } catch {
    if (/certificate/i.test(why)) why += ' — something on this computer (an antivirus that scans HTTPS, or a proxy) answers in place of huggingface.co; allow huggingface.co and cdn.jsdelivr.net in it, or turn its HTTPS scanning off for this app';
    console.error(`${m.id}: ${why}`);
    writeFileSync(stateFile(m), JSON.stringify({ failed: Date.now(), why }));
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'fetch') {
  const m = modelEntry(String(process.argv[3]));
  process.exitCode = m && (await fetchModel(m)) ? 0 : 1;
}
