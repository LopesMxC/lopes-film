/**
 * Which folder holds the version of an engine in use. An engine is fetched into `<base>`; an automatic update puts the
 * new version in its own folder beside it and writes `<base>.current.json` pointing there, keeping the one before so a
 * version that does not work can be put back (engine-updates.mjs). With no pointer, or one whose folder is gone, the
 * engine is where it always was.
 *
 * A new version is on trial until one command of it has worked: three failed commands before that put the old one back.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/** @typedef {{ version: string, dir: string, previous?: { version: string, dir: string } | null, trial?: boolean, failures?: number }} Pointer */

const pointerFile = (/** @type {string} */ base) => `${base}.current.json`;
/** folders on trial, to the base they belong to */
const onTrial = new Map();

/** @param {string} base @returns {Pointer | null} */
export function readPointer(base) {
  try {
    const p = /** @type {Pointer} */ (JSON.parse(readFileSync(pointerFile(base), 'utf8')));
    return p && typeof p.dir === 'string' && typeof p.version === 'string' && existsSync(p.dir) ? p : null;
  } catch { return null; }
}

/** @param {string} base @param {Pointer} pointer */
export function writePointer(base, pointer) {
  const file = pointerFile(base);
  writeFileSync(`${file}.tmp`, JSON.stringify(pointer));
  renameSync(`${file}.tmp`, file);
  if (pointer.trial) onTrial.set(pointer.dir, base); else onTrial.delete(pointer.dir);
}

/** The folder of the version in use. @param {string} base */
export function currentDir(base) {
  const p = readPointer(base);
  if (!p) return base;
  if (p.trial) onTrial.set(p.dir, base);
  return p.dir;
}

/** The version in use, when an update put it there (otherwise the one the program pins). @param {string} base */
export const currentVersion = (base) => readPointer(base)?.version ?? null;

/** Put the version before back, once the one in use has failed on trial. @param {string} base */
export function rollBack(base) {
  const p = readPointer(base);
  if (!p) return;
  onTrial.delete(p.dir);
  if (p.previous && existsSync(p.previous.dir)) writePointer(base, { version: p.previous.version, dir: p.previous.dir, previous: null, trial: false, failures: 0 });
  else { try { renameSync(pointerFile(base), `${pointerFile(base)}.bad`); } catch { /* none */ } }
  try { writeFileSync(`${pointerFile(base)}.rolled-back`, JSON.stringify({ version: p.version, at: Date.now() })); } catch { /* a note only */ }
}

/**
 * Called by every command the program runs: a command of a version on trial that worked ends the trial; three that
 * failed before any worked take the version back.
 * @param {string} cmd the program that ran @param {boolean} ok
 */
export function noteCommand(cmd, ok) {
  if (!onTrial.size) return;
  for (const [dir, base] of onTrial) {
    if (!cmd.startsWith(dir)) continue;
    const p = readPointer(base);
    if (!p || !p.trial) { onTrial.delete(dir); continue; }
    if (ok) { writePointer(base, { ...p, trial: false, failures: 0 }); continue; }
    const failures = (p.failures ?? 0) + 1;
    if (failures >= 3) rollBack(base); else writePointer(base, { ...p, failures });
  }
}
