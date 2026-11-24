// @ts-check
/**
 * A video or its sound fetched from a link (YouTube, Vimeo, Instagram, TikTok, X and about a thousand sites) with yt-dlp
 * (Unlicense): one program, fetched the first time from its GitHub release into `~/.lopesfilm/models/yt-dlp` and checked
 * against the SHA2-256SUMS that release publishes. Sites change often and yt-dlp follows them, so it is kept current: a
 * copy older than a week is fetched again before use. The file lands under assets/video (or assets/audio with --audio).
 *
 * Only what the person has the right to use: their own uploads, material under a licence that allows it, or a reference
 * kept for study. The verb's help says so; it does not judge it.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { exec, fetchTo, sha256Of } from './providers/localimage.mjs';

const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
export const ytdlpDir = () => process.env.LOPESFILM_YTDLP_DIR || join(homedir(), '.lopesfilm', 'models', 'yt-dlp');
export const YTDLP_BYTES = 18 * 2 ** 20;
const WEEK = 7 * 24 * 3600 * 1000;

/** @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return { file: arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe', exe: 'yt-dlp.exe' };
  if (platform === 'linux') return { file: arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux', exe: 'yt-dlp' };
  if (platform === 'darwin') return { file: 'yt-dlp_macos', exe: 'yt-dlp' };
  return null;
}
export const exePath = (dir = ytdlpDir()) => { const rt = runtimeFor(); return rt ? join(dir, rt.exe) : ''; };
export const installed = (dir = ytdlpDir()) => Boolean(runtimeFor()) && existsSync(exePath(dir));

/** yt-dlp fetched (again, when `fresh` and it is a week old). @param {string} [dir] @param {AbortSignal} [signal] @param {(l: string) => void} [say] @param {boolean} [fresh] */
export async function install(dir = ytdlpDir(), signal = new AbortController().signal, say = () => {}, fresh = false) {
  const rt = runtimeFor();
  if (!rt) throw new Error('Downloading from links runs on Windows, Linux and Mac.');
  if (installed(dir) && !(fresh && Date.now() - statSync(exePath(dir)).mtimeMs > WEEK)) return;
  say('fetching yt-dlp (about 18 MB)');
  mkdirSync(dir, { recursive: true });
  const sums = join(dir, 'SHA2-256SUMS');
  rmSync(sums, { force: true });
  await fetchTo(`${BASE}/SHA2-256SUMS`, sums, 0, undefined, signal);
  const want = readFileSync(sums, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[1] === rt.file)?.[0];
  if (!want) throw new Error(`the yt-dlp release lists no ${rt.file}`);
  const next = `${exePath(dir)}.next`;
  rmSync(next, { force: true });
  await fetchTo(`${BASE}/${rt.file}`, next, 0, want, signal);
  if ((await sha256Of(next)) !== want) { rmSync(next, { force: true }); throw new Error('yt-dlp did not match the checksum its release publishes'); }
  rmSync(exePath(dir), { force: true });
  const { renameSync } = await import('node:fs');
  renameSync(next, exePath(dir));
  if (process.platform !== 'win32') await exec('chmod', ['+x', exePath(dir)]);
}

/** A name a file can have, from a title. @param {string} s */
const fileName = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';

/**
 * The link's video (or sound) fetched into the project.
 * @param {string} root
 * @param {{ url?: string, query?: string, music?: boolean, out?: string, audio?: boolean, height?: number, from?: number, to?: number }} a
 * @param {AbortSignal} [signal] @param {(l: string) => void} [say]
 */
