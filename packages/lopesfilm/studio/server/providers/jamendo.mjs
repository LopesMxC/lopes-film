// @ts-check
/**
 * Jamendo with the person's own key (free): music found on the web, licensed for use (Creative Commons), downloaded
 * into the project. REST API v3 (https://developer.jamendo.com/v3.0), the key is the application's `client_id`. A search
 * answers with each track's name, artist, page, licence and download address (`audiodownload`, only for those whose
 * artist allows it). Each track lands with who made it and its licence, the credit the film gives it.
 */
import { call, download, landing, needed, notes, number, serviceUrl, text, clamp, extOf } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Jamendo';
const MODELS = {
  'web-music': [{ id: 'popularity_total', name: 'Most played' }, { id: 'relevance', name: 'Best match' }, { id: 'releasedate_desc', name: 'Newest' }],
};
const MAX_QUERY = 100;

/** A track's licence, as a short credit: "CC BY-NC" from its licence address (https://creativecommons.org/licenses/by-nc/3.0/). */
export function licenceOf(/** @type {unknown} */ url) {
  const m = /creativecommons\.org\/licenses\/([a-z-]+)\//i.exec(text(url));
  return m ? `CC ${m[1].toUpperCase()}` : m === null && text(url) ? text(url) : 'see page';
}

/** @type {Provider} */
export default {
  id: 'jamendo',
  name: NAME,
  env: 'JAMENDO_CLIENT_ID',
  keysUrl: 'https://devportal.jamendo.com/',
  billingUrl: 'https://devportal.jamendo.com/',
  pricingUrl: 'https://devportal.jamendo.com/',
  verbs: ['web-music'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'web-music') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    landing('audio/music', args.out, 'mp3');
    const said = prompt.length > MAX_QUERY ? [`${NAME} searches ${MAX_QUERY} characters at most: the prompt was cut there`] : [];
    const order = MODELS['web-music'].find((m) => m.id === ctx.model)?.id ?? MODELS['web-music'][0].id;
    const asked = Math.round(clamp(number(args.n) ?? 1, 1, 4));
    const query = new URLSearchParams({
      client_id: ctx.key, format: 'json', search: prompt.slice(0, MAX_QUERY), order, audiodownload_allowed: 'true', include: 'licenses',
      /* a few more than asked, so one that cannot be downloaded has a stand-in */
      limit: String(asked + 3),
    });
    const base = serviceUrl('JAMENDO', 'https://api.jamendo.com');
    const res = await call(NAME, `${base}/v3.0/tracks/?${query}`, {}, ctx);
    const body = /** @type {any} */ (await res.json());
    if (body?.headers?.status === 'failed') {
      throw new Error(/client|key|id/i.test(text(body.headers.error_message)) ? `${NAME} did not accept your key. Check it in Studio: Settings (the Lopes.Film logo at the top left) → Services.` : `${NAME}: ${text(body.headers.error_message) || 'the search failed'}`);
    }
    const hits = (Array.isArray(body?.results) ? body.results : []).filter((/** @type {any} */ h) => text(h?.audiodownload));
    /** @type {{ path: string, bytes: Uint8Array }[]} */
    const files = [];
    const index = [];
    const tracks = [];
    for (const h of hits) {
      if (files.length >= asked) break;
      const got = await download(NAME, text(h.audiodownload), ctx).catch((e) => { if (ctx.signal.aborted) throw e; return null; });
      if (!got || !got.bytes.length) continue;
      const stem = text(args.out).replace(/\.[a-z0-9]{2,4}$/i, '');
      const path = landing('audio/music', files.length ? `${stem}_${files.length + 1}` : args.out, extOf(got.type, 'mp3'));
      const dur = Number(h.duration) > 0 ? Number(h.duration) : null;
      const licence = licenceOf(h.license_ccurl);
      const credit = `"${text(h.name)}" by ${text(h.artist_name) || 'unknown'} on Jamendo (${licence})`;
      files.push({ path, bytes: got.bytes });
      index.push({ src: path, kind: 'audio', ...(dur ? { dur } : {}), from: { mode: 'search', prompt, provider: 'jamendo', sourceUrl: text(h.shareurl), credit } });
      tracks.push({ src: path, ...(dur ? { dur } : {}), title: text(h.name), artist: text(h.artist_name), licence, page: text(h.shareurl), credit });
    }
    if (!files.length) throw new Error(`${NAME} found no music for "${prompt}". Try other words.`);
    return { files, index, receipt: { provider: 'jamendo', tracks, asked, landed: files.length, ...notes(said) } };
  },
};
