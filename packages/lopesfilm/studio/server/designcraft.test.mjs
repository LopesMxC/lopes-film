import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESIGNS, design, packageFor, parseSteps } from './designcraft.mjs';

test('each program has a pinned package for Windows and Linux x64, with its sha256', () => {
  for (const d of Object.values(DESIGNS)) {
    for (const key of ['win32-x64', 'linux-x64']) {
      const pkg = d.packages[key];
      assert.ok(pkg && /^[0-9a-f]{64}$/.test(pkg.sha256) && pkg.bytes > 5e7, `${d.name} ${key}`);
      assert.ok(pkg.file.includes(d.version));
    }
    assert.equal(packageFor(d, 'darwin', 'arm64'), null);
  }
});

test('steps are a JSON list of commands, by id or command', () => {
  assert.deepEqual(parseSteps('[{"id":"frame.create","params":{"width":10}},{"command":"node.set"}]'), [{ id: 'frame.create', params: { width: 10 } }, { id: 'node.set', params: {} }]);
  assert.throws(() => parseSteps('nope'), /JSON list/);
  assert.throws(() => parseSteps([]), /JSON list/);
  assert.throws(() => parseSteps([{ params: {} }]), /needs an "id"/);
  assert.throws(() => parseSteps([{ id: 'a b' }]), /needs an "id"/);
  assert.throws(() => parseSteps([{ id: 'x', params: [] }]), /object/);
});

/* a fake program that writes what it is asked to: the arguments reach it as the real one takes them */
async function fake(name, body) {
  const dir = await mkdtemp(join(tmpdir(), 'of-design-'));
  const exe = process.platform === 'win32' ? `${name}-cli.exe` : `${name}-cli`;
  await mkdir(join(dir, 'x', 'bin'), { recursive: true });
  const file = join(dir, 'x', 'bin', exe);
  await writeFile(file, `#!/usr/bin/env node\n${body}\n`);
  await chmod(file, 0o755);
  return dir;
}

test('figcraft: the steps run into the project, then the layer is exported to assets/image', { skip: process.platform === 'win32' }, async () => {
  const dir = await fake('figcraft', `
const fs = require('fs'); const a = process.argv.slice(2);
if (a[0] === 'run') { const steps = JSON.parse(fs.readFileSync(a[1], 'utf8')); fs.writeFileSync(a[a.indexOf('--out') + 1], JSON.stringify(steps)); steps.forEach((s, i) => console.log(JSON.stringify({ command: s.command, ok: true, result: { id: i + 2 }, step: i }))); }
else if (a[0] === 'export') { fs.writeFileSync(a[a.indexOf('--out') + 1], 'PNG:' + a.join(' ')); }
else if (a[0] === 'commands') { console.log('node.create*  Create layer\\n    {type, fills (gradient)}\\ntext.create*  Text\\n    {text}'); }`);
  const root = await mkdtemp(join(tmpdir(), 'of-design-root-'));
  process.env.LOPESFILM_FIGCRAFT_DIR = dir;
  try {
    const made = await design(DESIGNS.figcraft, root, { out: 'card', steps: [{ id: 'frame.create', params: { width: 100 } }], node: 'Card', scale: 2 });
    assert.equal(made.src, 'assets/image/card.png');
    assert.equal(made.project, 'assets/design/card.figcraft');
    assert.deepEqual(made.steps.map((s) => s.result.id), [2]);
    assert.match(await readFile(join(root, made.src), 'utf8'), /export .*--scale 2.*--node Card/);
    /* the project is there now: steps are optional, and it is the one that is opened */
    const again = await design(DESIGNS.figcraft, root, { out: 'card', format: 'webp' });
    assert.equal(again.src, 'assets/image/card.webp');
    await assert.rejects(design(DESIGNS.figcraft, root, { out: 'nothing-here-yet-1', project: 'assets/design/other.figcraft' }), /no project/);
    await assert.rejects(design(DESIGNS.figcraft, root, { out: 'a', steps: [{ id: 'x' }], format: 'gif' }), /--format is one of/);
    await assert.rejects(design(DESIGNS.figcraft, root, { out: 'a', steps: [{ id: 'x' }], project: '../a.figcraft' }), /./);
    const found = await design(DESIGNS.figcraft, root, { commands: 'gradient' });
    assert.match(found.commands, /node\.create[\s\S]*gradient/);
    assert.doesNotMatch(found.commands, /text\.create/);
  } finally { delete process.env.LOPESFILM_FIGCRAFT_DIR; await rm(dir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});

test('vectorcraft: the commands, the project and the picture are one run', { skip: process.platform === 'win32' }, async () => {
  const dir = await fake('vectorcraft', `
const fs = require('fs'); const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) if (a[i] === '--export') fs.writeFileSync(a[i + 1], 'OUT:' + a.join(' '));
console.log(JSON.stringify({ command: 'shape.ellipse', result: { id: 2 }, step: 'cmd' }));`);
  const root = await mkdtemp(join(tmpdir(), 'of-design-root-'));
  process.env.LOPESFILM_VECTORCRAFT_DIR = dir;
  try {
    const made = await design(DESIGNS.vectorcraft, root, { out: 'logo', steps: [{ id: 'file.new', params: { width: 8 } }, { id: 'shape.ellipse', params: { x: 0 } }], format: 'svg' });
    assert.equal(made.src, 'assets/image/logo.svg');
    assert.match(await readFile(join(root, made.src), 'utf8'), /--cmd file\.new --params \{"width":8\} --cmd shape\.ellipse/);
    const again = await design(DESIGNS.vectorcraft, root, { out: 'logo', steps: [{ id: 'shape.rectangle', params: {} }] });
    assert.match(await readFile(join(root, again.src), 'utf8'), /run --in .*logo\.vectorcraft/);
  } finally { delete process.env.LOPESFILM_VECTORCRAFT_DIR; await rm(dir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});
