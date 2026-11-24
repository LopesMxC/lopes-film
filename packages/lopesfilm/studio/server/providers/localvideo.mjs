// @ts-check
/**
 * The built-in video maker: Wan 2.1 T2V 1.3B (Alibaba, Apache-2.0), a text-to-video model, run on this computer's
 * graphics card by stable-diffusion.cpp (the same program as the picture maker, Vulkan on Windows and Linux, Metal on a
 * Mac): no account, no key, offline once fetched. The text encoder (umt5-xxl, Q4_K_M) is kept in system memory
 * (`--offload-to-cpu`) and the picture decoder works in tiles (`--vae-tiling`), which is what lets it fit a 6 GB card.
 *
 * About 6.7 GB are fetched the first time a clip is made, into `~/.lopesfilm/models/video` (`LOPESFILM_VIDEO_DIR`), and
 * kept. A clip of 2 to 5 seconds at 480p takes minutes on a card of this class: it is a draft maker, not a render farm.
 * The program writes the clip in its own format; ffmpeg turns it into an H.264 mp4.
 *
 * Experimental: the file list and the flags follow stable-diffusion.cpp's Wan page (docs/wan.md); the model files are
 * checked by size and sha256 as they are fetched.
 */
import { NEEDS, offloadArgs } from '../hardware.mjs';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg } from '../../../src/shared.mjs';
import { landing, mp4Facts, needed, notes, number, text } from './common.mjs';
import { ensureRuntime, exec, fetchTo, runtimeFor } from './localimage.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Lopes.Film video';
const HF = 'https://huggingface.co';

/** The model's files, where they come from and how to check them (sizes and sha256 from the files' own pages). */
export const MODEL_FILES = /** @type {{ name: string, url: string, bytes: number, sha256: string }[]} */ ([
  { name: 'wan2.1_t2v_1.3B_fp16.safetensors', url: `${HF}/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors`, bytes: 2838303560, sha256: 'be531024cd9018cb5b48c40cfbb6a6191645b1c792eb8bf4f8c1c6e10f924dc5' },
  { name: 'umt5-xxl-encoder-Q4_K_M.gguf', url: `${HF}/city96/umt5-xxl-encoder-gguf/resolve/main/umt5-xxl-encoder-Q4_K_M.gguf`, bytes: 3655145312, sha256: '17cf97a5bbbc60a646d6105b832b6f657ce904a8a1ad970e4b59df0c67584a40' },
  { name: 'wan_2.1_vae.safetensors', url: `${HF}/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors`, bytes: 253815318, sha256: '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b' },
]);

export const videoDir = () => process.env.LOPESFILM_VIDEO_DIR || join(homedir(), '.lopesfilm', 'models', 'video');

/** Frames a clip of `seconds` takes: Wan makes 16 pictures a second, and a count of 4n+1. @param {number} seconds */
export function framesFor(seconds) {
  return Math.round(Math.max(1, seconds) * 16 / 4) * 4 + 1;
}

/** The clip's size: 832x480 wide, 480x832 tall, 624x624 square. @param {string} ratio */
export function videoSize(ratio) {
  if (['9:16', '9:21', '2:3', '3:4'].includes(ratio)) return { w: 480, h: 832 };
  if (ratio === '1:1') return { w: 624, h: 624 };
  return { w: 832, h: 480 };
}

/** The program's arguments. @param {{ dir: string, prompt: string, w: number, h: number, frames: number, seed: number, out: string }} o */
export function buildArgs({ dir, prompt, w, h, frames, seed, out }) {
  const m = (/** @type {number} */ i) => join(dir, 'models', MODEL_FILES[i].name);
  return ['-M', 'vid_gen', '--diffusion-model', m(0), '--vae', m(2), '--t5xxl', m(1), '-p', prompt, '--cfg-scale', '6.0',
    '--sampling-method', 'euler', '-W', String(w), '-H', String(h), '--diffusion-fa', '--video-frames', String(frames), '--flow-shift', '3.0',
    '--seed', String(seed), ...offloadArgs(NEEDS.video), '--vae-tiling', '-o', out];
}

/** Whether the model and the program are here. @param {string} [dir] */
export function installed(dir = videoDir()) {
  const rt = runtimeFor();
  return Boolean(rt) && existsSync(join(dir, 'bin', rt?.exe ?? '')) && MODEL_FILES.every((f) => { try { return statSync(join(dir, 'models', f.name)).size === f.bytes; } catch { return false; } });
}

