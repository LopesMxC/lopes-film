/**
 * Newer versions of the programs Lopes.Film fetches from GitHub, taken in by themselves and without a word.
 *
 * What keeps the app from breaking:
 *  - the new version goes to a folder of its own beside the working one; the working one is not touched;
 *  - the download must match the sha256 GitHub publishes for that file (a release without one is left alone);
 *  - a compatibility test runs before the switch: the program must start and name every command this app uses
 *    (`needs`). Commands a new version ADDS do no harm: the app only calls the ones it knows, and what it passes on
 *    to the agent is answered by the program itself. A command this app uses that is gone stops the update;
 *  - the switch is a pointer file (engine-current.mjs). The version before stays; if the new one fails three commands
 *    before any works, the old one is put back and that version is never tried again;
 *  - a version that failed any step is remembered and not retried.
 * Only engines already installed are updated, never installed. LOPESFILM_ENGINE_UPDATES=off turns it all off.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { currentDir, currentVersion, readPointer, writePointer } from './engine-current.mjs';
import { DESIGNS, packageFor } from './designcraft.mjs';
import { runtimeFor as aniRuntime } from './anicraft.mjs';
import { runtimeFor as effectRuntime, findCli } from './effectcraft.mjs';
import { runtimeFor as soundRuntime } from './soundcraft.mjs';
import { exec, fetchTo } from './providers/localimage.mjs';

const models = (/** @type {string} */ name) => join(homedir(), '.lopesfilm', 'models', name);

/**
 * The engines, the repository their releases are in, the version pinned in the module that fetches them, and (for the
 * ones that update by themselves) where they live, the package for this computer and the commands this app uses.
 * @typedef {{ id: string, repo: string, version: string, file: string, auto?: { env: string, base: string, pkg: () => { file: string, exe: string } | null, needs: string[] } }} Source
 * @type {Source[]}
 */
export const SOURCES = [
  { id: 'anicraft', repo: 'storytold/AniCraft', version: '0.2.1', file: 'anicraft.mjs', auto: { env: 'LOPESFILM_ANICRAFT_DIR', base: models('anicraft'), pkg: () => aniRuntime(), needs: ['commands', 'new', 'run', 'exec', 'info', 'render', 'gif', 'render-seq'] } },
  { id: 'effectcraft', repo: 'storytold/effectcraft', version: '0.4.0', file: 'effectcraft.mjs', auto: { env: 'LOPESFILM_EFFECTCRAFT_DIR', base: models('effectcraft'), pkg: () => effectRuntime(), needs: ['commands', 'run', 'script', 'render'] } },
  { id: 'figcraft', repo: 'storytold/figcraft', version: '0.13.1', file: 'designcraft.mjs', auto: { env: DESIGNS.figcraft.env, base: models('figcraft'), pkg: () => packageFor(DESIGNS.figcraft), needs: ['commands', 'run', 'export'] } },
  { id: 'vectorcraft', repo: 'storytold/vectorcraft', version: '0.11.0', file: 'designcraft.mjs', auto: { env: DESIGNS.vectorcraft.env, base: models('vectorcraft'), pkg: () => packageFor(DESIGNS.vectorcraft), needs: ['commands', 'run', 'export'] } },
  { id: 'soundcraft', repo: 'storytold/soundcraft', version: '0.12.1', file: 'soundcraft.mjs', auto: { env: 'LOPESFILM_SOUNDCRAFT_DIR', base: models('soundcraft'), pkg: () => soundRuntime(), needs: ['commands', 'plugins', 'run'] } },
  /* these are other people's tools, frozen for years: only told about */
  { id: 'autoedit', repo: 'WyattBlue/auto-editor', version: '31.6.0', file: 'autoedit.mjs' },
  { id: 'upscale', repo: 'xinntao/Real-ESRGAN', version: '0.2.5.0', file: 'upscale.mjs' },
  { id: 'interpolate', repo: 'nihui/rife-ncnn-vulkan', version: '20221029', file: 'interpolate.mjs' },
];

const EVERY = 12 * 3600_000;
const stateFile = () => process.env.LOPESFILM_ENGINE_UPDATES_CACHE || join(homedir(), '.lopesfilm', 'engine-updates.json');

/** @typedef {{ name: string, size: number, digest?: string, browser_download_url: string }} Asset */
/** @typedef {{ version: string, url: string, assets: Asset[] }} Latest */
/** @typedef {{ at?: number, latest?: Record<string, Latest>, tried?: Record<string, string[]> }} State */

/** @param {string} file @returns {State} */
function loadState(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } }
/** @param {string} file @param {State} state */
function saveState(file, state) { try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(state)); } catch { /* the state is a convenience */ } }

