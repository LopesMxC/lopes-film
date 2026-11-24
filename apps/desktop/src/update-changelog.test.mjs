import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { clearChangelog, readChangelog, writeChangelog } from './update-changelog.mjs';
import { notesText } from './update-controller.mjs';

test('as notas guardadas só valem para a versão que está rodando', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cl-'));
  assert.equal(readChangelog(dir, '0.3.3'), null);
  writeChangelog(dir, '0.3.3', '+ Novo');
  assert.equal(readChangelog(dir, '0.3.2'), null, 'ainda na versão antiga: não mostra');
  assert.deepEqual(readChangelog(dir, '0.3.3'), { version: '0.3.3', notes: '+ Novo' });
  clearChangelog(dir);
  assert.equal(readChangelog(dir, '0.3.3'), null);
});

test('sem notas ou sem versão não guarda nada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cl-'));
  writeChangelog(dir, '0.3.3', null);
  writeChangelog(dir, '', 'x');
  assert.equal(readChangelog(dir, '0.3.3'), null);
});

test('notesText aceita texto, lista de notas e tira HTML', () => {
  assert.equal(notesText('+ a\n~ b'), '+ a\n~ b');
  assert.equal(notesText([{ version: '1', note: '<p>+ a</p>' }, { note: '! b' }]), '+ a\n\n! b');
  assert.equal(notesText(undefined), null);
  assert.equal(notesText('   '), null);
});
