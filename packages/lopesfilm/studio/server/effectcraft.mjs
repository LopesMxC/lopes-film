// @ts-check
/**
 * EffectCraft (ArtCraft; MIT or Apache-2.0): a motion graphics and visual effects studio in the way of After Effects, with
 * more than 300 effects, 3D layers, shape and text layers, keyframes, expressions and a scripting object model like After
 * Effects'. Its command line (`effectcraft-cli`) runs with no window, so the agent builds a composition with it and renders
 * it here, with the background transparent (WebM VP9 or ProRes 4444) to lay over the film as a clip.
 *
 * Fetched the first time from the project's own GitHub release (about 60 MB: the CLI and the app) into
 * `~/.lopesfilm/models/effectcraft` (`LOPESFILM_EFFECTCRAFT_DIR`), checked by size and sha256. Renders on the CPU, so it
 * needs no graphics card (`--gpu` is left off). Nothing is sent anywhere.
 */
import { currentDir } from './engine-current.mjs';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';

const VERSION = '0.4.0';
const BASE = `https://github.com/storytold/effectcraft/releases/download/v${VERSION}`;

/** The package for this computer: its file, size and sha256 (SHA256SUMS of the release); null where there is none. @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { file: `effectcraft-${VERSION}-windows-x64-portable.zip`, bytes: 62338288, sha256: 'b348bb3fd075e672393ca8e2757746ca4a05ff9001a014b8f56cc2d84cacd2f0', exe: 'effectcraft-cli.exe', zip: true };
  if (platform === 'win32' && arch === 'arm64') return { file: `effectcraft-${VERSION}-windows-arm64-portable.zip`, bytes: 57716310, sha256: 'c8616ea63e9c2cd866f285f403a058b2817644101e5d3ddcc34da912e1761ca0', exe: 'effectcraft-cli.exe', zip: true };
  if (platform === 'linux' && arch === 'x64') return { file: `effectcraft-${VERSION}-linux-x86_64.tar.gz`, bytes: 59093773, sha256: '3b7b616ba837910e812e53cff1776c56159fe9644ef8dc47a45759bd7ab7679a', exe: 'effectcraft-cli', zip: false };
  if (platform === 'linux' && arch === 'arm64') return { file: `effectcraft-${VERSION}-linux-aarch64.tar.gz`, bytes: 55114936, sha256: 'd6517a75715319191d7c5b7de3cc7e65f9166ca5dfaa8bdb455b1b5a98892663', exe: 'effectcraft-cli', zip: false };
  if (platform === 'darwin') return { file: `effectcraft-cli-${VERSION}-macos-universal.zip`, bytes: 55806833, sha256: '950abbb83800518281115ef05cebc50d63a28dbeec204951c77f16ec2109219f', exe: 'effectcraft-cli', zip: true };
  return null;
}
export const effectcraftDir = () => process.env.LOPESFILM_EFFECTCRAFT_DIR || currentDir(join(homedir(), '.lopesfilm', 'models', 'effectcraft'));
export const EFFECTCRAFT_BYTES = 62338288;

/** The CLI inside what was unpacked (the packages differ in how deep they put it), or null. @param {string} dir @param {string} exe @param {number} [depth] @returns {string | null} */
export function findCli(dir, exe, depth = 4) {
  let names = /** @type {string[]} */ ([]);
  try { names = readdirSync(dir); } catch { return null; }
  for (const n of names) { const p = join(dir, n); if (n === exe) { try { if (statSync(p).isFile()) return p; } catch { /* gone */ } } }
  if (depth <= 0) return null;
  for (const n of names) {
    const p = join(dir, n);
    try { if (statSync(p).isDirectory()) { const found = findCli(p, exe, depth - 1); if (found) return found; } } catch { /* gone */ }
  }
  return null;
}

/** The CLI, once fetched; null before. @param {string} [dir] */
export function cliPath(dir = effectcraftDir()) {
  const rt = runtimeFor();
  return rt ? findCli(dir, rt.exe) : null;
}
/** @param {string} [dir] */
export const installed = (dir = effectcraftDir()) => cliPath(dir) !== null;

/** Fetch the program. @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function install(dir = effectcraftDir(), signal = new AbortController().signal, say = () => {}) {
  const rt = runtimeFor();
  if (!rt) throw new Error('Skill de Motion runs on Windows (x64, ARM64), Linux and Mac only.');
  if (installed(dir)) return;
  say(`fetching Skill de Motion ${VERSION} (about ${Math.round(rt.bytes / 2 ** 20)} MB)`);
  const file = join(tmpdir(), `lopesfilm-${rt.file}`);
  await fetchTo(`${process.env.LOPESFILM_EFFECTCRAFT_RELEASE_URL || BASE}/${rt.file}`, file, rt.bytes, rt.sha256, signal);
  mkdirSync(dir, { recursive: true });
  say('unpacking Skill de Motion');
  if (process.platform === 'win32') await exec('tar', ['-xf', file, '-C', dir], signal);
  else if (rt.zip) await exec('unzip', ['-o', '-q', file, '-d', dir], signal);
  else await exec('tar', ['-xzf', file, '-C', dir], signal);
  rmSync(file, { force: true });
  const cli = cliPath(dir);
  if (!cli) throw new Error('the Skill de Motion program is not in what was fetched');
  if (process.platform !== 'win32') await exec('chmod', ['+x', cli]);
}

/** how each way of rendering is asked of the program, and what it makes */
export const FORMATS = /** @type {const} */ ({
  webm: { ext: 'webm', args: ['--format', 'webm', '--webm-codec', 'vp9', '--channels', 'rgba'], alpha: true },
  mov: { ext: 'mov', args: ['--format', 'prores', '--prores', '4444', '--channels', 'rgba'], alpha: true },
  mp4: { ext: 'mp4', args: ['--format', 'h264'], alpha: false },
});
export const FORMAT_NAMES = Object.keys(FORMATS);

