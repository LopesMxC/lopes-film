/**
 * Lopes.Film's token optimizer: a local compression proxy (Headroom, listening on 127.0.0.1:8787 by default) that sits
 * between Claude Code and the Anthropic API and compresses what is sent, so a long session costs fewer input tokens.
 *
 * Off unless the person turns it on, in `<home>/.lopesfilm/optimizer.json` (`{ "enabled": true, "url":
 * "http://127.0.0.1:8787" }`) or with LOPESFILM_TOKEN_PROXY=<url>. Safety rules, all of them kept here:
 *   - only a loopback address (127.0.0.1, localhost, ::1) is ever used: the agent's sign-in travels with the requests,
 *     so a proxy on another computer would be handed the person's Claude account;
 *   - only ANTHROPIC_BASE_URL is set, never a key or a token: the person's own subscription keeps signing in;
 *   - fail open: a proxy that does not answer is skipped, so the project goes on straight to the API instead of
 *     stopping with a connection error.
 *
 * Reads no Electron module, so `node --test` can use it.
 */
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_PROXY_URL = 'http://127.0.0.1:8787';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** The proxy's address when it is a plain http(s) address on this computer, else null. @param {unknown} value */
export function loopbackUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!LOOPBACK.has(url.hostname)) return null;
  if (url.username || url.password) return null;
  return url.origin;
}

/**
 * What the person set: `{ url }` when the optimizer is on and its address is acceptable, else null.
 * @param {{ env?: Record<string, string | undefined>, home?: string }} [o]
 */
export function optimizerSetting({ env = process.env, home = homedir() } = {}) {
  const fromEnv = env.LOPESFILM_TOKEN_PROXY;
  if (fromEnv) { const url = loopbackUrl(fromEnv === '1' || fromEnv === 'on' ? DEFAULT_PROXY_URL : fromEnv); return url ? { url } : null; }
  let raw;
  try { raw = JSON.parse(readFileSync(join(home, '.lopesfilm', 'optimizer.json'), 'utf8')); } catch { return null; }
  if (!raw || raw.enabled !== true) return null;
  const url = loopbackUrl(raw.url ?? DEFAULT_PROXY_URL);
  return url ? { url } : null;
}

/** Whether something is listening at the address (a quick TCP connect). @param {string} url @param {number} [ms] */
export function proxyAnswers(url, ms = 400) {
  return new Promise((done) => {
    let u;
    try { u = new URL(url); } catch { done(false); return; }
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    const socket = connect({ host: u.hostname.replace(/^\[|\]$/g, ''), port });
    const end = (/** @type {boolean} */ ok) => { socket.destroy(); done(ok); };
    socket.setTimeout(ms, () => end(false));
    socket.once('connect', () => end(true));
    socket.once('error', () => end(false));
  });
}

/**
 * The variables a Claude Code session is given to go through the proxy: `{ ANTHROPIC_BASE_URL }`, or `{}` (off, an
 * address that is not this computer's, or a proxy that is not running).
 * @param {{ env?: Record<string, string | undefined>, home?: string, probe?: (url: string) => Promise<boolean> }} [o]
 * @returns {Promise<Record<string, string>>}
 */
export async function tokenProxyEnv({ env, home, probe = proxyAnswers } = {}) {
  const setting = optimizerSetting({ ...(env ? { env } : {}), ...(home ? { home } : {}) });
  if (!setting) return {};
  return (await probe(setting.url)) ? { ANTHROPIC_BASE_URL: setting.url } : {};
}
