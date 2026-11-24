#!/usr/bin/env node
// @ts-check
/**
 * Copies the library's published parts (what does not come inside the package: sounds and music, voice samples,
 * emoji stickers, the search model, template examples and the community catalog) from a host into a folder laid out
 * exactly as the app asks for them, ready to upload to your own site. Author: Lopes.
 *
 *   node scripts/library-mirror.mjs --out=D:/lopesfilm-library            (everything)
 *   node scripts/library-mirror.mjs --out=… --only=audio,stickers          (some parts)
 *   node scripts/library-mirror.mjs --dry                                  (only counts and measures)
 *
 * Upload the folder's contents to <your site>/library/ (on Hostinger: public_html/library/). Run again at any time:
 * files already there with the right size are skipped, so it resumes where it stopped.
 *
 * Options: --from=<host>  where to copy from (default https://openfilm.dev/library)
 *          --jobs=<n>     downloads at once (default 8)
 *          --models       also the models that come from Hugging Face / jsDelivr (not needed: the app fetches those there)
 */
import { createWriteStream, existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..', 'library');
const arg = (/** @type {string} */ name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? (process.argv.includes(`--${name}`) ? '' : undefined);
const FROM = (arg('from') || 'https://openfilm.dev/library').replace(/\/+$/, '');
const OUT = resolve(arg('out') || 'lopesfilm-library');
const DRY = arg('dry') !== undefined;
const JOBS = Math.max(1, Number(arg('jobs')) || 8);
const ONLY = arg('only') ? new Set(String(arg('only')).split(',')) : null;
const want = (/** @type {string} */ part) => !ONLY || ONLY.has(part);
const read = (/** @type {string} */ f) => JSON.parse(readFileSync(join(lib, f), 'utf8'));
const url = (/** @type {string} */ rel) => `${FROM}/${rel.split('/').map(encodeURIComponent).join('/')}`;

/** @type {Set<string>} */ const files = new Set();
/** @type {Set<string>} */ const bundles = new Set();
const collect = (/** @type {unknown} */ value, /** @type {RegExp} */ re) => {
  JSON.stringify(value).replace(/"((?:audio|voices|stickers\/emoji|models|examples)\/[^"]+)"/g, (_, rel) => (re.test(rel) && files.add(rel), ''));
};

if (want('audio')) collect(read('audio.json'), /^audio\//);
if (want('voices')) collect(read('voices.json'), /^voices\//);
if (want('stickers')) for (const item of read('stickers.json').items) if (String(item.id).startsWith('stickers/emoji/')) bundles.add(item.id);
if (want('models')) {
  const sources = read('model-sources.json');
  /** @type {Set<string>} */ const models = new Set();
  JSON.stringify([read('models.json'), read('local-models.json')]).replace(/"(models\/[^"]+\.[a-z0-9]+)"/gi, (_, rel) => (models.add(rel), ''));
  for (const rel of models) if (arg('models') !== undefined || !sources[rel]) files.add(rel);
}
if (want('examples')) {
  const templates = read('catalogs/templates.json');
  collect(templates, /^audio\//);
  for (const item of templates.items ?? []) if (item.kind === 'group') files.add(`examples/${item.id}.mp4`);
}

/** @param {string} target */
async function get(target, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(10 * 60_000), redirect: 'follow' });
      return res;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

let done = 0, skipped = 0, bytes = 0;
/** @type {string[]} */ const missing = [];
/** @type {string[]} */ const failed = [];

/** @param {string} rel */
async function copy(rel) {
  const at = join(OUT, ...rel.split('/'));
  if (DRY) {
    const res = await get(url(rel)).catch(() => null);
    if (!res || !res.ok) { missing.push(rel); return; }
    bytes += Number(res.headers.get('content-length')) || 0;
    await res.body?.cancel();
    done++;
    return;
  }
  const res = await get(url(rel)).catch((e) => (failed.push(`${rel}: ${e.message}`), null));
  if (!res) return;
  if (res.status === 404) { missing.push(rel); await res.body?.cancel(); return; }
  if (!res.ok || !res.body) { failed.push(`${rel}: ${res.status}`); return; }
  const size = Number(res.headers.get('content-length')) || 0;
  if (size && existsSync(at) && statSync(at).size === size) { await res.body.cancel(); skipped++; bytes += size; return; }
  await mkdir(dirname(at), { recursive: true });
  const part = `${at}.part`;
  try {
    await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), createWriteStream(part));
    await rename(part, at);
    bytes += statSync(at).size;
    done++;
  } catch (e) {
    await rm(part, { force: true });
    failed.push(`${rel}: ${e instanceof Error ? e.message : e}`);
  }
}

