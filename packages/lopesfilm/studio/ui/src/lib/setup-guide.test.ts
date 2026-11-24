import assert from 'node:assert/strict';
import test from 'node:test';
import { GUIDE_SKILLS, markSetupDone, recommendedSkills, setupDone, STEPS } from './setup-guide.ts';

test('the guide shows until it is done, then not', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(setupDone(storage), false);
  markSetupDone(storage);
  assert.equal(setupDone(storage), true);
});

test('the guide comes back after an update', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  markSetupDone(storage, '0.3.139');
  assert.equal(setupDone(storage, '0.3.139'), true);
  assert.equal(setupDone(storage, '0.3.140'), false);
});

test('skills are chosen by agent: all for the capable, the lean set for small-context ones', () => {
  assert.deepEqual(recommendedSkills('claude'), [...GUIDE_SKILLS]);
  assert.deepEqual(recommendedSkills(null), [...GUIDE_SKILLS]);
  const lean = recommendedSkills('qwen');
  assert.ok(lean.includes('lopesfilm/economy') && lean.includes('lopesfilm/cutting'));
  assert.ok(!lean.includes('lopesfilm/design') && !lean.includes('lopesfilm/canvas'));
  assert.ok(recommendedSkills('lopesfilm').includes('lopesfilm/canvas'));
  for (const id of ['claude', 'qwen', 'lopesfilm'] as const) for (const uid of recommendedSkills(id)) assert.ok(GUIDE_SKILLS.includes(uid as never), uid);
});

test('the steps run welcome first and the tour last', () => {
  assert.equal(STEPS[0], 'welcome');
  assert.equal(STEPS.at(-1), 'tour');
});