export async function webDownload(root, a, signal = new AbortController().signal, say = () => {}) {
  /* a song by its name: the first YouTube result for it (yt-dlp's own search) */
  const query = typeof a.query === 'string' ? a.query.trim() : '';
  let url;
  if (query && !/^https?:\/\//i.test(query)) url = { toString: () => `ytsearch1:${query}`, host: 'youtube.com', protocol: 'ytsearch:' };
  else {
    try { url = new URL(String(query || a.url)); } catch { throw new Error('--url is a web address (https://…)'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('--url is a web address (https://…)');
  }
  await install(ytdlpDir(), signal, say, true);
  if (a.music) a.audio = true;
  const sub = a.music ? 'audio/music' : a.audio ? 'audio' : 'video';
  const dir = join(root, 'assets', sub);
  await mkdir(dir, { recursive: true });
  const name = a.out ? fileName(a.out) : '%(title).60B';
  const height = Math.max(144, Math.min(4320, Number(a.height) || 1080));
  const args = [
    /* YouTube now asks for a JavaScript runtime to read its pages: Node (this computer's, when it has one) or Deno */
    '--js-runtimes', 'node', '--js-runtimes', 'deno',
    String(url), '--no-playlist', ...(a.music ? ['--embed-metadata'] : []), '--no-progress', '--newline', '--restrict-filenames', '--no-mtime',
    '--paths', dir, '-o', `${name}.%(ext)s`, '--print', 'after_move:filepath',
    ...(a.audio
      ? ['-x', '--audio-format', 'mp3', '--audio-quality', '2']
      : ['-f', `bv*[height<=${height}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${height}]+ba/b[height<=${height}]/b`, '--merge-output-format', 'mp4', '--remux-video', 'mp4']),
    ...(a.from !== undefined || a.to !== undefined ? ['--download-sections', `*${Number(a.from ?? 0)}-${a.to !== undefined ? Number(a.to) : 'inf'}`, '--force-keyframes-at-cuts'] : []),
  ];
  say(`fetching ${url.host}`);
  const started = Date.now() - 2000;
  /** @type {string} */
  let warning = '';
  const printed = await new Promise((ok, fail) => {
    const p = spawn(exePath(), args, { windowsHide: true, cwd: dir });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    const stop = () => p.kill();
    signal.addEventListener('abort', stop, { once: true });
    p.on('error', fail);
    p.on('close', (c) => {
      signal.removeEventListener('abort', stop);
      const why = err.trim().split('\n').filter((l) => /ERROR|error/.test(l)).slice(-2).join(' | ') || err.trim().split('\n').slice(-2).join(' | ') || `exit ${c}`;
      /* yt-dlp can end with an error after the file is saved (a step after the download: a remux, a thumbnail, a
         subtitle, a JavaScript runtime it looked for): the file is there and whole, so it is a success with a warning */
      if (c === 0) ok(out);
      else if (finished(dir, started)) { warning = why; ok(out); }
      else fail(new Error(/sign in to confirm|not a bot/i.test(why)
        ? 'YouTube asked to confirm this is not a bot and refused the download from this connection. Try again in a few minutes, or another link.'
        : `yt-dlp: ${why}`));
    });
  });
  const file = String(printed).trim().split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
  const made = file && existsSync(file) ? file : finished(dir, started) || newest(dir);
  if (!made) throw new Error('yt-dlp finished but no file was saved');
  const rel = `assets/${sub}/${made.slice(dir.length + 1).split('\\').join('/')}`;
  return { src: rel, from: String(url), bytes: statSync(made).size, ...(warning ? { warning: `yt-dlp said: ${warning} (the file was saved whole)` } : {}), note: 'Use it only if you have the right to: your own upload, a licence that allows it, or a reference for study.' };
}

/** A media file saved whole in the folder since `since` (no .part, no temporary file), the newest; '' when none. @param {string} dir @param {number} since */
function finished(dir, since) {
  let best = '', at = 0;
  for (const f of readdirSync(dir)) {
    if (!/\.(mp4|mkv|webm|mov|m4a|mp3|opus|ogg|wav|aac|flac)$/i.test(f) || /\.(part|ytdl|temp)\b|\.f\d+\./i.test(f)) continue;
    const p = join(dir, f); const st = statSync(p);
    if (st.isFile() && st.size > 1024 && st.mtimeMs >= since && st.mtimeMs > at) { at = st.mtimeMs; best = p; }
  }
  return best;
}

/** The newest file in a folder. @param {string} dir */
function newest(dir) {
  let best = '', at = 0;
  for (const f of readdirSync(dir)) { const p = join(dir, f); const s = statSync(p); if (s.isFile() && s.mtimeMs > at) { at = s.mtimeMs; best = p; } }
  return best;
}
void dirname;
