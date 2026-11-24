import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fft, greyColor, heatColor, logBands, spectrumDb, SPEC_FLOOR_DB } from './spectrogram.ts';

const sine = (hz: number, amp = 1, n = 2048, rate = 48000) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

test('fft finds a sine at its bin and reads a full-scale sine near 0 dBFS', () => {
  const db = spectrumDb(sine(3000)); // bin width 23.4 Hz → bin ≈ 128
  let peak = 0;
  for (let k = 1; k < db.length; k++) if (db[k] > db[peak]) peak = k;
  assert.ok(Math.abs(peak - 128) <= 1, String(peak));
  assert.ok(db[peak] > -3 && db[peak] <= 0.5, String(db[peak]));
});

test('half the amplitude is 6 dB lower', () => {
  const a = Math.max(...spectrumDb(sine(1000, 1)));
  const b = Math.max(...spectrumDb(sine(1000, 0.5)));
  assert.ok(Math.abs(a - b - 6.02) < 0.3);
});

test('log bands put a 1 kHz tone in its log band (≈57 of 100)', () => {
  const bands = logBands(spectrumDb(sine(1000)), 48000, 100);
  let top = 0;
  bands.forEach((v, i) => { if (v > bands[top]) top = i; });
  assert.ok(Math.abs(top - 56.6) <= 2, String(top)); // log10(1000/20)/log10(1000) of the way up
});

test('palettes: black at the floor, bright at the top; heat is coloured, grey is not', () => {
  assert.deepEqual(heatColor(SPEC_FLOOR_DB), [0, 0, 0]);
  assert.deepEqual(greyColor(SPEC_FLOOR_DB), [0, 0, 0]);
  const [r, g, b] = heatColor(-50);
  assert.ok(!(r === g && g === b));
  const [x, y, z] = greyColor(-30);
  assert.ok(x === y && y === z && x > 0);
});

test('fft of an impulse is flat', () => {
  const re = new Float32Array(8); re[0] = 1; const im = new Float32Array(8);
  fft(re, im);
  assert.ok([...re].every((v) => Math.abs(v - 1) < 1e-6));
});
