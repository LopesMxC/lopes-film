import test from 'node:test';
import assert from 'node:assert/strict';
import { rebrandText } from './rebrand.mjs';

const verkz = { internal: 'verkzfilm', name: 'VerkzFilm' };
const global = { internal: 'globalfilm', name: 'GlobalFilm' };

test('os nomes internos mudam: comando, variáveis, pasta, identificadores', () => {
  const out = rebrandText("const h = process.env.LOPESFILM_HOME || '~/.lopesfilm'; createLopesFilmAgent(); run `npx lopesfilm`", global);
  assert.equal(out, "const h = process.env.GLOBALFILM_HOME || '~/.globalfilm'; createGlobalFilmAgent(); run `npx globalfilm`");
});

test('o nome em textos vira o nome da marca; endereços e o repositório ficam', () => {
  assert.equal(rebrandText("title: 'Lopes.Film Studio'", verkz), "title: 'VerkzFilm Studio'");
  assert.equal(rebrandText('see https://github.com/openfilm/verkzfilm/issues and openfilm/verkzfilm', global), 'see https://github.com/openfilm/verkzfilm/issues and openfilm/verkzfilm');
  assert.equal(rebrandText('https://${d.lopesfilm}/account', global), 'https://${d.globalfilm}/account');
});
