import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGINES, engines, startInstall } from './local-engines.mjs';

test('the engines are the pack fetchers, the picture maker, the video maker, the upscaler and the eye model, each with its size', () => {
  const list = engines();
  assert.deepEqual(list.map((e) => e.id), ['pack-sfx', 'pack-ui', 'pack-vfx', 'pack-fonts', 'pack-models3d-kits', 'pack-models3d-more', 'image', 'video', 'upscale', 'eyes', 'effectcraft', 'figcraft', 'vectorcraft', 'interpolate', 'autoedit', 'soundcraft', 'anicraft', 'ytdlp', 'whisperfast', 'voiceclean', 'earshot', 'reavideo']);
  assert.ok(list.filter((e) => e.kind === 'pack').every((e) => e.license && e.folder && e.files > 0));
  for (const e of list) assert.ok(e.bytes > 0 && typeof e.installed === 'boolean' && typeof e.supported === 'boolean');
  assert.ok(list.find((e) => e.id === 'upscale').bytes < 60e6);
  assert.ok(list.find((e) => e.id === 'eyes').bytes < 10e6);
});

test('fetching starts once, says how it goes, and a failure is shown and can be tried again', async () => {
  let calls = 0, release;
  const was = ENGINES.eyes;
  ENGINES.eyes = { ...was, supported: () => true, installed: () => false, install: (_s, say) => { calls++; say('fetching a part'); return new Promise((_, no) => { release = no; }); } };
  try {
    startInstall('eyes'); startInstall('eyes');
    assert.equal(calls, 1);
    assert.equal(engines().find((e) => e.id === 'eyes').installing.say, 'fetching a part');
    release(new Error('offline'));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(engines().find((e) => e.id === 'eyes').failed, 'offline');
    startInstall('eyes');
    assert.equal(calls, 2);
    release(new Error('offline again'));
    await new Promise((r) => setTimeout(r, 10));
  } finally { ENGINES.eyes = was; }
  assert.throws(() => startInstall('nope'), /no such engine/);
});
