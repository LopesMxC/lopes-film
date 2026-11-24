// @ts-check
/**
 * SoundCraft (ArtCraft; MIT or Apache-2.0): a digital audio workstation that runs with no window. The agent mixes with a
 * list of commands (import tracks, set levels and pan, fades, EQ, compressor, reverb, gate…) and the mix is written as a
 * WAV or FLAC under assets/audio/mix, with the loudness measured. The session is kept (assets/audio/sessions/<out>.scraft)
 * and opened again by a later call. Fetched the first time (about 15 MB) into `~/.lopesfilm/models/soundcraft`
 * (`LOPESFILM_SOUNDCRAFT_DIR`), checked by size and sha256.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { currentDir } from './engine-current.mjs';
import { exec, fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';
import { findCli } from './effectcraft.mjs';
import { parseSteps } from './designcraft.mjs';

const BASE = 'https://github.com/storytold/soundcraft/releases/download/v0.12.1';
/** @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { file: 'soundcraft-0.12.1-windows-x64-portable.zip', root: 'soundcraft-0.12.1-windows-x64-portable', bytes: 15092330, sha256: '97760e9510f867fc9b8ab7182dfb7ac404d7744f53fa7e7c39140cb8e0635bca', exe: 'soundcraft-cli.exe' };
  if (platform === 'linux' && arch === 'x64') return { file: 'soundcraft-0.12.1-linux-x86_64.tar.gz', root: 'soundcraft-0.12.1-linux-x86_64', bytes: 16474930, sha256: 'b0a56bd6b5d27de6b12e354580c362be6f59125ea58f573044c84f6a7da87780', exe: 'soundcraft-cli' };
  return null;
}
export const soundcraftDir = () => process.env.LOPESFILM_SOUNDCRAFT_DIR || currentDir(join(homedir(), '.lopesfilm', 'models', 'soundcraft'));
export const SOUNDCRAFT_BYTES = 15092330;
export const FORMATS = ['wav', 'flac'];
/** @param {string} [dir] */
export const cliPath = (dir = soundcraftDir()) => { const rt = runtimeFor(); return rt ? findCli(dir, rt.exe) : null; };
/** @param {string} [dir] */
export const installed = (dir = soundcraftDir()) => cliPath(dir) !== null;

/** @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function install(dir = soundcraftDir(), signal = new AbortController().signal, say = () => {}) {
  const rt = runtimeFor();
  if (!rt) throw new Error('Skill SoundMaker runs on Windows (x64) and Linux (x64) so far.');
  if (installed(dir)) return;
  say('fetching Skill SoundMaker (about 15 MB)');
  const file = join(tmpdir(), `lopesfilm-${rt.file}`);
  await fetchTo(`${process.env.LOPESFILM_SOUNDCRAFT_RELEASE_URL || BASE}/${rt.file}`, file, rt.bytes, rt.sha256, signal);
  mkdirSync(dir, { recursive: true });
  await (process.platform === 'win32' ? exec('tar', ['-xf', file, '-C', dir], signal) : exec('tar', ['-xzf', file, '-C', dir], signal));
  rmSync(file, { force: true });
  const cli = cliPath(dir);
  if (!cli) throw new Error('the Skill SoundMaker program is not in what was fetched');
  if (process.platform !== 'win32') await exec('chmod', ['+x', cli]);
}

/**
 * Mix with SoundCraft. `steps` are commands run in order (file paths in them are relative to the project); the mix is
 * bounced to assets/audio/mix/<out>.<format>.
 * @param {string} root @param {{ out?: string, commands?: string | boolean, session?: string, steps?: unknown, format?: string, start?: number, end?: number }} a
 * @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function soundcraft(root, a, signal, say = () => {}) {
  const dir = soundcraftDir();
  if (!installed(dir)) await install(dir, signal, say);
  const cli = /** @type {string} */ (cliPath(dir));
  if (a.commands !== undefined) {
    const word = typeof a.commands === 'string' ? a.commands.trim() : '';
    if (!word) return { note: 'give --commands <word> (track, clip, fade, mix, eq, compressor…) or --commands plugins for the effects', total: (await exec(cli, ['commands'], signal)).split('\n').length };
    if (!/^[\w.\- ]+$/.test(word)) throw new Error('--commands is a word');
    const text = word === 'plugins' ? await exec(cli, ['plugins'], signal) : await exec(cli, ['commands', word], signal);
    return { commands: text.trim().slice(0, 12000), note: 'one command in detail: it is asked of the program as `describe <id>` through --commands describe:<id>' };
  }
  if (!a.out) throw new Error('--out names the mix to make');
  const format = a.format ?? 'wav';
  if (!FORMATS.includes(format)) throw new Error(`--format is one of ${FORMATS.join(', ')}`);
  const sessionRel = a.session || `assets/audio/sessions/${a.out}.scraft`;
  if (!sessionRel.toLowerCase().endsWith('.scraft')) throw new Error('--session is a .scraft file, under assets/audio/sessions');
  const session = inside(root, sessionRel);
  await mkdir(dirname(session), { recursive: true });
  const exists = existsSync(session);
  const steps = a.steps !== undefined ? parseSteps(a.steps) : [];
  if (!steps.length && !exists) throw new Error(`there is no session at ${sessionRel}: give --steps (a JSON list of commands, starting with session.new) to build one`);
  const rel = `assets/audio/mix/${a.out}.${format}`;
  const abs = inside(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  const args = ['run', ...(exists ? ['--in', session] : [])];
  for (const s of steps) args.push('--cmd', `${s.id}=${JSON.stringify(s.params)}`);
  args.push('--bounce', abs, '--save', session);
  if (a.start !== undefined) args.push('--start', String(Number(a.start)));
  if (a.end !== undefined) args.push('--end', String(Number(a.end)));
  say('mixing');
  const out = await exec(cli, args, signal, root);
  if (!existsSync(abs)) throw new Error(`Skill SoundMaker made no mix: ${out.trim().split('\n').slice(-2).join(' | ').slice(0, 400)}`);
  /* the bounce says its own loudness */
  /** @type {Record<string, unknown>} */
  let measured = {};
  for (const line of out.split('\n')) { const t = line.trim(); if (t.startsWith('{') && t.includes('"lufs"')) { try { measured = JSON.parse(t); } catch { /* not that line */ } } }
  const { size } = await stat(abs);
  return { src: rel, session: sessionRel, format, bytes: size, seconds: measured.seconds, lufs: measured.lufs, peakDb: measured.peak_db, truePeakDb: measured.true_peak_db };
}
