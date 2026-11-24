import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.HOME = mkdtempSync(join(tmpdir(), 'u-')); process.env.USERPROFILE = process.env.HOME;
const { recordUsage, readUsage } = await import('./usage.mjs');

test('API call gets a range, a local call none', async () => {
  await recordUsage({ verb: 'image', via: 'fal', model: 'x' });
  await recordUsage({ verb: 'image', via: 'localimage' });
  const u = await readUsage(30);
  assert.equal(u.calls, 2); assert.equal(u.apiCalls, 1);
  assert.ok(u.maxUsd > 0 && u.minUsd > 0);
  assert.equal(u.byService[0].id, 'image');
  assert.equal(u.today.calls, 2);
});
test('unknown verbs without a service are ignored', async () => {
  const before = (await readUsage(30)).calls;
  await recordUsage({ verb: 'browse' });
  assert.equal((await readUsage(30)).calls, before);
});
