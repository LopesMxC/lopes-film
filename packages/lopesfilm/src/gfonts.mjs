// Google fonts for a project's pages (`@remotion/google-fonts/Inter`, or a link to fonts.googleapis.com): fetched once, kept
// in the Lopes.Film folder, and served from there, so a film that used a font renders the same offline afterwards.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { studioHomeDir } from './locations.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/** The scripts a film needs: the others (CJK, Arabic …) are many files; add them by asking. */
const KEEP = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'vietnamese']);
export const gfontsDir = () => join(studioHomeDir(), 'cache', 'gfonts');
const slugOf = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function text(url, headers = {}) {
  const r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
}

/**
 * The stylesheet for `family` (`Inter`, `Open Sans`), its files saved beside it; the `url()`s point at `files/<name>`.
 * Tries the whole weight range first (a variable font), then the usual weights, then the font's default.
 * @returns {Promise<string>} CSS
 */
export async function googleFontCss(family, { dir = gfontsDir(), get = text } = {}) {
  const slug = slugOf(family);
  if (!slug) throw new Error('no font name');
  const css = join(dir, `${slug}.css`);
  if (existsSync(css)) return readFileSync(css, 'utf8');
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  let raw = '';
  for (const q of [`family=${name}:ital,wght@0,100..900;1,100..900`, `family=${name}:wght@100..900`, `family=${name}:ital,wght@0,400;0,700;1,400;1,700`, `family=${name}:wght@400;700`, `family=${name}`]) {
    try { raw = await (await get(`https://fonts.googleapis.com/css2?${q}&display=block`)).text(); break; } catch { /* the next shape of the request */ }
  }
  if (!raw) throw new Error(`Google Fonts has no "${family}" (or this computer is offline)`);
  mkdirSync(join(dir, 'files'), { recursive: true });
  const blocks = [...raw.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].filter((m) => KEEP.has(m[1]));
  const kept = [];
  for (const [, , block] of blocks) {
    const url = /url\((https:\/\/[^)]+)\)/.exec(block)?.[1];
    if (!url) continue;
    const file = `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.woff2`;
    if (!existsSync(join(dir, 'files', file))) writeFileSync(join(dir, 'files', file), Buffer.from(await (await get(url, {})).arrayBuffer()));
    kept.push(block.replace(url, `files/${file}`));
  }
  if (!kept.length) throw new Error(`Google Fonts sent no files for "${family}"`);
  const out = `${kept.join('\n')}\n`;
  writeFileSync(css, out);
  return out;
}

/** A file of a font already fetched (by the name `googleFontCss` gave it). */
export function googleFontFile(name, dir = gfontsDir()) {
  if (!/^[\da-f]{16}\.woff2$/.test(name)) return null;
  try { return readFileSync(join(dir, 'files', name)); } catch { return null; }
}
