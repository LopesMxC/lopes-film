import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filmHtml } from '../../src/film-doc.mjs';
import { EMPTY_FILM } from './film.mjs';
import { createTimeline, listTimelines, timelinePath } from './timelines.mjs';

const project = () => { const d = mkdtempSync(join(tmpdir(), 'tl-')); writeFileSync(join(d, 'film.html'), filmHtml(EMPTY_FILM)); return d; };

test('a project has its main timeline, and new ones appear beside it', async () => {
  const d = project();
  assert.deepEqual((await listTimelines(d)).timelines.map((t) => [t.main, t.current]), [[true, true]]);
  const made = await createTimeline(d, 'Versão curta');
  assert.match(made.folder, /^parts\/tl-Versão-curta$/);
  assert.ok(existsSync(join(d, made.folder, 'film.html')));
  const second = await createTimeline(d, 'Versão curta');
  assert.notEqual(second.folder, made.folder);
  const { timelines } = await listTimelines(d);
  assert.equal(timelines.length, 3);
  assert.equal(timelines[1].name, 'Versão curta');
});

test('from inside a timeline the list is the same project, with that one current; compound clips are not timelines', async () => {
  const d = project();
  const made = await createTimeline(d, 'Teaser');
  mkdirSync(join(d, 'parts', 'compound'), { recursive: true });
  writeFileSync(join(d, 'parts', 'compound', 'film.html'), filmHtml(EMPTY_FILM));
  const { timelines } = await listTimelines(made.path);
  assert.deepEqual(timelines.map((t) => [t.main, t.current]), [[true, false], [false, true]]);
});

test('only a timeline of the project can be opened', async () => {
  const d = project();
  const made = await createTimeline(d, 'A');
  assert.equal(timelinePath(d, ''), d);
  assert.equal(timelinePath(made.path, made.folder), made.path);
  assert.throws(() => timelinePath(d, 'parts/compound'), /not a timeline/);
  assert.throws(() => timelinePath(d, 'parts/tl-nope'), /not a timeline/);
  assert.throws(() => timelinePath(d, '../x'), /not a timeline/);
});