/** Whether `a` is a later version than `b` (dotted numbers; a leading v is ignored). @param {string} a @param {string} b */
export function newerThan(a, b) {
  const part = (/** @type {string} */ v) => v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const x = part(a), y = part(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/** @param {string} repo @param {typeof fetch} get @returns {Promise<Latest | null>} */
async function latestOf(repo, get) {
  const res = await get(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'lopesfilm' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = /** @type {{ tag_name?: string, html_url?: string, prerelease?: boolean, assets?: Asset[] }} */ (await res.json());
  if (!body.tag_name || body.prerelease) return null;
  const assets = (body.assets ?? []).map((a) => ({ name: a.name, size: a.size, digest: a.digest, browser_download_url: a.browser_download_url }));
  return { version: body.tag_name.replace(/^v/i, ''), url: body.html_url ?? `https://github.com/${repo}/releases`, assets };
}

/** The version of `s` in use: the one an update put there, or the one pinned. @param {Source} s */
const versionInUse = (s) => (s.auto ? currentVersion(s.auto.base) : null) ?? s.version;

/**
 * The engines with a newer release than the one in use: `{ id, current, latest, url }`.
 * @param {{ get?: typeof fetch, now?: number, file?: string, sources?: Source[] }} [options]
 * @returns {Promise<{ id: string, current: string, latest: string, url: string }[]>}
 */
export async function engineUpdates({ get = fetch, now = Date.now(), file = stateFile(), sources = SOURCES } = {}) {
  if (process.env.LOPESFILM_ENGINE_UPDATES === 'off') return [];
  const state = loadState(file);
  if (!state.at || now - state.at > EVERY || !state.latest) {
    /** @type {Record<string, Latest>} */
    const latest = {};
    await Promise.all(sources.map(async (s) => {
      try { const l = await latestOf(s.repo, get); if (l) latest[s.id] = l; } catch { /* offline, or GitHub's limit */ }
    }));
    /* nothing read (offline) is not remembered: it is asked again next time */
    if (!Object.keys(latest).length) return [];
    state.at = now; state.latest = latest;
    saveState(file, state);
  }
  return sources.flatMap((s) => {
    const l = state.latest?.[s.id];
    return l && newerThan(l.version, versionInUse(s)) ? [{ id: s.id, current: versionInUse(s), latest: l.version, url: l.url }] : [];
  });
}

/**
 * The compatibility test: the program starts and its help names every command this app uses.
 * @param {string} cli @param {string[]} needs @param {AbortSignal} [signal] @returns {Promise<string | null>} why not, or null when it passes
 */
export async function probe(cli, needs, signal) {
  let help = '';
  for (const args of [['--help'], ['help'], ['-h']]) {
    try { help = await exec(cli, args, signal); if (help.trim()) break; } catch (e) {
      /* many programs print their help and exit non-zero, or to stderr: that is still the help */
      const text = e instanceof Error ? e.message : '';
      if (/usage|commands|options/i.test(text)) { help = text; break; }
    }
  }
  if (!help.trim()) return 'it printed no help to check the commands against';
  const missing = needs.filter((n) => !new RegExp(`(^|[^\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`).test(help));
  return missing.length ? `it no longer has: ${missing.join(', ')}` : null;
}

/** @param {string} archive @param {string} dir @param {AbortSignal} [signal] */
async function unpack(archive, dir, signal) {
  mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') await exec('tar', ['-xf', archive, '-C', dir], signal);
  else if (archive.endsWith('.zip')) await exec('unzip', ['-o', '-q', archive, '-d', dir], signal);
  else await exec('tar', ['-xzf', archive, '-C', dir], signal);
}

/**
 * Take in `latest` for one engine; the working version stays whatever happens. Resolves to what was done.
 * @param {Source} s @param {Latest} latest @param {AbortSignal} [signal]
 * @returns {Promise<{ ok: boolean, why?: string }>}
 */
export async function updateOne(s, latest, signal) {
  const auto = s.auto;
  if (!auto) return { ok: false, why: 'not automatic' };
  const pkg = auto.pkg();
  if (!pkg) return { ok: false, why: 'no package for this computer' };
  const wanted = pkg.file.split(s.version).join(latest.version);
  const asset = latest.assets.find((a) => a.name === wanted);
  const sha = asset?.digest?.match(/^sha256:([0-9a-f]{64})$/i)?.[1];
  if (!asset || !sha || wanted === pkg.file) return { ok: false, why: `no verifiable package ${wanted}` };
  const before = readPointer(auto.base);
  const target = `${auto.base}-${latest.version}`;
  const archive = join(tmpdir(), `lopesfilm-update-${asset.name}`);
  try {
    await fetchTo(asset.browser_download_url, archive, asset.size, sha.toLowerCase(), signal ?? new AbortController().signal);
    rmSync(target, { recursive: true, force: true });
    await unpack(archive, target, signal);
    const cli = findCli(target, pkg.exe);
    if (!cli) throw new Error('the program is not in the package');
    if (process.platform !== 'win32') chmodSync(cli, 0o755);
    const bad = await probe(cli, auto.needs, signal);
    if (bad) throw new Error(bad);
    const was = before ? { version: before.version, dir: before.dir } : { version: s.version, dir: auto.base };
    writePointer(auto.base, { version: latest.version, dir: target, previous: was, trial: true, failures: 0 });
    /* the version before the one just left is no longer needed */
    if (before?.previous && before.previous.dir !== auto.base && before.previous.dir !== was.dir) rmSync(before.previous.dir, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    rmSync(target, { recursive: true, force: true });
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  } finally {
    rmSync(archive, { force: true });
  }
}

/**
 * One round: every installed engine with a newer release is updated, once per version. Never throws.
 * @param {{ get?: typeof fetch, now?: number, file?: string, sources?: Source[], signal?: AbortSignal }} [options]
 * @returns {Promise<{ id: string, version: string, ok: boolean, why?: string }[]>}
 */
export async function updateEngines(options = {}) {
  const { file = stateFile(), sources = SOURCES, signal } = options;
  /** @type {{ id: string, version: string, ok: boolean, why?: string }[]} */
  const done = [];
  try {
    const due = await engineUpdates(options);
    const state = loadState(file);
    for (const u of due) {
      const s = sources.find((x) => x.id === u.id);
      const latest = state.latest?.[u.id];
      if (!s?.auto || !latest || process.env[s.auto.env]) continue;
      if (state.tried?.[s.id]?.includes(latest.version)) continue;
      const pkg = s.auto.pkg();
      if (!pkg || !findCli(currentDir(s.auto.base), pkg.exe)) continue; /* not installed: nothing to update */
      const result = await updateOne(s, latest, signal);
      if (!result.ok) {
        const fresh = loadState(file);
        fresh.tried = { ...fresh.tried, [s.id]: [...(fresh.tried?.[s.id] ?? []), latest.version] };
        saveState(file, fresh);
      }
      done.push({ id: s.id, version: latest.version, ...result });
    }
  } catch { /* an update must never reach the person */ }
  return done;
}

/** A version put back after failing on trial is not tried again. @param {Source[]} [sources] @param {string} [file] */
export function forgetRolledBack(sources = SOURCES, file = stateFile()) {
  for (const s of sources) {
    if (!s.auto || !existsSync(`${s.auto.base}.current.json.rolled-back`)) continue;
    try {
      const { version } = JSON.parse(readFileSync(`${s.auto.base}.current.json.rolled-back`, 'utf8'));
      const state = loadState(file);
      state.tried = { ...state.tried, [s.id]: [...(state.tried?.[s.id] ?? []), version] };
      saveState(file, state);
      rmSync(`${s.auto.base}.current.json.rolled-back`, { force: true });
      rmSync(`${s.auto.base}-${version}`, { recursive: true, force: true });
    } catch { /* none */ }
  }
}

/** Left-over folders of versions no pointer uses (an update that was cut off). @param {Source[]} [sources] */
export function sweep(sources = SOURCES) {
  for (const s of sources) {
    if (!s.auto) continue;
    const parent = dirname(s.auto.base);
    const keep = new Set([s.auto.base, readPointer(s.auto.base)?.dir, readPointer(s.auto.base)?.previous?.dir]);
    let names = /** @type {string[]} */ ([]);
    try { names = readdirSync(parent); } catch { continue; }
    for (const n of names) {
      const p = join(parent, n);
      if (n.startsWith(`${s.id}-`) && /^\d/.test(n.slice(s.id.length + 1)) && !n.endsWith('.json') && !keep.has(p)) rmSync(p, { recursive: true, force: true });
    }
  }
}

let timer = /** @type {NodeJS.Timeout | undefined} */ (undefined);
/** Start the quiet rounds: one a minute after the app is up, then every 12 hours. Safe to call twice. */
export function startEngineUpdates() {
  if (timer || process.env.LOPESFILM_ENGINE_UPDATES === 'off' || process.env.NODE_TEST_CONTEXT) return;
  const round = () => { forgetRolledBack(); sweep(); void updateEngines(); };
  const first = setTimeout(round, 60_000);
  timer = setInterval(round, EVERY);
  first.unref(); timer.unref();
}
