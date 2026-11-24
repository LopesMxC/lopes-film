import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { builtInRoot, sourceOf } from './library.mjs';

const listed = JSON.parse(readFileSync(`${builtInRoot()}/local-models.json`, 'utf8'));

test('every file of every local model has a source at its maker\'s home, over https', () => {
  for (const m of listed.models) {
    for (const f of m.files) {
      const url = sourceOf(f.path);
      assert.match(url ?? '', /^https:\/\/(huggingface\.co|cdn\.jsdelivr\.net)\//, `${m.id}: ${f.path}`);
      assert.match(f.sha256, /^[0-9a-f]{64}$/, f.path);
      assert.ok(f.bytes > 0, f.path);
    }
  }
});

test('what only the library\'s host has (sounds, voices, emoji) has no source here: it still comes from the host', () => {
  assert.equal(sourceOf('audio/music/none.mp3'), null);
  assert.equal(sourceOf('voices/x/y.m4a'), null);
  assert.equal(sourceOf('stickers/emoji/smile'), null);
});

test('the local models are the ones that run here: Whisper small and large v3 turbo, IS-Net', () => {
  assert.deepEqual(listed.models.map((m) => m.id), ['whisper-small', 'whisper-large-v3-turbo', 'isnet-general']);
});
