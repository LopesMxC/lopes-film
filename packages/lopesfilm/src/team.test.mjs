import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overlaps, parseBoard, pickAccount, renderBoard, teamCommand } from './team.mjs';

const accounts = [{ name: 'A', configDir: null, path: null }, { name: 'B', configDir: '/b', path: null }, { name: 'C', configDir: '/c', path: null }];
const env = { LOPESFILM_TEAM: JSON.stringify(accounts) };

test('the board is written and read back, one line a part', () => {
  const tasks = [{ id: 'T1', title: 'Captions | big', status: 'done', owner: 'A', files: ['film.html', 'a.json'], note: 'ok\nline' }];
  const md = renderBoard('Make it', tasks);
  assert.match(md, /- \[x\] T1 \| Captions \/ big \| A \| film.html,a.json \| ok line/);
  assert.deepEqual(parseBoard(md)[0], { ...tasks[0], title: 'Captions / big', note: 'ok line' });
});

test('files that touch each other: the same one, or one inside the other', () => {
  assert.ok(overlaps(['film.html'], ['./FILM.html']));
  assert.ok(overlaps(['assets'], ['assets/a.png']));
  assert.ok(!overlaps(['film.html'], ['assets/a.png']));
  assert.ok(!overlaps([], ['film.html']), 'a part that names no file holds none');
});

test('the account with the most room, a part running on it counting 15 more', async () => {
  const full = { A: 40, B: 30, C: 80 };
  const f = async (a) => full[a.name];
  assert.equal((await pickAccount(accounts, f, [])).name, 'B');
  assert.equal((await pickAccount(accounts, f, [{ owner: 'B' }])).name, 'A', 'B has a part: 45 against 40');
  assert.equal((await pickAccount(accounts, async () => null, [])).name, 'A', 'none can say: the first');
});

test('without a team there is none: the agent does the part itself', async () => {
  const r = await teamCommand(['run', '--task', 'x'], { cwd: mkdtempSync(join(tmpdir(), 'team-')), env: {} });
  assert.equal(r.code, 3);
});

test('parts given at once go to different accounts, are on the board, and parts on the same file wait', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'team-'));
  const used = [];
  const gate = [];
  const claude = async ({ account, prompt }) => { used.push(account.name); await new Promise((r) => gate.push(r)); return { code: 0, out: `done by ${account.name}\n${prompt.includes('film.html') ? 'film' : ''}` }; };
  const usage = async (a) => ({ A: 10, B: 20, C: 30 })[a.name];
  const go = (title, files) => teamCommand(['run', '--task', `do ${title}`, '--title', title, '--files', files], { cwd, env, usage, claude });
  const p1 = go('captions', 'film.html');
  await new Promise((r) => setTimeout(r, 150));
  const p2 = go('effects', 'assets/fx.html');
  await new Promise((r) => setTimeout(r, 150));
  const p3 = go('cuts', 'film.html');
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(used, ['A', 'B'], 'the first two run, on the two with most room; the third waits for film.html');
  const mid = parseBoard(readFileSync(join(cwd, '.lopesfilm', 'team.md'), 'utf8'));
  assert.deepEqual(mid.map((t) => [t.id, t.status]), [['T1', 'running'], ['T2', 'running']]);
  gate.shift()();
  await new Promise((r) => setTimeout(r, 2_600));
  assert.equal(used.length, 3, 'the third started once the first let film.html go');
  while (gate.length) gate.shift()();
  const out = await Promise.all([p1, p2, p3]);
  assert.ok(out.every((r) => r.code === 0));
  const end = parseBoard(readFileSync(join(cwd, '.lopesfilm', 'team.md'), 'utf8'));
  assert.deepEqual(end.map((t) => t.status), ['done', 'done', 'done']);
  assert.match(readFileSync(join(cwd, '.lopesfilm', 'team.md'), 'utf8'), /## Request\s+do captions/);
});
