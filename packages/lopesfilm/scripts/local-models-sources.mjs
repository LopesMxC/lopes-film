#!/usr/bin/env node
// @ts-check
/**
 * library/local-models.json (the files of each Local model: size and sha256) and library/model-sources.json (where each
 * file is fetched from), read from the models' own homes: Hugging Face (Whisper, IS-Net) and the npm packages'
 * files on jsDelivr (onnxruntime-web, transformers.js). Large files take the sha256 Hugging Face publishes for them
 * (its LFS oid), so nothing big is downloaded here; the small ones are fetched once and hashed.
 *
 *   node scripts/local-models-sources.mjs
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { builtInRoot } from '../studio/server/library.mjs';

const ORT = 'onnxruntime-web@1.31.1';
const TRANSFORMERS = '@huggingface/transformers@4.3.2';
const jsd = (/** @type {string} */ pkg, /** @type {string} */ file) => `https://cdn.jsdelivr.net/npm/${pkg}/dist/${file}`;
const hf = (/** @type {string} */ repo, /** @type {string} */ file) => `https://huggingface.co/${repo}/resolve/main/${file}`;

/** @type {{ path: string, url: string }[]} */
const RUNTIME = ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']
  .map((f) => ({ path: `models/onnxruntime-web-1.31.1/${f}`, url: jsd(ORT, f) }));
const TRANSFORMERS_JS = { path: 'models/transformers-4.3.2/transformers.min.js', url: jsd(TRANSFORMERS, 'transformers.min.js') };
/* the `_timestamped` export keeps the cross-attentions that word timing reads */
const WHISPER = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
const whisper = (/** @type {string} */ id, /** @type {string} */ repo) => [...RUNTIME, TRANSFORMERS_JS, ...WHISPER.map((f) => ({ path: `models/${id}/${f}`, url: hf(repo, f) }))];

const MODELS = [
  { id: 'whisper-small', files: whisper('whisper-small', 'Xenova/whisper-small') },
  { id: 'whisper-large-v3-turbo', files: whisper('whisper-large-v3-turbo', 'onnx-community/whisper-large-v3-turbo_timestamped') },
  /* IS-Net general use, int8 (Apache-2.0): BiRefNet-lite needs more memory at 1024 than a WebAssembly runtime has (4 GB) */
  { id: 'isnet-general', files: [...RUNTIME, { path: 'models/isnet-general/model.onnx', url: hf('Ko033/isnet-general-use-onnx', 'onnx/model_quantized.onnx') }] },
];

/** @type {Map<string, Map<string, { size: number, oid: string | null }>>} */
const trees = new Map();
async function tree(/** @type {string} */ repo) {
  if (!trees.has(repo)) {
    const res = await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=1`);
    if (!res.ok) throw new Error(`${repo}: the file list answered ${res.status}`);
    const list = /** @type {{ path: string, size: number, lfs?: { oid: string } }[]} */ (await res.json());
    trees.set(repo, new Map(list.map((e) => [e.path, { size: e.size, oid: e.lfs?.oid ?? null }])));
  }
  return /** @type {Map<string, { size: number, oid: string | null }>} */ (trees.get(repo));
}

const known = new Map();
async function describe(/** @type {{ path: string, url: string }} */ f) {
  if (known.has(f.url)) return known.get(f.url);
  const hub = /^https:\/\/huggingface\.co\/(.+?)\/resolve\/main\/(.+)$/.exec(f.url);
  let found = hub ? (await tree(hub[1])).get(hub[2]) : null;
  if (hub && !found) throw new Error(`${f.url} is not in the repository`);
  /** @type {{ bytes: number, sha256: string }} */
  let out;
  if (found?.oid) out = { bytes: found.size, sha256: found.oid };
  else {
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`${f.url} answered ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    out = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  known.set(f.url, out);
  return out;
}

const models = [];
/** @type {Record<string, string>} */
const sources = {};
for (const m of MODELS) {
  const files = [];
  for (const f of m.files) { files.push({ path: f.path, ...(await describe(f)) }); sources[f.path] = f.url; }
  models.push({ id: m.id, files });
  console.log(`${m.id}: ${files.length} files, ${Math.round(files.reduce((n, f) => n + f.bytes, 0) / 1e6)} MB`);
}
writeFileSync(join(builtInRoot(), 'local-models.json'), `${JSON.stringify({ version: 1, models }, null, 1)}\n`);
writeFileSync(join(builtInRoot(), 'model-sources.json'), `${JSON.stringify(sources, null, 1)}\n`);
