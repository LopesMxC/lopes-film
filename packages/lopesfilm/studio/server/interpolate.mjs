// @ts-check
/**
 * Frame interpolation on this computer: RIFE (MIT) through its official ncnn-Vulkan program, which runs on any graphics
 * card (NVIDIA, AMD, Intel; no CUDA to install). It invents the pictures between the frames of a clip: smooth slow motion
 * (2x, 4x) or a clip raised to 60 fps. Only the program and the `rife-v4.6` model are taken out of the package (about 430 MB
 * is fetched the first time, from the project's own GitHub release, into `~/.lopesfilm/models/rife`, `LOPESFILM_RIFE_DIR`),
 * checked by size and sha256. Nothing is sent anywhere.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';
import { ffmpeg } from '../../src/shared.mjs';

const BASE = 'https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029';
export const MODEL = 'rife-v4.6';
/** The program for this computer; null where there is none. @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { zip: 'rife-ncnn-vulkan-20221029-windows.zip', root: 'rife-ncnn-vulkan-20221029-windows', bytes: 431540241, sha256: 'd8e4d772d26cd8006ef0ad0bc82eb191b53c68677d1ae2f42506d74cbbbea606', exe: 'rife-ncnn-vulkan.exe', extra: ['vcomp140.dll'] };
  if (platform === 'linux' && arch === 'x64') return { zip: 'rife-ncnn-vulkan-20221029-ubuntu.zip', root: 'rife-ncnn-vulkan-20221029-ubuntu', bytes: 431302796, sha256: '1e2c7ee7fa7daa326542d50622f0afedc80cf6f1858bda411d16385ffa5cdf68', exe: 'rife-ncnn-vulkan', extra: [] };
  return null;
}
export const rifeDir = () => process.env.LOPESFILM_RIFE_DIR || join(homedir(), '.lopesfilm', 'models', 'rife');
export const RIFE_BYTES = 431540241;
export const MODES = ['slow', 'fps'];

/** @param {string} [dir] */
export const exePath = (dir = rifeDir()) => { const rt = runtimeFor(); return rt ? join(dir, rt.root, rt.exe) : ''; };
/** @param {string} [dir] */
export const installed = (dir = rifeDir()) => Boolean(runtimeFor()) && existsSync(exePath(dir)) && existsSync(join(dir, runtimeFor()?.root ?? '', MODEL, 'flownet.bin'));

/** @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function install(dir = rifeDir(), signal = new AbortController().signal, say = () => {}) {
  const rt = runtimeFor();
  if (!rt) throw new Error('Frame interpolation runs on Windows (x64) and Linux (x64) so far.');
  if (installed(dir)) return;
  say('fetching the frame interpolator (RIFE, about 430 MB: once)');
  const zip = join(tmpdir(), `lopesfilm-${rt.zip}`);
  await fetchTo(`${process.env.LOPESFILM_RIFE_RELEASE_URL || BASE}/${rt.zip}`, zip, rt.bytes, rt.sha256, signal);
  mkdirSync(dir, { recursive: true });
  /* the package holds eleven models; one is kept */
  const members = [`${rt.root}/${rt.exe}`, ...rt.extra.map((f) => `${rt.root}/${f}`), `${rt.root}/${MODEL}`];
  await (process.platform === 'win32' ? exec('tar', ['-xf', zip, '-C', dir, ...members], signal) : exec('unzip', ['-o', '-q', zip, `${rt.root}/${rt.exe}`, `${rt.root}/${MODEL}/*`, '-d', dir], signal));
  rmSync(zip, { force: true });
  if (process.platform !== 'win32') await exec('chmod', ['+x', exePath(dir)]);
  if (!installed(dir)) throw new Error('the frame interpolator is not in what was fetched');
}

/** @param {string} file @returns {Promise<{ fps: number, seconds: number, audio: boolean }>} */
async function probe(file) {
  const j = JSON.parse(await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,r_frame_rate:format=duration', '-of', 'json', file]));
  const v = (j.streams ?? []).find((/** @type {any} */ s) => s.codec_type === 'video');
  if (!v) throw new Error('that is not a video ffmpeg can read');
  const [a, b] = String(v.r_frame_rate || '30/1').split('/').map(Number);
  return { fps: b ? a / b : 30, seconds: Number(j.format?.duration) || 0, audio: (j.streams ?? []).some((/** @type {any} */ s) => s.codec_type === 'audio') };
}

const MAX_FRAMES = 600;

/**
 * Smooth a clip. mode `slow`: `factor` (2 to 8) times as many frames at the same rate, so it plays that many times slower
 * (the sound is dropped: it would no longer fit). mode `fps`: raised to `fps` frames a second, same length, sound kept.
 * @param {string} root @param {{ src: string, out: string, mode?: string, factor?: number, fps?: number }} a @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function interpolate(root, a, signal, say = () => {}) {
  const dir = rifeDir();
  if (!installed(dir)) await install(dir, signal, say);
  const input = inside(root, a.src);
  const info = await probe(input);
  const mode = a.mode && MODES.includes(a.mode) ? a.mode : 'slow';
  const frames = Math.round(info.seconds * info.fps);
  if (frames < 2) throw new Error('the clip has fewer than two frames: there is nothing to put between');
  if (frames > MAX_FRAMES) throw new Error(`the clip is ${frames} frames long (${info.seconds.toFixed(1)} s); the interpolator takes ${MAX_FRAMES} at most (about ${Math.floor(MAX_FRAMES / info.fps)} s): cut it first`);
  let factor = 1, outFps = info.fps;
  if (mode === 'slow') { factor = Math.min(8, Math.max(2, Math.round(Number(a.factor) || 2))); }
  else {
    outFps = Number(a.fps) || 60;
    if (!(outFps > info.fps && outFps <= 120)) throw new Error(`--fps is above the clip's ${info.fps.toFixed(0)} and at most 120`);
    factor = outFps / info.fps;
  }
  const target = Math.round(frames * factor);
  const rel = `assets/video/${a.out}.mp4`;
  const abs = join(root, rel);
  if (abs === input) throw new Error('--out must not be the name of the file it smooths');
  await mkdir(dirname(abs), { recursive: true });
  const work = join(tmpdir(), `lopesfilm-rife-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    const fin = join(work, 'in'), fout = join(work, 'out');
    mkdirSync(fin); mkdirSync(fout);
    say(`taking the clip apart (${frames} frames)`);
    await ffmpeg(['-i', input, '-vsync', '0', join(fin, '%08d.png')], { timeoutMs: 600_000, what: 'taking the clip apart' }).done;
    say(`making ${target} frames (${MODEL}): minutes on most cards`);
    await exec(exePath(dir), ['-i', fin, '-o', fout, '-m', MODEL, '-n', String(target), '-f', '%08d.png'], signal, join(dir, /** @type {any} */ (runtimeFor()).root));
    say('putting the clip together');
    const keepSound = mode === 'fps' && info.audio;
    await ffmpeg(['-framerate', String(outFps), '-i', join(fout, '%08d.png'), ...(keepSound ? ['-i', input, '-map', '0:v', '-map', '1:a?', '-c:a', 'copy', '-shortest'] : ['-an']),
      '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', abs], { timeoutMs: 900_000, what: 'putting the clip together' }).done;
  } finally { rmSync(work, { recursive: true, force: true }); }
  const { size } = await stat(abs);
  return { src: rel, bytes: size, mode, fps: Number(outFps.toFixed(2)), frames: target, seconds: Number((target / outFps).toFixed(2)), sound: mode === 'fps' && info.audio };
}
