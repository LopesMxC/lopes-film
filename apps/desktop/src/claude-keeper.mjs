/**
 * The Claude Code sign-ins, kept so that nothing the app does (an update, a crash, a process stopped in the middle of
 * a token's renewal) takes them away. Each sign-in is a file Claude Code writes in its folder (`.credentials.json`, and
 * `.claude.json` beside it or in the home folder); this keeps a copy of each in the app's own data folder, outside
 * the account folders, and puts it back when the live one is missing or broken. A copy is made only of a sign-in that
 * reads as a whole (it has its refresh token), the last two are kept, and nothing is ever deleted but by `forget`, which
 * only the person's own "remove this account" calls. Never logged, never sent anywhere.
 *
 * Reads no Electron module, so `node --test` can use it.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CREDENTIALS = '.credentials.json';
const STATE = '.claude.json';

/** The folder a sign-in lives in: the account's own (given), or the computer's (CLAUDE_CONFIG_DIR, else ~/.claude). @param {string | null} configDir */
export const folderOf = (configDir, env = process.env, home = homedir()) => configDir || env.CLAUDE_CONFIG_DIR || join(home, '.claude');

/**
 * Where Claude Code keeps the rest of its sign-in (who, the first-run flags): beside the credentials when it has a
 * folder of its own, else in the home folder.
 * @param {string | null} configDir
 */
export const statePath = (configDir, env = process.env, home = homedir()) => (configDir || env.CLAUDE_CONFIG_DIR ? join(folderOf(configDir, env, home), STATE) : join(home, STATE));

/** A credentials file's text, when it holds a whole sign-in (a refresh token); else null. @param {string} file */
export function readSignIn(file) {
  try {
    const text = readFileSync(file, 'utf8');
    const o = JSON.parse(text)?.claudeAiOauth;
    return typeof o?.refreshToken === 'string' && o.refreshToken.length > 10 ? text : null;
  } catch { return null; }
}

/** Written whole or not at all: a temporary file, then renamed. @param {string} file @param {string} text */
function writeWhole(file, text) {
  mkdirSync(join(file, '..'), { recursive: true });
  const part = `${file}.${process.pid}.part`;
  writeFileSync(part, text, { mode: 0o600 });
  renameSync(part, file);
}

/**
 * @param {{ keepDir: string, env?: NodeJS.ProcessEnv, home?: string }} options
 * `keepDir`: where the copies are. Each sign-in has a `key` (the account's id; `own` for the computer's).
 */
export function createKeeper({ keepDir, env = process.env, home = homedir() }) {
  const at = (/** @type {string} */ key) => join(keepDir, String(key).replace(/[^\w.-]/g, '_'));
  return {
    /** Is the sign-in in `configDir` whole? */
    signedIn(/** @type {string | null} */ configDir) { return readSignIn(join(folderOf(configDir, env, home), CREDENTIALS)) !== null; },

    /** A copy of the live sign-in, when it is whole and not the one already kept: 'saved', 'same' or 'none'. */
    snapshot(/** @type {string | null} */ configDir, /** @type {string} */ key) {
      const live = readSignIn(join(folderOf(configDir, env, home), CREDENTIALS));
      if (live === null) return 'none';
      const dir = at(key);
      const kept = join(dir, CREDENTIALS);
      let same = false;
      try { same = readFileSync(kept, 'utf8') === live; } catch { /* none kept yet */ }
      if (same) return 'same';
      try {
        if (existsSync(kept) && readSignIn(kept) !== null) copyFileSync(kept, join(dir, `${CREDENTIALS}.previous`));
        writeWhole(kept, live);
        const state = statePath(configDir, env, home);
        if (existsSync(state)) copyFileSync(state, join(dir, STATE));
        return 'saved';
      } catch { return 'none'; }
    },

    /**
     * The kept sign-in put back, when the live one is missing or broken (never over a whole one): true when it was.
     * The state file is put back only where there is none.
     */
    restore(/** @type {string | null} */ configDir, /** @type {string} */ key) {
      const file = join(folderOf(configDir, env, home), CREDENTIALS);
      if (readSignIn(file) !== null) return false;
      const dir = at(key);
      const text = readSignIn(join(dir, CREDENTIALS)) ?? readSignIn(join(dir, `${CREDENTIALS}.previous`));
      if (text === null) return false;
      try {
        writeWhole(file, text);
        const state = statePath(configDir, env, home);
        if (!existsSync(state) && existsSync(join(dir, STATE))) copyFileSync(join(dir, STATE), state);
        return true;
      } catch { return false; }
    },

    /** The copy removed: only for an account the person removed. */
    forget(/** @type {string} */ key) { try { rmSync(at(key), { recursive: true, force: true }); } catch { /* kept */ } },
  };
}
