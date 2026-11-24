// @ts-check
/**
 * Upscaling on this computer: Real-ESRGAN (BSD-3-Clause) through its official ncnn-Vulkan program, which runs on any
 * graphics card (NVIDIA, AMD, Intel; no CUDA to install) and on a Mac. A picture, or a short clip frame by frame, comes
 * back larger and sharper; nothing is sent anywhere. About 45 MB are fetched the first time, from the project's own GitHub
 * release, into `~/.lopesfilm/models/upscale` (`LOPESFILM_UPSCALE_DIR`), and checked by size and sha256.
 *
 * Styles: `photo` (realesrgan-x4plus, real footage and pictures), `anime` (realesrgan-x4plus-anime, drawings), `fast`
 * (realesr-animevideov3, light and quick: the one for clips).
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';
import { ffmpeg } from '../../src/shared.mjs';

const BASE = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0';
/** The program for this computer: its zip, size and sha256, and the program in it; null where there is none. @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { zip: 'realesrgan-ncnn-vulkan-20220424-windows.zip', bytes: 45474481, sha256: 'abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d', exe: 'realesrgan-ncnn-vulkan.exe' };
  if (platform === 'linux' && arch === 'x64') return { zip: 'realesrgan-ncnn-vulkan-20220424-ubuntu.zip', bytes: 46931474, sha256: 'e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96', exe: 'realesrgan-ncnn-vulkan' };
  if (platform === 'darwin') return { zip: 'realesrgan-ncnn-vulkan-20220424-macos.zip', bytes: 51817124, sha256: 'e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a', exe: 'realesrgan-ncnn-vulkan' };
  return null;
}
export const upscaleDir = () => process.env.LOPESFILM_UPSCALE_DIR || join(homedir(), '.lopesfilm', 'models', 'upscale');
export const UPSCALE_BYTES = 45474481;
export const STYLES = ['photo', 'anime', 'fast'];

/** Whether the program and its models are here. @param {string} [dir] */
export function installed(dir = upscaleDir()) {
  const rt = runtimeFor();
  return Boolean(rt) && existsSync(join(dir, rt?.exe ?? '')) && existsSync(join(dir, 'models', 'realesrgan-x4plus.bin'));
}

/** Fetch the program and its models. @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function install(dir = upscaleDir(), signal = new AbortController().signal, say = () => {}) {
  const rt = runtimeFor();
  if (!rt) throw new Error('Upscaling runs on Windows (x64), Linux (x64) and Mac only.');
  if (installed(dir)) return;
  say('fetching the upscaler (Real-ESRGAN, about 45 MB)');
  const zip = join(tmpdir(), `lopesfilm-${rt.zip}`);
  await fetchTo(`${process.env.LOPESFILM_UPSCALE_RELEASE_URL || BASE}/${rt.zip}`, zip, rt.bytes, rt.sha256, signal);
  mkdirSync(dir, { recursive: true });
  await (process.platform === 'win32' ? exec('tar', ['-xf', zip, '-C', dir], signal) : exec('unzip', ['-o', '-q', zip, '-d', dir], signal));
  rmSync(zip, { force: true });
  if (process.platform !== 'win32') await exec('chmod', ['+x', join(dir, rt.exe)]);
  if (!installed(dir)) throw new Error('the upscaler is not in what was fetched');
}

/** The program's model and scale for a style and the factor asked. @param {string} style @param {number} scale */
export function modelFor(style, scale) {
  if (style === 'anime') return { n: 'realesrgan-x4plus-anime', s: 4 };
  if (style === 'fast') return { n: 'realesr-animevideov3', s: scale };
  return { n: 'realesrgan-x4plus', s: 4 };
}

/** The ffmpeg filter that brings a program's output down to the factor asked (the x4 models make 4). @param {number} made @param {number} scale */
export const trim = (made, scale) => (made === scale ? '' : `scale=iw*${scale}/${made}:ih*${scale}/${made}:flags=lanczos`);

/** @param {string} file @returns {Promise<{ width: number, height: number, fps: number, seconds: number }>} */
async function probe(file) {
  const out = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file]);
  const j = JSON.parse(out);
  const s = j.streams?.[0];
  if (!s) throw new Error('that is not a picture or video ffmpeg can read');
  const [a, b] = String(s.r_frame_rate || '30/1').split('/').map(Number);
  return { width: s.width, height: s.height, fps: b ? a / b : 30, seconds: Number(j.format?.duration) || 0 };
}

const MAX_FRAMES = 900;

