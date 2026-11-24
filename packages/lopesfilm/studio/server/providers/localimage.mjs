// @ts-check
/**
 * The built-in picture maker: Z-Image-Turbo (Alibaba Tongyi, Apache-2.0), a 6-billion-parameter text-to-picture model,
 * run on this computer's graphics card by stable-diffusion.cpp (MIT, leejet/stable-diffusion.cpp): no account, no key,
 * offline once fetched. Quantized (Q4_K, 3.9 GB) with its text encoder (Qwen3 4B, Q4_K_M, 2.5 GB) kept in system
 * memory (`--offload-to-cpu`), it needs about 4 GB of video memory: it fits a 6 GB card (an RTX 3050). On Windows and
 * Linux it uses the Vulkan build (any NVIDIA, AMD or Intel card, no CUDA to install); on a Mac, the Metal build.
 *
 * About 7 GB are fetched the first time a picture is made, into `~/.lopesfilm/models/image` (`LOPESFILM_IMAGE_DIR`), and
 * kept. A fetch that stops (the run's time ran out, the connection dropped) goes on from where it was when it is run again.
 */
import { NEEDS, offloadArgs } from '../hardware.mjs';
import { noteCommand } from '../engine-current.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { landing, madePicture, needed, text } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'Lopes.Film image';
const TAG = 'master-872-cc515a0';
const RELEASE = `https://github.com/leejet/stable-diffusion.cpp/releases/download/${TAG}`;
const HF = 'https://huggingface.co';

/** The model's files, where they come from and how to check them. */
export const MODEL_FILES = /** @type {{ name: string, url: string, bytes: number, sha256: string }[]} */ ([
  { name: 'z_image_turbo-Q4_K.gguf', url: `${HF}/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf`, bytes: 3864250304, sha256: '14b375ab4f226bc5378f68f37e899ef3c2242b8541e61e2bc1aff40976086fbd' },
  { name: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', url: `${HF}/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, bytes: 2497281120, sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597' },
  { name: 'ae.safetensors', url: `${HF}/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors`, bytes: 335304388, sha256: 'afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38' },
]);

/** The runtime for this computer: the zip of the release and the program in it; null where there is none. @param {string} [platform] @param {string} [arch] */
export function runtimeFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { zip: `sd-master-cc515a0-bin-win-vulkan-x64.zip`, exe: 'sd-cli.exe' };
  if (platform === 'linux' && arch === 'x64') return { zip: 'sd-master-cc515a0-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip', exe: 'sd-cli' };
  if (platform === 'darwin' && arch === 'arm64') return { zip: 'sd-master-cc515a0-bin-Darwin-macOS-26.6.2-arm64.zip', exe: 'sd-cli' };
  return null;
}

export const imageDir = () => process.env.LOPESFILM_IMAGE_DIR || join(homedir(), '.lopesfilm', 'models', 'image');
const downloadBase = () => process.env.LOPESFILM_IMAGE_RELEASE_URL || RELEASE;

/** How a picture of `ratio` ("16:9") and `quality` is sized: the longer side, both sides a multiple of 16. @param {string} ratio @param {string} quality */
export function sizeFor(ratio, quality) {
  const [a, b] = ratio.split(':').map(Number);
  const long = quality === 'high' ? 1280 : quality === 'medium' ? 1024 : 768;
  const w = a >= b ? long : long * (a / b), h = a >= b ? long * (b / a) : long;
  const snap = (/** @type {number} */ v) => Math.max(256, Math.round(v / 16) * 16);
  return { w: snap(w), h: snap(h) };
}

/** The program's arguments. @param {{ dir: string, prompt: string, w: number, h: number, steps: number, seed: number, out: string, fast?: boolean }} o */
export function buildArgs({ dir, prompt, w, h, steps, seed, out, fast = true }) {
  const m = (/** @type {number} */ i) => join(dir, 'models', MODEL_FILES[i].name);
  return ['--diffusion-model', m(0), '--vae', m(2), '--llm', m(1), '-p', prompt, '--cfg-scale', '1.0', '--steps', String(steps),
    '-W', String(w), '-H', String(h), '--seed', String(seed), ...offloadArgs(NEEDS.image), ...(fast ? ['--diffusion-fa'] : []), '-o', out];
}

/** Whether the model and the program are here. @param {string} [dir] */
export function installed(dir = imageDir()) {
  const rt = runtimeFor();
  return Boolean(rt) && existsSync(join(dir, 'bin', rt?.exe ?? '')) && MODEL_FILES.every((f) => { try { return statSync(join(dir, 'models', f.name)).size === f.bytes; } catch { return false; } });
}

/** Fetch `url` to `to`, going on from a part already there. @param {string} url @param {string} to @param {number} bytes @param {string | undefined} sha256 @param {AbortSignal} signal */
const inFlight = new Map();
export function fetchTo(url, to, bytes, sha256, signal) {
  /* the same file asked for twice at once (the image and the video engine share one program) is fetched once */
  const running = inFlight.get(to);
  if (running) return running;
  const job = fetchOnce(url, to, bytes, sha256, signal).finally(() => inFlight.delete(to));
  inFlight.set(to, job);
  return job;
}

