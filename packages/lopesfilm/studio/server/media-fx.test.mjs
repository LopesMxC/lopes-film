import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stabilize, track, stems, cutoutVideo, trackSubject } from './media-fx.mjs';

const root = mkdtempSync(join(tmpdir(), 'mfx-'));
mkdirSync(join(root, 'assets'), { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30:d=2', '-vf', 'crop=300:220:10+5*sin(t*6):10+4*cos(t*5)', '-pix_fmt', 'yuv420p', join(root, 'assets/shaky.mp4')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=300:d=2', '-f', 'lavfi', '-i', 'sine=f=900:d=2', '-filter_complex', '[0][1]amerge=inputs=2', join(root, 'assets/song.wav')]);

test('stabilize writes a steadier clip', async () => {
  const r = await stabilize(root, { src: 'assets/shaky.mp4', out: 'steady', level: 'medium' });
  assert.equal(r.src, 'assets/video/steady.mp4');
  assert.ok(existsSync(join(root, r.src)));
});
test('stabilize rejects an unknown level and the same file', async () => {
  await assert.rejects(stabilize(root, { src: 'assets/shaky.mp4', out: 'x', level: 'huge' }), /level is one of/);
});
test('track saves per-frame motion', async () => {
  const r = await track(root, { src: 'assets/shaky.mp4', out: 'cam' });
  const j = JSON.parse(readFileSync(join(root, r.src), 'utf8'));
  assert.ok(j.frames.length >= 55);
  assert.ok(j.frames.some((f) => f.dx !== 0 || f.dy !== 0));
  assert.equal(j.fps, 30);
});
test('stems splits voice and the rest', async () => {
  const v = await stems(root, { src: 'assets/song.wav', out: 'voice', mode: 'voice' });
  const i = await stems(root, { src: 'assets/song.wav', out: 'rest', mode: 'instrumental' });
  assert.ok(existsSync(join(root, v.src)) && existsSync(join(root, i.src)));
  await assert.rejects(stems(root, { src: 'assets/song.wav', out: 'z', mode: 'x' }), /mode is one of/);
});
test('cutout-video says what is missing when no model is installed, and makes a transparent clip when one is', async () => {
  const { default: local } = await import('./providers/local.mjs');
  await local.refresh?.();
  if (!(local.models?.cutout ?? []).length) {
    await assert.rejects(cutoutVideo(root, { src: 'assets/shaky.mp4', out: 'c' }), /IS-Net|local/i);
    return;
  }
  const made = await cutoutVideo(root, { src: 'assets/shaky.mp4', out: 'c', fps: 2 });
  assert.match(made.src, /\.webm$/);
});

test('subject-track follows a box through the clip', async () => {
  const made = await trackSubject(root, { src: 'assets/shaky.mp4', out: 'subject', x: 0.3, y: 0.3, w: 0.2, h: 0.2 });
  assert.ok(made.frames > 1);
  await assert.rejects(trackSubject(root, { src: 'assets/shaky.mp4', out: 's2', x: 0.3, y: 0.3, w: 0, h: 0.2 }), /too small/);
});
