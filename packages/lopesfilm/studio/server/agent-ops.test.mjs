import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentOps } from './agent-ops.mjs';

const make = (pages, direct = async () => {}) => {
  const events = [];
  const direct_ = [];
  const ops = createAgentOps({ emit: (_r, e) => events.push(e), pages: () => pages, direct: async (r, o) => { direct_.push(o); return direct(r, o); } });
  return { ops, events, direct_ };
};

test('with no page showing the project, Studio makes the edit itself', async () => {
  const { ops, events, direct_ } = make(0);
  assert.deepEqual(await ops.run('/p', [{ op: 'remove', clip: 'a' }]), { ok: true, by: 'studio' });
  assert.equal(events.length, 0);
  assert.equal(direct_.length, 1);
});

test('a page takes the job, makes the edit, and the agent hears how it went', async () => {
  const { ops, events, direct_ } = make(1);
  const run = ops.run('/p', [{ op: 'remove', clip: 'a' }]);
  assert.equal(events[0].type, 'agent-ops');
  assert.equal(ops.claim(events[0].id), true);
  assert.equal(ops.done(events[0].id, null), true);
  assert.deepEqual(await run, { ok: true, by: 'editor' });
  assert.equal(direct_.length, 0);
});

test('a refusal by the editor reaches the agent', async () => {
  const { ops, events } = make(1);
  const run = ops.run('/p', [{ op: 'remove', clip: 'a' }]);
  ops.claim(events[0].id);
  ops.done(events[0].id, 'the track is locked');
  assert.deepEqual(await run, { ok: false, error: 'the track is locked', by: 'editor' });
});

test('a page that does not take the job in time is passed over, and cannot make it later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { ops, events, direct_ } = make(1);
  const run = ops.run('/p', [{ op: 'remove', clip: 'a' }]);
  t.mock.timers.tick(2600);
  assert.deepEqual(await run, { ok: true, by: 'studio' });
  assert.equal(direct_.length, 1);
  assert.equal(ops.claim(events[0].id), false);
});

import { expandCuts } from './agent-ops.mjs';
test('a cut is worked out as a split of the clip\'s trim', () => {
  const value = { tracks: [{ clips: [{ id: 'a', at: 2, time: [10, 20], speed: 2 }] }] };
  assert.deepEqual(expandCuts(value, [{ op: 'cut', clip: 'a', at: 4 }]), [{ op: 'split', clip: 'a', at: 4, time: [10, 14], restTime: [14, 20] }]);
  assert.throws(() => expandCuts(value, [{ op: 'cut', clip: 'a', at: 9 }]), /not inside/);
});
