/**
 * Lopes.Film's economy limits for Claude Code: the skills only ASK the agent to spend less; these are limits the program
 * itself keeps, so a long session costs less whatever the agent does. All are Claude Code's own settings, passed as
 * environment variables to the agent Lopes.Film starts:
 *
 *   CLAUDE_AUTOCOMPACT_PCT_OVERRIDE   the conversation is folded into a summary at 75% of the window, not near the top: a
 *                                     long session stops re-reading (and re-paying for) a huge history every turn
 *   BASH_MAX_OUTPUT_LENGTH            a command's output is cut at 20,000 characters (30,000 by default): a log or a
 *                                     listing no longer fills the window; the agent filters (tail, grep) instead
 *   MAX_MCP_OUTPUT_TOKENS             the same for a connected tool's answer (25,000 tokens by default → 8,000)
 *   DISABLE_NON_ESSENTIAL_MODEL_CALLS the small side calls (flavour text, titles) are not made
 *
 * Only the harmless one is on by default; the limits (compaction, output caps) are opt-in with `"limits": true`. Off with `{ "enabled": false }` in `<home>/.lopesfilm/economy.json` or LOPESFILM_ECONOMY=0. The person's
 * own value for any of them (in their shell, or in that file's "env") wins. Reads no Electron module.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** always: costs the editing nothing. */
export const ECONOMY_ENV = Object.freeze({ DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1' });
/** only when the person asks (`"limits": true` in economy.json): they can cut what the agent sees. */
export const ECONOMY_LIMITS = Object.freeze({ CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '75', BASH_MAX_OUTPUT_LENGTH: '20000', MAX_MCP_OUTPUT_TOKENS: '8000' });

/**
 * @param {{ env?: Record<string, string | undefined>, home?: string, shell?: Record<string, string | undefined> }} [o]
 * @returns {Record<string, string>} the variables to add (none when turned off)
 */
export function economyEnv({ env = process.env, home = homedir(), shell = {} } = {}) {
  if (env.LOPESFILM_ECONOMY === '0') return {};
  /** @type {any} */
  let file = {};
  try { file = JSON.parse(readFileSync(join(home, '.lopesfilm', 'economy.json'), 'utf8')) ?? {}; } catch { /* none: the defaults */ }
  if (file.enabled === false) return {};
  const mine = file.env && typeof file.env === 'object' ? file.env : {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries({ ...ECONOMY_ENV, ...(file.limits === true ? ECONOMY_LIMITS : {}), ...mine })) {
    if (shell[key] !== undefined || env[key] !== undefined) continue;
    if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
  }
  return out;
}
