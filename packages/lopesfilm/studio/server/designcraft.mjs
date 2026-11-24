// @ts-check
/**
 * FigCraft and VectorCraft (ArtCraft; MIT or Apache-2.0): two design studios that run with no window.
 *
 *   figcraft     interface design in the way of Figma: frames, auto layout, components, variants, styles, text, vectors.
 *                For title cards, lower thirds, thumbnails, social frames, app screens and overlays.
 *   vectorcraft  vector illustration in the way of Illustrator: paths, shapes, gradients, type, boolean operations.
 *                For logos, icons, shapes and illustrations.
 *
 * Each has a command line the agent drives with a JSON list of commands; the picture comes out as a PNG with a transparent
 * background (or SVG, PDF, WebP, JPG), under assets/image, to lay over the film or to animate (EffectCraft).
 *
 * Fetched the first time from the project's own GitHub release (about 100 MB each: the CLI is taken out of the package)
 * into `~/.lopesfilm/models/<name>` (`LOPESFILM_FIGCRAFT_DIR`, `LOPESFILM_VECTORCRAFT_DIR`), checked by size and sha256.
 * Nothing is sent anywhere.
 */
import { currentDir } from './engine-current.mjs';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';
import { findCli } from './effectcraft.mjs';

/** @typedef {{ file: string, bytes: number, sha256: string, exe: string, zip?: boolean }} Package */
/**
 * @typedef {{ name: string, label: string, version: string, base: string, env: string, packages: Record<string, Package> }} Design
 */

/** @type {Record<'figcraft' | 'vectorcraft', Design>} */
export const DESIGNS = {
  figcraft: {
    name: 'figcraft', label: 'FigCraft', version: '0.13.1', env: 'LOPESFILM_FIGCRAFT_DIR',
    base: 'https://github.com/storytold/figcraft/releases/download/v0.13.1',
    packages: {
      'win32-x64': { file: 'figcraft-0.13.1-windows-x64-portable.zip', bytes: 101051668, sha256: 'efa98c7efdbb6a225530fec0e3b3cc5378dac55a4e6fd60880740bc743e1cb4d', exe: 'figcraft-cli.exe', zip: true },
      'linux-x64': { file: 'figcraft-0.13.1-linux-x86_64.tar.gz', bytes: 101537246, sha256: '865cf29c75a737cd859d93fa48e9d4aa8dc6023f258aa127e88b97d887f90d27', exe: 'figcraft-cli' },
    },
  },
  vectorcraft: {
    name: 'vectorcraft', label: 'Skill de Vetor', version: '0.11.0', env: 'LOPESFILM_VECTORCRAFT_DIR',
    base: 'https://github.com/storytold/vectorcraft/releases/download/v0.11.0',
    packages: {
      'win32-x64': { file: 'vectorcraft-0.11.0-windows-x64-portable.zip', bytes: 122431888, sha256: '699a2a257819b7c8a064839b594dc81653a59cc6d10fde5496aae6f1dd294728', exe: 'vectorcraft-cli.exe', zip: true },
      'linux-x64': { file: 'vectorcraft-0.11.0-linux-x86_64.tar.gz', bytes: 120177805, sha256: '83ca62a455bbb1d1c61c6b05133bc41ceda1d1d99e4be7509d287c364ceb8f39', exe: 'vectorcraft-cli' },
    },
  },
};

/** The package for this computer; null where there is none (they are made for Windows and Linux on x64 so far). @param {Design} d @param {string} [platform] @param {string} [arch] */
export const packageFor = (d, platform = process.platform, arch = process.arch) => d.packages[`${platform}-${arch}`] ?? null;
/** @param {Design} d */
export const designDir = (d) => process.env[d.env] || currentDir(join(homedir(), '.lopesfilm', 'models', d.name));
/** @param {Design} d */
export const designBytes = (d) => packageFor(d, 'win32', 'x64')?.bytes ?? 0;
/** @param {Design} d @param {string} [dir] */
export function designCli(d, dir = designDir(d)) {
  const pkg = packageFor(d);
  return pkg ? findCli(dir, pkg.exe) : null;
}
/** @param {Design} d @param {string} [dir] */
export const designInstalled = (d, dir = designDir(d)) => designCli(d, dir) !== null;

