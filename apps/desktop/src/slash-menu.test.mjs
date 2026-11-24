import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLASH_COMMANDS, SLASH_GROUPS, buildSlashMenu, matchSlashTrigger, slashLocale } from '../chat/src/components/prompt-editor/slash-menu.ts';

test('/ opens at the start and after a space, not inside a path or address', () => {
  assert.deepEqual(matchSlashTrigger('/'), { leadOffset: 0, query: '', replaceableString: '/' });
  assert.equal(matchSlashTrigger('faça /leg')?.query, 'leg');
  assert.equal(matchSlashTrigger('assets/video'), null);
  assert.equal(matchSlashTrigger('https://x'), null);
  assert.equal(matchSlashTrigger('/leg ao'), null, 'a space ends it');
  assert.equal(matchSlashTrigger('sem barra'), null);
});

test('empty query lists every command, grouped in the library order', () => {
  const all = buildSlashMenu('', 'pt');
  assert.equal(all.length, SLASH_COMMANDS.length);
  const titles = all.filter((e) => e.firstOfGroup).map((e) => e.groupLabel);
  assert.deepEqual(titles, Object.values(SLASH_GROUPS).map((g) => g.pt));
});

test('typing filters by label, id and keywords, in either language', () => {
  assert.equal(buildSlashMenu('leg', 'pt')[0].command.id, 'captions');
  assert.equal(buildSlashMenu('after', 'en')[0].command.id, 'effectcraft');
  assert.equal(buildSlashMenu('olhos', 'pt')[0].command.id, 'eyes');
  assert.equal(buildSlashMenu('zzzz', 'pt').length, 0);
});

test('every command has both languages and a text to insert', () => {
  for (const c of SLASH_COMMANDS) for (const l of ['pt', 'en']) { assert.ok(c.label[l] && c.hint[l] && c.text[l], `${c.id} ${l}`); assert.ok(SLASH_GROUPS[c.group], c.id); }
  assert.equal(new Set(SLASH_COMMANDS.map((c) => c.id)).size, SLASH_COMMANDS.length);
});

test('Portuguese UI gets Portuguese, the rest English', () => {
  assert.equal(slashLocale('pt-BR'), 'pt');
  assert.equal(slashLocale('ja'), 'en');
});
