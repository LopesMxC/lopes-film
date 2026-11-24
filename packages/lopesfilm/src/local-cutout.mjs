// @ts-check
/**
 * A picture's background taken out on this computer: IS-Net (general use) finds what the picture is of, at the side it was made for (1024 × 1024) on the
 * library's WebAssembly onnxruntime (local-asr.mjs RUNTIME), and the mask it gives, scaled back to the picture's own
 * size, becomes the alpha of a PNG of the whole picture. ffmpeg reads and writes the pictures. Nothing is sent anywhere.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { modelFile } from './local-models.mjs';
import { RUNTIME, runtimeFolder, threads } from './local-asr.mjs';

const run = promisify(execFile);
/** The side the model looks at the picture in, when it does not say. */
const DEFAULT_SIDE = 512;
/**
 * How each model wants the picture and gives the mask: IS-Net (DIS, Apache-2.0) takes pixels minus 0.5 and answers with
 * a mask already between 0 and 1, stretched here to its own lowest and highest; a model that answers with logits
 * (`logits: true`) has them turned into a mask by the sigmoid.
 */
const PROFILES = {
  'isnet-general': { mean: [0.5, 0.5, 0.5], std: [1, 1, 1], logits: false },
};

/** The model, loaded once per process: a video's frames (cutoutMany) all use the same session. */
const sessions = new Map();
/** @param {string} id @returns {Promise<{ ort: any, session: any }>} */
async function sessionOf(id) {
  if (!sessions.has(id)) {
    sessions.set(id, (async () => {
      const ort = await import(pathToFileURL(modelFile(RUNTIME)).href);
      ort.env.wasm.wasmPaths = runtimeFolder();
      ort.env.wasm.numThreads = threads();
      /* its notes on how it optimized the graph are not ours to print */
      ort.env.logLevel = 'error';
      const session = await ort.InferenceSession.create(readFileSync(modelFile(`models/${id}/model.onnx`)), { logSeverityLevel: 3 });
      return { ort, session };
    })());
  }
  return sessions.get(id);
}

/**
 * Every picture of the folder `inDir` (by name) cut out into `outDir` under the same name, with the model loaded once.
 * Prints a line `{"progress":n,"of":total}` after each, for whoever started it to show.
 * @param {string} id @param {string} inDir @param {string} outDir
 */
export async function cutoutMany(id, inDir, outDir) {
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const names = readdirSync(inDir).filter((f) => /\.png$/i.test(f)).sort();
  let n = 0;
  for (const f of names) {
    await cutout(id, join(inDir, f), join(outDir, f));
    console.log(JSON.stringify({ progress: ++n, of: names.length }));
  }
  return { frames: n };
}

/**
 * The picture `src` as a PNG at `out`, its background transparent, by the model `id`. Returns its width and height,
 * and how much of it was kept (0 to 1: none means the model found nothing it is of).
 * @param {string} id @param {string} src @param {string} out
 */
export async function cutout(id, src, out) {
  const { stdout: probe } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]);
  const [width, height] = probe.trim().split(',').map(Number);
  if (!width || !height) throw new Error(`${src} is not a picture ffmpeg can read.`);
  const { ort, session } = await sessionOf(id);
  /* the side the model was made for (1024 in the Hugging Face one), else 512 */
  const shape = /** @type {unknown[] | undefined} */ (session.inputMetadata?.[session.inputNames[0]]?.shape ?? session.inputMetadata?.find?.((m) => m.name === session.inputNames[0])?.shape);
  const SIDE = typeof shape?.[2] === 'number' && shape[2] > 0 ? shape[2] : DEFAULT_SIDE;
  const { stdout: rgb } = await run('ffmpeg', ['-v', 'error', '-nostdin', '-i', src, '-frames:v', '1', '-vf', `scale=${SIDE}:${SIDE}:flags=bicubic`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { encoding: 'buffer', maxBuffer: 64 << 20 });
  const profile = /** @type {Record<string, { mean: number[], std: number[], logits: boolean }>} */ (PROFILES)[id] ?? PROFILES['isnet-general'];
  const n = SIDE * SIDE;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = (rgb[i * 3 + c] / 255 - profile.mean[c]) / profile.std[c];
  const result = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIDE, SIDE]) });
  const logits = /** @type {Float32Array} */ (result[session.outputNames[0]].data);

  const probability = new Float32Array(n);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = profile.logits ? 1 / (1 + Math.exp(-logits[i])) : logits[i];
    probability[i] = a;
    if (a < low) low = a;
    if (a > high) high = a;
  }
  const mask = Buffer.alloc(n);
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const a = profile.logits || high <= low ? probability[i] : (probability[i] - low) / (high - low);
    mask[i] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    kept += a;
  }
  await new Promise((done, fail) => {
    const proc = execFile('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${SIDE}x${SIDE}`, '-i', '-',
      '-filter_complex', `[1:v]scale=${width}:${height}:flags=bicubic[m];[0:v]format=rgba[c];[c][m]alphamerge`, '-frames:v', '1', out],
    (e) => (e ? fail(e) : done(undefined)));
    proc.stdin?.end(mask);
  });
  return { width, height, kept: Math.round((kept / n) * 1000) / 1000 };
}