/** Fetch the program. @param {Design} d @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function installDesign(d, dir = designDir(d), signal = new AbortController().signal, say = () => {}) {
  const pkg = packageFor(d);
  if (!pkg) throw new Error(`${d.label} runs on Windows and Linux (x64) so far.`);
  if (designInstalled(d, dir)) return;
  say(`fetching ${d.label} ${d.version} (about ${Math.round(pkg.bytes / 2 ** 20)} MB)`);
  const file = join(tmpdir(), `lopesfilm-${pkg.file}`);
  await fetchTo(`${process.env[`${d.env.replace(/_DIR$/, '')}_RELEASE_URL`] || d.base}/${pkg.file}`, file, pkg.bytes, pkg.sha256, signal);
  mkdirSync(dir, { recursive: true });
  say(`unpacking ${d.label}`);
  if (process.platform === 'win32') {
    /* only the command line and the licences: the app beside it is as big again and not needed here */
    const root = pkg.file.replace(/\.zip$/, '');
    await exec('tar', ['-xf', file, '-C', dir, `${root}/${pkg.exe}`, `${root}/LICENSE-APACHE`], signal).catch(() => exec('tar', ['-xf', file, '-C', dir], signal));
  } else await exec('tar', ['-xzf', file, '-C', dir], signal);
  rmSync(file, { force: true });
  const cli = designCli(d, dir);
  if (!cli) throw new Error(`the ${d.label} program is not in what was fetched`);
  if (process.platform !== 'win32') await exec('chmod', ['+x', cli]);
}

/** Pictures each can write, by extension. */
export const IMAGE_FORMATS = /** @type {Record<string, string[]>} */ ({
  figcraft: ['png', 'webp', 'jpg', 'svg', 'pdf'],
  vectorcraft: ['png', 'svg', 'pdf', 'jpg', 'webp', 'gif', 'tif'],
});
const COMMAND_ID = /^[A-Za-z][A-Za-z0-9_.]*$/;

/**
 * The steps as a list of { id, params }: a JSON list of {"id" | "command": "node.create", "params": {…}}.
 * @param {unknown} steps @returns {{ id: string, params: Record<string, unknown> }[]}
 */
export function parseSteps(steps) {
  let list = steps;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { throw new Error('--steps is a JSON list: [{"id":"frame.create","params":{"width":1280,"height":300}}, …]'); } }
  if (!Array.isArray(list) || !list.length) throw new Error('--steps is a JSON list of commands: [{"id":"frame.create","params":{…}}, …]');
  return list.map((item, i) => {
    const id = item && typeof item === 'object' ? item.id ?? item.command : undefined;
    if (typeof id !== 'string' || !COMMAND_ID.test(id)) throw new Error(`step ${i + 1} needs an "id" (a command: frame.create, text.create, shape.rectangle, …; --commands lists them)`);
    const params = item.params ?? {};
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(`step ${i + 1}: "params" is an object`);
    return { id, params };
  });
}

/** What each step answered, from the program's JSON lines (one per step). @param {string} text */
function results(text) {
  /** @type {unknown[]} */
  const out = [];
  for (const line of text.split('\n')) { const t = line.trim(); if (t.startsWith('{')) { try { out.push(JSON.parse(t)); } catch { /* not a result line */ } } }
  return out;
}

