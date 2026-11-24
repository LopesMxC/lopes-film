// @ts-check
/**
 * SearXNG (open source metasearch): web search through an instance of the person's own, on this computer or one they
 * trust, no key. Its address is LOPESFILM_SEARXNG_URL (http://127.0.0.1:8080 when not set). The instance must answer
 * JSON: `search: formats: [html, json]` in its settings.yml. Pages are read here, with no service (web.mjs `readPage`).
 */
import { call, serviceUrl, text } from './common.mjs';
import { HITS, fetched, hitOf, queriesOf, readPage, searched, urlsOf } from './web.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'SearXNG';
const MODELS = { 'web-search': [{ id: 'general', name: 'General' }, { id: 'news', name: 'News' }, { id: 'science', name: 'Science' }] };

/** @type {Provider} */
export default {
  id: 'searxng',
  name: NAME,
  env: 'SEARXNG_API_KEY',
  keysUrl: 'https://docs.searxng.org/admin/installation.html',
  billingUrl: 'https://docs.searxng.org/',
  pricingUrl: 'https://docs.searxng.org/',
  keyless: true,
  verbs: ['web-search', 'web-fetch'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb === 'web-search') {
      const { queries, ignored } = queriesOf(args);
      const base = serviceUrl('SEARXNG', 'http://127.0.0.1:8080');
      const category = MODELS['web-search'].find((m) => m.id === ctx.model)?.id ?? 'general';
      const rows = await Promise.all(queries.map(async (query) => {
        const q = new URLSearchParams({ q: query.slice(0, 400), format: 'json', categories: category });
        const res = await call(NAME, `${base}/search?${q}`, { headers: ctx.key ? { authorization: `Bearer ${ctx.key}` } : {} }, ctx).catch((e) => {
          if (ctx.signal.aborted) throw e;
          throw /\(403\)|answered 403/.test(e.message) ? new Error(`${NAME} refused JSON: turn it on in the instance's settings.yml (search → formats: html, json).`) : e;
        });
        const body = /** @type {any} */ (await res.json());
        const results = Array.isArray(body?.results) ? body.results : [];
        return { query, hits: results.slice(0, HITS).map((/** @type {any} */ r) => hitOf({ title: r?.title, url: r?.url, excerpt: text(r?.content), publishedAt: r?.publishedDate })) };
      }));
      return searched('searxng', rows, ignored);
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
