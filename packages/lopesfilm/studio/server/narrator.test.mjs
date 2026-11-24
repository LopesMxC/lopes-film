import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterFor, withPauses } from './narrator.mjs';

test('sem mudança, sem filtro; velocidade e tom viram atempo e asetrate', () => {
  assert.equal(filterFor({ speed: 1, pitch: 0 }), null);
  assert.equal(filterFor({ speed: 1.25 }), 'atempo=1.25');
  assert.equal(filterFor({ pitch: 12 }, 48000), 'asetrate=67882,aresample=48000,atempo=0.70711'); // limitado a +6
  assert.equal(filterFor({ speed: 9 }), 'atempo=2');
});

test('as pausas viram a marca do serviço, ou pontuação', () => {
  assert.equal(withPauses('Oi [pausa 2s] tudo', 'inworld'), 'Oi <break time="2000ms" /> tudo');
  assert.equal(withPauses('Oi [pausa] tudo', 'cartesia'), 'Oi <break time="600ms"/> tudo');
  assert.equal(withPauses('Oi [pausa 400ms] tudo', 'elevenlabs'), 'Oi  …  tudo');
  assert.equal(withPauses('Oi [Pausa 2s] tudo', 'openai'), 'Oi . …  tudo');
});
