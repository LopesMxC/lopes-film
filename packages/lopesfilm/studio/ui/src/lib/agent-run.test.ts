import test from 'node:test';
import assert from 'node:assert/strict';
import { stepFor } from './agent-run.ts';

test('an operation says where the cursor goes', () => {
  assert.deepEqual(stepFor({ op: 'remove', clip: 'a' }), { kind: 'delete', clip: 'a' });
  assert.deepEqual(stepFor({ op: 'split', clip: 'a', at: 4 }), { kind: 'cut', clip: 'a', at: 4 });
  assert.equal(stepFor({ op: 'move', clip: 'a', at: 2 })?.kind, 'move');
  assert.equal(stepFor({ op: 'move', clip: 'a', at: 2, track: 1 })?.kind, 'track');
  assert.deepEqual(stepFor({ op: 'insert', clip: { src: 'x.mp4' }, at: 1, track: 0 }), { kind: 'create', src: 'x.mp4', at: 1, track: 0 });
  assert.equal(stepFor({ op: 'insert', from: 'a', at: 3 })?.kind, 'duplicate');
  assert.equal(stepFor({ op: 'props', edits: [{ clip: 'a', prop: 'volume', value: 0.5 }] })?.kind, 'volume');
  assert.equal(stepFor({ op: 'props', edits: [{ clip: 'a', prop: 'foo', value: 1 }] })?.kind, 'adjust');
  assert.equal(stepFor({ op: 'stage', w: 1, h: 1 }), null);
});
