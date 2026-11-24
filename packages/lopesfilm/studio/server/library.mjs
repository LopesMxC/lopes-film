// @ts-check
/**
 * Lopes.Film's library: the transitions, effects, text, stickers, looks and sounds that come with Lopes.Film (library/ in
 * this package), read-only, shown in the assets drawer beside the project's media and Saved.
 *
 *   library/index.json   what is in it: each thing's id (its place in library/), its category and group, its name in
 *                        each language, and what it is —
 *                          page   a bundle as Saved keeps one (saved.json, files/, poster.jpg, preview.mp4)
 *                          sound  a file (sounds/<name>.m4a), its waveform in sounds/waves/<name>.png
 *                          look   a CSS `filter`, written into a clip's style
 *                          fade   one of Studio's transitions (ui lib/transitions), made of fades
 *                        and, for a thing someone sent to the library, `by`: their GitHub name (the drawer shows it
 *                        as the community's; without it, a thing is Lopes.Film's own)
 *   library/<id>/…       the things themselves
 *   library/stickers.json  emoji stickers, each a bundle under stickers/emoji/ (published with the library likewise)
 *   library/audio.json   more sounds and music, as index.json says its own (`audio/<sfx|music>/<name>.mp3`, each with its
 *                        waveform beside it in waves/), the files published with the library rather than kept in git
 *                        (fetchLibrary: fetched on first use, like the voices' samples and the emoji stickers)
 *   library/voices.json  the voices to speak a voice-over in: the ready-made voices of the voice-over services Lopes.Film
 *                        offers, each with its service's own sample (voices/<service>/<voice>.m4a); made by
 *                        scripts/library-voices.mjs from those services' own lists
 *
 * The things the person starred are kept in the shared prefs.json (`libraryFavorites`, their ids), so every Lopes.Film on
 * this computer shows the same ones.
 *
 * A thing is taken into a project as a thing of Saved is (saved.mjs takeSaved), by its path `lopesfilm/<id>`: copied,
 * a bundle's files to `saved/lopesfilm/<id as one name>/` there (`effects-snow`), a file into assets/. Nothing here is
 * ever written.
 */
