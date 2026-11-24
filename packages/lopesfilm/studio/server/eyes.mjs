// @ts-check
/**
 * Eye contact on this computer (src/local-eyes.mjs does the work, in a process of its own so its memory is given back
 * and Studio goes on): the models, about 5 MB, are fetched the first time into `~/.lopesfilm/models/eyes`
 * (`LOPESFILM_EYES_DIR`) and checked by size and sha256.
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTo } from './providers/localimage.mjs';
import { inside } from './files.mjs';

const HF = 'https://huggingface.co';
/** The models, pinned to the commit they were checked at. */
export const MODEL_FILES = [
  { name: 'yunet.onnx', url: `${HF}/opencv/face_detection_yunet/resolve/3cc26e7f1014a5ee5d74a42acee58bafc9d0a310/face_detection_yunet_2023mar.onnx`, bytes: 232589, sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4' },
  { name: 'face_landmarks.onnx', url: `${HF}/fernandotonon/QtMeshEditor-facemesh-onnx/resolve/32714088ed9830a98df6ee653ad406a3b83ef014/face_landmarks.onnx`, bytes: 4920979, sha256: 'd16e5a55e6a480284d468ee32469692464049518c311662ab3956681de31e3e9' },
];
export const EYES_BYTES = MODEL_FILES.reduce((n, f) => n + f.bytes, 0);
export const eyesDir = () => process.env.LOPESFILM_EYES_DIR || join(homedir(), '.lopesfilm', 'models', 'eyes');
const RUN = fileURLToPath(new URL('../../src/local-eyes.mjs', import.meta.url));

/** Whether the models are here. @param {string} [dir] */
export const installed = (dir = eyesDir()) => MODEL_FILES.every((f) => { try { return statSync(join(dir, f.name)).size === f.bytes; } catch { return false; } });

/** Fetch what is missing. @param {string} [dir] @param {AbortSignal} [signal] @param {(line: string) => void} [say] */
export async function install(dir = eyesDir(), signal = new AbortController().signal, say = () => {}) {
  for (const f of MODEL_FILES) {
    const to = join(dir, f.name);
    if (existsSync(to) && statSync(to).size === f.bytes) continue;
    say(`fetching the eye model: ${f.name}`);
    await fetchTo(f.url, to, f.bytes, f.sha256, signal);
  }
}

/**
 * Correct the eyes of `a.src` (a picture or a video of the project) into assets/video/<out>.mp4 (assets/image/<out>.png).
 * @param {string} root @param {{ src: string, out: string, strength?: number }} a @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function eyes(root, a, signal, say = () => {}) {
  const dir = eyesDir();
  if (!installed(dir)) await install(dir, signal, say);
  const input = inside(root, a.src);
  const still = /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(input);
  const rel = `assets/${still ? 'image' : 'video'}/${a.out}.${still ? 'png' : 'mp4'}`;
  const abs = join(root, rel);
  if (abs === input) throw new Error('--out must not be the name of the file it corrects');
  await mkdir(dirname(abs), { recursive: true });
  const strength = Math.min(1, Math.max(0, a.strength ?? 0.9));
  const done = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [RUN, input, abs, String(strength)], { windowsHide: true, env: { ...process.env, LOPESFILM_EYES_DIR: dir, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } });
    let last = '', buf = '';
    signal?.addEventListener('abort', () => p.kill(), { once: true });
    p.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n'); buf = lines.pop() ?? '';
      for (const line of lines) { if (line.trim()) last = line; try { const j = JSON.parse(line); if (j.progress) say(`eye contact: frame ${j.progress} of ${j.of}`); } catch { /* not ours */ } }
    });
    p.on('error', reject);
    p.on('close', () => {
      if (buf.trim()) last = buf.trim();
      try { const j = JSON.parse(last); if (j.error) reject(new Error(j.error)); else resolve(j); } catch { reject(new Error(signal?.aborted ? 'cancelled' : 'the eye program stopped without an answer')); }
    });
  });
  const { size } = await stat(abs);
  const { frames, corrected } = /** @type {{ frames: number, corrected: number }} */ (done);
  return { src: rel, bytes: size, frames, eyesMoved: corrected, strength };
}
