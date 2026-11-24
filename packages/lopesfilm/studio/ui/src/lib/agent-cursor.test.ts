import test from 'node:test';
import assert from 'node:assert/strict';
import { agentActions, MOST_STEPS } from './agent-cursor.ts';
import type { TimelineBlock } from './timeline-layout.ts';

const clip = (id: string, startMs: number, endMs: number, more: Partial<TimelineBlock> = {}): TimelineBlock => ({ id, clipId: id, title: id, startMs, endMs, kind: 'video', src: `${id}.mp4`, ...more });

test('a new clip is a create; a gone one a delete; nothing changed is nothing', () => {
  assert.deepEqual(agentActions([clip('a', 0, 1000)], [clip('a', 0, 1000), clip('b', 1000, 2000)]).map((x) => [x.kind, x.id]), [['create', 'b']]);
  assert.deepEqual(agentActions([clip('a', 0, 1000), clip('b', 1000, 2000)], [clip('a', 0, 1000)]).map((x) => [x.kind, x.id]), [['delete', 'b']]);
  assert.deepEqual(agentActions([clip('a', 0, 1000)], [clip('a', 0, 1000)]), []);
});

test('moved keeps its length, trim changes it (at the edge that moved), words are typing, a setting is an adjust', () => {
  assert.equal(agentActions([clip('a', 0, 1000)], [clip('a', 500, 1500)])[0]!.kind, 'move');
  const longer = agentActions([clip('a', 0, 1000)], [clip('a', 0, 1800)])[0]!;
  assert.deepEqual([longer.kind, longer.at], ['trim', 1]);
  assert.deepEqual(agentActions([clip('a', 500, 1000)], [clip('a', 300, 1000)]).map((x) => [x.kind, x.at]), [['trim', 0]]);
  assert.equal(agentActions([clip('t', 0, 1000, { words: 'Hi' })], [clip('t', 0, 1000, { words: 'Hello' })])[0]!.kind, 'type');
  assert.equal(agentActions([clip('a', 0, 1000, { gainDb: 0 })], [clip('a', 0, 1000, { gainDb: -6 })])[0]!.kind, 'volume');
  assert.equal(agentActions([clip('a', 0, 1000, { speed: 1 })], [clip('a', 0, 1000, { speed: 2 })])[0]!.kind, 'speed');
  assert.equal(agentActions([clip('a', 0, 1000, { z: 1 })], [clip('a', 0, 1000, { z: 3 })])[0]!.kind, 'layer');
  assert.equal(agentActions([clip('a', 0, 1000)], [clip('a', 0, 1000, { disabled: true })])[0]!.kind, 'toggle');
  assert.equal(agentActions([clip('a', 0, 1000, { cast: 'x' })], [clip('a', 0, 1000, { cast: 'y' })])[0]!.kind, 'adjust');
  assert.equal(agentActions([clip('a', 0, 1000)], [{ ...clip('a', 0, 1000), title: 'Novo nome' }])[0]!.kind, 'rename');
});

test('a clip cut in two is one cut, at the end of the first half, not a trim and a create', () => {
  const before = [clip('a', 0, 2000)];
  const after = [clip('a', 0, 800), clip('a2', 800, 2000, { src: 'a.mp4' })];
  after[1]!.src = after[0]!.src;
  const steps = agentActions(before, after);
  assert.deepEqual(steps.map((x) => [x.kind, x.id, x.at]), [['cut', 'a', 1]]);
});

test('one change plays at most a few steps', () => {
  const many = Array.from({ length: 30 }, (_, i) => clip(`c${i}`, i * 1000, i * 1000 + 900));
  assert.equal(agentActions([], many).length, MOST_STEPS);
});

test('a big edit brings in more cursors, a small one keeps one', async () => {
  const { lanesFor } = await import('./agent-cursor.ts');
  assert.deepEqual([0, 1, 2, 3, 4, 6, 8, 9, 10, 12].map(lanesFor), [1, 1, 2, 3, 4, 6, 8, 8, 8, 8]);
});

test('a twin of a clip that stays is a duplicate, not a create', () => {
  assert.equal(agentActions([clip('a', 0, 1000, { src: 'x.mp4' })], [clip('a', 0, 1000, { src: 'x.mp4' }), clip('b', 2000, 3000, { src: 'x.mp4' })])[0]!.kind, 'duplicate');
  assert.equal(agentActions([clip('a', 0, 1000, { src: 'x.mp4' })], [clip('a', 0, 1000, { src: 'x.mp4' }), clip('b', 2000, 3500, { src: 'y.mp4' })])[0]!.kind, 'create');
});

test('a clip on another track is a track change, even when it also moved; the same track is not', () => {
  const on = (row: string, a = 0, b = 1000) => clip('a', a, b, { row });
  assert.deepEqual(agentActions([on('v1')], [on('v2')]).map((x) => x.kind), ['track']);
  assert.deepEqual(agentActions([on('v1')], [on('v2', 500, 1500)]).map((x) => x.kind), ['track']);
  assert.deepEqual(agentActions([on('v1')], [on('v1', 500, 1500)]).map((x) => x.kind), ['move']);
  assert.equal(agentActions([clip('a', 0, 1000)], [clip('a', 0, 1000, { src: 'n.mp4' }), clip('n', 1000, 2000, { src: 'n.mp4' })]).find((x) => x.kind === 'create')!.src, 'n.mp4');
});
