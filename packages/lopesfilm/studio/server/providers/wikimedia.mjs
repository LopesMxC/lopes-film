// @ts-check
/**
 * Wikimedia Commons (Wikimedia Foundation): millions of free pictures and videos, no key. MediaWiki API
 * (https://www.mediawiki.org/wiki/API:Search): a search of the file namespace, with each file's address, size, author
 * and licence. Pictures come at most 1920 px wide; clips are the WebM or MP4 files it has. Each result says who made it
 * and its licence, the credit the film gives it.
 */
import { AGENT, call, clamp, foundClips, foundPictures, landing, needed, number, plain, serviceUrl, shapeNote, text } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Wikimedia Commons';
const MODELS = { 'image-search': [{ id: 'bitmap', name: 'Photos and drawings' }], 'video-search': [{ id: 'video', name: 'Videos' }] };

/** @type {Provider} */
export default {
  id: 'wikimedia',
  name: NAME,
  env: 'WIKIMEDIA_TOKEN',
  keysUrl: 'https://commons.wikimedia.org/',
  billingUrl: 'https://commons.wikimedia.org/',
  pricingUrl: 'https://commons.wikimedia.org/',
  keyless: true,
  verbs: ['image-search', 'video-search'],
  models: MODELS,
  async run(verb, args, ctx) {
    if (verb !== 'image-search' && verb !== 'video-search') throw new Error(`${NAME} does not do ${verb}.`);
    const videos = verb === 'video-search';
    const prompt = needed(args, 'prompt');
    landing(videos ? 'video' : 'image', args.out, videos ? 'mp4' : 'jpg');
    const query = new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${prompt.slice(0, 200)} filetype:${videos ? 'video' : 'bitmap'}`,
      gsrlimit: String(clamp(Math.round(number(args.n) ?? 1) + 4, 1, 30)), prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata',
      ...(videos ? {} : { iiurlwidth: '1920' }), origin: '*',
    });
    const base = serviceUrl('WIKIMEDIA', 'https://commons.wikimedia.org');
    const body = /** @type {any} */ (await (await call(NAME, `${base}/w/api.php?${query}`, { headers: AGENT }, ctx)).json());
    const pages = Object.values(body?.query?.pages ?? {}).sort((/** @type {any} */ a, /** @type {any} */ b) => (a.index ?? 0) - (b.index ?? 0));
    const rows = pages.flatMap((/** @type {any} */ p) => {
      const info = p?.imageinfo?.[0];
      if (!info) return [];
      const meta = info.extmetadata ?? {};
      const author = plain(meta.Artist?.value) || 'unknown';
      const credit = `"${text(p.title).replace(/^File:/, '').replace(/\.[a-z0-9]{2,4}$/i, '')}" by ${author} (${plain(meta.LicenseShortName?.value) || 'see page'}) via Wikimedia Commons`;
      return [{ info, credit, page: text(info.descriptionurl) }];
    });
    if (videos) {
      const hits = rows.filter((r) => /^video\/(webm|mp4)$/.test(text(r.info.mime))).map((r) => ({
        url: text(r.info.url), page: r.page, credit: r.credit, dur: Number(r.info.duration) > 0 ? Number(r.info.duration) : null,
        w: r.info.width > 0 ? r.info.width : null, h: r.info.height > 0 ? r.info.height : null, headers: AGENT,
      }));
      return foundClips({ service: NAME, provider: 'wikimedia', args, hits, notes: shapeNote(args, NAME) }, ctx);
    }
    const hits = rows.filter((r) => /^image\/(jpeg|png|webp)$/.test(text(r.info.mime))).map((r) => ({
      url: text(r.info.thumburl) || text(r.info.url), page: r.page, credit: r.credit, headers: AGENT,
    }));
    return foundPictures({ service: NAME, provider: 'wikimedia', args, hits, notes: [] }, ctx);
  },
};
