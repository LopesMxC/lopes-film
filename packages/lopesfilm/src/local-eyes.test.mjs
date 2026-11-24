import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestFace, cropToFrame, EYES, facing, fillRing, gazeOffset, moveIris, roiFromFace, roiFromLandmarks } from './local-eyes.mjs';

/** A face of 478 points: eyes 100 wide, 20 tall, with the iris where `ix, iy` says (offsets from the middle of the eye A). */
function face({ ix = 0, iy = 0, open = 20 } = {}) {
  const pts = Array.from({ length: 478 }, () => ({ x: 200, y: 200 }));
  const eye = (which, cx) => {
    const e = EYES[which];
    e.ring.forEach((i, k) => { const a = (k / e.ring.length) * 2 * Math.PI; pts[i] = { x: cx + 50 * Math.cos(a), y: 100 + (open / 2) * Math.sin(a) }; });
    pts[e.corners[0]] = { x: cx - 50, y: 100 }; pts[e.corners[1]] = { x: cx + 50, y: 100 };
    pts[e.lids[0]] = { x: cx, y: 100 - open / 2 }; pts[e.lids[1]] = { x: cx, y: 100 + open / 2 };
    pts[e.iris] = { x: cx + ix, y: 100 + iy };
    [[8, 0], [-8, 0], [0, 8], [0, -8]].forEach(([dx, dy], k) => { pts[e.iris + 1 + k] = { x: cx + ix + dx, y: 100 + iy + dy }; });
  };
  eye('A', 100); eye('B', 300);
  pts[33] = { x: 50, y: 100 }; pts[263] = { x: 350, y: 100 }; pts[1] = { x: 200, y: 160 };
  return pts;
}

test('the crop maps back to the frame: the middle of it is the middle of the region, turned by the eyes', () => {
  const r = { cx: 300, cy: 200, size: 256, angle: 0 };
  assert.deepEqual(cropToFrame(r, 128, 128), { x: 300, y: 200 });
  assert.deepEqual(cropToFrame(r, 0, 0), { x: 172, y: 72 });
  const t = cropToFrame({ ...r, angle: Math.PI / 2 }, 256, 128);
  assert.ok(Math.abs(t.x - 300) < 1e-9 && Math.abs(t.y - 328) < 1e-9);
});

test('the region comes from the face, 1.5 times its longer side, and from the landmarks when tracking', () => {
  const r = roiFromFace({ x: 100, y: 100, w: 80, h: 120 }, { x: 120, y: 130 }, { x: 160, y: 130 });
  assert.equal(r.size, 180); assert.equal(r.angle, 0); assert.equal(r.cx, 140);
  const t = roiFromLandmarks(face());
  assert.equal(t.angle, 0);
});

test('an iris off the middle of its eye is moved back, an iris in the middle is left', () => {
  const g = gazeOffset(face({ ix: -20 }), 'A', 1);
  assert.ok(g.d.x > 0 && g.d.x <= 20, `moves right by ${g.d.x}`);
  const still = gazeOffset(face(), 'A', 1);
  assert.ok(Math.hypot(still.d.x, still.d.y) < 0.01);
  assert.ok(Math.abs(gazeOffset(face({ ix: -20 }), 'A', 0.5).d.x - g.d.x / 2) < 0.01, 'strength scales it');
});

test('the move is held to a third of the eye across and a seventh up or down', () => {
  const g = gazeOffset(face({ ix: -48, iy: 9 }), 'A', 1);
  assert.ok(g.d.x <= 30.01 && Math.abs(g.d.y) <= 14.01);
});

test('a blink is left alone', () => {
  const g = gazeOffset(face({ ix: -20, open: 4 }), 'A', 1);
  assert.equal(Math.hypot(g.d.x, g.d.y), 0);
});

test('a head turned away is left alone, one facing the lens is not', () => {
  assert.equal(facing(face()), 1);
  const turned = face(); turned[1] = { x: 330, y: 160 };
  assert.equal(facing(turned), 0);
});

test('a ring is filled inside and not outside, softly at the edge', () => {
  const ring = [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 25, y: 15 }, { x: 5, y: 15 }];
  const m = fillRing(ring, 30, 20, 0);
  assert.equal(m[10 * 30 + 15], 1); assert.equal(m[2 * 30 + 2], 0); assert.equal(m[10 * 30 + 28], 0);
  const soft = fillRing(ring, 30, 20, 2);
  assert.ok(soft[10 * 30 + 4] > 0 && soft[10 * 30 + 4] < 1);
});

test('the iris slides: a dark disc in a light eye moves by the offset, and nothing outside the eye changes', () => {
  const w = 120, h = 60, rgb = new Uint8Array(w * h * 3).fill(240);
  const pts = face({ ix: -20 }).map((p) => ({ x: p.x - 40, y: p.y - 70 }));
  const iris = pts[EYES.A.iris];
  const x0 = Math.round(iris.x), y0 = Math.round(iris.y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - x0, y - y0) < 8) rgb.fill(20, (y * w + x) * 3, (y * w + x) * 3 + 3);
  const corner = rgb.slice(0, 3);
  moveIris(rgb, w, h, pts, 'A', { x: 16, y: 0 }, 8);
  const dark = (x, y) => rgb[(y * w + x) * 3] < 120;
  assert.ok(dark(x0 + 14, y0), 'the disc is further right');
  assert.ok(!dark(x0 - 12, y0), 'and gone from where it was');
  assert.deepEqual(rgb.slice(0, 3), corner);
});

test('the best face is the biggest of the sure ones, its eyes told left from right', () => {
  const side = 640, cells = (s) => (side / s) ** 2;
  const out = {};
  for (const s of [8, 16, 32]) out[`cls_${s}`] = { data: new Float32Array(cells(s)) }, out[`obj_${s}`] = { data: new Float32Array(cells(s)) },
    out[`bbox_${s}`] = { data: new Float32Array(cells(s) * 4) }, out[`kps_${s}`] = { data: new Float32Array(cells(s) * 10) };
  const i = 5 * 20 + 7; /* stride 32: row 5, col 7 */
  out.cls_32.data[i] = 0.9; out.obj_32.data[i] = 0.9;
  out.bbox_32.data.set([0.5, 0.5, Math.log(3), Math.log(4)], i * 4);
  out.kps_32.data.set([0.5, 0, -0.5, 0], i * 10);
  const f = bestFace(out, side);
  assert.ok(f && Math.abs(f.box.w - 96) < 1e-3 && Math.abs(f.box.h - 128) < 1e-3);
  assert.ok(f.left.x < f.right.x);
  assert.equal(bestFace({ ...out, cls_32: { data: new Float32Array(cells(32)) } }, side), null);
});