import { createWriteStream, existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { communityCatalog, communityReady, fetchCommunity, isCommunity, refreshCommunity } from './community-library.mjs';
import { setSharedPref, sharedHome, sharedPref } from '../../src/locations.mjs';
import { SKILL_UID } from '../../src/skills.mjs';
import { packDir, packInstalled } from './packs.mjs';

export { refreshCommunity };

/** What a path names the library by (`lopesfilm/<id>`), as `saved/` names Saved. */
export const BUILT_IN = 'lopesfilm';

/** The library's folder. */
export const builtInRoot = () => process.env.LOPESFILM_BUILT_IN_LIBRARY || fileURLToPath(new URL('../../library', import.meta.url));

/**
 * The library's parts too big to come with the package (git-ignored, left out of npm): its sounds and music (`audio/`),
 * its voices' samples (`voices/`), its emoji stickers (`stickers/emoji/`), the models Local services runs (`models/`,
 * src/local-models.mjs), each template's example with its music (`examples/`). Each is fetched on first use from the
 * library's host and kept in the shared home, once for every Lopes.Film on this computer; a bundle (a sticker) comes
 * with the list of its files, `files.json` beside it there, written when the library is published.
 */
const PUBLISHED = ['audio/', 'voices/', 'stickers/emoji/', 'models/', 'examples/'];
/** A place in the library: names of letters, digits, dots, dashes and underscores, between slashes. */
const SAFE_PLACE = /^[\w.-]+(?:\/[\w.-]+)*$/;

/** The Lopes.Film library on the developer's own site (scripts/library-mirror.mjs copies it there). */
export const OWN_LIBRARY = 'https://lightgoldenrodyellow-wombat-163159.hostingersite.com/library';
/** The original host, asked only for what the own site does not have (yet). */
export const ORIGIN_LIBRARY = 'https://openfilm.dev/library';
/**
 * Where the published parts come from, in order: LOPESFILM_LIBRARY_URL alone when set; else the own site first and the
 * original host behind it.
 */
export const libraryHosts = () => (process.env.LOPESFILM_LIBRARY_URL ? [process.env.LOPESFILM_LIBRARY_URL] : [OWN_LIBRARY, ORIGIN_LIBRARY]).map((h) => h.replace(/\/+$/, ''));
/** @type {Map<string, number>} A host that failed to answer is skipped for a while, so a missing site costs one try. */
const hostDown = new Map();

/**
 * A published file's response from the first host that has it. A site that answers a missing file with a web page
 * (status 200, text/html) does not count as having it.
 * @param {string} rel @param {number} ms
 */
export async function fetchPublished(rel, ms) {
  const path = rel.split('/').map(encodeURIComponent).join('/');
  const hosts = libraryHosts();
  /** @type {Response | null} */ let last = null;
  /** @type {unknown} */ let error = null;
  for (const [i, host] of hosts.entries()) {
    const final = i === hosts.length - 1;
    if (!final && (hostDown.get(host) ?? 0) > Date.now()) continue;
    try {
      const res = await fetch(`${host}/${path}`, { signal: AbortSignal.timeout(final ? ms : Math.min(ms, 20_000)) });
      const page = /text\/html/i.test(res.headers.get('content-type') ?? '') && !/\.html?$/i.test(rel);
      if (res.ok && !page) return res;
      await res.body?.cancel().catch(() => {});
      last = res;
    } catch (e) {
      error = e;
      if (!final) hostDown.set(host, Date.now() + 5 * 60_000);
    }
  }
  if (last) return last;
  throw error ?? new Error(`no host has ${rel}`);
}

/**
 * Where a model's file is fetched from when it comes from its maker's own home (library/model-sources.json, made by
 * scripts/local-models-sources.mjs: Hugging Face, and the npm packages on jsDelivr); null for what only the library's host has.
 * @param {string} rel @returns {string | null}
 */
export function sourceOf(rel) {
  try {
    const url = JSON.parse(readFileSync(join(builtInRoot(), 'model-sources.json'), 'utf8'))[rel];
    return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
  } catch { return null; }
}

/** Where the fetched ones are kept. */
export const libraryCache = () => process.env.LOPESFILM_LIBRARY_CACHE || join(sharedHome(), 'library');

/**
 * A place under one of the library's folders, as a path: never one that leaves it (`..`, an absolute path, a link out
 * of it). Not files.mjs's `inside`, whose project rules (and what it loads) a search has no need of.
 * @param {string} root @param {string} rel
 */
function inside(root, rel) {
  if (!rel || rel.includes('\0')) throw new Error('which file?');
  const at = resolve(root, normalize(rel.split('/').join(sep)));
  const back = relative(root, at);
  const out = (/** @type {string} */ path) => !path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
  if (out(back) || (existsSync(at) && out(relative(realpathSync(root), realpathSync(at))))) throw new Error(`${rel} is not in the library`);
  return at;
}

/** A place of the library on this computer: in the package, else among the fetched ones; null for neither. */
function located(/** @type {string} */ rel) {
  const pack = packFile(rel);
  if (pack) return pack;
  for (const root of [builtInRoot(), libraryCache()]) {
    let at;
    try { at = inside(root, rel); } catch { return null; }
    if (existsSync(at)) {
      /* A failed bundle stays resumable, but is not offered as complete. Older complete caches need no marker. */
      if (root === libraryCache() && statSync(at).isDirectory() && existsSync(join(at, '.partial'))) continue;
      return at;
    }
  }
  return null;
}

/** @type {Map<string, string>} Why the last fetch of a place failed, for whoever has to say so. */
const fetchErrors = new Map();
export const fetchError = (/** @type {string} */ rel) => fetchErrors.get(rel) ?? '';
/** @type {Map<string, Promise<string | null>>} */
const fetching = new Map();
/** @type {Map<string, Promise<void>>} A bundle and its card's poster can ask for the same file concurrently. */
const filesFetching = new Map();

/** @param {string} rel */
function fetchFile(rel) {
  const pending = filesFetching.get(rel);
  if (pending) return pending;
  if (located(rel)) return Promise.resolve();
  const job = downloadFile(rel).finally(() => filesFetching.delete(rel));
  filesFetching.set(rel, job);
  return job;
}

/** One file of the published library into the cache: whole or not at all. */
async function downloadFile(/** @type {string} */ rel) {
  /* a model is a hundred megabytes: time for a slow line */
  const ms = rel.startsWith('models/') ? 30 * 60_000 : 60_000;
  const source = sourceOf(rel);
  const res = source ? await fetch(source, { signal: AbortSignal.timeout(ms) }) : await fetchPublished(rel, ms);
  if (!res.ok) throw new Error(`the library's ${rel} came back ${res.status}`);
  const at = inside(libraryCache(), rel);
  await mkdir(dirname(at), { recursive: true });
  const part = `${at}.part-${process.pid}`;
  /* written as it comes: how far a model is can be read off its size (local-models.mjs) */
  try {
    await pipeline(Readable.fromWeb(/** @type {import('node:stream/web').ReadableStream} */ (res.body)), createWriteStream(part));
  } catch (e) {
    await rm(part, { force: true });
    throw e;
  }
  await rename(part, at);
}

/**
 * A place of the library on this computer (a file, or a bundle's folder), fetched first when it is a published part
 * not fetched yet; null when it is neither here nor fetchable (offline, or no such thing).
 */
export function fetchLibrary(/** @type {unknown} */ rel) {
  if (typeof rel !== 'string' || !rel || !SAFE_PLACE.test(rel) || rel.split('/').some((part) => part === '..' || part === '.')) return Promise.resolve(null);
  if (isCommunity(rel)) return fetchCommunity(libraryCache(), rel);
  const was = fetching.get(rel);
  if (was) return was;
  const here = located(rel);
  if (here || !PUBLISHED.some((part) => rel.startsWith(part))) return Promise.resolve(here);
  const job = (async () => {
    try {
      /* a file has a name with a dot; a bundle is a folder, its files listed beside it */
      if (/\.[a-z0-9]+$/i.test(rel)) await fetchFile(rel);
      else {
        const res = await fetchPublished(`${rel}/files.json`, 30_000);
        if (!res.ok) return null;
        const files = /** @type {unknown} */ (await res.json());
        if (!Array.isArray(files)) return null;
        const folder = inside(libraryCache(), rel);
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, '.partial'), '');
        for (const file of files) if (typeof file === 'string') await fetchFile(`${rel}/${file}`);
        await rm(join(folder, '.partial'), { force: true });
      }
      return located(rel);
    } catch (e) {
      fetchErrors.set(rel, e instanceof Error ? `${e.message}${e.cause instanceof Error ? ` (${e.cause.message})` : ''}` : String(e));
      return null;
    } finally {
      fetching.delete(rel);
    }
  })();
  fetching.set(rel, job);
  return job;
}