/** The sha256 of a file of any size, read in pieces (readFile refuses a file over 2 GiB). @param {string} file */
export async function sha256Of(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** What went wrong with a fetch, as the person can use it: undici says only "fetch failed" and keeps the reason in `cause`. @param {any} e */
const why = (e) => { const c = e?.cause; return [e?.message, c?.code, c?.message].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(': '); };
const sleep = (/** @type {number} */ ms, /** @type {AbortSignal} */ signal) => new Promise((done) => { const t = setTimeout(done, ms); signal?.addEventListener('abort', () => { clearTimeout(t); done(undefined); }, { once: true }); });

/** A big file over a bad connection: a drop goes on from the part already fetched, up to 12 times, waiting longer each time. */
async function fetchOnce(url, to, bytes, sha256, signal) {
  const tries = Number(process.env.LOPESFILM_FETCH_TRIES) || 12;
  let last = /** @type {any} */ (null);
  for (let i = 0; i < tries; i++) {
    if (signal?.aborted) throw new Error('cancelled');
    try { return await fetchAttempt(url, to, bytes, sha256, signal); } catch (e) {
      if (signal?.aborted) throw e;
      if (/** @type {any} */ (e)?.permanent) throw e;
      last = e;
      await sleep(Math.min(30_000, 1_000 * 2 ** i) * (process.env.LOPESFILM_FETCH_WAIT === undefined ? 1 : Number(process.env.LOPESFILM_FETCH_WAIT)), signal);
    }
  }
  throw new Error(`${NAME}: ${url} could not be fetched (${why(last)}). The part fetched is kept: run it again when the connection is back.`);
}

async function fetchAttempt(url, to, bytes, sha256, signal) {
  const part = `${to}.part`;
  mkdirSync(join(to, '..'), { recursive: true });
  let have = existsSync(part) ? statSync(part).size : 0;
  /* a part as long as the whole (or longer: a stale one) cannot be gone on from: 416 */
  if (bytes && have >= bytes) { rmSync(part, { force: true }); have = 0; }
  let res = await fetch(url, { signal, redirect: 'follow', headers: have ? { range: `bytes=${have}-` } : {} });
  /* 416 Range Not Satisfiable: the part is no use (a changed file, an unknown size): start again from the first byte */
  if (res.status === 416 && have) {
    rmSync(part, { force: true }); have = 0;
    res = await fetch(url, { signal, redirect: 'follow' });
  }
  if (!res.ok && res.status !== 206) {
    /* a refusal that will not change (not found, forbidden) is not tried again; a busy server (429, 5xx) is */
    throw Object.assign(new Error(`${NAME}: ${url} answered ${res.status}. Try again later.`), { permanent: res.status < 500 && res.status !== 429 && res.status !== 408 });
  }
  const resumed = res.status === 206;
  await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), createWriteStream(part, { flags: resumed ? 'a' : 'w' }));
  const got = statSync(part).size;
  /* closed early with no error: the part stays and the next try goes on from it */
  if (bytes && got < bytes) throw new Error(`${NAME}: ${to} came incomplete (${got} of ${bytes} bytes)`);
  if (bytes && got > bytes) { rmSync(part, { force: true }); throw new Error(`${NAME}: ${to} came longer than it should`); }
  if (sha256 && (await sha256Of(part)) !== sha256) { rmSync(part, { force: true }); throw Object.assign(new Error(`${NAME}: ${to} did not match its checksum. Run it again.`), { permanent: true }); }
  renameSync(part, to);
}

/** @param {string} cmd @param {string[]} args @param {AbortSignal} [signal] @param {string} [cwd] @returns {Promise<string>} its output */
export function exec(cmd, args, signal, cwd) {
  return new Promise((done, fail) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let log = '';
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    const stop = () => p.kill();
    signal?.addEventListener('abort', stop, { once: true });
    p.on('error', (e) => { noteCommand(cmd, false); fail(e); });
    p.on('close', (code) => { signal?.removeEventListener('abort', stop); if (!signal?.aborted) noteCommand(cmd, code === 0); if (signal?.aborted) fail(new Error('cancelled')); else if (code === 0) done(log); else fail(Object.assign(new Error(log.trim().split('\n').slice(-3).join(' | ') || `exit ${code}`), { log })); });
  });
}

/** Fetch the program (stable-diffusion.cpp) into `dir/bin` when it is not there. @param {string} dir @param {AbortSignal} signal @param {(line: string) => void} say */
let runtimeQueue = Promise.resolve();
let runtimeWaiting = 0;
export function ensureRuntime(dir, signal, say) {
  /* one at a time: two engines fetching the same zip would trample it (one renames or deletes it under the other) */
  runtimeWaiting++;
  const job = runtimeQueue.then(() => ensureRuntimeNow(dir, signal, say)).finally(() => { runtimeWaiting--; });
  runtimeQueue = job.catch(() => {});
  return job;
}

