import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { adviceAll, estimate } from './ai-advice.mjs';
import { open, seal } from './vault.mjs';

const rtx3050 = { ramGb: 16, cpu: 'x', cores: 8, gpus: [{ name: 'RTX 3050', vramGb: 6 }], vramGb: 6, tier: 'balanced', read: true };

test('RTX 3050 de 6 GB: narrador, imagem e troca de rosto locais; vídeo e música por API', () => {
  const by = Object.fromEntries(adviceAll(rtx3050).map((a) => [a.id, a.mode]));
  assert.equal(by.narrator, 'local');
  assert.equal(by.image, 'local');
  assert.equal(by.faceswap, 'local');
  assert.equal(by.video, 'api');
  assert.equal(by.music, 'api');
});

test('a estimativa é uma faixa aproximada por unidade', () => {
  const e = estimate('narrator', 5000);
  assert.equal(e.approx, true);
  assert.ok(e.minUsd < e.maxUsd);
  assert.throws(() => estimate('nada', 1));
});

test('a chave cifrada abre igual e não aparece em claro', () => {
  const key = randomBytes(32);
  const sealed = seal('sk-minha-chave-123', key);
  assert.ok(sealed.startsWith('enc1:'));
  assert.ok(!sealed.includes('minha-chave'));
  assert.equal(open(sealed, key), 'sk-minha-chave-123');
  assert.equal(open('em-claro', key), 'em-claro');
  assert.equal(open(sealed, randomBytes(32)), '');
});