/**
 * What of the library a thing needs here before it can be put in: its own file or bundle when that is a published part
 * (a sound, a piece of music, an emoji), and a template's music. None for what comes with the package.
 * @param {{ id: string, music?: string }} item
 */
export function partsOf(item) {
  return [...((isCommunity(item.id) || PUBLISHED.some((part) => item.id.startsWith(part))) ? [item.id] : []), ...(typeof item.music === 'string' ? [item.music] : [])];
}

/** Of the things `ids`, those not all here yet (to be fetched before they are put in). @param {unknown} ids */
export function notHere(ids) {
  if (!Array.isArray(ids)) return [];
  const byId = new Map((/** @type {{ items: { id: string, music?: string }[] }} */ (libraryIndex())).items.map((i) => [i.id, i]));
  return ids.filter((id) => {
    if (typeof id !== 'string') return false;
    const item = byId.get(id);
    if (item) return partsOf(item).some((rel) => isCommunity(rel) ? !communityReady(libraryCache(), rel) : !located(rel));
    /* The samples and examples are played directly and are not items in the add-to-project index. */
    return /^(voices|examples)\//.test(id) && SAFE_PLACE.test(id) && !id.split('/').some((part) => part === '..' || part === '.') && !located(id);
  });
}

/** Fetch an indexed asset's dependencies or a template's published preview. @param {unknown} id */
export async function fetchItem(id) {
  if (typeof id !== 'string') return false;
  if (isCommunity(id)) await refreshCommunity();
  const items = /** @type {{ items: { id: string, kind?: string, music?: string }[] }} */ (libraryIndex()).items;
  if (id.startsWith('examples/') && id.endsWith('.mp4')) {
    const template = items.find((item) => item.id === id.slice('examples/'.length, -'.mp4'.length) && item.kind === 'group');
    return Boolean(template && await fetchLibrary(id));
  }
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  for (const rel of partsOf(item)) if (!(await fetchLibrary(rel))) return false;
  return true;
}

