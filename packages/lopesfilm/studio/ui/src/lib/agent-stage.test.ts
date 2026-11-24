import test from 'node:test';
import assert from 'node:assert/strict';
import { agentActions } from './agent-cursor.ts';
import { agentStage, stageTracks, type StageEntry } from './agent-stage.ts';
import type { TimelineBlock, TimelineTrack } from './timeline-layout.ts';

const clip = (id: string, startMs: number, endMs: number, more: Partial<TimelineBlock> = {}): TimelineBlock => ({ id, clipId: id, title: id, startMs, endMs, kind: 'video', src: `${id}.mp4`, ...more });
const row = (blocks: TimelineBlock[]): TimelineTrack => ({ lane: 'v', role: 'video', index: 0, name: null, kind: 'visual', blocks });
const entriesOf = (was: TimelineBlock[], now: TimelineBlock[]): StageEntry[] => {
  const by = new Map(was.map((b) => [b.clipId, b]));
  return agentActions(was, now).map((action) => ({ action, before: action.kind === 'delete' ? was.find((b) => b.id === action.id) ?? null : by.get(now.find((b) => b.id === action.id)?.clipId) ?? null, lane: 'v', index: 0 }));
};

test('nothing pending: the very same tracks', () => {
  const t = [row([clip('a', 0, 1000)])];
  assert.equal(stageTracks(t, []), t);
});

test('a new clip is held back, and a track it is not on stays the same object', () => {
  const other = { ...row([clip('z', 0, 500)]), lane: 'a' };
  const now = [row([clip('a', 0, 1000), clip('b', 1000, 2000)]), other];
  const out = stageTracks(now, entriesOf([clip('a', 0, 1000)], now[0]!.blocks));
  assert.deepEqual(out[0]!.blocks.map((b) => [b.id, Boolean(b.agentHold)]), [['a', false], ['b', true]]);
  assert.equal(out[1], other);
});

test('a cut is whole until its cursor gets there: the first half as long as it was, the second held', () => {
  const was = [clip('a', 0, 2000)];
  const now = [clip('a', 0, 800), clip('a2', 800, 2000)];
  const out = stageTracks([row(now)], entriesOf(was, now))[0]!.blocks;
  assert.deepEqual(out.map((b) => [b.id, b.startMs, b.endMs, Boolean(b.agentHold)]), [['a', 0, 2000, false], ['a2', 800, 2000, true]]);
});

test('a move shows where the clip was; a removed clip is still there; a setting is as it was', () => {
  assert.deepEqual(stageTracks([row([clip('a', 500, 1500)])], entriesOf([clip('a', 0, 1000)], [clip('a', 500, 1500)]))[0]!.blocks.map((b) => [b.startMs, b.endMs]), [[0, 1000]]);
  assert.deepEqual(stageTracks([row([clip('a', 0, 1000)])], entriesOf([clip('a', 0, 1000), clip('b', 1000, 2000)], [clip('a', 0, 1000)]))[0]!.blocks.map((b) => b.id), ['a', 'b']);
  assert.equal(stageTracks([row([clip('a', 0, 1000, { gainDb: -6 })])], entriesOf([clip('a', 0, 1000, { gainDb: 0 })], [clip('a', 0, 1000, { gainDb: -6 })]))[0]!.blocks[0]!.gainDb, 0);
});

test('applying a step takes it off the list; flush takes all', () => {
  const was = [clip('a', 0, 1000)], now = [clip('a', 0, 1000), clip('b', 1000, 2000), clip('c', 2000, 3000)];
  const es = entriesOf(was, now); agentStage.push(es);
  assert.equal(agentStage.get().pending.length, 2);
  agentStage.apply(es[0]!.action); assert.equal(agentStage.get().pending.length, 1);
  agentStage.flush(); assert.equal(agentStage.get().pending.length, 0);
});

test('a clip that changed track is still on its old track until its cursor gets there', () => {
  const was = clip('a', 0, 1000, { row: 'v1' }), now = clip('a', 0, 1000, { row: 'v2' });
  const tracks = [{ ...row([clip('z', 0, 500, { row: 'v1' })]), lane: 'v1' }, { ...row([now]), lane: 'v2' }];
  const es: StageEntry[] = [{ action: { kind: 'track', id: 'a', at: 0.5, media: 'video' }, before: was, lane: 'v1', index: 0 }];
  const out = stageTracks(tracks, es);
  assert.deepEqual(out.map((tr) => tr.blocks.map((b) => b.id)), [['z', 'a'], []]);
});
