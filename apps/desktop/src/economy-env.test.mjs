import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { economyEnv, ECONOMY_ENV, ECONOMY_LIMITS } from './economy-env.mjs';

const home = () => mkdtempSync(join(tmpdir(), 'eco-'));
test('on by default', () => assert.deepEqual(economyEnv({ env: {}, home: home() }), ECONOMY_ENV));
test('off by the variable and by the file', () => {
  assert.deepEqual(economyEnv({ env: { LOPESFILM_ECONOMY: '0' }, home: home() }), {});
  const h = home(); mkdirSync(join(h, '.lopesfilm')); writeFileSync(join(h, '.lopesfilm', 'economy.json'), '{"enabled":false}');
  assert.deepEqual(economyEnv({ env: {}, home: h }), {});
});
test("the person's own value wins, in the shell or in the file", () => {
  const h = home(); mkdirSync(join(h, '.lopesfilm')); writeFileSync(join(h, '.lopesfilm', 'economy.json'), '{"env":{"MAX_MCP_OUTPUT_TOKENS":4000}}');
  const out = economyEnv({ env: {}, home: h, shell: { BASH_MAX_OUTPUT_LENGTH: '99' } });
  assert.equal(out.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, undefined);
  assert.equal(out.BASH_MAX_OUTPUT_LENGTH, undefined);
  assert.equal(out.MAX_MCP_OUTPUT_TOKENS, '4000');
});
test('the limits only when asked', () => {
  const h = home(); mkdirSync(join(h, '.lopesfilm')); writeFileSync(join(h, '.lopesfilm', 'economy.json'), '{"limits":true}');
  assert.deepEqual(economyEnv({ env: {}, home: h }), { ...ECONOMY_ENV, ...ECONOMY_LIMITS });
});
