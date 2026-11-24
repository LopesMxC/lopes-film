// @ts-check
/**
 * AniCraft (ArtCraft; MIT or Apache-2.0): a 2D vector animation studio in the way of Adobe Animate, run with no window.
 * The agent draws shapes and text, makes keyframes and tweens (classic, shape, motion) with a list of commands, and the
 * animation comes out as a video with a transparent background (WebM), an opaque MP4, a GIF, a Lottie file or one picture,
 * under assets/video (assets/image for a picture). The project is kept (assets/design/<out>.anicraft) and opened again.
 * Fetched the first time (about 20 MB) into `~/.lopesfilm/models/anicraft` (`LOPESFILM_ANICRAFT_DIR`), checked by size and sha256.
 *
 * The program has no transparent stage, so the transparent video is made on a key colour (#00FF00) that ffmpeg takes out.
 */
import { currentDir } from './engine-current.mjs';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';
import { findCli } from './effectcraft.mjs';
import { ffmpeg } from '../../src/shared.mjs';

const BASE = 'https://github.com/storytold/AniCraft/releases/download/v0.2.1';
/** @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { file: 'anicraft-0.2.1-windows-x64-portable.zip', bytes: 18965079, sha256: 'cd51c7e2bc81957f7a162596eea564c78fc134acae27ea5c2163f5d617a53ce4', exe: 'anicraft-cli.exe' };
  if (platform === 'linux' && arch === 'x64') return { file: 'anicraft-0.2.1-linux-x86_64.tar.gz', bytes: 19705850, sha256: 'a3a8795bd6aea4b4bc5ca0f26c226a072330d38fe93f4edf5526360ebf7156fd', exe: 'anicraft-cli' };
  return null;
}
export const anicraftDir = () => process.env.LOPESFILM_ANICRAFT_DIR || currentDir(join(homedir(), '.lopesfilm', 'models', 'anicraft'));
export const ANICRAFT_BYTES = 18965079;
export const FORMATS = ['webm', 'mp4', 'gif', 'lottie', 'png'];
/** @param {string} [dir] */
export const cliPath = (dir = anicraftDir()) => { const rt = runtimeFor(); return rt ? findCli(dir, rt.exe) : null; };
/** @param {string} [dir] */
export const installed = (dir = anicraftDir()) => cliPath(dir) !== null;

/** @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function install(dir = anicraftDir(), signal = new AbortController().signal, say = () => {}) {
  const rt = runtimeFor();
  if (!rt) throw new Error('Skill 2D runs on Windows (x64) and Linux (x64) so far.');
  if (installed(dir)) return;
  say('fetching Skill 2D (about 20 MB)');
  const file = join(tmpdir(), `lopesfilm-${rt.file}`);
  await fetchTo(`${process.env.LOPESFILM_ANICRAFT_RELEASE_URL || BASE}/${rt.file}`, file, rt.bytes, rt.sha256, signal);
  mkdirSync(dir, { recursive: true });
  /* the Windows zip holds the program and the desktop app side by side with no folder: only the command line is kept */
  await (process.platform === 'win32' ? exec('tar', ['-xf', file, '-C', dir, rt.exe, 'LICENSE-APACHE', 'LICENSE-MIT'], signal).catch(() => exec('tar', ['-xf', file, '-C', dir], signal)) : exec('tar', ['-xzf', file, '-C', dir], signal));
  rmSync(file, { force: true });
  const cli = cliPath(dir);
  if (!cli) throw new Error('the Skill 2D program is not in what was fetched');
  if (process.platform !== 'win32') await exec('chmod', ['+x', cli]);
}

const COMMAND_ID = /^[A-Za-z][A-Za-z0-9_.]*$/;
/** @param {unknown} steps @returns {{ cmd: string, params: Record<string, unknown> }[]} */
export function parseSteps(steps) {
  let list = steps;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { throw new Error('--steps is a JSON list: [{"id":"draw.rect","params":{"x":20,"y":120,"w":100,"h":100,"fill":"#E0384E"}}, …]'); } }
  if (!Array.isArray(list) || !list.length) throw new Error('--steps is a JSON list of commands: [{"id":"draw.rect","params":{…}}, …]');
  return list.map((item, i) => {
    const id = item && typeof item === 'object' ? item.id ?? item.cmd ?? item.command : undefined;
    if (typeof id !== 'string' || !COMMAND_ID.test(id)) throw new Error(`step ${i + 1} needs an "id" (a command: draw.rect, text.create, timeline.insert_keyframe, …; --commands lists them)`);
    const params = item.params ?? {};
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(`step ${i + 1}: "params" is an object`);
    return { cmd: id, params };
  });
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const KEY = '#00ff00';

