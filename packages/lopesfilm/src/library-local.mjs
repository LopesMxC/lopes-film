// @ts-check
/**
 * Library search by meaning, run on this computer (Settings → Services → Library search: Local): the same model as
 * Lopes.Film's service (multilingual-e5-small, int8, MIT), downloaded once (~120 MB) to ~/.lopesfilm/models/library, and
 * the library's vectors (library/vectors.i8) compared with the search's by cosine. Nothing leaves this computer, not
 * even the words of a search. Until the model is here a search answers with its words alone (null), and the model is
 * fetched in the background, once.
 *
 *   LOPESFILM_LIBRARY_MODEL_DIR   where the model is kept
 *   LOPESFILM_LIBRARY_MODEL_URL   where it is fetched from (Xenova/multilingual-e5-small on Hugging Face)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { libraryFile } from '../studio/server/library.mjs';
import { manifest } from './library-semantic.mjs';
import { loadEmbedder, packVocabulary } from './sentence-model.mjs';

export const modelDir = () => process.env.LOPESFILM_LIBRARY_MODEL_DIR?.trim() || join(homedir(), '.lopesfilm', 'models', 'library');
const modelUrl = () => (process.env.LOPESFILM_LIBRARY_MODEL_URL?.trim() || 'https://huggingface.co/Xenova/multilingual-e5-small/resolve/main').replace(/\/+$/, '');
const sha = (/** @type {Uint8Array} */ b) => createHash('sha256').update(b).digest('hex');

/** The cosines of a search vector with each thing's int8 vector (each its own scale), the things of `cat` only, best first. */
export function rank(/** @type {Float32Array} */ q, /** @type {Int8Array} */ values, /** @type {{ ids: string[], cats: string[], scales: number[], dims: number }} */ meta, /** @type {string} */ cat, limit = 50) {
  /** @type {[string, number][]} */
  const scored = [];
  for (let n = 0; n < meta.ids.length; n++) {
    if (meta.cats[n] !== cat) continue;
    let dot = 0;
    const at = n * meta.dims;
    for (let k = 0; k < meta.dims; k++) dot += values[at + k] * q[k];
    scored.push([meta.ids[n], Math.round(dot * meta.scales[n] * 1e6) / 1e6]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** The model's three files, as the manifest names them, in the model folder. */
function files() {
  const m = manifest();
  if (!m) return null;
  const dir = modelDir();
  const require = createRequire(import.meta.url);
  let runtime = '';
  try { runtime = join(dirname(require.resolve('onnxruntime-web')), 'ort.wasm.min.mjs'); } catch { return null; }
  return { m, dir, onnx: join(dir, 'model_quantized.onnx'), tokenizer: join(dir, 'vocab.bin'), runtime };
}

/** Fetches the model when it is not here (sizes and hashes as library/models.json says), kept whole or not at all. */
async function fetchModel(/** @type {NonNullable<ReturnType<typeof files>>} */ f) {
  mkdirSync(f.dir, { recursive: true });
  const want = new Map(f.m.files.map((x) => [x.path.split('/').pop(), x.sha256]));
  if (!existsSync(f.onnx) || sha(readFileSync(f.onnx)) !== want.get('model_quantized.onnx')) {
    const res = await fetch(`${modelUrl()}/onnx/model_quantized.onnx`);
    if (!res.ok) throw new Error(`the model answered ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (sha(bytes) !== want.get('model_quantized.onnx')) throw new Error('the model downloaded is not the one expected');
    writeFileSync(`${f.onnx}.part`, bytes);
    renameSync(`${f.onnx}.part`, f.onnx);
  }
  if (!existsSync(f.tokenizer) || sha(readFileSync(f.tokenizer)) !== want.get('vocab.bin')) {
    const res = await fetch(`${modelUrl()}/tokenizer.json`);
    if (!res.ok) throw new Error(`the tokenizer answered ${res.status}`);
    const json = `${f.dir}/tokenizer.json`;
    writeFileSync(json, new Uint8Array(await res.arrayBuffer()));
    const packed = packVocabulary(json);
    if (sha(packed) !== want.get('vocab.bin')) throw new Error('the tokenizer downloaded is not the one expected');
    writeFileSync(f.tokenizer, packed);
  }
}

/** @type {Promise<(text: string) => Promise<Float32Array>> | null} */
let embedding = null;
/** @type {Promise<void> | null} */
let fetching = null;
/** What went wrong with the model last (said in Settings), or ''. */
export let problem = '';

/** The things' vectors, read once. @type {{ meta: any, values: Int8Array } | null} */
let vectors = null;
function vectorsOf() {
  if (vectors) return vectors;
  const json = libraryFile('vectors.json');
  const i8 = libraryFile('vectors.i8');
  if (!json || !i8) return null;
  const bytes = readFileSync(i8);
  vectors = { meta: JSON.parse(readFileSync(json, 'utf8')), values: new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  return vectors;
}

/** Whether the model is here and the search can run now. */
export function localReady() {
  const f = files();
  return Boolean(f && existsSync(f.onnx) && existsSync(f.tokenizer) && vectorsOf());
}

/**
 * The things of `cat` nearest in meaning to `query`: [id, cosine], at most `limit`; null while the model is not here (it
 * is fetched in the background) or cannot run.
 * @param {string} query @param {string} cat @param {number} [limit]
 * @returns {Promise<[string, number][] | null>}
 */
export async function localNearest(query, cat, limit = 50) {
  const f = files();
  const v = vectorsOf();
  if (!f || !v) return null;
  if (!existsSync(f.onnx) || !existsSync(f.tokenizer)) {
    fetching ??= fetchModel(f).then(() => { problem = ''; }, (e) => { problem = /** @type {Error} */ (e).message; fetching = null; });
    return null;
  }
  try {
    embedding ??= loadEmbedder({ runtime: f.runtime, onnx: f.onnx, tokenizer: f.tokenizer });
    const q = await (await embedding)(`query: ${query}`);
    return rank(q, v.values, v.meta, cat, limit);
  } catch (e) {
    embedding = null;
    problem = /** @type {Error} */ (e).message;
    return null;
  }
}
