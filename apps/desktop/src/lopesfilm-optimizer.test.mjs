import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_PROXY_URL, loopbackUrl, optimizerSetting, tokenProxyEnv } from './lopesfilm-optimizer.mjs';

const home = (config) => {
  const dir = mkdtempSync(join(tmpdir(), 'lopesfilm-'));
  if (config !== undefined) { mkdirSync(join(dir, '.lopesfilm')); writeFileSync(join(dir, '.lopesfilm', 'optimizer.json'), typeof config === 'string' ? config : JSON.stringify(config)); }
  return dir;
};

test('only an address on this computer is ever accepted', () => {
  assert.equal(loopbackUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  assert.equal(loopbackUrl('http://localhost:8787/v1'), 'http://localhost:8787');
  assert.equal(loopbackUrl('http://[::1]:9000'), 'http://[::1]:9000');
  assert.equal(loopbackUrl('https://api.example.com'), null, "another computer would be handed the person's sign-in");
  assert.equal(loopbackUrl('http://127.0.0.1.evil.test'), null);
  assert.equal(loopbackUrl('http://user:pw@127.0.0.1:8787'), null);
  assert.equal(loopbackUrl('ftp://127.0.0.1'), null);
  assert.equal(loopbackUrl(''), null);
  assert.equal(loopbackUrl(undefined), null);
});

test('off unless the person turns it on', () => {
  assert.equal(optimizerSetting({ env: {}, home: home() }), null);
  assert.equal(optimizerSetting({ env: {}, home: home({ enabled: false }) }), null);
  assert.equal(optimizerSetting({ env: {}, home: home('not json') }), null);
  assert.deepEqual(optimizerSetting({ env: {}, home: home({ enabled: true }) }), { url: DEFAULT_PROXY_URL });
  assert.deepEqual(optimizerSetting({ env: {}, home: home({ enabled: true, url: 'http://localhost:9999' }) }), { url: 'http://localhost:9999' });
  assert.equal(optimizerSetting({ env: {}, home: home({ enabled: true, url: 'https://evil.test' }) }), null);
});

test('the environment variable turns it on, with 1/on for the default address', () => {
  assert.deepEqual(optimizerSetting({ env: { LOPESFILM_TOKEN_PROXY: '1' }, home: home() }), { url: DEFAULT_PROXY_URL });
  assert.deepEqual(optimizerSetting({ env: { LOPESFILM_TOKEN_PROXY: 'http://127.0.0.1:1234' }, home: home() }), { url: 'http://127.0.0.1:1234' });
  assert.equal(optimizerSetting({ env: { LOPESFILM_TOKEN_PROXY: 'https://evil.test' }, home: home() }), null);
});

test('only ANTHROPIC_BASE_URL is set, and a proxy that does not answer is skipped (fail open)', async () => {
  const on = home({ enabled: true });
  assert.deepEqual(await tokenProxyEnv({ env: {}, home: on, probe: async () => true }), { ANTHROPIC_BASE_URL: DEFAULT_PROXY_URL });
  assert.deepEqual(await tokenProxyEnv({ env: {}, home: on, probe: async () => false }), {});
  assert.deepEqual(await tokenProxyEnv({ env: {}, home: home(), probe: async () => { throw new Error('never asked when off'); } }), {});
});
