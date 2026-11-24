import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from './ai-engine.ts';

const p = (id: string, verbs: string[], models: Record<string, { id: string; name: string }[]>, source: 'file' | null = 'file') => ({ id, name: id, verbs, models, keysUrl: '', pricingUrl: '', env: '', source });
const state = {
  providers: [
    p('localimage', ['image'], { image: [{ id: 'z-image-turbo', name: 'Z' }] }),
    p('fal', ['image', 'video'], { image: [{ id: 'flux', name: 'F' }], video: [{ id: 'seedance-2.0', name: 'S' }, { id: 'minimax-h3-max-recast', name: 'R' }] }),
    p('openai', ['image'], { image: [{ id: 'gpt-image', name: 'G' }] }, null),
  ],
  use: {},
  advice: [],
} as never;

test('local and API pick different providers; a provider not connected is never used', () => {
  assert.equal(route(state, 'image', 'local')?.via, 'localimage');
  assert.equal(route(state, 'image', 'api')?.via, 'fal');
});

test('face swap needs the recast model, only at an API', () => {
  assert.deepEqual(route(state, 'faceswap', 'api'), { via: 'fal', model: 'minimax-h3-max-recast', name: 'fal' });
  assert.equal(route(state, 'faceswap', 'local'), null);
  assert.equal(route(state, 'music', 'api'), null);
});
