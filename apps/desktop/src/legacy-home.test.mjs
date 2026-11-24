import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { migrateLegacyHome } from './legacy-home.mjs';

const folder = (root, name, files) => {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
  return dir;
};

test('a new brand folder takes the services of the most recent sibling, key and providers together', () => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-'));
  const own = folder(root, '.lopesfilm', { key: 'new-key', 'studio.json': '{}' });
  const old = folder(root, '.openfilm', { key: 'k-old', 'providers.json': 'p-old' });
  const recent = folder(root, '.verkzfilm', { key: 'k-recent', 'providers.json': 'p-recent', 'studio.json': '{"a":1}' });
  utimesSync(join(old, 'providers.json'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  const done = migrateLegacyHome(own, { home: root });
  assert.deepEqual(done.slice(0, 2), ['key', 'providers.json']);
  assert.equal(readFileSync(join(own, 'key'), 'utf8'), 'k-recent');
  assert.equal(readFileSync(join(own, 'providers.json'), 'utf8'), 'p-recent');
  assert.equal(readFileSync(join(own, 'studio.json'), 'utf8'), '{"a":1}');
  assert.equal(readFileSync(join(recent, 'key'), 'utf8'), 'k-recent');
});

test('a folder that already has its services is left alone, and so is one with no sibling to copy from', () => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-'));
  const own = folder(root, '.lopesfilm', { key: 'mine', 'providers.json': 'mine' });
  folder(root, '.verkzfilm', { key: 'k', 'providers.json': 'p' });
  assert.deepEqual(migrateLegacyHome(own, { home: root }), []);
  assert.equal(readFileSync(join(own, 'key'), 'utf8'), 'mine');
  const alone = folder(root, '.globalfilm', {});
  const none = mkdtempSync(join(tmpdir(), 'legacy-'));
  assert.deepEqual(migrateLegacyHome(join(none, '.x'), { home: none }), []);
  assert.equal(existsSync(join(alone, 'providers.json')), true === false);
});

test('the shipped providers are written once, and only add what a folder lacks', async () => {
  const { seedProviders } = await import('./legacy-home.mjs');
  const root = mkdtempSync(join(tmpdir(), 'seed-'));
  const seed = join(root, 'seed.json');
  writeFileSync(seed, JSON.stringify({ keys: { a: '1', b: '2' }, use: { x: 'a' } }));
  const own = join(root, '.lopesfilm');
  assert.equal(seedProviders(own, seed), true);
  assert.deepEqual(JSON.parse(readFileSync(join(own, 'providers.json'), 'utf8')).keys, { a: '1', b: '2' });
  writeFileSync(join(own, 'providers.json'), JSON.stringify({ keys: { a: 'mine' }, use: { x: 'z' } }));
  assert.equal(seedProviders(own, seed), true);
  const now = JSON.parse(readFileSync(join(own, 'providers.json'), 'utf8'));
  assert.deepEqual(now.keys, { a: 'mine', b: '2' });
  assert.deepEqual(now.use, { x: 'z' });
  assert.equal(seedProviders(own, seed), false);
});
