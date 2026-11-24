import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { mirrorSessions, mirrorTurn, restoreChat } from './chat-backup.mjs';
import { loadChat, saveSessions, saveTurn } from './chat-store.mjs';

test('conversations come back from the app copy when the project lost its own', () => {
  const data = mkdtempSync(join(tmpdir(), 'cb-d-')), project = mkdtempSync(join(tmpdir(), 'cb-p-'));
  mkdirSync(join(project, '.film'), { recursive: true });
  writeFileSync(join(project, '.film', 'id'), 'p1\n');
  const sessions = { sessions: [{ id: 's1', title: 'Cut' }], last: 's1' };
  saveSessions(project, sessions);
  saveTurn(project, { turn: { id: 'local:t1', createdAt: '2026-01-01' }, items: [{ kind: 'text' }] });
  mirrorSessions(data, project, JSON.stringify({ version: 1, ...sessions }));
  mirrorTurn(data, project, 'local-t1.json', JSON.stringify({ turn: { id: 'local:t1', createdAt: '2026-01-01' }, items: [{ kind: 'text' }] }));
  /* a project with its own record is left alone */
  assert.equal(restoreChat(data, project), false);
  rmSync(join(project, '.film', 'chat'), { recursive: true });
  assert.equal(loadChat(project).sessions.length, 0);
  assert.equal(restoreChat(data, project), true);
  const back = loadChat(project);
  assert.equal(back.sessions[0].id, 's1');
  assert.equal(back.turns.length, 1);
  /* nothing copied for a project never seen */
  const other = mkdtempSync(join(tmpdir(), 'cb-o-'));
  assert.equal(restoreChat(data, other), false);
  assert.equal(existsSync(join(other, '.film')), false);
});

test('a new project made in a deleted one\'s folder starts with a new chat', () => {
  const data = mkdtempSync(join(tmpdir(), 'cb-d-')), project = mkdtempSync(join(tmpdir(), 'cb-p-'));
  mkdirSync(join(project, '.film'), { recursive: true });
  writeFileSync(join(project, '.film', 'id'), 'old\n');
  saveSessions(project, { sessions: [{ id: 's1', title: 'Old' }], last: 's1' });
  mirrorSessions(data, project, JSON.stringify({ version: 1, sessions: [{ id: 's1', title: 'Old' }], last: 's1' }));
  /* deleted, and a new "Untitled" made at the same path */
  rmSync(join(project, '.film'), { recursive: true });
  mkdirSync(join(project, '.film'), { recursive: true });
  writeFileSync(join(project, '.film', 'id'), 'new\n');
  assert.equal(restoreChat(data, project), false);
  assert.equal(loadChat(project).sessions.length, 0);
  /* its own chat, once saved, is the copy from then on */
  mirrorSessions(data, project, JSON.stringify({ version: 1, sessions: [{ id: 's2', title: 'New' }], last: 's2' }));
  rmSync(join(project, '.film', 'chat'), { recursive: true, force: true });
  assert.equal(restoreChat(data, project), true);
  assert.equal(loadChat(project).sessions[0].id, 's2');
});
