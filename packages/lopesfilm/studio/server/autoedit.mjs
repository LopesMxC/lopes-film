// @ts-check
/**
 * Automatic cuts on this computer: auto-editor (Unlicense) is one program with ffmpeg inside (about 45 MB, fetched the first
 * time from the project's own GitHub release into `~/.lopesfilm/models/auto-editor`, `LOPESFILM_AUTOEDITOR_DIR`, checked by
 * size and sha256). It takes the silences and dead stretches out of a clip, or speeds them up, and writes the result under
 * assets/video. `cuts` only reports what it would keep, so the agent can look before it cuts.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';

const BASE = 'https://github.com/WyattBlue/auto-editor/releases/download/31.6.0';
/** @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { file: 'auto-editor-windows-x86_64.exe', bytes: Math.round(42.5 * 2 ** 20), sha256: '6e037bc629db4f8b63b6ec6ebc265def3ad82ac63d74bb49d6b22963dc07b348', exe: 'auto-editor.exe' };
  if (platform === 'linux' && arch === 'x64') return { file: 'auto-editor-linux-x86_64', bytes: 46145848, sha256: 'ad38d62dda324bf5adf820e7c49fd982c30e4b9b89682a6f9a441b6485edd29a', exe: 'auto-editor' };
  if (platform === 'darwin' && arch === 'arm64') return { file: 'auto-editor-macos-arm64', bytes: 25 * 2 ** 20, sha256: '4312ae06d1e764a809a011c24a630f9cbe2be0cca803c5610433ff1d4dd05711', exe: 'auto-editor' };
  return null;
}
export const autoEditorDir = () => process.env.LOPESFILM_AUTOEDITOR_DIR || join(homedir(), '.lopesfilm', 'models', 'auto-editor');
export const AUTOEDITOR_BYTES = 46145848;
/** @param {string} [dir] */
export const exePath = (dir = autoEditorDir()) => { const rt = runtimeFor(); return rt ? join(dir, rt.exe) : ''; };
/** @param {string} [dir] */
export const installed = (dir = autoEditorDir()) => Boolean(runtimeFor()) && existsSync(exePath(dir));

/** @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function install(dir = autoEditorDir(), signal = new AbortController().signal, say = () => {}) {
  const rt = runtimeFor();
  if (!rt) throw new Error('Automatic cuts run on Windows (x64), Linux (x64) and Apple-silicon Mac so far.');
  if (installed(dir)) return;
  say('fetching auto-editor (about 45 MB)');
  mkdirSync(dir, { recursive: true });
  /* a single program: fetched to its place under its own name; the byte count is the page's rounded one, so only the hash vouches */
  await fetchTo(`${process.env.LOPESFILM_AUTOEDITOR_RELEASE_URL || BASE}/${rt.file}`, exePath(dir), 0, rt.sha256, signal);
  if (process.platform !== 'win32') await exec('chmod', ['+x', exePath(dir)]);
}

const SECONDS = /^\d+(\.\d+)?$/;
/** A time as auto-editor reads it: seconds. @param {unknown} v @param {string} name */
const secs = (v, name) => { const s = String(v); if (!SECONDS.test(s)) throw new Error(`--${name} is a number of seconds`); return `${s}s`; };

/**
 * Cut the dead parts out of a clip.
 * @param {string} root @param {{ src: string, out: string, edit?: string, threshold?: number, margin?: number, speedup?: number, cuts?: boolean }} a @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function autoEdit(root, a, signal, say = () => {}) {
  const dir = autoEditorDir();
  if (!installed(dir)) await install(dir, signal, say);
  const input = inside(root, a.src);
  if (!existsSync(input)) throw new Error(`there is no file at ${a.src}`);
  const rel = `assets/video/${a.out}.mp4`;
  const abs = join(root, rel);
  if (abs === input) throw new Error('--out must not be the name of the file it cuts');
  await mkdir(dirname(abs), { recursive: true });
  /* "audio:threshold=4%" is what it listens for: below it is silence */
  const edit = a.edit || `audio:threshold=${a.threshold !== undefined ? `${Number(a.threshold)}%` : '4%'}`;
  if (!/^[\w:=%.,() \-+*/<>]+$/.test(edit)) throw new Error('--edit is an auto-editor expression, e.g. "audio:threshold=4%" or "motion:threshold=2%"');
  const args = [input, '--edit', edit, '--margin', secs(a.margin ?? 0.2, 'margin'), '-o', abs, '--no-open'];
  if (a.speedup !== undefined) args.push('--when-silent', `speed:${Number(a.speedup)}`);
  say('listening for the silences');
  const before = await probeSeconds(input);
  await exec(exePath(dir), args, signal);
  if (!existsSync(abs)) throw new Error('auto-editor made no file');
  const after = await probeSeconds(abs);
  const { size } = await stat(abs);
  return { src: rel, bytes: size, secondsBefore: before, secondsAfter: after, removed: Number((before - after).toFixed(2)), edit };
}

/** @param {string} file */
async function probeSeconds(file) {
  const out = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number((Number(out.trim()) || 0).toFixed(2));
}
