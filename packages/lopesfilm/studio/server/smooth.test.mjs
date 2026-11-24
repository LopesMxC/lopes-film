import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { interpolate, runtimeFor as rifeRuntime, MODEL } from './interpolate.mjs';
import { autoEdit, runtimeFor as aeRuntime } from './autoedit.mjs';

const linux = process.platform === 'linux' && process.arch === 'x64';
const ffmpegHere = spawnSync('ffmpeg', ['-version']).status === 0;

test('both programs are pinned by sha256 for Windows x64', () => {
  for (const rt of [rifeRuntime('win32', 'x64'), aeRuntime('win32', 'x64')]) assert.match(rt.sha256, /^[0-9a-f]{64}$/);
  assert.equal(rifeRuntime('darwin', 'arm64'), null);
});

async function clip(dir) {
  const f = join(dir, 'assets', 'video'); await mkdir(f, { recursive: true });
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=d=2:s=64x64:r=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(f, 'a.mp4')]);
  return 'assets/video/a.mp4';
}

test('interpolate: asks the program for the frames it must make, and puts them together', { skip: !(linux && ffmpegHere) }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'of-rife-'));
  const root = await mkdtemp(join(tmpdir(), 'of-rife-root-'));
  const rt = rifeRuntime();
  await mkdir(join(dir, rt.root, MODEL), { recursive: true });
  await writeFile(join(dir, rt.root, MODEL, 'flownet.bin'), 'x');
  /* a fake that copies each input frame to as many outputs as asked with -n */
  await writeFile(join(dir, rt.root, rt.exe), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const get = (k) => a[a.indexOf(k) + 1];
const files = fs.readdirSync(get('-i')).sort(); const n = Number(get('-n'));
fs.writeFileSync(require('os').tmpdir() + '/rife-args.json', JSON.stringify(a));
for (let i = 0; i < n; i++) fs.copyFileSync(get('-i') + '/' + files[Math.min(files.length - 1, Math.floor(i * files.length / n))], get('-o') + '/' + String(i + 1).padStart(8, '0') + '.png');`);
  await chmod(join(dir, rt.root, rt.exe), 0o755);
  process.env.LOPESFILM_RIFE_DIR = dir;
  try {
    const src = await clip(root);
    const slow = await interpolate(root, { src, out: 'slow', factor: 4 });
    assert.equal(slow.frames, 80);
    assert.equal(slow.seconds, 8);
    assert.equal(slow.src, 'assets/video/slow.mp4');
    assert.ok(existsSync(join(root, slow.src)));
    const f60 = await interpolate(root, { src, out: 'f', mode: 'fps', fps: 30 });
    assert.equal(f60.frames, 60);
    assert.equal(f60.seconds, 2);
    await assert.rejects(interpolate(root, { src, out: 'f', mode: 'fps', fps: 5 }), /--fps is above/);
    await assert.rejects(interpolate(root, { src, out: 'a' }), /./);
  } finally { delete process.env.LOPESFILM_RIFE_DIR; await rm(dir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});

test('autoedit: the expression, the margin and the seconds removed', { skip: !(linux && ffmpegHere) }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'of-ae-'));
  const root = await mkdtemp(join(tmpdir(), 'of-ae-root-'));
  /* a fake that records its arguments and writes a shorter copy */
  await writeFile(join(dir, 'auto-editor'), `#!/usr/bin/env node
const a = process.argv.slice(2); require('fs').writeFileSync(require('os').tmpdir() + '/ae-args.json', JSON.stringify(a));
require('child_process').spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', a[0], '-t', '1', a[a.indexOf('-o') + 1]]);`);
  await chmod(join(dir, 'auto-editor'), 0o755);
  process.env.LOPESFILM_AUTOEDITOR_DIR = dir;
  try {
    const src = await clip(root);
    const done = await autoEdit(root, { src, out: 'tight', threshold: 6, margin: 0.3, speedup: 8 });
    assert.deepEqual([done.secondsBefore, done.secondsAfter, done.removed], [2, 1, 1]);
    const { readFileSync } = await import('node:fs');
    const args = JSON.parse(readFileSync(join(tmpdir(), 'ae-args.json'), 'utf8'));
    assert.ok(args.includes('audio:threshold=6%') && args.includes('0.3s') && args.includes('speed:8'));
    await assert.rejects(autoEdit(root, { src, out: 'x', margin: '1; rm' }), /number of seconds/);
    await assert.rejects(autoEdit(root, { src, out: 'x', edit: 'audio; rm -rf' }), /expression/);
    await assert.rejects(autoEdit(root, { src: 'assets/video/none.mp4', out: 'x' }), /no file/);
  } finally { delete process.env.LOPESFILM_AUTOEDITOR_DIR; await rm(dir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});

test('soundcraft: steps become --cmd ID=JSON, the mix is bounced and measured, the session kept', { skip: !(linux && ffmpegHere) }, async () => {
  const { soundcraft, runtimeFor } = await import('./soundcraft.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'of-sc-'));
  const root = await mkdtemp(join(tmpdir(), 'of-sc-root-'));
  await mkdir(join(dir, 'bin'), { recursive: true });
  await writeFile(join(dir, 'bin', runtimeFor().exe), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2);
fs.writeFileSync(require('os').tmpdir() + '/sc-args.json', JSON.stringify(a));
fs.writeFileSync(a[a.indexOf('--bounce') + 1], 'RIFF'); fs.writeFileSync(a[a.indexOf('--save') + 1], 'S');
console.log(JSON.stringify({ bytes: 4, lufs: -16.2, path: a[a.indexOf('--bounce') + 1], peak_db: -1, seconds: 3, true_peak_db: -0.9 }));`);
  await chmod(join(dir, 'bin', runtimeFor().exe), 0o755);
  process.env.LOPESFILM_SOUNDCRAFT_DIR = dir;
  try {
    const { readFileSync } = await import('node:fs');
    const r = await soundcraft(root, { out: 'mix', steps: [{ id: 'session.new', params: { name: 'm' } }, { id: 'mix.volume', params: { tracks: [2], db: -6 } }] });
    assert.equal(r.src, 'assets/audio/mix/mix.wav');
    assert.deepEqual([r.lufs, r.seconds], [-16.2, 3]);
    const args = JSON.parse(readFileSync(join(tmpdir(), 'sc-args.json'), 'utf8'));
    assert.ok(args.includes('mix.volume={"tracks":[2],"db":-6}') && !args.includes('--in'));
    await soundcraft(root, { out: 'mix', format: 'flac' });
    assert.ok(JSON.parse(readFileSync(join(tmpdir(), 'sc-args.json'), 'utf8')).includes('--in'));
    await assert.rejects(soundcraft(root, { out: 'other' }), /no session/);
    await assert.rejects(soundcraft(root, { out: 'x', steps: [{ id: 'a' }], format: 'mp3' }), /--format is one of/);
  } finally { delete process.env.LOPESFILM_SOUNDCRAFT_DIR; await rm(dir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});

test('anicraft: a new project is made, the steps run and are saved over it, the frames become a video', { skip: !(linux && ffmpegHere) }, async () => {
  const { anicraft, runtimeFor, parseSteps } = await import('./anicraft.mjs');
  assert.deepEqual(parseSteps([{ cmd: 'a.b' }, { id: 'c', params: { x: 1 } }]), [{ cmd: 'a.b', params: {} }, { cmd: 'c', params: { x: 1 } }]);
  assert.throws(() => parseSteps([{}]), /needs an "id"/);
  const dir = await mkdtemp(join(tmpdir(), 'of-ani-'));
  const root = await mkdtemp(join(tmpdir(), 'of-ani-root-'));
  await mkdir(join(dir, 'x'), { recursive: true });
  const exe = join(dir, 'x', runtimeFor().exe);
  await writeFile(exe, `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const get = (k) => a[a.indexOf(k) + 1];
fs.appendFileSync(require('os').tmpdir() + '/ani-calls.log', JSON.stringify(a) + '\\n');
if (a[0] === 'new') fs.writeFileSync(get('--out'), 'NEW');
else if (a[0] === 'run') fs.writeFileSync(get('--save'), 'RAN');
else if (a[0] === 'exec') fs.writeFileSync(get('--save'), 'KEYED');
else if (a[0] === 'info') console.log(JSON.stringify({ frames: 10, fps: 10 }));
else if (a[0] === 'render-seq') { fs.mkdirSync(get('--out-dir'), { recursive: true }); for (let i = 1; i <= 10; i++) require('child_process').spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x00FF00:s=32x32', '-frames:v', '1', get('--out-dir') + '/frame_' + String(i).padStart(5, '0') + '.png']); }
else if (a[0] === 'commands') console.log(JSON.stringify([{ id: 'timeline.create_tween', params: '{layer?, frame?, easing?}' }, { id: 'draw.rect', params: '{x}' }]));`);
  await chmod(exe, 0o755);
  process.env.LOPESFILM_ANICRAFT_DIR = dir;
  try {
    const { readFileSync } = await import('node:fs');
    const log = join(tmpdir(), 'ani-calls.log'); await rm(log, { force: true });
    const r = await anicraft(root, { out: 'a', width: 320, height: 180, fps: 24, steps: [{ id: 'draw.rect', params: { x: 1 } }] });
    assert.equal(r.src, 'assets/video/a.webm');
    assert.equal(readFileSync(join(root, r.project), 'utf8'), 'RAN');
    const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(calls[0].slice(0, 7), ['new', '--out', calls[0][2], '--width', '320', '--height', '180']);
    assert.ok(calls.some((c) => c[0] === 'exec' && c.includes('doc.set_stage') && c.includes('{"background":"#00ff00"}')), 'drawn on the key colour');
    const mp4 = await anicraft(root, { out: 'a', format: 'mp4', background: '#101820' });
    assert.equal(mp4.src, 'assets/video/a.mp4');
    assert.ok(readFileSync(log, 'utf8').includes('{\\"background\\":\\"#101820\\"}'));
    const found = await anicraft(root, { commands: 'tween easing' });
    assert.match(found.commands, /create_tween/);
    assert.doesNotMatch(found.commands, /draw\.rect/);
    await assert.rejects(anicraft(root, { out: 'none' }), /no project/);
    await assert.rejects(anicraft(root, { out: 'a', background: 'red' }), /colour/);
  } finally { delete process.env.LOPESFILM_ANICRAFT_DIR; await rm(dir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});
