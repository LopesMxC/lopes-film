import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessToken, claudeUsage, forgetClaudeUsage, fullness, readClaudeUsage } from './claude-usage.mjs';

test('the usage address\'s answer, as windows; the fuller one says how full the account is', () => {
  const u = readClaudeUsage({ five_hour: { utilization: 32.5, resets_at: '2026-11-26T20:00:00+00:00' }, seven_day: { utilization: 61, resets_at: null }, extra_usage: null });
  assert.equal(u.five.pct, 32.5);
  assert.equal(u.five.resetsAt, Date.parse('2026-11-26T20:00:00+00:00'));
  assert.equal(u.seven.resetsAt, null);
  assert.equal(fullness(u), 61);
  assert.equal(readClaudeUsage({}), null);
  assert.equal(readClaudeUsage(null), null);
  assert.equal(fullness(null), null);
});

test('the token is read from the sign-in file only while it holds, and asked once a minute', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-'));
  assert.equal(accessToken(dir), null, 'no sign-in');
  writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'T', expiresAt: Date.now() + 60_000 } }));
  assert.equal(accessToken(dir), 'T');
  assert.equal(accessToken(dir, Date.now() + 120_000), null, 'run out: unknown, not full');
  forgetClaudeUsage();
  const seen = [];
  const fake = async (url, o) => { seen.push([url, o.headers.Authorization, o.headers['anthropic-beta']]); return { ok: true, json: async () => ({ five_hour: { utilization: 10 }, seven_day: { utilization: 20 } }) }; };
  const a = await claudeUsage(dir, { fetch: fake });
  await claudeUsage(dir, { fetch: fake });
  assert.equal(seen.length, 1, 'kept');
  assert.deepEqual(seen[0], ['https://api.anthropic.com/api/oauth/usage', 'Bearer T', 'oauth-2025-04-20']);
  assert.equal(fullness(a), 20);
  forgetClaudeUsage();
  assert.equal(await claudeUsage(dir, { fetch: async () => ({ ok: false }) }), null, 'a refusal: unknown');
});
