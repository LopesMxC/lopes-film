import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { currentDir, noteCommand, readPointer } from './engine-current.mjs';
import { SOURCES, engineUpdates, newerThan, probe, updateEngines } from './engine-updates.mjs';

const posix = process.platform !== 'win32';

test('versions compare as numbers, not as text', () => {
  assert.equal(newerThan('0.10.0', '0.9.0'), true);
  assert.equal(newerThan('v0.2.2', '0.2.1'), true);
  assert.equal(newerThan('0.2.1', '0.2.1'), false);
  assert.equal(newerThan('0.2', '0.2.1'), false);
  assert.equal(newerThan('20230101', '20221029'), true);
});

test('the version each engine is listed at is the one its module fetches', () => {
  for (const s of SOURCES) {
    const text = readFileSync(new URL(`./${s.file}`, import.meta.url), 'utf8');
    assert.ok(text.includes(s.version), `${s.id}: ${s.version} is not in ${s.file}`);
  }
});

/** A fake engine: a script that prints a help naming `commands`, packed as a release asset, behind a local server. */
async function fake(/** @type {string[]} */ commands, /** @type {boolean} */ works = true) {
  const dir = mkdtempSync(join(tmpdir(), 'eu-'));
  const pack = join(dir, 'pack');
  mkdirSync(pack, { recursive: true });
  writeFileSync(join(pack, 'fake-cli'), `#!/bin/sh\n${works ? `echo "Usage: fake-cli <command>\\nCommands:\\n${commands.map((c) => `  ${c}`).join('\\n')}"` : 'exit 3'}\n`, { mode: 0o755 });
  const tgz = join(dir, 'fake-2.0.0-linux.tar.gz');
  execFileSync('tar', ['-czf', tgz, '-C', pack, 'fake-cli']);
  const bytes = readFileSync(tgz);
  const server = createServer((_, res) => { res.end(bytes); });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  const url = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/fake-2.0.0-linux.tar.gz`;
  const release = { tag_name: 'v2.0.0', html_url: 'https://x', assets: [{ name: 'fake-2.0.0-linux.tar.gz', size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, browser_download_url: url }] };
  const get = /** @type {typeof fetch} */ (async () => /** @type {Response} */ ({ ok: true, json: async () => release }));
  /* the working version 1.0.0 is already here */
  const base = join(dir, 'models', 'fake');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'fake-cli'), '#!/bin/sh\necho old\n', { mode: 0o755 });
  /** @type {import('./engine-updates.mjs').Source} */
  const source = { id: 'fake', repo: 'x/fake', version: '1.0.0', file: 'anicraft.mjs', auto: { env: 'LOPESFILM_FAKE_DIR', base, pkg: () => ({ file: 'fake-1.0.0-linux.tar.gz', exe: 'fake-cli' }), needs: ['run', 'render'] } };
  return { dir, base, get, source, file: join(dir, 'state.json'), close: () => { server.closeAllConnections(); server.close(); } };
}

test('a newer release is told once, kept for twelve hours, and offline says nothing', async () => {
  const f = await fake(['run', 'render']);
  const first = await engineUpdates({ get: f.get, now: 1000, file: f.file, sources: [f.source] });
  assert.deepEqual(first.map((u) => [u.id, u.current, u.latest]), [['fake', '1.0.0', '2.0.0']]);
  let asked = 0;
  const counting = /** @type {typeof fetch} */ ((...a) => { asked++; return f.get(...a); });
  assert.equal((await engineUpdates({ get: counting, now: 2000, file: f.file, sources: [f.source] })).length, 1);
  assert.equal(asked, 0, 'not asked again within twelve hours');
  const offline = /** @type {typeof fetch} */ (async () => { throw new Error('offline'); });
  assert.deepEqual(await engineUpdates({ get: offline, now: 1, file: join(f.dir, 'none.json'), sources: [f.source] }), []);
  f.close();
});

test('the probe passes a help that names the commands, extra ones included, and names what is missing', { skip: !posix }, async () => {
  const f = await fake(['run', 'render', 'brand-new-command']);
  const cli = join(f.dir, 'pack', 'fake-cli');
  assert.equal(await probe(cli, ['run', 'render']), null);
  assert.match(String(await probe(cli, ['run', 'export'])), /export/);
  assert.match(String(await probe(join(f.base, 'fake-cli'), ['run'])), /run/, 'a program that prints no commands fails');
  f.close();
});

test('an update is taken in beside the working one, and the pointer moves only when the test passes', { skip: !posix }, async () => {
  const f = await fake(['run', 'render', 'brand-new-command']);
  /* the old fake prints no help, so the working copy is the pinned one at base; the update is judged on its own help */
  const done = await updateEngines({ get: f.get, now: 1, file: f.file, sources: [f.source] });
  assert.deepEqual(done.map((d) => [d.id, d.ok]), [['fake', true]], JSON.stringify(done));
  assert.equal(readPointer(f.base)?.version, '2.0.0');
  assert.equal(currentDir(f.base), `${f.base}-2.0.0`);
  assert.ok(existsSync(join(f.base, 'fake-cli')), 'the working version is untouched');
  f.close();
});

test('a version that lost a command the app uses is refused, and not tried again', { skip: !posix }, async () => {
  const f = await fake(['run']); /* no render */
  const first = await updateEngines({ get: f.get, now: 1, file: f.file, sources: [f.source] });
  assert.deepEqual(first.map((d) => d.ok), [false]);
  assert.match(first[0].why ?? '', /render/);
  assert.equal(readPointer(f.base), null);
  assert.equal(currentDir(f.base), f.base);
  assert.ok(!existsSync(`${f.base}-2.0.0`), 'the folder is cleaned up');
  const again = await updateEngines({ get: f.get, now: 2, file: f.file, sources: [f.source] });
  assert.deepEqual(again, [], 'the same version is not tried again');
  f.close();
});

test('a download that does not match the published sha256 is refused', { skip: !posix }, async () => {
  const f = await fake(['run', 'render']);
  const wrong = /** @type {typeof fetch} */ (async () => /** @type {Response} */ ({ ok: true, json: async () => ({ tag_name: 'v2.0.0', assets: [{ name: 'fake-2.0.0-linux.tar.gz', size: 10, digest: `sha256:${'0'.repeat(64)}`, browser_download_url: 'http://127.0.0.1:1/x' }] }) }));
  process.env.LOPESFILM_FETCH_TRIES = '1';
  const done = await updateEngines({ get: wrong, now: 1, file: f.file, sources: [f.source] });
  delete process.env.LOPESFILM_FETCH_TRIES;
  assert.deepEqual(done.map((d) => d.ok), [false]);
  assert.equal(currentDir(f.base), f.base);
  f.close();
});

test('a release with no published sha256 is left alone', { skip: !posix }, async () => {
  const f = await fake(['run', 'render']);
  const bare = /** @type {typeof fetch} */ (async () => /** @type {Response} */ ({ ok: true, json: async () => ({ tag_name: 'v2.0.0', assets: [{ name: 'fake-2.0.0-linux.tar.gz', size: 10, browser_download_url: 'http://127.0.0.1:1/x' }] }) }));
  const done = await updateEngines({ get: bare, now: 1, file: f.file, sources: [f.source] });
  assert.match(done[0].why ?? '', /verifiable/);
  f.close();
});

test('a new version that fails three commands before any works is put back; one that works ends its trial', { skip: !posix }, async () => {
  const f = await fake(['run', 'render']);
  await updateEngines({ get: f.get, now: 1, file: f.file, sources: [f.source] });
  const cli = join(`${f.base}-2.0.0`, 'fake-cli');
  noteCommand(cli, false); noteCommand(cli, false);
  assert.equal(readPointer(f.base)?.version, '2.0.0', 'two failures are not enough');
  noteCommand(cli, false);
  assert.equal(readPointer(f.base)?.version, '1.0.0', 'the third puts the old one back');
  assert.equal(currentDir(f.base), f.base);
  assert.ok(existsSync(`${f.base}.current.json.rolled-back`));
  const g = await fake(['run', 'render']);
  await updateEngines({ get: g.get, now: 1, file: g.file, sources: [g.source] });
  const cli2 = join(`${g.base}-2.0.0`, 'fake-cli');
  noteCommand(cli2, false); noteCommand(cli2, true); noteCommand(cli2, false); noteCommand(cli2, false); noteCommand(cli2, false);
  assert.equal(readPointer(g.base)?.version, '2.0.0', 'after one success the trial is over');
  f.close(); g.close();
});