/**
 * Design with FigCraft or VectorCraft and export a picture. `steps` (commands, run in order) change the project file
 * (made when it is not there); the page or the layer `node` is then written to assets/image/<out>.<format>.
 * @param {Design} d
 * @param {string} root
 * @param {{ out?: string, commands?: string | boolean, project?: string, steps?: unknown, format?: string, scale?: number, node?: string, page?: string }} a
 * @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function design(d, root, a, signal, say = () => {}) {
  const dir = designDir(d);
  if (!designInstalled(d, dir)) await installDesign(d, dir, signal, say);
  const cli = /** @type {string} */ (designCli(d, dir));
  if (a.commands !== undefined) {
    const text = await exec(cli, ['commands'], signal);
    const filter = typeof a.commands === 'string' ? a.commands.toLowerCase() : '';
    if (!filter) return { note: 'give --commands <word> to list the ones that match (a name, a label: "text", "gradient", "auto layout")', total: text.split('\n').length };
    /* a command is its line and the indented lines that follow (figcraft puts the parameters there): one that matches in any of them */
    /** @type {string[][]} */
    const groups = [];
    for (const line of text.split('\n')) { if (/^\s/.test(line) && groups.length) groups[groups.length - 1].push(line); else if (line.trim()) groups.push([line]); }
    const keep = groups.filter((g) => g.join('\n').toLowerCase().includes(filter)).slice(0, 25).map((g) => g.map((l) => l.slice(0, 1200)).join('\n'));
    return { commands: keep.join('\n').slice(0, 20000) };
  }
  if (!a.out) throw new Error('--out names the picture to make');
  const formats = IMAGE_FORMATS[d.name];
  const format = a.format ?? 'png';
  if (!formats.includes(format)) throw new Error(`--format is one of ${formats.join(', ')}`);
  const ext = d.name === 'figcraft' ? 'figcraft' : 'vectorcraft';
  const projectRel = a.project || `assets/design/${a.out}.${ext}`;
  if (!projectRel.toLowerCase().endsWith(`.${ext}`)) throw new Error(`--project is a .${ext} file, under assets/design`);
  const project = inside(root, projectRel);
  await mkdir(dirname(project), { recursive: true });
  const exists = existsSync(project);
  const rel = `assets/image/${a.out}.${format}`;
  const abs = inside(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  const scale = a.scale !== undefined ? Number(a.scale) : 1;
  if (!(scale > 0 && scale <= 8)) throw new Error('--scale is from 0 to 8 (2 makes the picture twice as large)');
  const steps = a.steps !== undefined ? parseSteps(a.steps) : null;
  if (!steps && !exists) throw new Error(`there is no project at ${projectRel}: give --steps (a JSON list of commands) to build one (--commands <word> lists the commands)`);
  const cwd = dirname(project);
  let answered = /** @type {unknown[]} */ ([]);
  if (d.name === 'figcraft') {
    if (steps) {
      say('designing');
      const script = join(tmpdir(), `lopesfilm-figcraft-${process.pid}-${Date.now()}.json`);
      writeFileSync(script, JSON.stringify(steps.map((s) => ({ command: s.id, params: s.params }))));
      try { answered = results(await exec(cli, ['run', script, ...(exists ? ['--in', project] : []), '--out', project], signal, cwd)); } finally { rmSync(script, { force: true }); }
    }
    say(`exporting ${format}`);
    await exec(cli, ['export', project, '--out', abs, '--format', format, '--scale', String(scale), ...(a.node ? ['--node', a.node] : []), ...(a.page ? ['--page', a.page] : [])], signal, cwd);
  } else {
    /* one run: the commands, then the project saved and the picture written */
    const args = ['run', ...(exists ? ['--in', project] : [])];
    for (const s of steps ?? []) args.push('--cmd', s.id, '--params', JSON.stringify(s.params));
    args.push('--export', project, '--export', abs, '--scale', String(scale));
    say('drawing');
    answered = results(await exec(cli, args, signal, cwd));
  }
  if (!existsSync(abs)) throw new Error(`${d.label} made no picture: ${JSON.stringify(answered.slice(-2)).slice(0, 400)}`);
  const { size } = await stat(abs);
  return {
    src: rel, project: projectRel, format, bytes: size, steps: answered.length ? answered.slice(0, 60) : undefined,
    note: format === 'png' || format === 'webp' ? 'the background is transparent where nothing is drawn: lay it over the film as an image clip; animate it with effectcraft' : undefined,
  };
}