/** @type {Map<string, { mtime: number, value: unknown }>} */
const kept = new Map();

/** A JSON file of the library as it is (`empty` when there is none); read again when it changes. @param {string} name @param {unknown} empty */
function read(name, empty) {
  const file = join(builtInRoot(), name);
  if (!existsSync(file)) return empty;
  const mtime = statSync(file).mtimeMs;
  const was = kept.get(file);
  if (was?.mtime === mtime) return was.value;
  const value = JSON.parse(readFileSync(file, 'utf8'));
  kept.set(file, { mtime, value });
  return value;
}

/**
 * The library's other catalogs, each written by its script or by hand: its things shown with the index's own. The
 * sounds and music (audio.json), the emoji (stickers.json), and each catalog in catalogs/ (stickers, effects,
 * transitions, text, templates made as pages), by its name.
 */
export const catalogFiles = () => ['audio.json', 'stickers.json',
  ...(existsSync(join(builtInRoot(), 'catalogs')) ? readdirSync(join(builtInRoot(), 'catalogs')).filter((f) => f.endsWith('.json')).sort().map((f) => `catalogs/${f}`) : [])];

/** @type {{ parts: unknown[], index: unknown } | null} */
let merged = null;

/** The free sound-effects packs (packs.mjs), once installed: their files are the library's, by `packs/<pack>/<place in the pack>`. */
const SOUND_PACKS = [
  { id: 'sfx', root: 'sounds', label: 'SFX Kit', folders: /** @type {Record<string, string>} */ ({}) },
  { id: 'ui', root: '', label: 'Kenney', folders: { interface: 'Interface', ui: 'UI Audio' } },
];
const PACK_SOUND = /^packs\/(sfx|ui)\/(.+)$/;
function packFile(/** @type {string} */ rel) {
  const m = PACK_SOUND.exec(rel);
  if (!m || !packInstalled(m[1])) return null;
  try {
    const at = inside(packDir(m[1]), m[2]);
    return existsSync(at) && statSync(at).isFile() && /\.(wav|mp3|ogg)$/i.test(at) ? at : null;
  } catch { return null; }
}

const titled = (/** @type {string} */ slug) => slug.replace(/\.[^.]+$/, '').split(/[-_]+/).filter(Boolean).map((w, i) => (i ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
/** @type {Map<string, { key: string, catalog: { groups: Record<string, { id: string, name: Record<string, string> }[]>, items: unknown[] } | null }>} */
const packSounds = new Map();

/** An installed sound pack as a catalog for the Sounds tab: a group for each of its folders, a sound for each audio file. */
function packSoundCatalog(/** @type {typeof SOUND_PACKS[number]} */ pack) {
  if (!packInstalled(pack.id)) return null;
  const base = join(packDir(pack.id), pack.root);
  let key = '';
  try { key = String(statSync(base).mtimeMs); } catch { return null; }
  const had = packSounds.get(pack.id);
  if (had?.key === key) return had.catalog;
  const groups = new Map();
  const items = [];
  try {
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(wav|mp3|ogg)$/i.test(entry.name)) continue;
      const folder = relative(base, entry.parentPath ?? entry.path).split(sep)[0] || 'misc';
      const group = `pack-${pack.id}-${folder}`.replace(/[^\w-]/g, '-');
      if (!groups.has(group)) groups.set(group, { id: group, name: { en: `${pack.label} · ${pack.folders[folder] ?? titled(folder)}` } });
      const rel = `packs/${pack.id}/${pack.root ? `${pack.root}/` : ''}${folder === 'misc' ? '' : `${folder}/`}${entry.name}`;
      items.push({ id: rel, cat: 'sound', group, name: { en: titled(entry.name) }, kind: 'sound' });
    }
  } catch { return null; }
  items.sort((a, b) => /** @type {any} */ (a).id.localeCompare(/** @type {any} */ (b).id, undefined, { numeric: true }));
  const catalog = { groups: { sound: [...groups.values()] }, items };
  packSounds.set(pack.id, { key, catalog });
  return catalog;
}

