import assert from 'node:assert/strict';
import test from 'node:test';
import provider, { buildArgs, framesFor, MODEL_FILES, videoSize } from './localvideo.mjs';

test('a clip of n seconds takes 4k+1 frames at 16 a second', () => {
  assert.deepEqual([2, 3, 5].map(framesFor), [33, 49, 81]);
  for (const s of [2, 3, 4, 5]) assert.equal((framesFor(s) - 1) % 4, 0);
});

test('the clip is sized for its shape', () => {
  assert.deepEqual(videoSize('16:9'), { w: 832, h: 480 });
  assert.deepEqual(videoSize('9:16'), { w: 480, h: 832 });
  assert.deepEqual(videoSize('1:1'), { w: 624, h: 624 });
});

test('the program is asked for video, with the text encoder kept in system memory', () => {
  const args = buildArgs({ dir: '/m', prompt: 'a cat', w: 832, h: 480, frames: 33, seed: 1, out: '/o.avi' });
  assert.deepEqual(args.slice(0, 2), ['-M', 'vid_gen']);
  for (const flag of ['--offload-to-cpu', '--vae-tiling', '--video-frames', '--t5xxl', '--vae', '--diffusion-model']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('--video-frames') + 1], '33');
});

test('every model file is checked by size and sha256', () => {
  assert.equal(MODEL_FILES.length, 3);
  for (const f of MODEL_FILES) { assert.match(f.sha256, /^[0-9a-f]{64}$/); assert.ok(f.bytes > 1e8); assert.match(f.url, /^https:\/\/huggingface\.co\//); }
});

test('it is a keyless provider of video only', () => {
  assert.equal(provider.id, 'localvideo');
  assert.deepEqual(provider.verbs, ['video']);
  assert.equal(provider.keyless, true);
});
