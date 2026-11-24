import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PACKS, packById, packDir, packInstalled } from './packs.mjs';

test('the manifest lists only free licences, pinned files with a size and a checksum, and nothing outside its folder', () => {
  assert.deepEqual(PACKS.map((p) => p.id), ['sfx', 'ui', 'vfx', 'fonts', 'models3d-kits', 'models3d-more']);
  for (const p of PACKS) {
    assert.match(p.license, /^(CC0 1\.0|SIL OFL 1\.1)$/);
    /* the OpenGameArt packs are CC0 on the page each file comes from (`page`); the others carry their licence file */
    if (p.kind === 'models3d') assert.ok(p.files.every((f) => f.unzip && /^https:\/\/opengameart\.org\/content\/[\w-]+$/.test(f.page)), `${p.id}: its pages`);
    else assert.ok(p.files.some((f) => /LICEN[SC]E|OFL/.test(f.to)), `${p.id} carries its licence`);
    for (const f of p.files) {
      assert.match(f.url, p.kind === 'models3d' ? /^https:\/\/opengameart\.org\/sites\/default\/files\/[^/]+\.zip$/ : /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//);
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(f.bytes > 0 && !f.to.startsWith('/') && !f.to.split('/').includes('..'));
    }
    assert.equal(p.bytes, p.files.reduce((n, f) => n + f.bytes, 0));
  }
});

test('a pack is fetched file by file, checked, and refused when a file is not what the manifest says', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'packs-'));
  process.env.LOPESFILM_PACKS_DIR = dir; process.env.LOPESFILM_FONT_DIR = join(dir, 'fonts-os');
  t.after(() => { delete process.env.LOPESFILM_PACKS_DIR; delete process.env.LOPESFILM_FONT_DIR; });
  const body = Buffer.from('RIFFdata');
  const server = createServer((_q, r) => r.end(body)); await new Promise((d) => server.listen(0, '127.0.0.1', () => d(null))); t.after(() => server.close());
  const pack = packById('vfx');
  const real = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (url, init) => real(`http://127.0.0.1:${server.address().port}/x`, init));
  const files = pack.files.splice(0, pack.files.length, ...pack.files.slice(0, 2));
  t.after(() => pack.files.splice(0, pack.files.length, ...files));
  pack.files.forEach((f) => { f.bytes = body.length; f.sha256 = createHash('sha256').update(body).digest('hex'); });
  assert.equal(packInstalled('vfx'), false);
  const { installPack } = await import('./packs.mjs');
  await installPack('vfx', new AbortController().signal, () => {});
  assert.equal(packInstalled('vfx'), true);
  assert.ok(existsSync(join(packDir('vfx'), pack.files[0].to)));
  assert.match(readFileSync(join(packDir('vfx'), 'CREDITS.txt'), 'utf8'), /CC0/);
  pack.files[1].sha256 = '0'.repeat(64); writeFileSync(join(packDir('vfx'), pack.files[1].to), 'x');
  await assert.rejects(installPack('vfx', new AbortController().signal, () => {}), /checksum/);
});

test('packs-manifest.json goes into the published package (Studio reads it as it starts)', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.files.includes('studio/server/packs-manifest.json'));
});

test('an installed sound pack shows in the library index (the Sounds tab) and its files are served', async () => {
  const { mkdirSync, openSync, ftruncateSync, closeSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'packs-'));
  process.env.LOPESFILM_PACKS_DIR = dir;
  try {
    const lib = await import('./library.mjs');
    assert.equal(lib.libraryIndex().items.some((i) => i.id.startsWith('packs/sfx/')), false, 'nothing before the pack is installed');
    const pack = packById('sfx');
    for (const f of pack.files) {
      const to = join(dir, 'sfx', ...f.to.split('/'));
      mkdirSync(join(to, '..'), { recursive: true });
      const fd = openSync(to, 'w'); ftruncateSync(fd, f.bytes); closeSync(fd);
    }
    assert.ok(packInstalled('sfx'));
    const index = lib.libraryIndex();
    const sounds = index.items.filter((i) => i.id.startsWith('packs/sfx/'));
    assert.equal(sounds.length, pack.files.filter((f) => f.to.endsWith('.wav')).length);
    assert.ok(sounds.every((i) => i.cat === 'sound' && i.kind === 'sound' && i.name.en));
    assert.ok(index.groups.sound.some((g) => g.id.startsWith('pack-')));
    assert.ok(lib.libraryFile(sounds[0].id), 'the file is found by its library place');
    assert.equal(lib.libraryFile('packs/sfx/../../etc/passwd'), null);
  } finally {
    delete process.env.LOPESFILM_PACKS_DIR;
  }
});

