import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fetchTo } from './providers/localimage.mjs';

const body = Buffer.from('0123456789'.repeat(100));
const server = createServer((req, res) => {
  const m = /bytes=(\d+)-/.exec(req.headers.range ?? '');
  if (m) {
    const from = Number(m[1]);
    if (from >= body.length) { res.writeHead(416); res.end(); return; }
    res.writeHead(206); res.end(body.subarray(from)); return;
  }
  res.writeHead(200); res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/f.bin`;
const signal = new AbortController().signal;

test('a part as long as the file (416) starts again', async () => {
  const to = join(mkdtempSync(join(tmpdir(), 'fr-')), 'f.bin');
  writeFileSync(`${to}.part`, body);
  await fetchTo(url, to, body.length, undefined, signal);
  assert.deepEqual(readFileSync(to), body);
});
test('a part longer than the file starts again', async () => {
  const to = join(mkdtempSync(join(tmpdir(), 'fr-')), 'f.bin');
  writeFileSync(`${to}.part`, Buffer.concat([body, body]));
  await fetchTo(url, to, 0, undefined, signal);
  assert.deepEqual(readFileSync(to), body);
});
test('a short part goes on', async () => {
  const to = join(mkdtempSync(join(tmpdir(), 'fr-')), 'f.bin');
  writeFileSync(`${to}.part`, body.subarray(0, 300));
  await fetchTo(url, to, body.length, undefined, signal);
  assert.deepEqual(readFileSync(to), body);
  assert.equal(existsSync(`${to}.part`), false);
});
test('a checksum is checked by streaming (files over 2 GiB cannot be read whole)', async () => {
  const to = join(mkdtempSync(join(tmpdir(), 'fr-')), 'f.bin');
  const sum = createHash('sha256').update(body).digest('hex');
  await fetchTo(url, to, body.length, sum, signal);
  assert.deepEqual(readFileSync(to), body);
  const bad = join(mkdtempSync(join(tmpdir(), 'fr-')), 'g.bin');
  await assert.rejects(fetchTo(url, bad, body.length, '0'.repeat(64), signal), /checksum/);
});
test('a connection that drops half way goes on from the part, by itself', async () => {
  process.env.LOPESFILM_FETCH_WAIT = '0';
  let first = true;
  const flaky = createServer((req, res) => {
    const m = /bytes=(\d+)-/.exec(req.headers.range ?? '');
    const from = m ? Number(m[1]) : 0;
    if (first) { first = false; res.writeHead(200, { 'content-length': body.length }); res.write(body.subarray(0, 400)); setTimeout(() => res.destroy(), 20); return; }
    res.writeHead(m ? 206 : 200); res.end(body.subarray(from));
  });
  await new Promise((r) => flaky.listen(0, '127.0.0.1', r));
  const to = join(mkdtempSync(join(tmpdir(), 'fr-')), 'f.bin');
  await fetchTo(`http://127.0.0.1:${flaky.address().port}/f.bin`, to, body.length, createHash('sha256').update(body).digest('hex'), signal);
  assert.deepEqual(readFileSync(to), body);
  flaky.close();
});
test('a 404 is not tried again', async () => {
  const nf = createServer((req, res) => { res.writeHead(404); res.end(); });
  await new Promise((r) => nf.listen(0, '127.0.0.1', r));
  await assert.rejects(fetchTo(`http://127.0.0.1:${nf.address().port}/x`, join(mkdtempSync(join(tmpdir(), 'fr-')), 'x'), 0, undefined, signal), /answered 404/);
  nf.close();
});
test.after(() => server.close());
