// @ts-check
/**
 * Timelines of a project: its own film (the main one) and others made beside it, each a film.html in a folder of its own
 * under parts/ (`parts/tl-<name>`, as a compound clip's film is, parts.mjs). Each opens as a project tab of its own, so
 * the person works in several at once; each leads back to the project it belongs to, whose assets they all use.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { FILM_FILE } from '../../src/film-doc.mjs';
import { PARTS } from './compound.mjs';
import { EMPTY_FILM } from './film.mjs';
import { compoundOuter, writePartFilm } from './parts.mjs';

/** What a timeline's folder starts with, to tell it from a compound clip's film. */
export const TIMELINE_PREFIX = 'tl-';

/** @typedef {{ folder: string, name: string, main: boolean, current: boolean }} Timeline */

/** A timeline's name as it reads: `tl-versao-curta` → `versao curta`. @param {string} folderName */
export const timelineName = (folderName) => folderName.replace(TIMELINE_PREFIX, '').replace(/-+/g, ' ').trim() || folderName;

/**
 * The timelines of the project `projectPath` belongs to (the main one first), and which of them it is.
 * @param {string} projectPath @returns {Promise<{ root: string, timelines: Timeline[] }>}
 */
export async function listTimelines(projectPath) {
  const root = compoundOuter(projectPath);
  const here = resolve(projectPath);
  /** @type {Timeline[]} */
  const timelines = [{ folder: '', name: '', main: true, current: here === resolve(root) }];
  const entries = await readdir(join(root, PARTS), { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !entry.name.startsWith(TIMELINE_PREFIX) || !existsSync(join(root, PARTS, entry.name, FILM_FILE))) continue;
    timelines.push({ folder: `${PARTS}/${entry.name}`, name: timelineName(entry.name), main: false, current: here === resolve(root, PARTS, entry.name) });
  }
  return { root, timelines };
}

/**
 * A new, empty timeline beside the project's own film (its stage and looks the same). Returns where it is.
 * @param {string} projectPath @param {string} name
 */
export async function createTimeline(projectPath, name) {
  const root = compoundOuter(projectPath);
  const folder = await writePartFilm(root, `${TIMELINE_PREFIX}${String(name).trim().slice(0, 60) || 'timeline'}`, EMPTY_FILM);
  return { root, folder, path: join(root, folder), name: timelineName(basename(folder)) };
}

/**
 * Where a timeline is: the project's own folder for the main one (`folder` empty), else a timeline's under parts/.
 * @param {string} projectPath @param {string} folder
 */
export function timelinePath(projectPath, folder) {
  const root = compoundOuter(projectPath);
  if (!folder) return root;
  const m = new RegExp(`^${PARTS}/(${TIMELINE_PREFIX}[^/\\\\]+)$`).exec(folder);
  if (!m || !existsSync(join(root, folder, FILM_FILE))) throw new Error('not a timeline of this project');
  return join(root, folder);
}
