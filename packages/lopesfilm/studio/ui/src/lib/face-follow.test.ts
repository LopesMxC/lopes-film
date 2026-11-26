import test from 'node:test';
import assert from 'node:assert/strict';
import { faceFollowMotion } from './face-follow.ts';

test('the zoom is fixed and the picture moves against the face, never past its edge', () => {
  const m = faceFollowMotion([{ t: 0, x: 0.5, y: 0.5 }, { t: 1, x: 0.7, y: 0.5 }, { t: 2, x: 0.95, y: 0.2 }], { w: 1080, h: 1920 }, { w: 1080, h: 1920 }, 1.5)!;
  assert.deepEqual(m.scale, [{ t: 0, v: 1.5 }, { t: 2, v: 1.5 }]);
  assert.deepEqual(m.translate[0]!.v, [0, 0]);
  /* a face right of centre: the picture goes left (negative), by what the zoom allows (half of 1080 * 0.5) */
  assert.ok(m.translate[1]!.v[0] < 0);
  assert.ok(Math.abs(m.translate[2]!.v[0]) <= 270 + 0.01);
  assert.ok(m.translate[2]!.v[1] > 0, 'a face above the centre: the picture goes down');
});

test('a wide picture in a tall stage is placed as the stage shows it', () => {
  const m = faceFollowMotion([{ t: 0, x: 0.6, y: 0.5 }], { w: 1920, h: 1080 }, { w: 1080, h: 1920 }, 1.2)!;
  /* contained: 1080 wide, 607.5 tall; zoomed it is shorter than the stage, so it cannot move up or down */
  assert.equal(m.translate[0]!.v[1], 0);
  assert.equal(faceFollowMotion([], { w: 1, h: 1 }, { w: 1, h: 1 }), null);
});