/**
 * Animate with AniCraft and render.
 * @param {string} root
 * @param {{ out?: string, commands?: string | boolean, project?: string, steps?: unknown, format?: string, width?: number, height?: number, fps?: number, from?: number, to?: number, frame?: number, scale?: number, background?: string }} a
 * @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function anicraft(root, a, signal, say = () => {}) {
  const dir = anicraftDir();
  if (!installed(dir)) await install(dir, signal, say);
  const cli = /** @type {string} */ (cliPath(dir));
  if (a.commands !== undefined) {
    const words = (typeof a.commands === 'string' ? a.commands : '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return { note: 'give --commands <words> (tween, keyframe, draw, text, layer, easing, symbol, filter…) to list the commands that match', hint: 'frames in steps are 0-based; --from/--to/--frame are 1-based, as in the timeline' };
    /** @type {{ id: string, label?: string, params?: string }[]} */
    const all = JSON.parse(await exec(cli, ['commands'], signal));
    const hit = all.filter((c) => words.every((w) => `${c.id} ${c.label ?? ''} ${c.params ?? ''}`.toLowerCase().includes(w))).slice(0, 30);
    return { commands: hit.map((c) => `${c.id} ${(c.params ?? '').slice(0, 400)}`).join('\n') };
  }
  if (!a.out) throw new Error('--out names the animation to make');
  const format = a.format ?? 'webm';
  if (!FORMATS.includes(format)) throw new Error(`--format is one of ${FORMATS.join(', ')}`);
  if (a.background !== undefined && !HEX.test(a.background)) throw new Error('--background is a colour like "#101820"');
  const projectRel = a.project || `assets/design/${a.out}.anicraft`;
  if (!projectRel.toLowerCase().endsWith('.anicraft')) throw new Error('--project is an .anicraft file, under assets/design');
  const project = inside(root, projectRel);
  await mkdir(dirname(project), { recursive: true });
  const exists = existsSync(project);
  const steps = a.steps !== undefined ? parseSteps(a.steps) : null;
  if (!steps && !exists) throw new Error(`there is no project at ${projectRel}: give --steps (a JSON list of commands) to build one (--commands <words> lists the commands)`);
  const work = join(tmpdir(), `lopesfilm-anicraft-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    let answered = '';
    if (steps) {
      say('animating');
      let source = project;
      if (!exists) {
        source = join(work, 'new.anicraft');
        await exec(cli, ['new', '--out', source, '--width', String(Math.round(a.width || 1280)), '--height', String(Math.round(a.height || 720)), '--fps', String(Math.round(a.fps || 30))], signal);
      }
      const script = join(work, 'steps.json');
      writeFileSync(script, JSON.stringify(steps));
      const saved = join(work, 'saved.anicraft');
      answered = await exec(cli, ['run', source, script, '--save', saved], signal);
      if (!existsSync(saved)) throw new Error('the animation was not saved');
      copyFileSync(saved, project);
    }
    /* what is drawn: the project on the key colour, or the colour asked for */
    const wantsAlpha = format === 'webm' || format === 'lottie' || format === 'png';
    const bg = a.background ?? (format === 'webm' ? KEY : null);
    let drawn = project;
    if (bg && format !== 'lottie') {
      drawn = join(work, 'drawn.anicraft');
      await exec(cli, ['exec', project, 'doc.set_stage', JSON.stringify({ background: bg }), '--save', drawn], signal);
    }
    const rel = format === 'png' ? `assets/image/${a.out}.png` : `assets/video/${a.out}.${format === 'lottie' ? 'json' : format}`;
    const abs = inside(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    rmSync(abs, { force: true });
    const range = [...(a.from ? ['--from', String(Math.round(a.from))] : []), ...(a.to ? ['--to', String(Math.round(a.to))] : [])];
    const scale = a.scale ? ['--scale', String(a.scale)] : [];
    const info = JSON.parse(await exec(cli, ['info', project], signal));
    const fps = Number(info.fps) || Math.round(a.fps || 30);
    say(`rendering ${format}`);
    if (format === 'png') {
      await exec(cli, ['render', drawn, '--out', abs, '--frame', String(Math.round(a.frame || 1)), ...scale], signal);
    } else if (format === 'gif') {
      await exec(cli, ['gif', drawn, '--out', abs, ...range, ...scale, '--overwrite', 'yes'], signal);
    } else if (format === 'lottie') {
      const lottie = ['exec', project, 'file.export_lottie', JSON.stringify({ path: abs, ...(a.from ? { from: a.from - 1 } : {}), ...(a.to ? { to: a.to - 1 } : {}), ...(a.background ? { background: true } : {}), confirm: true })];
      await exec(cli, lottie, signal);
    } else {
      const seq = join(work, 'seq');
      await exec(cli, ['render-seq', drawn, '--out-dir', seq, ...range, ...scale], signal);
      /* the sequence keeps the frame numbers asked for */
      const input = ['-framerate', String(fps), '-start_number', String(Math.round(a.from || 1)), '-i', join(seq, 'frame_%05d.png')];
      const encode = format === 'webm' && !a.background
        ? ['-vf', 'colorkey=0x00FF00:0.28:0.08,despill=type=green:mix=0.5,format=yuva420p', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', '-auto-alt-ref', '0']
        : format === 'webm' ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '24']
          : ['-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
      await ffmpeg([...input, ...encode, abs], { timeoutMs: 900_000, what: 'putting the animation together' }).done;
    }
    if (!existsSync(abs)) throw new Error(`Skill 2D made no file: ${answered.trim().slice(-300)}`);
    const { size } = await stat(abs);
    return {
      src: rel, project: projectRel, format, bytes: size, frames: info.frames, fps,
      note: wantsAlpha && !a.background ? (format === 'webm' ? 'the background is transparent (a green key taken out: keep pure green #00FF00 out of the drawing, or the green goes too): lay it over the film as a <video> clip' : format === 'lottie' ? 'a Lottie animation: play it in film.html with the lottie adapter' : 'a picture of the frame, on the stage colour') : undefined,
    };
  } finally { rmSync(work, { recursive: true, force: true }); }
}