test('the interface-sounds pack shows in the Sounds tab once installed, one group for each folder', async () => {
  const { mkdirSync, openSync, ftruncateSync, closeSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'packs-ui-'));
  process.env.LOPESFILM_PACKS_DIR = dir;
  try {
    const lib = await import('./library.mjs');
    const pack = packById('ui');
    assert.equal(pack.license, 'CC0 1.0');
    assert.ok(pack.files.every((f) => /^https:\/\/raw\.githubusercontent\.com\/Calinou\/kenney-(interface-sounds|ui-audio)\/[0-9a-f]{40}\//.test(f.url) && /^[0-9a-f]{64}$/.test(f.sha256)));
    for (const f of pack.files) {
      const to = join(dir, 'ui', ...f.to.split('/'));
      mkdirSync(join(to, '..'), { recursive: true });
      const fd = openSync(to, 'w'); ftruncateSync(fd, f.bytes); closeSync(fd);
    }
    const index = lib.libraryIndex();
    const sounds = index.items.filter((i) => i.id.startsWith('packs/ui/'));
    assert.equal(sounds.length, pack.files.filter((f) => f.to.endsWith('.wav')).length);
    assert.ok(['pack-ui-interface', 'pack-ui-ui'].every((g) => index.groups.sound.some((x) => x.id === g)));
    assert.ok(lib.libraryFile(sounds[0].id));
    assert.equal(lib.libraryFile('packs/ui/LICENSE-ui.txt'), null, 'only audio is given out');
  } finally {
    delete process.env.LOPESFILM_PACKS_DIR;
  }
});

test('a zip of a 3D pack is fetched, checked, unpacked into its folder and removed', async (t) => {
  const { execFileSync } = await import('node:child_process');
  const { mkdirSync, readdirSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'packs-3d-'));
  process.env.LOPESFILM_PACKS_DIR = join(dir, 'packs');
  t.after(() => { delete process.env.LOPESFILM_PACKS_DIR; });
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'tree.glb'), 'glTF');
  execFileSync('zip', ['-jq', join(dir, 'kit.zip'), join(dir, 'src', 'tree.glb')]);
  const body = readFileSync(join(dir, 'kit.zip'));
  const server = createServer((_q, r) => r.end(body)); await new Promise((d) => server.listen(0, '127.0.0.1', () => d(null))); t.after(() => server.close());
  const real = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (url, init) => real(`http://127.0.0.1:${server.address().port}/x`, init));
  const pack = packById('models3d-kits');
  const files = pack.files.splice(0, pack.files.length, { ...pack.files[0], bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') });
  t.after(() => pack.files.splice(0, pack.files.length, ...files));
  const { installPack } = await import('./packs.mjs');
  assert.equal(packInstalled('models3d-kits'), false);
  await installPack('models3d-kits', new AbortController().signal, () => {});
  assert.equal(packInstalled('models3d-kits'), true);
  const name = pack.files[0].to.replace(/\.zip$/, '');
  assert.ok(existsSync(join(packDir('models3d-kits'), name, 'tree.glb')));
  assert.equal(existsSync(join(packDir('models3d-kits'), pack.files[0].to)), false, 'the zip is removed');
  assert.match(readFileSync(join(packDir('models3d-kits'), 'CREDITS.txt'), 'utf8'), /opengameart\.org\/content/);
  assert.ok(readdirSync(packDir('models3d-kits')).includes(name));
});
