import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fitMove, paletteOf, measure } from './measure.mjs';

const haveFfmpeg = !spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).error && !spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).error;

test('a move\'s start, duration and ease are recovered from its samples', () => {
  const dt = 1 / 30;
  const cubicOut = (u) => 1 - (1 - u) ** 3;
  const points = [];
  for (let i = 0; i < 60; i++) { const t = i * dt; points.push([t, cubicOut(Math.min(1, Math.max(0, (t - 0.5) / 1)))]); }
  const best = fitMove(points, 0.5 + dt, dt, 3);
  assert.equal(best[0].name, 'power2.out');
  assert.ok(Math.abs(best[0].duration - 1) < 0.1, `duration ${best[0].duration}`);
  assert.ok(Math.abs(best[0].start - 0.5) < 0.1, `start ${best[0].start}`);
  assert.match(best[0].css, /^cubic-bezier\(/);
  assert.ok(best[0].error < 0.01);
});

test('a slow start and an overshoot are told apart', () => {
  const dt = 1 / 30;
  const back = (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
  const inOut = (u) => (u < 0.5 ? 8 * u ** 4 : 1 - (-2 * u + 2) ** 4 / 2);
  const sample = (f, start, d) => Array.from({ length: 70 }, (_, i) => [i * dt, f(Math.min(1, Math.max(0, (i * dt - start) / d)))]);
  assert.equal(fitMove(sample(back, 0.4, 0.7), 0.4 + dt, dt, 3)[0].name, 'back.out(1.7)');
  assert.equal(fitMove(sample(inOut, 0.4, 0.8), 0.4 + 3 * dt, dt, 3)[0].name, 'power3.inOut');
});

test('the commonest colours of a picture, close shades counted as one', () => {
  const px = new Uint8Array(100 * 3);
  for (let i = 0; i < 100; i++) { const c = i < 70 ? [10, 10, 12] : i < 95 ? [200, 30, 40] : [205, 28, 44]; px.set(c, i * 3); }
  const p = paletteOf(px, 3);
  assert.equal(p.length, 2);
  assert.equal(p[0].hex, '#0a0a0c');
  assert.ok(Math.abs(p[0].share - 0.7) < 0.01);
});

const lines = (r) => r.lines.join('\n');

test('measure on real video: probe, cuts, curve, ink, colors, compare, extract', { skip: !haveFfmpeg && 'no ffmpeg' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-measure-'));
  const make = (name, graph) => {
    const out = join(dir, name);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'color=c=white:s=80x80:r=30:d=3', '-filter_complex', graph, '-pix_fmt', 'yuv420p', out]);
    assert.equal(r.status, 0, String(r.stderr));
    return out;
  };
  const ref = make('ref.mp4', "[0][1]overlay=x='100+400*(1-pow(1-clip((t-0.5)/1,0,1),3))':y=140:eval=frame");
  /* the same box, but a quarter of the size and dimmer */
  const small = make('small.mp4', "[1]scale=40:40,eq=brightness=-0.6[s];[0][s]overlay=x='100+400*(1-pow(1-clip((t-0.5)/1,0,1),3))':y=160:eval=frame");
  const noteq = (r) => assert.equal(r.ok, true, lines(r));

  const p = await measure(['probe', ref]);
  assert.match(lines(p), /640×360 at 30 fps/);

  const c = await measure(['curve', ref], { start: '0.3', end: '1.8', roi: '0,100,640,160' });
  noteq(c);
  assert.match(lines(c), /closest eases: power2\.out over 1s/);

  const k = await measure(['colors', ref], { at: '2', grid: '4x3' });
  assert.match(lines(k), /lighter to the right|even/);

  const i = await measure(['ink', ref], { at: '2', roi: '0,100,640,160' });
  assert.match(lines(i), /80×80 px/);

  const same = await measure(['compare', ref, ref], { t: '2', region: '0,100,640,160' });
  noteq(same);
  const worse = await measure(['compare', ref, small], { t: '2', region: '0,100,640,160' });
  assert.equal(worse.ok, false);
  assert.match(lines(worse), /✗ element height: 40 px against 80 px/);

  const gone = await measure(['compare', ref, small], { t: '2', region: '0,0,100,60', 'ref-region': '0,100,640,160' });
  assert.equal(gone.ok, false);
  assert.match(lines(gone), /missing/);

  const x = await measure(['extract', ref], { at: '2', roi: '480,130,100,100', out: join(dir, 'crop.png') });
  assert.ok(existsSync(join(dir, 'crop.png')), lines(x));
});

test('a cut in the middle of a video is found where it is, and a wrong command is a usage error', { skip: !haveFfmpeg && 'no ffmpeg' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-measure-cut-'));
  const out = join(dir, 'cut.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x203040:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=0xd04030:s=320x180:r=30:d=2', '-filter_complex', '[0][1]concat=n=2:v=1:a=0', '-pix_fmt', 'yuv420p', out]);
  assert.equal(r.status, 0, String(r.stderr));
  const c = await measure(['cuts', out], {});
  assert.match(lines(c), /1 hard cut/);
  assert.match(lines(c), /cut at 2s/);
  await assert.rejects(() => measure(['curve', out], { start: '0' }), /stretch of the move/);
  await assert.rejects(() => measure(['nope', out], {}), /no nope/);
  await assert.rejects(() => measure(['probe', join(dir, 'missing.mp4')], {}), /not a file/);
});