/** @param {string[]} list @param {(rel: string) => Promise<void>} work */
async function pool(list, work) {
  let next = 0, last = 0;
  const total = list.length;
  await Promise.all(Array.from({ length: Math.min(JOBS, total) }, async () => {
    while (next < total) {
      await work(list[next++]);
      const now = Date.now();
      if (now - last > 2000) { last = now; process.stdout.write(`\r  ${next}/${total}  ${(bytes / 1e9).toFixed(2)} GB   `); }
    }
  }));
  process.stdout.write(`\r  ${total}/${total}  ${(bytes / 1e9).toFixed(2)} GB   \n`);
}

console.log(`Lopes.Film — espelho da biblioteca\n  de:   ${FROM}\n  para: ${DRY ? '(só medindo)' : OUT}`);

/* a bundle is a folder; its files are listed beside it in files.json, which the mirror keeps too */
if (bundles.size) {
  console.log(`Pacotes (figurinhas): ${bundles.size}`);
  await pool([...bundles], async (rel) => {
    const res = await get(url(`${rel}/files.json`)).catch(() => null);
    if (!res || !res.ok) { missing.push(`${rel}/files.json`); return; }
    const list = /** @type {unknown} */ (await res.json());
    if (!Array.isArray(list)) return;
    if (!DRY) {
      await mkdir(join(OUT, ...rel.split('/')), { recursive: true });
      await writeFile(join(OUT, ...rel.split('/'), 'files.json'), `${JSON.stringify(list)}\n`);
    }
    for (const f of list) if (typeof f === 'string' && !f.includes('..')) files.add(`${rel}/${f}`);
  });
}

/* the community catalog: its list, and each of its files by content */
if (want('community')) {
  const res = await get(url('community/v1/catalog.json')).catch(() => null);
  if (res?.ok) {
    const text = await res.text();
    if (!DRY) {
      await mkdir(join(OUT, 'community', 'v1'), { recursive: true });
      await writeFile(join(OUT, 'community', 'v1', 'catalog.json'), text);
    }
    for (const [, sha] of text.matchAll(/"sha256"\s*:\s*"([a-f0-9]{64})"/g)) files.add(`community/v1/blobs/${sha}`);
  }
}

console.log(`Arquivos: ${files.size}`);
await pool([...files].sort(), copy);

const report = { from: FROM, at: new Date().toISOString(), files: files.size, copied: done, skipped, bytes, missing, failed };
if (!DRY) await writeFile(join(OUT, 'mirror-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nPronto: ${done} ${DRY ? 'medidos' : 'copiados'}, ${skipped} já estavam, ${(bytes / 1e9).toFixed(2)} GB no total.`);
if (missing.length) console.log(`Não existem na origem (${missing.length}) — normal para itens retirados: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
if (failed.length) { console.log(`Falharam (${failed.length}) — rode de novo para tentar outra vez:\n  ${failed.slice(0, 10).join('\n  ')}`); process.exitCode = 1; }
if (!DRY) console.log(`\nAgora envie o conteúdo de ${OUT} para <seu site>/library/ (Hostinger: public_html/library/).`);
