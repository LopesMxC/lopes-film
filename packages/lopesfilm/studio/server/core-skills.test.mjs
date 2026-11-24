import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORE_SKILLS } from '../../src/skills.mjs';
import { startStudio } from './server.mjs';

test("Studio lists Lopes.Film's own skills first, in their order, installed, and only turned off", async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'of-core-skills-'));
  const variables = { LOPESFILM_HOME: join(root, 'home'), LOPESFILM_SHARED_HOME: join(root, 'shared'), LOPESFILM_LIBRARY: join(root, 'library'), LOPESFILM_SKILLS: join(root, 'mine') };
  const previous = Object.fromEntries(Object.keys(variables).map((key) => [key, process.env[key]]));
  Object.assign(process.env, variables);
  mkdirSync(variables.LOPESFILM_HOME);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(root, { recursive: true, force: true });
  });
  const studio = await startStudio({ port: 0, openBrowser: () => {} });
  t.after(() => studio.close());
  const api = (path, { method = 'GET', body } = {}) => fetch(studio.origin + path, {
    method, headers: { 'x-studio-key': studio.key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const listed = async () => (await (await api('/api/skills')).json()).skills;
  const core = (await listed()).slice(0, 3);
  assert.deepEqual(core.map((s) => [s.uid, s.as, s.core, s.installed]), [
    ['lopesfilm/edit', 'lopesfilm-edit', true, true], ['lopesfilm/media', 'lopesfilm-media', true, true], ['lopesfilm/canvas', 'lopesfilm-canvas', true, true],
  ]);
  assert.equal(core[0].shown.title['zh-CN'], '剪辑');
  assert.ok((await listed()).slice(CORE_SKILLS.length).every((s) => !s.core), 'the library\'s are not');
  assert.equal((await api('/api/skills/lopesfilm%2Fcanvas/on', { method: 'PUT', body: { on: false } })).status, 200);
  assert.equal((await listed()).find((s) => s.uid === 'lopesfilm/canvas').off, true);
  assert.equal((await api('/api/skills/lopesfilm%2Fcanvas/installed', { method: 'PUT', body: { installed: false } })).status, 404, 'never uninstalled');
  assert.equal((await api('/api/skills/lopesfilm%2Fcanvas', { method: 'DELETE' })).status, 404, 'never removed');
});
