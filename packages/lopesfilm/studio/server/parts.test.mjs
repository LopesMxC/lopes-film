import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filmHtml } from '../../src/film-doc.mjs';
import { compoundOuter, readPartFilm, writePartFilm } from './parts.mjs';
import { inside } from './files.mjs';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'of-parts-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'a.mp4'), '');
  writeFileSync(join(root, 'film.html'), filmHtml({ stage: { w: 640, h: 360 }, tracks: [], keyframes: { gone: '0% { opacity: 0 }' } })
    .replace('<style>', '<style>\n  @font-face { font-family: X; src: url(assets/x.woff2) }'));
  return root;
}

test('a compound clip\'s film: written in a folder of its own with the film\'s looks, read back as it says', async () => {
  const root = project();
  const film = { stage: { w: 640, h: 360 }, tracks: [{ clips: [{ id: 'a', src: '../../assets/a.mp4', time: [0, 2] }] }], keyframes: {} };
  const folder = await writePartFilm(root, 'compound', film);
  assert.equal(folder, 'parts/compound');
  assert.equal(await writePartFilm(root, 'compound', film), 'parts/compound-2', 'a name taken: the next');
  const text = readFileSync(join(root, folder, 'film.html'), 'utf8');
  assert.match(text, /url\(\.\.\/\.\.\/assets\/x\.woff2\)/, 'its fonts named from its folder');
  assert.doesNotMatch(text, /@keyframes gone/, 'the film\'s other keyframes left behind');
  assert.deepEqual((await readPartFilm(root, folder)).tracks[0].clips[0].src, '../../assets/a.mp4');
  await assert.rejects(readPartFilm(root, '../elsewhere'));
});

test('a compound clip\'s folder reaches the files of the project it is in, never past it nor into its tools', async () => {
  const root = project();
  const folder = await writePartFilm(root, 'compound', { tracks: [] });
  const own = join(root, folder);
  assert.equal(compoundOuter(own), compoundOuter(root));
  assert.equal(inside(own, '../../assets/a.mp4'), join(root, 'assets', 'a.mp4'));
  assert.throws(() => inside(own, '../../../x'));
  assert.throws(() => inside(own, '.film/state.json'));
  assert.throws(() => inside(own, '../../.film/state.json'));
  assert.throws(() => inside(root, '../x'), 'a project of its own is as it was');
});

import { rebaseStrays } from './parts.mjs';
import { mkdtempSync as mk2, mkdirSync as mkd2, writeFileSync as wf2, readFileSync as rf2 } from 'node:fs';
import { tmpdir as td2 } from 'node:os';
import { join as j2 } from 'node:path';
test('a timeline film naming assets/ is put right when the file is in the project around it', async () => {
  const root = mk2(j2(td2(), 'rs-'));
  wf2(j2(root, 'film.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080"></head><body></body></html>');
  mkd2(j2(root, 'assets'), { recursive: true }); wf2(j2(root, 'assets/a.mp3'), 'x');
  const f = await writePartFilm(root, 'tl-x', { stage: { w: 1920, h: 1080 }, tracks: [] });
  const p = j2(root, f, 'film.html');
  wf2(p, rf2(p, 'utf8').replace('<body>', '<body>\n<audio id="a" src="assets/a.mp3"></audio><audio id="b" src="assets/missing.mp3"></audio>'));
  assert.equal(await rebaseStrays(j2(root, f)), true);
  const out = rf2(p, 'utf8');
  assert.match(out, /src="\.\.\/\.\.\/assets\/a\.mp3"/);
  assert.match(out, /src="assets\/missing\.mp3"/);
  assert.equal(await rebaseStrays(root), false);
});
