import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveVideoNote, vaultFolder } from './obsidian.mjs';

const world = () => {
  const home = mkdtempSync(join(tmpdir(), 'lf-obsidian-'));
  const vault = join(home, 'OneDrive', 'Documentos', 'Mapas de Estudo', 'Aprendizados Claude');
  mkdirSync(vault, { recursive: true });
  return { home, vault };
};
const job = (kind = 'video') => ({ name: 'Meu video: teste/1', outputs: ['C:\\x\\a.mp4'], out: 'C:\\x\\a.mp4', bytes: 5 * 1024 * 1024, encoder: 'h264_nvenc', startedAt: 1000, finishedAt: 66000, ask: { kind, codec: 'h264', shortEdge: 1080, fps: 30 } });

test('the vault is found by itself, or is the one chosen', () => {
  const { home, vault } = world();
  assert.equal(vaultFolder(null, home), vault);
  assert.equal(vaultFolder(join(home, 'nada'), home), null);
  assert.equal(vaultFolder(null, join(home, 'outro')), null);
});

test('a finished video becomes a note and a line in the index', async () => {
  const { home, vault } = world();
  const now = new Date(2026, 10, 25, 21, 43);
  const path = await saveVideoNote(job(), { root: join(home, 'Projects', 'filme-1'), prefs: { obsidianOn: true, obsidianFolder: null }, now, home });
  assert.ok(path && existsSync(path));
  assert.ok(path.includes(join('Claude', 'Videos Lopes.Film', '2026', '11')));
  const text = readFileSync(path, 'utf8');
  assert.match(text, /tipo: video-lopesfilm/);
  assert.match(text, /Tempo para exportar: 1 min 05 s/);
  assert.match(text, /\[\[00 Videos Lopes\.Film\]\]/);
  const index = readFileSync(join(vault, 'Claude', 'Videos Lopes.Film', '00 Videos Lopes.Film.md'), 'utf8');
  assert.match(index, /- 2026-11-25 \[\[2026-11-25 21h43 Meu video teste 1\]\]/);
  const again = await saveVideoNote(job(), { root: join(home, 'Projects', 'filme-1'), prefs: {}, now, home });
  assert.notEqual(again, path, 'the same minute is not overwritten');
});

test('nothing is made for what is not a video, when turned off, or without a vault', async () => {
  const { home } = world();
  const root = join(home, 'p');
  assert.equal(await saveVideoNote(job('stills'), { root, prefs: {}, home }), null);
  assert.equal(await saveVideoNote(job(), { root, prefs: { obsidianOn: false }, home }), null);
  assert.equal(await saveVideoNote(job(), { root, prefs: {}, home: join(home, 'vazio') }), null);
});
