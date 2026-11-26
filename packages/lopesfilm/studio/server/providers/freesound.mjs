// @ts-check
/**
 * Freesound with the person's own API key (free): sound effects and music found on the web, licensed for use (Creative
 * Commons), downloaded into the project. API v2 (https://freesound.org/docs/api/); the key is the application's API key
 * (its "client secret"), sent as `token`. The previews (high quality MP3) need only that token; the original files
 * would need a sign-in, so the preview is what lands. Each sound lands with who made it and its licence, the credit the
 * film gives it. Serves `web-music` (`--kind music|sfx`, music by default) and the Library's Freesound tab (freesound-route.mjs).
 */
import { call, download, landing, needed, notes, number, serviceUrl, text, clamp } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Freesound';
const MODELS = {
  'web-music': [{ id: 'score', name: 'Best match' }, { id: 'downloads_desc', name: 'Most downloaded' }, { id: 'rating_desc', name: 'Best rated' }, { id: 'created_desc', name: 'Newest' }],
};
const FIELDS = 'id,name,username,license,duration,url,previews,tags,description,avg_rating,num_downloads';
export const base = () => serviceUrl('FREESOUND', 'https://freesound.org');

/** A licence address as a short credit: ".../licenses/by-nc/4.0/" → "CC BY-NC 4.0"; zero → "CC0". */
export function licenceOf(/** @type {unknown} */ url) {
  const u = text(url);
  if (/publicdomain\/zero/i.test(u)) return 'CC0';
  const m = /licenses\/([a-z-]+)\/([\d.]+)/i.exec(u);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : u || 'see page';
}

/**
 * The query of a search: sound effects are short (under 30 s), music long (over 30 s).
 * @param {string} kind
 */
export const lengthFilter = (kind) => (kind === 'sfx' ? 'duration:[0 TO 30]' : 'duration:[30 TO 600]');

/**
 * One search at Freesound: the sounds found, each as the Library's tab and `get` show them.
 * @param {{ key: string, query: string, kind: string, order?: string, page?: number, limit?: number, signal: AbortSignal }} o
 */
export async function search({ key, query, kind, order = 'score', page = 1, limit = 15, signal }) {
  const q = new URLSearchParams({
    query: query.slice(0, 120), token: key, fields: FIELDS, page_size: String(limit), page: String(Math.max(1, page)),
    sort: order, filter: lengthFilter(kind),
  });
  const res = await call(NAME, `${base()}/apiv2/search/text/?${q}`, {}, { key, signal });
  const body = /** @type {any} */ (await res.json());
  const found = (Array.isArray(body?.results) ? body.results : []).map((/** @type {any} */ h) => ({
    id: Number(h.id), name: text(h.name), by: text(h.username), licence: licenceOf(h.license), dur: Number(h.duration) || 0,
    page: text(h.url), preview: text(h.previews?.['preview-hq-mp3']) || text(h.previews?.['preview-lq-mp3']),
    tags: Array.isArray(h.tags) ? h.tags.slice(0, 6).map(text) : [], downloads: Number(h.num_downloads) || 0,
  })).filter((/** @type {any} */ h) => h.preview);
  return { count: Number(body?.count) || 0, next: Boolean(body?.next), found };
}

/** @type {Provider} */
export default {
  id: 'freesound',
  name: NAME,
  env: 'FREESOUND_API_KEY',
  keysUrl: 'https://freesound.org/apiv2/apply/',
  billingUrl: 'https://freesound.org/apiv2/apply/',
  pricingUrl: 'https://freesound.org/help/faq/',
  verbs: ['web-music'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'web-music') throw new Error(`${NAME} does not do ${verb}.`);
    const kind = text(args.kind) === 'sfx' ? 'sfx' : 'music';
    const dir = kind === 'sfx' ? 'audio/sfx' : 'audio/music';
    const asked = Math.round(clamp(number(args.n) ?? 1, 1, 4));
    /** @type {any[]} */
    let hits;
    if (number(args.id)) {
      /* one sound by its Freesound id (the Library tab's pick) */
      const res = await call(NAME, `${base()}/apiv2/sounds/${Math.round(Number(args.id))}/?${new URLSearchParams({ token: ctx.key, fields: FIELDS })}`, {}, ctx);
      const h = /** @type {any} */ (await res.json());
      hits = [{ id: Number(h.id), name: text(h.name), by: text(h.username), licence: licenceOf(h.license), dur: Number(h.duration) || 0, page: text(h.url), preview: text(h.previews?.['preview-hq-mp3']) }];
    } else {
      const prompt = needed(args, 'prompt');
      const order = MODELS['web-music'].find((m) => m.id === ctx.model)?.id ?? MODELS['web-music'][0].id;
      hits = (await search({ key: ctx.key, query: prompt, kind, order, limit: asked + 3, signal: ctx.signal })).found;
    }
    /** @type {{ path: string, bytes: Uint8Array }[]} */
    const files = [];
    const index = [];
    const tracks = [];
    const label = text(args.prompt) || (hits[0]?.name ?? '');
    for (const h of hits) {
      if (files.length >= asked) break;
      if (!h.preview) continue;
      const got = await download(NAME, h.preview, ctx).catch((e) => { if (ctx.signal.aborted) throw e; return null; });
      if (!got || !got.bytes.length) continue;
      const stem = text(args.out).replace(/\.[a-z0-9]{2,4}$/i, '');
      const path = landing(dir, files.length ? `${stem}_${files.length + 1}` : args.out, 'mp3');
      const credit = `"${h.name}" by ${h.by || 'unknown'} on Freesound (${h.licence})`;
      files.push({ path, bytes: got.bytes });
      index.push({ src: path, kind: 'audio', ...(h.dur ? { dur: h.dur } : {}), from: { mode: 'search', prompt: label, provider: 'freesound', sourceUrl: h.page, credit } });
      tracks.push({ src: path, ...(h.dur ? { dur: h.dur } : {}), title: h.name, artist: h.by, licence: h.licence, page: h.page, credit });
    }
    if (!files.length) throw new Error(`${NAME} found no ${kind === 'sfx' ? 'sound effect' : 'music'} for "${label}". Try other words (English works best).`);
    return { files, index, receipt: { provider: 'freesound', kind, tracks, asked, landed: files.length, skill: 'freesound', ...notes(['credit every sound in the film\'s end; read the freesound skill']) } };
  },
};
