import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'of-style-'));
process.env.LOPESFILM_SHARED_HOME = home;
process.env.LOPESFILM_SKILLS = join(home, 'Skills');
const { clearStyle, forgetStyleLine, learnFromEdit, libraryThing, setStyleEnabled, styleState } = await import('./style-memory.mjs');

test("the person's edits teach Meu estilo, written as an always-on skill; a line taken out is not learnt again", () => {
  assert.deepEqual(libraryThing('assets/library/transitions/glitch/files/glitch.html'), { cat: 'transitions', id: 'glitch' });
  assert.equal(libraryThing('assets/video/a.mp4'), null);
  const film = { tracks: [{ clips: [{ id: 'v1', src: 'assets/video/a.mp4', time: [0, 10] }, { id: 't1', src: 'assets/library/transitions/flash/files/flash.html' }] }] };
  for (let i = 0; i < 3; i++) learnFromEdit(film, [{ op: 'insert', clip: { src: 'assets/library/transitions/ink-bleed/files/ink-bleed.html' } }]);
  learnFromEdit(film, [{ op: 'remove', clip: 't1' }]);
  learnFromEdit(film, [{ op: 'remove', clip: 't1' }]);
  for (let i = 0; i < 5; i++) learnFromEdit(film, [{ op: 'props', edits: [{ clip: 'v1', prop: 'end', value: 2.5 }] }]);
  for (let i = 0; i < 3; i++) learnFromEdit(film, [{ op: 'props', edits: [{ clip: 'v1', prop: 'fade', value: [0.5, 1] }] }]);
  const state = styleState();
  const keys = state.lines.map((l) => l.key);
  assert.ok(keys.includes('fav:transitions') && keys.includes('avoid:transitions:flash') && keys.includes('shots') && keys.includes('fades'), keys.join());
  const skill = join(home, 'Skills', 'meu-estilo', 'SKILL.md');
  assert.match(readFileSync(skill, 'utf8'), /^---\nname: meu-estilo\n[\s\S]*ink bleed \(3×\)[\s\S]*2\.5 s/);
  forgetStyleLine('shots');
  learnFromEdit(film, [{ op: 'props', edits: [{ clip: 'v1', prop: 'end', value: 2.5 }] }]);
  assert.ok(!styleState().lines.some((l) => l.key === 'shots'), 'taken out stays out');
  setStyleEnabled(false);
  assert.equal(existsSync(skill), false, 'off: no skill given');
  learnFromEdit(film, [{ op: 'split', clip: 'v1', at: 1 }]);
  setStyleEnabled(true);
  assert.equal(existsSync(skill), true);
  clearStyle();
  assert.deepEqual(styleState().lines, []);
  assert.equal(existsSync(skill), false);
});
