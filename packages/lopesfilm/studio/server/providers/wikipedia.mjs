// @ts-check
/**
 * Wikipedia (Wikimedia Foundation), no key: its articles found by a search, in the language chosen as the model. Action
 * API (https://www.mediawiki.org/wiki/API:Search). Good for facts, people, places and history, not for the news. Pages are
 * read here, with no service (web.mjs `readPage`).
 */
import { AGENT, call, plain, serviceUrl } from './common.mjs';
import { HITS, fetched, hitOf, queriesOf, readPage, searched, urlsOf } from './web.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Wikipedia';
const MODELS = { 'web-search': [{ id: 'en', name: 'English' }, { id: 'pt', name: 'Português' }, { id: 'es', name: 'Español' }, { id: 'fr', name: 'Français' }, { id: 'de', name: 'Deutsch' }, { id: 'ja', name: '日本語' }, { id: 'zh', name: '中文' }] };

/** @type {Provider} */
export default {
  id: 'wikipedia',
  name: NAME,
  env: 'WIKIPEDIA_TOKEN',
  keysUrl: 'https://www.wikipedia.org/',
  billingUrl: 'https://www.wikipedia.org/',
  pricingUrl: 'https://www.wikipedia.org/',
  keyless: true,
  verbs: ['web-search', 'web-fetch'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb === 'web-search') {
      const { queries, ignored } = queriesOf(args);
      const lang = MODELS['web-search'].find((m) => m.id === ctx.model)?.id ?? 'en';
      const base = serviceUrl('WIKIPEDIA', `https://${lang}.wikipedia.org`);
      const rows = await Promise.all(queries.map(async (query) => {
        const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: query.slice(0, 300), srlimit: String(HITS), format: 'json', utf8: '1', origin: '*' });
        const body = /** @type {any} */ (await (await call(NAME, `${base}/w/api.php?${q}`, { headers: AGENT }, ctx)).json());
        const found = Array.isArray(body?.query?.search) ? body.query.search : [];
        return { query, hits: found.map((/** @type {any} */ r) => hitOf({ title: r?.title, url: `${base}/wiki/${encodeURIComponent(String(r?.title ?? '').replace(/ /g, '_'))}`, excerpt: plain(r?.snippet), publishedAt: r?.timestamp })) };
      }));
      return searched('wikipedia', rows, ignored);
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
