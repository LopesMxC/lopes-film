import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compatModule, importMapFor, inlineScripts, resolveRelative, translate, wantsTranslation } from './code-modules.mjs';
import { googleFontCss } from './gfonts.mjs';
import { launch, serve } from './host.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'codemod-'));
const put = (root, files) => { for (const [name, body] of Object.entries(files)) { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), body); } };

test('TSX is translated: types go, JSX becomes calls, imports resolve to the layer and to files', () => {
  const root = tmp();
  put(root, { 'src/Title.tsx': 'export const T = 1;', 'src/util/index.ts': 'export const u = 1;', 'src/style.css': 'a{}', 'src/d.json': '{"a":1}', 'src/p.png': 'x' });
  const { code } = translate({
    file: join(root, 'src/Root.tsx'), root, up: '..',
    source: `import React from 'react';\nimport { Composition } from 'remotion';\nimport { TransitionSeries } from '@remotion/transitions';\nimport { fade } from '@remotion/transitions/fade';\n`
      + `import { T } from './Title';\nimport { u } from './util';\nimport './style.css';\nimport d from './d.json';\nimport png from './p.png';\ntype P = { a: number };\nexport const R = ({ a }: P) => <Composition id="x" a={a} t={[TransitionSeries, fade, T, u, d, png]} />;`,
  });
  assert.match(code, /from ['"]\.\.\/__film\/compat\/react\.mjs['"]/);
  assert.match(code, /from ['"]\.\.\/__film\/compat\/remotion\.mjs['"]/);
  assert.match(code, /from ['"]\.\.\/__film\/compat\/remotion-transitions\.mjs['"]/);
  assert.match(code, /from ['"]\.\.\/__film\/compat\/remotion-transitions-fade\.mjs['"]/);
  assert.match(code, /from ['"]\.\.\/__film\/compat\/jsx-runtime\.mjs['"]/);
  assert.match(code, /from ['"]\.\/Title\.tsx['"]/);
  assert.match(code, /from ['"]\.\/util\/index\.ts['"]/);
  assert.match(code, /import ['"]\.\/style\.css\?film=css['"]/);
  assert.match(code, /from ['"]\.\/d\.json\?film=json['"]/);
  assert.match(code, /from ['"]\.\/p\.png\?film=url['"]/);
  assert.doesNotMatch(code, /type P/);
  rmSync(root, { recursive: true, force: true });
});

test('a syntax error comes back as an error naming the file; names of the layer follow the package path', () => {
  const out = translate({ source: 'const = ;', file: '/p/a.tsx', root: '/p', up: '.' });
  assert.match(out.error, /a\.tsx/);
  assert.equal(compatModule('@remotion/google-fonts/Inter'), 'remotion-google-fonts-Inter.mjs');
  assert.equal(compatModule('@remotion/transitions/clock-wipe'), 'remotion-transitions-clock-wipe.mjs');
  assert.equal(compatModule('lodash'), null);
});

test('resolving: an extension is found, a .js import finds a .ts file, a folder finds its index', () => {
  const root = tmp();
  put(root, { 'a.tsx': '', 'b.ts': '', 'c/index.jsx': '' });
  assert.equal(resolveRelative(root, './a'), join(root, 'a.tsx'));
  assert.equal(resolveRelative(root, './b.js'), join(root, 'b.ts'));
  assert.equal(resolveRelative(root, './c'), join(root, 'c/index.jsx'));
  assert.equal(resolveRelative(root, './none'), null);
  rmSync(root, { recursive: true, force: true });
});

test('a .js file is translated only when it imports React or Remotion; pages get an import map once, and inline TSX is translated', () => {
  assert.equal(wantsTranslation('/p/a.js', 'import { x } from "remotion";'), true);
  assert.equal(wantsTranslation('/p/b.js', 'export const x = 1;'), false);
  assert.equal(wantsTranslation('/p/c.tsx', 'export const x = 1;'), true);
  assert.match(importMapFor('<script type="module" src="a.tsx"></script>', '..'), /"remotion":"\.\.\/__film\/compat\/remotion\.mjs"/);
  assert.match(importMapFor('<script type="module">import "@remotion/shapes"</script>', '.'), /"@remotion\/transitions\/clock-wipe":"\.\/__film\/compat\/remotion-transitions-clock-wipe\.mjs"/);
  assert.equal(importMapFor('<script type="importmap">{}</script><script src="a.tsx"></script>', '.'), '');
  assert.equal(importMapFor('<p>hello</p>', '.'), '');
  const html = inlineScripts('<script type="text/tsx">const a: number = 1; document.title = <b>{a}</b> && "x";</script>', { file: '/p/x.html', root: '/p', up: '.' });
  assert.match(html, /^<script type="module">/);
  assert.doesNotMatch(html, /: number/);
});

test('Google fonts: the stylesheet is made once from what the service sends, its files kept beside it', async () => {
  const dir = tmp();
  const calls = [];
  const css = `/* latin */\n@font-face {\n  font-family: 'Demo';\n  src: url(https://fonts.gstatic.com/s/demo/v1/a.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}\n/* thai */\n@font-face {\n  font-family: 'Demo';\n  src: url(https://fonts.gstatic.com/s/demo/v1/b.woff2) format('woff2');\n}\n`;
  const get = async (url) => { calls.push(url); return url.includes('gstatic') ? { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } : { text: async () => css }; };
  const first = await googleFontCss('Demo Sans', { dir, get });
  assert.match(first, /url\(files\/[\da-f]{16}\.woff2\)/);
  assert.doesNotMatch(first, /thai|gstatic/);
  const n = calls.length;
  assert.equal(await googleFontCss('Demo Sans', { dir, get }), first);
  assert.equal(calls.length, n, 'the second time nothing is fetched');
  await assert.rejects(googleFontCss('Nope', { dir, get: async () => { throw new Error('404'); } }), /no "Nope"/);
  rmSync(dir, { recursive: true, force: true });
});

test('a Remotion project written in TSX runs as it is: Root, components, CSS, JSON, public/ files, transitions, shapes', { timeout: 120_000 }, async () => {
  const root = tmp();
  put(root, {
    'index.html': '<!doctype html><body style="margin:0"><script type="module" src="./src/index.tsx"></script></body>',
    'src/index.tsx': `import { registerRoot } from 'remotion';\nimport { RemotionRoot } from './Root';\nimport './style.css';\nregisterRoot(RemotionRoot);`,
    'src/Root.tsx': `import React from 'react';\nimport { Composition } from 'remotion';\nimport { Main } from './Main';\nexport const RemotionRoot: React.FC = () => <Composition id="Main" component={Main} durationInFrames={120} fps={30} width={640} height={360} />;`,
    'src/Main.tsx': `import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { Circle } from '@remotion/shapes';
import data from './data.json';
const Scene: React.FC<{ id: string }> = ({ id }) => { const f = useCurrentFrame(); return <AbsoluteFill id={id} className="bg">{id}{Math.round(f)}</AbsoluteFill>; };
export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={60}><Scene id="a" /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={60}><Scene id="b" /></TransitionSeries.Sequence>
    </TransitionSeries>
    <b id="o">{interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' }).toFixed(2)} {data.name}</b>
    <Img id="img" src={staticFile('dot.svg')} width={20} height={20} /><Circle radius={10} fill="red" />
  </AbsoluteFill>;
};`,
    'src/style.css': '.bg{background:#123;color:#fff}',
    'src/data.json': '{"name":"mundo"}',
    'assets/dot.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="9" fill="red"/></svg>',
  });
  const site = await serve(root);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${site.url}/index.html`);
    await page.waitForFunction(() => window.film, null, { timeout: 15000 });
    const at = (t) => page.evaluate(async (t) => { await window.film.ready?.call?.(window.film); window.filmHost.time(t); await window.film.frame(t); window.filmHost.settle(t); }, t);
    await at(0.5);   // frame 15: only the first scene
    assert.equal(await page.locator('#a').count(), 1);
    assert.equal(await page.locator('#b').count(), 0);
    assert.equal(await page.locator('#o').innerText(), '0.50 mundo');
    await at(1.5);   // frame 45: in the transition (starts at 40): both scenes, the second one at its own frame 5
    assert.equal(await page.locator('#a').innerText(), 'a45');
    assert.equal(await page.locator('#b').innerText(), 'b5');
    await at(2.5);   // frame 75: only the second
    assert.equal(await page.locator('#a').count(), 0);
    assert.equal(await page.locator('#b').innerText(), 'b35');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('a') ?? document.getElementById('b')).backgroundColor), 'rgb(17, 34, 51)');
    assert.equal(await page.evaluate(() => document.getElementById('img').complete && document.getElementById('img').naturalWidth), 20, 'public/ finds the file in assets/');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await site.close(); rmSync(root, { recursive: true, force: true }); }
});

test('@remotion/lottie draws the animation at the frame, @remotion/captions and media-utils load, an unknown package says so', { timeout: 120_000 }, async () => {
  const root = tmp();
  const anim = { v: '5.7.0', fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: 't', ddd: 0, assets: [], layers: [{ ddd: 0, ind: 1, ty: 4, nm: 's', sr: 1, ip: 0, op: 60, st: 0, ao: 0,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 1, k: [{ t: 0, s: [10, 50, 0], i: { x: [1], y: [1] }, o: { x: [0], y: [0] } }, { t: 59, s: [90, 50, 0] }] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
    shapes: [{ ty: 'gr', it: [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [20, 20] } }, { ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 } },
      { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }] }] };
  put(root, {
    'index.html': '<!doctype html><body style="margin:0"><script type="module" src="./m.tsx"></script></body>',
    'anim.json': JSON.stringify(anim),
    'm.tsx': `import React from 'react';
import { Composition, registerRoot, AbsoluteFill } from 'remotion';
import { Lottie } from '@remotion/lottie';
import { parseSrt, createTikTokStyleCaptions } from '@remotion/captions';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import data from './anim.json';
const pages = createTikTokStyleCaptions({ captions: parseSrt({ input: '1\\n00:00:00,000 --> 00:00:01,000\\nHi\\n' }).captions }).pages.length;
const Main = () => <AbsoluteFill id="pg" data-pages={pages} data-fn={typeof getAudioDurationInSeconds}><Lottie animationData={data} style={{ width: 200, height: 200 }} /></AbsoluteFill>;
registerRoot(() => <Composition id="m" component={Main} durationInFrames={60} fps={30} width={200} height={200} />);`,
    'bad.html': '<!doctype html><body><script type="module">import "@remotion/rive";</script></body>',
  });
  const site = await serve(root);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site.url}/index.html`);
    await page.waitForFunction(() => window.film, null, { timeout: 15000 });
    const x = async (t) => {
      await page.evaluate(async (t) => { await window.film.ready?.call?.(window.film); window.filmHost.time(t); await window.film.frame(t); window.filmHost.settle(t); }, t);
      return page.evaluate(() => { const b = document.querySelector('svg path[fill="rgb(255,0,0)"], svg path[fill="rgb(255, 0, 0)"]')?.getBoundingClientRect(); return b ? Math.round(b.x + b.width / 2) : null; });
    };
    const x0 = await x(0), x1 = await x(1), x2 = await x(1.9);
    assert.ok(x0 !== null && x1 !== null && x0 < x1 && x1 < x2, `the circle moves right with t: ${x0} ${x1} ${x2}`);
    assert.equal(await page.locator('#pg').getAttribute('data-pages'), '1');
    assert.equal(await page.locator('#pg').getAttribute('data-fn'), 'function');
    assert.deepEqual(errors, []);
    const bad = await browser.newPage();
    const failed = [];
    bad.on('pageerror', (e) => failed.push(e.message));
    await bad.goto(`${site.url}/bad.html`);
    await bad.waitForTimeout(500);
    assert.match(failed.join(' '), /@remotion\/rive|not in Lopes\.Film's layer/);
  } finally { await browser.close(); await site.close(); rmSync(root, { recursive: true, force: true }); }
});
