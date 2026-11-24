import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoice, wavOf, FILES, installed } from './supertonic.mjs';
import provider from './supertonic.mjs';

test('voice ids', () => {
  assert.deepEqual(parseVoice('pt-f3'), { language: 'pt', style: 'F3' });
  assert.deepEqual(parseVoice('M1'), { language: 'na', style: 'M1' });
  assert.throws(() => parseVoice('xx-F1'), /no language/);
  assert.throws(() => parseVoice('robot'), /voice is/);
});

test('wav bytes', () => {
  const w = wavOf([0, 0.5, -0.5, 1], 44100);
  assert.equal(w.length, 44 + 8);
  assert.equal(Buffer.from(w).toString('latin1', 0, 4), 'RIFF');
});

test('lists voices by language, keyless, nothing installed', async () => {
  assert.equal(provider.keyless, true);
  const r = await provider.run('voice', { language: 'pt', gender: 'f', limit: 10 }, {});
  assert.ok(r.receipt.voices.length === 5 && r.receipt.voices.every((v) => v.voiceId.startsWith('pt-F')));
  assert.equal(installed('/nonexistent'), false);
  assert.ok(FILES.length === 16);
});
