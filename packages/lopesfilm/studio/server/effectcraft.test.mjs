import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'ec-'));
const bin = join(dir, 'engine', 'pkg');
mkdirSync(bin, { recursive: true });
/* a fake program: logs its arguments, makes the project and the render */
const exe = join(bin, process.platform === 'win32' ? 'effectcraft-cli.exe' : 'effectcraft-cli');
writeFileSync(exe, `#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, 'log.txt'))}, JSON.stringify(a)+'\\n');
if(a[0]==='run'){const i=a.indexOf('--save-as');if(i>0)fs.writeFileSync(a[i+1],'{}');}
if(a[0]==='render'){fs.writeFileSync(a[a.indexOf('--out')+1],'webm-bytes');}
console.log('{"ok":true}');`);
chmodSync(exe, 0o755);
process.env.LOPESFILM_EFFECTCRAFT_DIR = join(dir, 'engine');
const fx = await import('./effectcraft.mjs');

test('the program is found, whatever the folder depth', () => {
  assert.equal(fx.installed(), process.platform !== 'win32' || true);
  assert.ok(fx.cliPath()?.endsWith('effectcraft-cli') || fx.cliPath()?.endsWith('.exe'));
});

test('steps become run arguments', () => {
  assert.deepEqual(fx.stepArgs([{ id: 'comp.new', params: { name: 'Main' } }, 'layer.newText', { text: 'x' }]), ['comp.new', '{"name":"Main"}', 'layer.newText', '{"text":"x"}']);
  assert.throws(() => fx.stepArgs([{ id: 'bad id; rm' }]), /needs an "id"/);
  assert.throws(() => fx.stepArgs('nope'), /JSON list/);
  assert.throws(() => fx.stepArgs([]), /JSON list/);
});

test('builds and renders a transparent webm into assets/video', { skip: process.platform === 'win32' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'ecp-'));
  const r = await fx.effectcraft(root, { out: 'titulo', steps: [{ id: 'comp.new', params: { name: 'Main', width: 640, height: 360, frameRate: 30, duration: 2 } }] });
  assert.equal(r.src, 'assets/video/titulo.webm');
  assert.equal(r.alpha, true);
  assert.equal(readFileSync(join(root, r.src), 'utf8'), 'webm-bytes');
  const log = readFileSync(join(dir, 'log.txt'), 'utf8');
  assert.match(log, /--empty/);
  assert.match(log, /"--channels","rgba"/);
  await assert.rejects(fx.effectcraft(root, { out: 'x', project: '../fora.ecproj', steps: ['comp.new'] }), /inside|project|outside|path/i);
  await assert.rejects(fx.effectcraft(root, { out: 'y' }), /there is no project/);
});