const COMMAND_ID = /^[A-Za-z][A-Za-z0-9_.]*$/;

/**
 * The `run` arguments for steps given as a JSON list: [{ "id": "comp.new", "params": { … } }, …] (or ["comp.new", {…}, …]).
 * @param {unknown} steps @returns {string[]}
 */
export function stepArgs(steps) {
  let list = steps;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { throw new Error('--steps is a JSON list: [{"id":"comp.new","params":{"name":"Main","width":1920,"height":1080,"frameRate":30,"duration":4}}, …]'); } }
  if (!Array.isArray(list) || !list.length) throw new Error('--steps is a JSON list of commands: [{"id":"comp.new","params":{…}}, …]');
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (typeof item === 'string') { if (!COMMAND_ID.test(item)) throw new Error(`step ${i + 1}: "${item}" is not a command id`); out.push(item, typeof list[i + 1] === 'object' && list[i + 1] ? JSON.stringify(list[++i]) : '{}'); continue; }
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !COMMAND_ID.test(item.id)) throw new Error(`step ${i + 1} needs an "id" (a command: comp.new, layer.newText, …)`);
    out.push(item.id, JSON.stringify(item.params ?? {}));
  }
  return out;
}

/**
 * Build with EffectCraft and render: `steps` (commands, run in order) or `script` (a .jsx with the After Effects object model)
 * change the project file `project` (made when it is not there); then comp `comp` is rendered into assets/video/<out>.<format>.
 * @param {string} root
 * @param {{ out?: string, commands?: string | boolean, project?: string, comp?: string, steps?: unknown, script?: string, format?: string, start?: number, end?: number, fps?: number }} a
 * @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function effectcraft(root, a, signal, say = () => {}) {
  const dir = effectcraftDir();
  if (!installed(dir)) await install(dir, signal, say);
  const cli = /** @type {string} */ (cliPath(dir));
  if (a.commands !== undefined) {
    const text = await exec(cli, ['commands', ...(typeof a.commands === 'string' && a.commands ? ['--filter', a.commands] : []), '--json'], signal);
    return { commands: text.trim().slice(0, 20000) };
  }
  const format = /** @type {keyof typeof FORMATS} */ (a.format && a.format in FORMATS ? a.format : 'webm');
  const spec = FORMATS[format];
  if (!a.out) throw new Error('--out names the file to make');
  const projectRel = a.project || `assets/motion/${a.out}.ecproj`;
  if (!/\.ecproj$/i.test(projectRel)) throw new Error('--project is an .ecproj file, under assets/motion');
  const project = inside(root, projectRel);
  await mkdir(dirname(project), { recursive: true });
  const exists = existsSync(project);
  const comp = a.comp || 'Main';
  /* the work, in the project's own folder, the program's own output kept for the answer */
  const logs = /** @type {string[]} */ ([]);
  if (a.steps !== undefined) {
    say('building the composition');
    const out = await exec(cli, ['run', ...stepArgs(a.steps), ...(exists ? ['--project', project, '--save'] : ['--empty', '--save-as', project]), '--json'], signal, dirname(project));
    logs.push(out.trim().split('\n').pop() ?? '');
  } else if (a.script) {
    say('running the script');
    const file = inside(root, a.script);
    const out = await exec(cli, ['script', file, ...(exists ? [project] : []), '--json'], signal, dirname(project));
    logs.push(out.trim().split('\n').slice(-3).join(' | '));
  } else if (!exists) {
    throw new Error(`there is no project at ${projectRel}: give --steps (a JSON list of commands) or --script (a .jsx) to build one, or --project of one that exists`);
  }
  if (!existsSync(project)) throw new Error('the composition was not saved: end the steps so the project is saved (they are saved with --save-as), or run a script that saves it');
  const rel = `assets/video/${a.out}.${spec.ext}`;
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  say(`rendering ${comp}${spec.alpha ? ' with a transparent background' : ''}`);
  const args = ['render', project, '--comp', comp, '--out', abs, ...spec.args];
  if (a.start !== undefined) args.push('--start', String(a.start));
  if (a.end !== undefined) args.push('--end', String(a.end));
  if (a.fps !== undefined) args.push('--fps', String(a.fps));
  const rendered = await exec(cli, [...args, '--json'], signal, dirname(project));
  if (!existsSync(abs)) throw new Error(`Skill de Motion made no file: ${rendered.trim().split('\n').slice(-2).join(' | ')}`);
  const { size } = await stat(abs);
  return { src: rel, project: projectRel, comp, format, alpha: spec.alpha, bytes: size,
    note: spec.alpha ? 'the background is transparent: lay it over the film as a <video> clip (a .webm keeps its alpha in the Studio and in the export)' : 'no alpha: the picture is opaque' };
}
