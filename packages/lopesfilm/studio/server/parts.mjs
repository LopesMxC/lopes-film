// @ts-check
/**
 * The films of compound clips, each a film.html in a folder of its own under `parts/` (compound.mjs): written when
 * one is made, read when one is taken apart.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { FILM_FILE, filmHtml, readFilm, readFilmFile } from '../../src/film-doc.mjs';
import { PARTS, srcInto } from './compound.mjs';

/** @typedef {import('./ops.mjs').FilmValue} FilmValue */

/** The head of the film around it, its files named from `folder` (its fonts, its stylesheets): its looks go with it. */
function headFrom(/** @type {string} */ text, /** @type {string} */ folder) {
  const end = text.search(/<body\b/i);
  const head = end >= 0 ? text.slice(0, end) : '';
  return head
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_, q, src) => `url(${q}${srcInto(src, folder)}${q})`)
    .replace(/\b(href|src)=(["'])([^"']+)\2/g, (_, attr, q, src) => `${attr}=${q}${srcInto(src, folder)}${q}`);
}

/** A folder under parts/ no film is in yet: `parts/<name>`, else `parts/<name>-2`… */
function freeFolder(/** @type {string} */ root, /** @type {string} */ name) {
  const stem = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'compound';
  for (let n = 1; ; n++) {
    const folder = `${PARTS}/${n === 1 ? stem : `${stem}-${n}`}`;
    if (!existsSync(join(root, folder))) return folder;
  }
}

/**
 * Write a compound clip's film (its files already named from a folder under parts/) in a new folder there, its head
 * the film's own (its stage, styles and fonts) with only its clips' keyframes. Returns the folder.
 * @param {string} root @param {string} name @param {FilmValue} film
 */
export async function writePartFilm(root, name, film) {
  const { doc, problems } = readFilm(film);
  if (!doc) throw new Error(problems.join('\n'));
  const folder = freeFolder(root, name);
  const own = await readFile(join(root, FILM_FILE), 'utf8').catch(() => '');
  const before = own ? `${headFrom(own, folder)}<body>\n</body>\n</html>\n` : '';
  const text = filmHtml(film, before && readFilmFile(before).doc ? before : '');
  await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, folder, FILM_FILE), text, { flag: 'wx' });
  return folder;
}

/**
 * The project a folder is the compound clip of (its film in `<project>/parts/<name>`), out to the outermost; the folder
 * itself when it is none's. Its films name their files from there (`../../assets/a.mp4`), so they are served from it.
 * @param {string} folder
 */
export function compoundOuter(folder) {
  let at = resolve(folder);
  while (basename(dirname(at)) === PARTS && existsSync(join(dirname(dirname(at)), FILM_FILE))) at = dirname(dirname(at));
  return at;
}

/** A compound clip's film, as it says (`folder`: under parts/, within the project). @param {string} root @param {string} folder */
export async function readPartFilm(root, folder) {
  const at = resolve(root, folder);
  if (!(at.startsWith(resolve(root, PARTS) + sep)) || relative(root, at).split(sep).includes('..')) throw new Error('not a compound clip\'s folder');
  const { value, problems } = readFilmFile(await readFile(join(at, FILM_FILE), 'utf8'));
  if (!value) throw new Error(problems.join('\n'));
  return /** @type {FilmValue} */ (value);
}

/**
 * A timeline or compound film names its files from its own folder (`../../assets/a.mp4`). An agent working in that
 * folder writes `assets/a.mp4` instead, which is not there: the media shows as missing. Each such name whose file is
 * missing beside the film but present in the project around it is rewritten as the film should name it.
 * @param {string} folder the folder of a film (a project's own is left alone)
 * @returns {Promise<boolean>} whether the film was rewritten
 */
export async function rebaseStrays(folder) {
  const outer = compoundOuter(folder);
  const sub = relative(outer, resolve(folder)).split(sep).join('/');
  if (!sub) return false;
  const file = join(folder, FILM_FILE);
  const text = await readFile(file, 'utf8').catch(() => '');
  if (!text) return false;
  let changed = false;
  const fix = (/** @type {string} */ src) => {
    const bare = src.split(/[?#]/)[0] ?? src;
    if (!bare || /^([a-z][a-z0-9+.-]*:|\/|\.\.?\/|#)/i.test(bare) || existsSync(join(folder, bare)) || !existsSync(join(outer, bare))) return src;
    changed = true;
    return srcInto(src, sub);
  };
  const next = text
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, src) => { const s = fix(src); return s === src ? m : `url(${q}${s}${q})`; })
    .replace(/\b(href|src)=(["'])([^"']+)\2/g, (m, attr, q, src) => { const s = fix(src); return s === src ? m : `${attr}=${q}${s}${q}`; });
  if (changed) await writeFile(file, next);
  return changed;
}
