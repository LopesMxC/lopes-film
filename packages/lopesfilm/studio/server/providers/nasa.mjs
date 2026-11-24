// @ts-check
/**
 * NASA Image and Video Library (images.nasa.gov), no key: NASA's pictures and videos, mostly in the public domain.
 * https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf. A search answers with each item's details and the address
 * of its list of files; the large picture, or the medium-sized clip, is picked from that list. Each says who made it
 * and its page. Some items are another's (the library says so in its copyright field): check the page before using one.
 */
import { call, clamp, foundClips, foundPictures, landing, needed, number, serviceUrl, shapeNote, text } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'NASA';
const MODELS = { 'image-search': [{ id: 'image', name: 'NASA pictures' }], 'video-search': [{ id: 'video', name: 'NASA videos' }] };

/** The first of the file addresses that ends with one of `suffixes`, in that order, as https. @param {string[]} files @param {RegExp[]} suffixes */
const pick = (files, suffixes) => {
  for (const s of suffixes) { const f = files.find((u) => s.test(u)); if (f) return f.replace(/^http:\/\/(images-[a-z]+\.nasa\.gov)/, 'https://$1'); }
  return '';
};

/** @type {Provider} */
export default {
  id: 'nasa',
  name: NAME,
  env: 'NASA_API_KEY',
  keysUrl: 'https://api.nasa.gov/',
  billingUrl: 'https://api.nasa.gov/',
  pricingUrl: 'https://images.nasa.gov/',
  keyless: true,
  verbs: ['image-search', 'video-search'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'image-search' && verb !== 'video-search') throw new Error(`${NAME} does not do ${verb}.`);
    const videos = verb === 'video-search';
    const prompt = needed(args, 'prompt');
    landing(videos ? 'video' : 'image', args.out, videos ? 'mp4' : 'jpg');
    const asked = Math.round(clamp(number(args.n) ?? 1, 1, 8));
    const query = new URLSearchParams({ q: prompt.slice(0, 200), media_type: videos ? 'video' : 'image', page_size: String(clamp(asked + 3, 1, 20)) });
    const base = serviceUrl('NASA', 'https://images-api.nasa.gov');
    const body = /** @type {any} */ (await (await call(NAME, `${base}/search?${query}`, {}, ctx)).json());
    const items = (Array.isArray(body?.collection?.items) ? body.collection.items : []).filter((/** @type {any} */ i) => text(i?.href) && i?.data?.[0]);
    /* each item's file list, asked together */
    const found = await Promise.all(items.map(async (/** @type {any} */ i) => {
      try {
        const files = /** @type {unknown} */ (await (await call(NAME, text(i.href).replace(/^http:\/\/(images-[a-z]+\.nasa\.gov)/, 'https://$1'), {}, ctx)).json());
        const list = Array.isArray(files) ? files.filter((f) => typeof f === 'string') : [];
        const url = videos ? pick(list, [/~large\.mp4$/i, /~medium\.mp4$/i, /~mobile\.mp4$/i, /~small\.mp4$/i]) : pick(list, [/~large\.jpg$/i, /~medium\.jpg$/i, /~orig\.jpg$/i]);
        const d = i.data[0];
        const who = text(d.photographer) || text(d.secondary_creator) || text(d.center) || 'NASA';
        return url ? [{ url, page: `https://images.nasa.gov/details/${encodeURIComponent(text(d.nasa_id))}`, credit: `${text(d.title) ? `"${text(d.title)}" · ` : ''}${who} / NASA` }] : [];
      } catch (e) { if (ctx.signal.aborted) throw e; return []; }
    }));
    const hits = found.flat();
    return videos
      ? foundClips({ service: NAME, provider: 'nasa', args, hits: hits.map((h) => ({ ...h, dur: null, w: null, h: null })), notes: shapeNote(args, NAME) }, ctx)
      : foundPictures({ service: NAME, provider: 'nasa', args, hits, notes: [] }, ctx);
  },
};
