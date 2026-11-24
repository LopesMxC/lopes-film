import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import provider, { buildArgs, sizeFor, runtimeFor, MODEL_FILES, installed } from './localimage.mjs';

test('sizes are multiples of 16 and follow the ratio', () => {
  assert.deepEqual(sizeFor('16:9', 'medium'), { w: 1024, h: 576 });
  assert.deepEqual(sizeFor('9:16', 'low'), { w: 432, h: 768 });
  assert.deepEqual(sizeFor('1:1', 'high'), { w: 1280, h: 1280 });
});

test('arguments', () => {
  const a = buildArgs({ dir: '/d', prompt: 'a cat', w: 512, h: 512, steps: 8, seed: 1, out: '/o.png' });
  assert.ok(a.includes('--offload-to-cpu') && a.includes('--llm') && a.includes('--diffusion-fa'));
  assert.ok(!buildArgs({ dir: '/d', prompt: 'x', w: 512, h: 512, steps: 8, seed: 1, out: '/o.png', fast: false }).includes('--diffusion-fa'));
  assert.equal(MODEL_FILES.length, 3);
  assert.equal(runtimeFor('win32', 'x64').exe, 'sd-cli.exe');
  assert.equal(runtimeFor('freebsd', 'x64'), null);
});

test('a fetch that fails is an error, not a silent skip', { skip: process.platform === 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'li-'));
  process.env.LOPESFILM_IMAGE_DIR = dir;
  mkdirSync(join(dir, 'bin')); mkdirSync(join(dir, 'models'));
  for (const f of MODEL_FILES) writeFileSync(join(dir, 'models', f.name), Buffer.alloc(0));
  // sizes must match to count as installed: use a stand-in check instead
  assert.equal(installed(dir), false);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const rt = runtimeFor();
  writeFileSync(join(dir, 'bin', rt.exe), `#!/usr/bin/env node\nconst a=process.argv;const o=a[a.indexOf('-o')+1];require('fs').writeFileSync(o,Buffer.from('${png.toString('base64')}','base64'));\n`);
  chmodSync(join(dir, 'bin', rt.exe), 0o755);
  // pretend the model is present at its sizes by calling with installed bypass: run() installs when missing, so stub fetch
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(provider.run('image', { prompt: 'a cat', out: 'cat' }, { signal: new AbortController().signal, say() {}, root: dir }), /offline|could not|fetch failed/);
  globalThis.fetch = realFetch;
});

test('fetchTo: the same file asked for twice at once is fetched once (image and video share one program)', async () => {
  const { createServer } = await import('node:http');
  const { mkdtempSync, readFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fetchTo } = await import('./localimage.mjs');
  let hits = 0;
  const srv = createServer((_req, res) => { hits++; setTimeout(() => res.end('hello'), 50); });
  await new Promise((r) => srv.listen(0, r));
  const to = join(mkdtempSync(join(tmpdir(), 'lf-')), 'a.zip');
  const url = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}/a.zip`;
  await Promise.all([fetchTo(url, to, 0), fetchTo(url, to, 0)]);
  srv.close();
  assert.equal(hits, 1);
  assert.equal(readFileSync(to, 'utf8'), 'hello');
  assert.equal(existsSync(`${to}.part`), false);
});