/**
 * Upscale `a.src` (a picture or a video of the project) into assets/image/<out>.png or assets/video/<out>.mp4.
 * @param {string} root @param {{ src: string, out: string, scale?: number, style?: string }} a @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function upscale(root, a, signal, say = () => {}) {
  const dir = upscaleDir();
  if (!installed(dir)) await install(dir, signal, say);
  const rt = /** @type {NonNullable<ReturnType<typeof runtimeFor>>} */ (runtimeFor());
  const exe = join(dir, rt.exe);
  const input = inside(root, a.src);
  const scale = Math.min(4, Math.max(2, Math.round(Number(a.scale) || 2)));
  const info = await probe(input);
  const isVideo = /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(input) || info.seconds > 0.2 && !/\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(input);
  const style = a.style && STYLES.includes(a.style) ? a.style : isVideo ? 'fast' : 'photo';
  const { n, s } = modelFor(style, scale);
  const rel = `assets/${isVideo ? 'video' : 'image'}/${a.out}.${isVideo ? 'mp4' : 'png'}`;
  const abs = join(root, rel);
  if (abs === input) throw new Error('--out must not be the name of the file it upscales');
  await mkdir(dirname(abs), { recursive: true });
  const work = join(tmpdir(), `lopesfilm-upscale-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    if (!isVideo) {
      say(`upscaling the picture ${scale}x (${style})`);
      const big = join(work, 'big.png');
      await exec(exe, ['-i', input, '-o', big, '-n', n, '-s', String(s), '-f', 'png'], signal, dir);
      const cut = trim(s, scale);
      if (cut) await ffmpeg(['-i', big, '-vf', cut, '-frames:v', '1', abs], { what: 'sizing the picture' }).done;
      else renameSync(big, abs);
    } else {
      const frames = Math.round(info.seconds * info.fps);
      if (frames > MAX_FRAMES) throw new Error(`the clip is ${frames} frames long (${info.seconds.toFixed(1)} s); the upscaler takes ${MAX_FRAMES} at most (about ${Math.floor(MAX_FRAMES / info.fps)} s): cut it first`);
      const fin = join(work, 'in'), fout = join(work, 'out');
      mkdirSync(fin); mkdirSync(fout);
      say(`taking the clip apart (${frames} frames)`);
      await ffmpeg(['-i', input, '-vsync', '0', join(fin, '%06d.png')], { timeoutMs: 600_000, what: 'taking the clip apart' }).done;
      say(`upscaling ${frames} frames ${scale}x (${style}): minutes on most cards`);
      await exec(exe, ['-i', fin, '-o', fout, '-n', n, '-s', String(s), '-f', 'png'], signal, dir);
      say('putting the clip together');
      const cut = trim(s, scale);
      await ffmpeg(['-framerate', String(info.fps), '-i', join(fout, '%06d.png'), '-i', input, '-map', '0:v', '-map', '1:a?',
        ...(cut ? ['-vf', cut] : []), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', abs],
      { timeoutMs: 900_000, what: 'putting the clip together' }).done;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const { size } = await stat(abs);
  const after = await probe(abs).catch(() => null);
  return { src: rel, bytes: size, ...(after ? { width: after.width, height: after.height } : {}), style, scale };
}

const CHUNK_FRAMES = 150;

/**
 * Bring a finished export up to `shortEdge` (4K: 2160) with the upscaler, a film of any length: its frames are taken
 * apart, enlarged and put back together `CHUNK_FRAMES` at a time, so the disk holds a few seconds of pictures, not all
 * of them. The sound is copied from the original. A file already that large is only copied.
 * @param {string} input @param {string} output an .mp4 @param {{ shortEdge?: number, signal?: AbortSignal, onProgress?: (done: number) => void, say?: (line: string) => void }} [o]
 */
export async function upscaleVideoFile(input, output, { shortEdge = 2160, signal, onProgress = () => {}, say = () => {} } = {}) {
  const dir = upscaleDir();
  if (!installed(dir)) await install(dir, signal, say);
  const rt = /** @type {NonNullable<ReturnType<typeof runtimeFor>>} */ (runtimeFor());
  const exe = join(dir, rt.exe);
  const info = await probe(input);
  const edge = Math.min(info.width, info.height);
  if (edge >= shortEdge) { await ffmpeg(['-i', input, '-c', 'copy', '-movflags', '+faststart', output], { what: 'copying the film' }).done; return { upscaled: false, width: info.width, height: info.height }; }
  const factor = shortEdge / edge;
  const scale = Math.min(4, Math.max(2, Math.ceil(factor)));
  /* realesr-animevideov3 makes any factor 2 to 4 and is the quick one; the x4 models would make 4 whatever is asked */
  const { n, s } = modelFor('fast', scale);
  const outW = Math.round((info.width * factor) / 2) * 2, outH = Math.round((info.height * factor) / 2) * 2;
  const total = Math.max(1, Math.round(info.seconds * info.fps));
  const work = join(tmpdir(), `lopesfilm-up4k-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const parts = [];
  try {
    for (let start = 0, i = 0; start < total; start += CHUNK_FRAMES, i++) {
      if (signal?.aborted) throw new Error('cancelled');
      const fin = join(work, `in${i}`), fout = join(work, `out${i}`), part = join(work, `part${i}.mp4`);
      mkdirSync(fin); mkdirSync(fout);
      say(`4K ${Math.min(100, Math.round((start / total) * 100))}%`);
      await ffmpeg(['-ss', String(start / info.fps), '-i', input, '-frames:v', String(CHUNK_FRAMES), '-vsync', '0', join(fin, '%06d.png')], { timeoutMs: 600_000, what: 'taking the film apart' }).done;
      await exec(exe, ['-i', fin, '-o', fout, '-n', n, '-s', String(s), '-f', 'png'], signal, dir);
      await ffmpeg(['-framerate', String(info.fps), '-i', join(fout, '%06d.png'), '-vf', `scale=${outW}:${outH}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p', '-an', part], { timeoutMs: 900_000, what: 'putting the film together' }).done;
      rmSync(fin, { recursive: true, force: true }); rmSync(fout, { recursive: true, force: true });
      parts.push(part);
      onProgress(Math.min(1, (start + CHUNK_FRAMES) / total));
    }
    const list = join(work, 'parts.txt');
    writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-i', input, '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-movflags', '+faststart', output], { timeoutMs: 900_000, what: 'joining the film' }).done;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return { upscaled: true, width: outW, height: outH };
}