/**
 * The library's index: library/index.json, and the things of each other catalog with it (the sounds and music of
 * audio.json, the emoji of stickers.json): their groups after its own, their things after its own.
 */
export function libraryIndex() {
  const own = /** @type {{ version: number, groups: Record<string, unknown[]>, items: unknown[] }} */ (read('index.json', { version: 1, groups: {}, items: [] }));
  const more = /** @type {({ groups?: Record<string, { id: string }[]>, items?: unknown[] } | null)[]} */ (catalogFiles().map((name) => read(name, null)));
  more.push(communityCatalog());
  for (const pack of SOUND_PACKS) more.push(packSoundCatalog(pack));
  const parts = [own, ...more];
  if (merged && merged.parts.length === parts.length && merged.parts.every((p, i) => p === parts[i])) return merged.index;
  const groups = { ...own.groups };
  const items = [...own.items];
  for (const catalog of more) {
    if (!catalog) continue;
    for (const [cat, list] of Object.entries(catalog.groups ?? {})) {
      const have = new Set((/** @type {{ id: string }[]} */ (groups[cat] ?? [])).map((g) => g.id));
      groups[cat] = [...(groups[cat] ?? []), ...list.filter((g) => !have.has(g.id))];
    }
    items.push(...(catalog.items ?? []));
  }
  merged = { parts, index: { ...own, groups, items } };
  return merged.index;
}

/** The voices as library/voices.json has them: the services (each with its voice-over models) and their voices. */
export const libraryVoices = () => read('voices.json', { version: 1, providers: [], voices: [] });

/** A voice's id among the starred things: `voice:<service>/<its id there>`. */
export const voiceKey = (/** @type {{ provider: string, id: string }} */ v) => `voice:${v.provider}/${v.id}`;

/** Every id a star can be on: the index's things and the voices. */
function starrable() {
  return new Set([
    ...(/** @type {{ items: { id: string }[] }} */ (libraryIndex())).items.map((item) => item.id),
    ...(/** @type {{ voices: { provider: string, id: string }[] }} */ (libraryVoices())).voices.map(voiceKey),
  ]);
}

/** A file of the library on this computer by its place there (a poster, a preview, a page, a sound), or null when there is none. */
export function libraryFile(/** @type {unknown} */ rel) {
  if (typeof rel !== 'string' || !rel) return null;
  const file = located(rel);
  return file && statSync(file).isFile() ? file : null;
}

/** libraryFile, fetching it first when it is a published part not here yet (fetchLibrary). */
export async function libraryFileFetched(/** @type {unknown} */ rel) {
  const file = await fetchLibrary(rel);
  return file && statSync(file).isFile() ? file : null;
}

/** Where the starred things are kept in the shared prefs.json. */
const FAVORITES = 'libraryFavorites';

/** Skill stars outlive a catalog refresh or a change of project; they are shown when that uid is available again. */
const skillFavorite = (/** @type {string} */ id) => id.startsWith('skill:') && SKILL_UID.test(id.slice(6));

/** The ids the person starred, in order: available library things and voices, and skills by their uid. */
export function libraryFavorites() {
  const starred = sharedPref(FAVORITES);
  const ids = starrable();
  return Array.isArray(starred) ? [...new Set(starred.filter((id) => typeof id === 'string' && (ids.has(id) || skillFavorite(id))))] : [];
}

/** Keep valid skill ids and available library things as favorites. Returns them as kept. */
export function setLibraryFavorites(/** @type {unknown} */ ids) {
  const known = starrable();
  const next = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string' && (known.has(id) || skillFavorite(id))))] : [];
  setSharedPref(FAVORITES, next);
  return next;
}

