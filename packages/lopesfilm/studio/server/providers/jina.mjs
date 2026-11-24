// @ts-check
/**
 * Jina Search with the person's own key (free tokens on sign-up): web search that answers JSON. `GET s.jina.ai/?q=`
 * (https://jina.ai/reader), key as a bearer token, results without the pages' content (`X-Respond-With: no-content`):
 * the pages are read here, with no service (web.mjs `readPage`).
 */
import { call, serviceUrl, text } from './common.mjs';
import { HITS, fetched, hitOf, queriesOf, readPage, searched, urlsOf } from './web.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Jina Search';
const MODELS = { 'web-search': [{ id: 'web', name: 'Web Search' }] };

/** @type {Provider} */
export default {
  id: 'jina',
  name: NAME,
  env: 'JINA_API_KEY',
  keysUrl: 'https://jina.ai/api-dashboard/',
  billingUrl: 'https://jina.ai/api-dashboard/',
  pricingUrl: 'https://jina.ai/reader/',
  verbs: ['web-search', 'web-fetch'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb === 'web-search') {
      const { queries, ignored } = queriesOf(args);
      const base = serviceUrl('JINA', 'https://s.jina.ai');
      const rows = await Promise.all(queries.map(async (query) => {
        const q = new URLSearchParams({ q: query.slice(0, 400) });
        const body = /** @type {any} */ (await (await call(NAME, `${base}/?${q}`, {
          headers: { accept: 'application/json', authorization: `Bearer ${ctx.key}`, 'x-respond-with': 'no-content' },
        }, ctx)).json());
        const results = Array.isArray(body?.data) ? body.data : [];
        return { query, hits: results.slice(0, HITS).map((/** @type {any} */ r) => hitOf({ title: r?.title, url: r?.url, excerpt: text(r?.description), publishedAt: r?.date })) };
      }));
      return searched('jina', rows, ignored);
    }
    if (verb === 'web-fetch') {
      const { urls, ignored } = urlsOf(args);
      const read = await Promise.all(urls.map(async (url) => {
        try { return { url, page: await readPage(url, ctx), why: '' }; } catch (e) {
          if (ctx.signal.aborted) throw e;
          return { url, page: null, why: /** @type {Error} */ (e).message };
        }
      }));
      return fetched('local', read.flatMap((r) => r.page ? [r.page] : []), read.flatMap((r) => r.page ? [] : [{ url: r.url, why: r.why }]), ignored);
    }
    throw new Error(`${NAME} does not do ${verb}.`);
  },
};
