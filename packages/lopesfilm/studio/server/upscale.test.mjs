import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modelFor, runtimeFor, STYLES, trim } from './upscale.mjs';

test('the program is the official release for each system, with its checksum', () => {
  const w = runtimeFor('win32', 'x64');
  assert.equal(w?.exe, 'realesrgan-ncnn-vulkan.exe'); assert.equal(w?.sha256.length, 64); assert.equal(w?.bytes, 45474481);
  assert.equal(runtimeFor('linux', 'x64')?.exe, 'realesrgan-ncnn-vulkan');
  assert.ok(runtimeFor('darwin', 'arm64'));
  assert.equal(runtimeFor('win32', 'arm64'), null);
});

test('each style picks its model, and the factor is brought down from what the model makes', () => {
  assert.deepEqual(modelFor('photo', 2), { n: 'realesrgan-x4plus', s: 4 });
  assert.deepEqual(modelFor('anime', 3), { n: 'realesrgan-x4plus-anime', s: 4 });
  assert.deepEqual(modelFor('fast', 3), { n: 'realesr-animevideov3', s: 3 });
  assert.equal(trim(4, 2), 'scale=iw*2/4:ih*2/4:flags=lanczos');
  assert.equal(trim(4, 4), '');
  assert.deepEqual(STYLES, ['photo', 'anime', 'fast']);
});
