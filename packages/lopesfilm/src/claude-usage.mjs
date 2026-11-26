/**
 * How much of its plan each Claude Code account has used, to share the use between the accounts (agent-roster.mjs
 * balanceClaudeAccount): the 5-hour and the 7-day windows, as Anthropic's own usage address says them for the sign-in
 * of that account (the one Claude Code's /usage reads). The token is read from the account's sign-in file only for the
 * call and is never kept, logged or sent anywhere else. Asked at most once a minute per account, and never for longer
 * than a short wait. An account that cannot say (a token that has run out, no sign-in, no network) is `null`: unknown,
 * not full. Reads no Electron module, so `node --test` can use it.
 *
 * @typedef {{ pct: number, resetsAt: number | null }} UsageWindow
 * @typedef {{ five: UsageWindow | null, seven: UsageWindow | null }} ClaudeUsage
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ADDRESS = 'https://api.anthropic.com/api/oauth/usage';
const KEPT_MS = 60_000;
const WAIT_MS = 5_000;
/** @type {Map<string, { at: number, usage: Promise<ClaudeUsage | null> }>} */
const kept = new Map();

/** The folder an account is signed in from: the app's own (given), or the computer's (CLAUDE_CONFIG_DIR, else ~/.claude). @param {string | null} configDir */
export const configDirOf = (configDir) => configDir || process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

/** @param {unknown} w */
function windowOf(w) {
  const o = /** @type {any} */ (w);
  const pct = Number(o?.utilization);
  if (!o || !Number.isFinite(pct)) return null;
  const at = typeof o.resets_at === 'string' ? Date.parse(o.resets_at) : NaN;
  return { pct: Math.max(0, Math.min(100, pct)), resetsAt: Number.isFinite(at) ? at : null };
}

/** The answer of the usage address, as windows. @param {unknown} body @returns {ClaudeUsage | null} */
export function readClaudeUsage(body) {
  const b = /** @type {any} */ (body);
  if (!b || typeof b !== 'object') return null;
  const five = windowOf(b.five_hour);
  const seven = windowOf(b.seven_day);
  return five || seven ? { five, seven } : null;
}

/** How full the account is, 0–100: the fuller of its two windows; null when it could not say. @param {ClaudeUsage | null | undefined} usage */
export const fullness = (usage) => {
  const all = [usage?.five?.pct, usage?.seven?.pct].filter((n) => typeof n === 'number');
  return all.length ? Math.max(...all) : null;
};

/** The access token of an account's sign-in (Windows and Linux keep it in a file), or null: none, or run out. @param {string} dir @param {number} now */
export function accessToken(dir, now = Date.now()) {
  try {
    const o = JSON.parse(readFileSync(join(dir, '.credentials.json'), 'utf8')).claudeAiOauth;
    if (!o?.accessToken) return null;
    if (typeof o.expiresAt === 'number' && o.expiresAt <= now) return null;
    return String(o.accessToken);
  } catch { return null; }
}

/**
 * One account's usage, kept a minute. @param {string | null} configDir `null`: the computer's own
 * @param {{ fresh?: boolean, fetch?: typeof fetch, now?: () => number }} [o] @returns {Promise<ClaudeUsage | null>}
 */
export function claudeUsage(configDir, { fresh = false, fetch: get = globalThis.fetch, now = Date.now } = {}) {
  const dir = configDirOf(configDir);
  const hit = kept.get(dir);
  if (hit && !fresh && now() - hit.at < KEPT_MS) return hit.usage;
  const usage = (async () => {
    const token = accessToken(dir, now());
    if (!token) return null;
    const res = await get(ADDRESS, { headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(WAIT_MS) });
    return res.ok ? readClaudeUsage(await res.json()) : null;
  })().catch(() => null);
  kept.set(dir, { at: now(), usage });
  return usage;
}

/** Forget what was kept (a sign-in changed). */
export const forgetClaudeUsage = () => kept.clear();