/** Fetch what is missing: the program, then the model. @param {string} dir @param {AbortSignal} signal @param {(line: string) => void} say */
export async function install(dir, signal, say) {
  await ensureRuntime(dir, signal, say);
  for (const [i, f] of MODEL_FILES.entries()) {
    const to = join(dir, 'models', f.name);
    if (existsSync(to) && statSync(to).size === f.bytes) continue;
    say(`fetching the video model: ${f.name} (${i + 1}/${MODEL_FILES.length}, ${(f.bytes / 2 ** 30).toFixed(1)} GB)`);
    await fetchTo(f.url, to, f.bytes, f.sha256, signal);
  }
}

/** The clip the program wrote: the file asked for, else the newest video-like file it left in the folder. @param {string} folder @param {string} out */
function written(folder, out) {
  if (existsSync(out)) return out;
  const found = readdirSync(folder).filter((f) => /\.(avi|mp4|webm|webp|gif)$/i.test(f)).map((f) => join(folder, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  return found ?? null;
}

/** @type {Provider} */
export default {
  id: 'localvideo',
  name: NAME,
  env: '',
  keysUrl: 'https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B',
  billingUrl: 'https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B',
  pricingUrl: 'https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B',
  verbs: ['video'],
  keyless: true,
  models: {
    video: [{ id: 'wan-2.1-t2v-1.3b', name: 'Wan 2.1 1.3B (on this computer, slow: minutes per clip)', spec: {
      ratios: ['16:9', '9:16', '1:1'], seconds: [2, 5], refs: 0,
    } }],
  },
  async run(verb, args, ctx) {
    if (verb !== 'video') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    const said = [];
    for (const flag of ['first-frame', 'last-frame', 'input-reference', 'video']) {
      if (text(args[flag])) said.push(`--${flag} is not used by the built-in video maker (text to video only)`);
    }
    const asked = number(args.duration) ?? 3;
    const seconds = Math.min(5, Math.max(2, Math.round(asked)));
    if (seconds !== asked) said.push(`the built-in video maker makes 2 to 5 second clips: ${seconds} s`);
    const dir = videoDir();
    if (!installed(dir)) await install(dir, ctx.signal, ctx.say);
    const rt = /** @type {NonNullable<ReturnType<typeof runtimeFor>>} */ (runtimeFor());
    const { w, h } = videoSize(text(args['aspect-ratio']));
    const work = join(tmpdir(), `lopesfilm-video-${process.pid}-${Date.now()}`);
    mkdirSync(work, { recursive: true });
    const raw = join(work, 'clip.avi');
    const mp4 = join(work, 'clip.mp4');
    try {
      ctx.say('making the clip on this computer: this takes a few minutes');
      await exec(join(dir, 'bin', rt.exe), buildArgs({ dir, prompt, w, h, frames: framesFor(seconds), seed: Math.floor(Math.random() * 2 ** 31), out: raw }), ctx.signal, join(dir, 'bin'));
      const made = written(work, raw);
      if (!made) throw new Error('the program wrote no clip');
      const { done } = ffmpeg(['-i', made, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '16', '-movflags', '+faststart', '-an', mp4], { timeoutMs: 120_000, what: 'turning the clip into mp4' });
      await done;
      const bytes = new Uint8Array(await readFile(mp4));
      const facts = mp4Facts(bytes);
      const path = landing('video', args.out, 'mp4');
      const dur = facts?.seconds ?? seconds;
      return {
        files: [{ path, bytes }],
        index: [{ src: path, kind: 'video', dur, hasAudio: false, from: { mode: 'generate', prompt, provider: 'localvideo', model: 'wan-2.1-t2v-1.3b', sec: seconds } }],
        receipt: { provider: 'localvideo', model: 'wan-2.1-t2v-1.3b', src: path, dur, hasAudio: false, ...notes(['made on this computer by Wan 2.1 1.3B (no sound)', ...said]) },
      };
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      throw new Error(`${NAME}: the video program stopped (${/** @type {Error} */ (e).message}). A card with less than 6 GB of video memory, little free memory (16 GB is comfortable), or an old driver can do that.`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
};
