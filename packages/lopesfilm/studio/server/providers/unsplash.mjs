// @ts-check
/**
 * Unsplash with the person's own key (free: 50 requests an hour while in development): photos by its photographers.
 * REST API (https://unsplash.com/documentation), the key is the application's access key, sent as `Client-ID`. A search
 * answers with each photo's sizes; the one 1920 px wide is downloaded here, and Unsplash is told of each download, as
 * its guidelines ask. Each photo says who took it and its page.
 */
import { call, clamp, foundPictures, landing, needed, number, serviceUrl, text } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Unsplash';
const MODELS = { 'image-search': [{ id: 'relevant', name: 'Best match' }, { id: 'latest', name: 'Newest' }] };

/** @type {Provider} */
export default {
  id: 'unsplash',
  name: NAME,
  env: 'UNSPLASH_ACCESS_KEY',
  keysUrl: 'https://unsplash.com/oauth/applications',
  billingUrl: 'https://unsplash.com/developers',
  pricingUrl: 'https://unsplash.com/developers',
  verbs: ['image-search'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'image-search') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    landing('image', args.out, 'jpg');
    const asked = Math.round(clamp(number(args.n) ?? 1, 1, 8));
    const order = MODELS['image-search'].find((m) => m.id === ctx.model)?.id ?? 'relevant';
    const query = new URLSearchParams({ query: prompt.slice(0, 200), per_page: String(clamp(asked + 2, 1, 30)), order_by: order, content_filter: 'high' });
    const base = serviceUrl('UNSPLASH', 'https://api.unsplash.com');
    const headers = { authorization: `Client-ID ${ctx.key}`, 'accept-version': 'v1' };
    const body = /** @type {any} */ (await (await call(NAME, `${base}/search/photos?${query}`, { headers }, ctx)).json());
    const results = Array.isArray(body?.results) ? body.results : [];
    const hits = results.flatMap((/** @type {any} */ p) => {
      const raw = text(p?.urls?.raw);
      const url = raw ? `${raw}${raw.includes('?') ? '&' : '?'}w=1920&q=80&fm=jpg` : text(p?.urls?.regular);
      return url ? [{ url, page: text(p?.links?.html), credit: `Photo by ${text(p?.user?.name) || 'unknown'} on Unsplash` }] : [];
    });
    const result = await foundPictures({ service: NAME, provider: 'unsplash', args, hits, notes: [] }, ctx);
    /* told of the downloads, as Unsplash asks; it does not matter if this fails */
    await Promise.all(results.slice(0, asked).map((/** @type {any} */ p) => text(p?.links?.download_location)
      ? fetch(text(p.links.download_location), { headers, signal: ctx.signal }).catch(() => null) : null));
    return result;
  },
};