async function ensureRuntimeNow(dir, signal, say) {
  const rt = runtimeFor();
  if (!rt) throw new Error(`${NAME} runs on Windows (x64), Linux (x64) and Mac (Apple chips) only.`);
  if (existsSync(join(dir, 'bin', rt.exe))) return;
  say('fetching the picture program (stable-diffusion.cpp)');
  const zip = join(tmpdir(), `lopesfilm-${rt.zip}`);
  if (!existsSync(zip)) await fetchTo(`${downloadBase()}/${rt.zip}`, zip, 0, undefined, signal);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  await (process.platform === 'linux' ? exec('unzip', ['-o', '-q', zip, '-d', join(dir, 'bin')], signal) : exec('tar', ['-xf', zip, '-C', join(dir, 'bin')], signal));
  if (runtimeWaiting <= 1) rmSync(zip, { force: true });
  /* a zip that holds its files in a folder: lift them */
  if (!existsSync(join(dir, 'bin', rt.exe))) {
    const sub = readdirSync(join(dir, 'bin'), { withFileTypes: true }).find((e) => e.isDirectory() && existsSync(join(dir, 'bin', e.name, rt.exe)));
    if (!sub) throw new Error(`${NAME}: the program ${rt.exe} is not in what was fetched.`);
    for (const f of readdirSync(join(dir, 'bin', sub.name))) renameSync(join(dir, 'bin', sub.name, f), join(dir, 'bin', f));
  }
  if (process.platform !== 'win32') await exec('chmod', ['+x', join(dir, 'bin', rt.exe)]);
}

/** Fetch what is missing: the program, then the model. @param {string} dir @param {AbortSignal} signal @param {(line: string) => void} say */
export async function install(dir, signal, say) {
  await ensureRuntime(dir, signal, say);
  for (const [i, f] of MODEL_FILES.entries()) {
    const to = join(dir, 'models', f.name);
    if (existsSync(to) && statSync(to).size === f.bytes) continue;
    say(`fetching the picture model: ${f.name} (${i + 1}/${MODEL_FILES.length}, ${(f.bytes / 2 ** 30).toFixed(1)} GB)`);
    await fetchTo(f.url, to, f.bytes, f.sha256, signal);
  }
}

/** @type {Provider} */
export default {
  id: 'localimage',
  name: NAME,
  env: '',
  keysUrl: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo',
  billingUrl: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo',
  pricingUrl: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo',
  verbs: ['image'],
  keyless: true,
  models: {
    image: [{ id: 'z-image-turbo', name: 'Z-Image-Turbo (on this computer, about 4 GB of video memory)', spec: {
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'], refs: 0, qualities: ['low', 'medium', 'high'],
    } }],
  },
  async run(verb, args, ctx) {
    if (verb !== 'image') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    const ignored = ['ref', 'mask', 'markup', 'transparent'].filter((f) => args[f] !== undefined).map((f) => `--${f} is not used by the built-in picture maker`);
    if (text(args.format) && text(args.format) !== 'png') throw new Error(`${NAME} makes PNG pictures only.`);
    const dir = imageDir();
    if (!installed(dir)) await install(dir, ctx.signal, ctx.say);
    const rt = /** @type {NonNullable<ReturnType<typeof runtimeFor>>} */ (runtimeFor());
    const { w, h } = sizeFor(text(args.ratio) || '3:2', text(args.quality) || 'low');
    const out = join(tmpdir(), `lopesfilm-image-${process.pid}-${Date.now()}.png`);
    const base = { dir, prompt, w, h, steps: 8, seed: Math.floor(Math.random() * 2 ** 31), out };
    const exe = join(dir, 'bin', rt.exe);
    try {
      try { await exec(exe, buildArgs(base), ctx.signal, join(dir, 'bin')); }
      catch (e) {
        /* a build of the program that spells the flash-attention flag otherwise: once more without it */
        if (ctx.signal.aborted || !/diffusion-fa|unknown|invalid|unrecogni/i.test(String(/** @type {Error} */ (e).message))) throw e;
        await exec(exe, buildArgs({ ...base, fast: false }), ctx.signal, join(dir, 'bin'));
      }
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      throw new Error(`${NAME}: the picture program stopped (${/** @type {Error} */ (e).message}). A card with less than 4 GB of video memory free, or an old driver, can do that.`);
    }
    const bytes = new Uint8Array(await readFile(out));
    rmSync(out, { force: true });
    const path = landing('image', args.out, 'png');
    return madePicture({ path, bytes, prompt, provider: 'localimage', model: 'z-image-turbo',
      notes: ['made on this computer by Z-Image-Turbo', ...ignored] });
  },
};
