import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOPESFILM_HOME = mkdtempSync(join(tmpdir(), 'local-home-'));
process.env.LOPESFILM_LIBRARY_MODEL_DIR = mkdtempSync(join(tmpdir(), 'local-model-'));
/* nothing to fetch it from: the search must answer with words alone, not hang or throw */
process.env.LOPESFILM_LIBRARY_MODEL_URL = 'http://127.0.0.1:9';
const { rank, localNearest, problem } = await import('./library-local.mjs');

test('things of one category ranked by cosine, each vector with its own scale', () => {
  const meta = { dims: 2, ids: ['a', 'b', 'c', 'd'], cats: ['sound', 'sound', 'music', 'sound'], scales: [0.01, 0.02, 0.01, 0.01] };
  /* a: (100,0)*.01 = (1,0); b: (0,50)*.02 = (0,1); c: another category; d: (70,70)*.01 */
  const values = Int8Array.from([100, 0, 0, 50, 100, 0, 70, 70]);
  const q = Float32Array.from([1, 0]);
  assert.deepEqual(rank(q, values, meta, 'sound'), [['a', 1], ['d', 0.7], ['b', 0]]);
  assert.deepEqual(rank(q, values, meta, 'sound', 1), [['a', 1]]);
  assert.deepEqual(rank(q, values, meta, 'music'), [['c', 1]]);
});

test('without the model here, a local search answers null (words alone) and does not throw', async () => {
  assert.equal(await localNearest('calm piano', 'music'), null);
  assert.equal(typeof problem, 'string');
});
