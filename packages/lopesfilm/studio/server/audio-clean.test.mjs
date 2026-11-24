import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chain, cleanAudio } from './audio-clean.mjs';

test('chain builds filters for each option', () => {
  assert.match(chain({ denoise: 'strong' }), /arnndn=m=bd.rnnn:mix=1,afftdn=nr=11/);
  assert.match(chain({ voice: true }), /arnndn=m=sh.rnnn/);
  assert.match(chain({ voice: true }), /deesser/);
  assert.match(chain({ hum: '50' }), /equalizer=f=150/);
  assert.doesNotMatch(chain({ denoise: 'off', normalize: false }), /afftdn|loudnorm/);
  assert.throws(() => chain({ eq: 'nope' }));
});

test('cleanAudio writes an m4a under assets/audio/clean', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-'));
  mkdirSync(join(root, 'assets/audio'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-f', 'lavfi', '-i', 'anoisesrc=d=2:a=0.05', '-filter_complex', 'amix=inputs=2', join(root, 'assets/audio/in.wav')]);
  const r = await cleanAudio(root, { src: 'assets/audio/in.wav', out: 'out', voice: true, eq: 'voice' });
  assert.equal(r.src, 'assets/audio/clean/out.m4a');
  assert.ok(existsSync(join(root, r.src)) && r.bytes > 1000);
});

import { VOICE_FX, chain as chainOf } from './audio-clean.mjs';
test('every voice effect makes a filter chain, and the chain takes it before the loudness', () => {
  for (const name of Object.keys(VOICE_FX)) {
    for (const amount of [0, 60, 100]) {
      const af = chainOf({ denoise: 'off', fx: name, amount, normalize: false });
      assert.ok(af.length > 10, `${name} at ${amount}`);
    }
  }
  assert.match(chainOf({ denoise: 'off', fx: 'echo', normalize: -16 }), /aecho=.*loudnorm/);
  assert.throws(() => chainOf({ fx: 'nope' }), /fx is one of/);
  assert.doesNotMatch(chainOf({ denoise: 'off', normalize: false }), /aecho|lowpass=f=1/);
});

test('a failure says why, not only "Conversion failed!"', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-'));
  mkdirSync(join(root, 'assets'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=1', join(root, 'assets/silent.mp4')]);
  await assert.rejects(cleanAudio(root, { src: 'assets/silent.mp4', out: 'x' }), (e) => !/^ffmpeg: Conversion failed!?$/.test(e.message) && /ffmpeg: .{10,}/.test(e.message));
});

import { pruneChain } from './audio-clean.mjs';
test('filters this ffmpeg lacks are left out, quoted commas kept', () => {
  const af = chainOf({ voice: true, fx: 'robot', amount: 50 });
  const out = pruneChain(af, new Set(['highpass', 'afftfilt', 'loudnorm']));
  assert.doesNotMatch(out, /arnndn|afftdn|deesser/);
  assert.match(out, /hypot\(re,im\)/);
  assert.equal(pruneChain(af, null), af);
});

import { DEREVERB } from './audio-clean.mjs';
test('dereverb adds a fast gate, a spectral pass and a low-mid cut, and rejects an unknown level', () => {
  const c = chainOf({ denoise: 'off', dereverb: 'medium', normalize: false });
  assert.match(c, /agate=threshold=0\.035:ratio=3/);
  assert.match(c, /equalizer=f=320/);
  assert.throws(() => chainOf({ dereverb: 'huge' }), /dereverb is one of/);
  assert.equal(chainOf({ denoise: 'off', normalize: false }).includes('agate'), false);
  assert.deepEqual(Object.keys(DEREVERB), ['off', 'light', 'medium', 'strong']);
});
