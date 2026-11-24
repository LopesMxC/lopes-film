import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, serve } from './host.mjs';

const MAP = `<script type="importmap">{"imports":{"react":"./__film/compat/react.mjs","react-dom":"./__film/compat/react-dom.mjs","react-dom/client":"./__film/compat/react-dom-client.mjs","react/jsx-runtime":"./__film/compat/jsx-runtime.mjs","react/jsx-dev-runtime":"./__film/compat/jsx-dev-runtime.mjs","remotion":"./__film/compat/remotion.mjs","film-compat":"./__film/compat/film-compat.mjs"}}</script>`;

async function withPage(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'compat-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  const site = await serve(root);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await run(page, site.url, errors);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await site.close(); rmSync(root, { recursive: true, force: true }); }
}
const at = (page, t) => page.evaluate(async (t) => {
  await window.film.ready?.call?.(window.film);
  window.filmHost.time(t); await window.film.frame(t); window.filmHost.settle(t);
}, t);

test('a Remotion composition is drawn from t: hooks, Sequence, interpolate, spring', { timeout: 90_000 }, async () => {
  const page1 = `<!doctype html>${MAP}<body style="margin:0"><script type="module">
import React from 'react';
import { registerRoot, Composition, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
const h = React.createElement;
function Scene() {
  const frame = useCurrentFrame(); const { fps, width } = useVideoConfig();
  return h(AbsoluteFill, { id: 'bg' }, h('b', { id: 'o' }, interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' }).toFixed(3)),
    h('b', { id: 's' }, spring({ frame, fps, config: { damping: 200 } }).toFixed(3)), h('b', { id: 'w' }, String(width)),
    h(Sequence, { from: 45, durationInFrames: 15 }, h(Late)));
}
function Late() { return h('b', { id: 'late' }, 'local ' + Math.round(useCurrentFrame())); }
const Root = () => h(Composition, { id: 'a', component: Scene, durationInFrames: 90, fps: 30, width: 1280, height: 720 });
registerRoot(Root);
</script>`;
  await withPage({ 'page.html': page1 }, async (page, url) => {
    await page.goto(`${url}/page.html`);
    await page.waitForFunction(() => window.film?.frame);
    assert.equal(await page.evaluate(() => window.film.duration), 3);
    await at(page, 0.5);
    const read = () => page.evaluate(() => ({ o: o.textContent, s: s.textContent, w: w.textContent, late: document.getElementById('late')?.textContent ?? null }));
    const half = await read();
    assert.equal(half.o, '0.500');
    assert.equal(half.w, '1280');
    assert.equal(half.late, null, 'a Sequence is not there before its from');
    assert.ok(Number(half.s) > 0 && Number(half.s) < 1);
    await at(page, 1.6);
    const later = await read();
    assert.equal(later.o, '1.000');
    assert.equal(later.late, 'local 3', 'inside a Sequence the frame counts from its start (1.6 s = frame 48, from 45)');
    await at(page, 0.5);
    assert.deepEqual(await read(), half, 'the same t draws the same picture after another');
  });
});

test('a page named like a composition draws it (a film.html src has no ?composition=)', { timeout: 90_000 }, async () => {
  const body = `<!doctype html>${MAP}<body style="margin:0"><script type="module">
import React from 'react';
import { registerRoot, Composition } from 'remotion';
const h = React.createElement;
const One = () => h('b', { id: 'who' }, 'one');
const Two = () => h('b', { id: 'who' }, 'two');
registerRoot(() => h(React.Fragment, null,
  h(Composition, { id: 'One', component: One, durationInFrames: 30, fps: 30, width: 640, height: 360 }),
  h(Composition, { id: 'Two', component: Two, durationInFrames: 60, fps: 30, width: 640, height: 360 })));
</script>`;
  await withPage({ 'index.html': body, 'Two.html': body }, async (page, url) => {
    for (const [file, who, secs] of [['index.html', 'one', 1], ['Two.html', 'two', 2], ['index.html?composition=Two', 'two', 2]]) {
      await page.goto(`${url}/${file}`);
      await page.waitForFunction(() => window.film?.frame);
      assert.equal(await page.evaluate(() => window.film.duration), secs, file);
      assert.equal(await page.evaluate(() => document.getElementById('who')?.textContent), who, file);
    }
  });
});

test('React with htm and the script-tag form draws from t', { timeout: 90_000 }, async () => {
  const page = `<!doctype html><script src="__film/compat.js"></script><body><script>
const { html, mount } = FilmCompat;
function Dot() { const f = Remotion.useCurrentFrame(); return html\`<i id="d" style=\${{ position: 'absolute', left: f * 10 }}>\${Math.round(f)}</i>\`; }
mount(Dot, { fps: 10, duration: 2 });
</script>`;
  await withPage({ 'page.html': page }, async (p, url) => {
    await p.goto(`${url}/page.html`);
    await p.waitForFunction(() => window.film?.frame);
    await at(p, 1.5);
    assert.equal(await p.evaluate(() => d.textContent), '15');
    assert.equal(await p.evaluate(() => window.film.duration), 2);
  });
});

test('GSAP, anime.js, Lottie and Three are told t, and nothing else moves them', { timeout: 90_000 }, async () => {
  const page = `<!doctype html>${MAP}<body><script type="module">
import { gsap, anime, lottie, three } from 'film-compat';
const calls = [];
const paused = [];
const tl = { pause() { paused.push('tl'); return this; }, time(t, suppress) { calls.push(['gsap', t, suppress]); } };
const g = { ticker: { lagSmoothing(n) { calls.push(['lag', n]); }, remove() {} }, globalTimeline: {} };
gsap(tl, g);
anime({ pause() { paused.push('anime'); }, seek(ms) { calls.push(['anime', ms]); } });
const lot = { isLoaded: true, totalFrames: 300, frameRate: 30, pause() { paused.push('lottie'); }, goToAndStop(v, isFrame) { calls.push(['lottie', v, isFrame]); } };
lottie(lot);
const renderer = { setAnimationLoop(f) { calls.push(['loop', f]); }, render(s, c) { calls.push(['three', s, c]); } };
three(renderer, 'scene', 'camera', (t) => calls.push(['update', t]));
window.calls = calls; window.paused = paused;
</script>`;
  await withPage({ 'page.html': page }, async (p, url) => {
    await p.goto(`${url}/page.html`);
    await p.waitForFunction(() => window.film?.frame && window.calls);
    await at(p, 2.5);
    const { calls, paused } = await p.evaluate(() => ({ calls: window.calls, paused: window.paused }));
    assert.deepEqual(paused.sort(), ['anime', 'lottie', 'tl']);
    assert.deepEqual(calls, [
      ['lag', 0], ['loop', null], ['gsap', 2.5, false], ['anime', 2500], ['lottie', 2500, false], ['update', 2.5], ['three', 'scene', 'camera'],
    ]);
  });
});
