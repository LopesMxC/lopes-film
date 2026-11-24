// @ts-check
/**
 * Openverse (WordPress, open source): pictures and music under Creative Commons or in the public domain, found across
 * Flickr, Wikimedia, museums and Jamendo. No key needed (anonymous use is rate limited; a token pasted as the key lifts
 * it). https://docs.openverse.org/. The model is the licence filter. Each result says who made it and its licence, the
 * credit the film gives it.
 */
import { call, clamp, download, extOf, foundPictures, landing, needed, notes, number, plain, serviceUrl, text } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Openverse';
const MODELS = {
  'image-search': [{ id: 'commercial', name: 'Free for commercial use' }, { id: 'all', name: 'Any open licence' }],
  'web-music': [{ id: 'commercial', name: 'Free for commercial use' }, { id: 'all', name: 'Any open licence' }],
};

/** "CC BY 4.0" from a result's licence and version. @param {any} h */
const licence = (h) => ['CC', text(h?.license).toUpperCase(), text(h?.license_version)].filter(Boolean).join(' ').replace(/^CC (CC0|PDM)/, '$1');

/** @type {Provider} */
export default {
  id: 'openverse',
  name: NAME,
  env: 'OPENVERSE_TOKEN',
  keysUrl: 'https://api.openverse.org/v1/#tag/auth',
  billingUrl: 'https://openverse.org/',
  pricingUrl: 'https://openverse.org/',
  keyless: true,
  verbs: ['image-search', 'web-music'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'image-search' && verb !== 'web-music') throw new Error(`${NAME} does not do ${verb}.`);
    const music = verb === 'web-music';
    const prompt = needed(args, 'prompt');
    const asked = Math.round(clamp(number(args.n) ?? 1, 1, music ? 4 : 8));
    landing(music ? 'audio/music' : 'image', args.out, music ? 'mp3' : 'jpg');
    const filter = MODELS[verb].find((m) => m.id === ctx.model)?.id ?? 'commercial';
    const query = new URLSearchParams({ q: prompt.slice(0, 200), page_size: String(clamp(asked + 3, 1, 20)), mature: 'false',
      ...(filter === 'commercial' ? { license_type: 'commercial' } : {}), ...(music ? { category: 'music' } : {}) });
    const base = serviceUrl('OPENVERSE', 'https://api.openverse.org');
    const body = /** @type {any} */ (await (await call(NAME, `${base}/v1/${music ? 'audio' : 'images'}/?${query}`, { headers: ctx.key ? { authorization: `Bearer ${ctx.key}` } : {} }, ctx)).json());
    const results = Array.isArray(body?.results) ? body.results : [];
    if (!music) {
      const hits = results.flatMap((/** @type {any} */ h) => text(h?.url) ? [{ url: text(h.url), page: text(h.foreign_landing_url),
        credit: `"${plain(h.title) || 'Untitled'}" by ${plain(h.creator) || 'unknown'} (${licence(h)}) via Openverse` }] : []);
      return foundPictures({ service: NAME, provider: 'openverse', args, hits, notes: [] }, ctx);
    }
    /** @type {{ path: string, bytes: Uint8Array }[]} */
    const files = [];
    const index = [];
    const tracks = [];
    for (const h of results) {
      if (files.length >= asked) break;
      if (!text(h?.url)) continue;
      const got = await download(NAME, text(h.url), ctx).catch((e) => { if (ctx.signal.aborted) throw e; return null; });
      if (!got || !got.bytes.length) continue;
      const stem = text(args.out).replace(/\.[a-z0-9]{2,4}$/i, '');
      const path = landing('audio/music', files.length ? `${stem}_${files.length + 1}` : args.out, extOf(got.type, 'mp3'));
      const dur = Number(h.duration) > 0 ? Math.round(Number(h.duration)) / 1000 : null;
      const credit = `"${plain(h.title) || 'Untitled'}" by ${plain(h.creator) || 'unknown'} (${licence(h)}) via Openverse`;
      files.push({ path, bytes: got.bytes });
      index.push({ src: path, kind: 'audio', ...(dur ? { dur } : {}), from: { mode: 'search', prompt, provider: 'openverse', sourceUrl: text(h.foreign_landing_url), credit } });
      tracks.push({ src: path, ...(dur ? { dur } : {}), title: plain(h.title), artist: plain(h.creator), licence: licence(h), page: text(h.foreign_landing_url), credit });
    }
    if (!files.length) throw new Error(`${NAME} found no music for "${prompt}". Try other words.`);
    return { files, index, receipt: { provider: 'openverse', tracks, asked, landed: files.length, ...notes([]) } };
  },
};
