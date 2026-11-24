// @ts-check
/**
 * Coverr with the person's own key (free: 50 requests an hour): stock video clips, free to use in films, with no
 * credit required (it asks apps to link to it, which each result's credit does). REST API (https://api.coverr.co/docs),
 * the key as a bearer token. A search answers with each clip's title, shape and the address of its MP4.
 */
import { call, clamp, foundClips, landing, needed, number, serviceUrl, text } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Coverr';
const MODELS = { 'video-search': [{ id: 'popularity', name: 'Most popular' }, { id: 'date', name: 'Newest' }] };

/** @type {Provider} */
export default {
  id: 'coverr',
  name: NAME,
  env: 'COVERR_API_KEY',
  keysUrl: 'https://coverr.co/developers',
  billingUrl: 'https://coverr.co/developers',
  pricingUrl: 'https://coverr.co/developers',
  verbs: ['video-search'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'video-search') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    landing('video', args.out, 'mp4');
    const orientation = text(args.orientation);
    const sort = MODELS['video-search'].find((m) => m.id === ctx.model)?.id ?? 'popularity';
    const query = new URLSearchParams({ query: prompt.slice(0, 200), page_size: String(clamp(Math.round(number(args.n) ?? 1) + 6, 1, 50)), sort, urls: 'true', api_key: ctx.key });
    const base = serviceUrl('COVERR', 'https://api.coverr.co');
    const body = /** @type {any} */ (await (await call(NAME, `${base}/videos?${query}`, { headers: { authorization: `Bearer ${ctx.key}` } }, ctx)).json());
    const hits = (Array.isArray(body?.hits) ? body.hits : [])
      /* a shape asked for is the clip's own: portrait is vertical, the others are not */
      .filter((/** @type {any} */ h) => !orientation || (orientation === 'portrait') === Boolean(h?.is_vertical))
      .flatMap((/** @type {any} */ h) => {
        const url = text(h?.urls?.mp4_download) || text(h?.urls?.mp4);
        return url ? [{ url, page: 'https://coverr.co', credit: `${text(h.title) ? `"${text(h.title)}" · ` : ''}Video from Coverr`,
          dur: Number(h.duration) > 0 ? Number(h.duration) : null, w: null, h: Number(h.max_height) > 0 ? Number(h.max_height) : null }] : [];
      });
    return foundClips({ service: NAME, provider: 'coverr', args, hits: hits.map((/** @type {any} */ h) => ({ ...h, h: null })), notes: [] }, ctx);
  },
};
