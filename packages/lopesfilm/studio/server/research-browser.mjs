// @ts-check
/**
 * The person's own browser for the agent's research: once they linked it (the setup guide, Settings), `get browse --url`
 * opens a page in it so they see what the agent is looking at (a reference, a competitor's page, a site to take a look from).
 * Reading a page is `get web-fetch`; this one shows it. Never through a shell: an address's `&` or `|` are not commands.
 */
import { spawn } from 'node:child_process';
import { readPrefs } from './prefs.mjs';

/** The command that opens an address in the default browser. @param {string} url @param {NodeJS.Platform} [platform] */
export function browserCommand(url, platform = process.platform) {
  if (platform === 'win32') return ['rundll32', 'url.dll,FileProtocolHandler', url];
  return platform === 'darwin' ? ['open', url] : ['xdg-open', url];
}

/** @param {string} url @param {(cmd: string, args: string[]) => void} [launch] */
export function browse(url, launch = (cmd, args) => { try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* no browser */ } }) {
  if (!readPrefs().researchBrowser) throw new Error('the person has not linked their browser: Settings, or the setup guide, link it (then `get browse` opens pages in it). Until then use `get web-search` and `get web-fetch`.');
  let u;
  try { u = new URL(url); } catch { throw new Error(`${url} is not a web address`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('--url is a web address (https://…)');
  const [cmd, ...args] = browserCommand(u.href);
  launch(cmd, args);
  return { opened: u.href };
}
