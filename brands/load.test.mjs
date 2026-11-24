import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRANDS_DIR, BRAND_IDS, brandCss, loadBrand } from './load.mjs';

test('cada marca tem nome, appId, porta e pasta de dados próprios, e os ícones', () => {
  const brands = BRAND_IDS.map((id) => loadBrand(id));
  assert.deepEqual(brands.map((b) => b.name), ['Lopes.Film', 'GlobalFilm', 'VerkzFilm']);
  for (const key of ['appId', 'studioPort', 'homeDir', 'libraryDir', 'name']) assert.equal(new Set(brands.map((b) => b[key])).size, 3, key);
  for (const b of brands) for (const f of ['icon.ico', 'icon.icns', 'icon.png']) assert.ok(existsSync(join(BRANDS_DIR, b.id, f)), `${b.id}/${f}`);
});

test('o tema: a VerkzFilm não troca nada (é o tema-base); as outras trocam o acento nos dois temas', () => {
  assert.equal(brandCss(loadBrand('verkz')), '');
  for (const id of ['lopes', 'global']) {
    const css = brandCss(loadBrand(id));
    assert.match(css, /:root\[data-theme='dark'\]/);
    assert.match(css, /:root:not\(\[data-theme\]\)/);
    assert.equal((css.match(/--accent:/g) ?? []).length, 2);
  }
});

test('uma marca desconhecida é recusada', () => {
  assert.throws(() => loadBrand('outra'), /Marca desconhecida/);
});
