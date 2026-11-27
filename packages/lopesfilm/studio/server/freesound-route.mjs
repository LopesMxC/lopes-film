// @ts-check
/**
 * The Library's Freesound tab: `GET /api/freesound/search?q=&kind=all|sfx|music&order=&page=` (all, the default: the whole library) → { connected, count, next, found: [{ id,
 * name, by, licence, dur, page, preview, tags, downloads }] }. The key is the one kept in Settings → Services (or
 * FREESOUND_API_KEY); it never leaves this computer, a preview is a public address that plays with no key. With no key:
 * `{ connected: false }` and the tab says where to connect it. Putting a sound on the film is `get web-music --via freesound --id`.
 */
import { HttpError, json } from './http.mjs';
import { providerKey, readSettings } from './keys.mjs';
import freesound, { search } from './providers/freesound.mjs';

/** @param {import('./http.mjs').Req} req @param {import('./http.mjs').Res} res @param {string[]} parts @param {URL} url */
export async function freesoundRoute(req, res, parts, url) {
  if (parts[0] !== 'search' || req.method !== 'GET') throw new HttpError(404, 'Not found');
  const key = providerKey(freesound, await readSettings())?.key;
  if (!key) return json(res, 200, { connected: false, count: 0, next: false, found: [] });
  /* `all` (the default) is the whole library: no length filter, and with no words it is browsed, most downloaded first */
  const asked = url.searchParams.get('kind');
  const kind = asked === 'sfx' ? 'sfx' : asked === 'music' ? 'music' : 'all';
  const query = (url.searchParams.get('q') ?? '').trim();
  const picked = ['score', 'downloads_desc', 'rating_desc', 'created_desc'].includes(url.searchParams.get('order') ?? '') ? String(url.searchParams.get('order')) : 'score';
  const order = !query && picked === 'score' ? 'downloads_desc' : picked;
  const page = Math.max(1, Math.round(Number(url.searchParams.get('page')) || 1));
  try {
    return json(res, 200, { connected: true, ...(await search({ key, query, kind, order, page, limit: 20, signal: AbortSignal.timeout(20_000) })) });
  } catch (e) {
    throw new HttpError(502, String(/** @type {Error} */ (e).message));
  }
}
