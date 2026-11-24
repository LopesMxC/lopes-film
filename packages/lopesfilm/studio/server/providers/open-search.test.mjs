import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import openverse from './openverse.mjs';
import wikimedia from './wikimedia.mjs';
import nasa from './nasa.mjs';
import unsplash from './unsplash.mjs';
import coverr from './coverr.mjs';
import searxng from './searxng.mjs';
import wikipedia from './wikipedia.mjs';
import jina from './jina.mjs';
import acestep from './acestep.mjs';
import stableaudio, { wavSeconds } from './stableaudio.mjs';

/** One fake server for every service of the open ones: `reply` answers each request; `seen` keeps them. */
let server, base;
let reply = () => [404, {}];
const seen = [];
before(async () => {
  server = createServer(async (req, res) => {
    const call = { method: req.method, url: new URL(req.url, 'http://x'), headers: req.headers };
    seen.push(call);
    const [status, body, type = 'application/json'] = await reply(call);
    res.writeHead(status, { 'content-type': type }).end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const n of ['OPENVERSE', 'WIKIMEDIA', 'NASA', 'UNSPLASH', 'COVERR', 'SEARXNG', 'WIKIPEDIA', 'JINA']) process.env[`LOPESFILM_${n}_URL`] = base;
  process.env.LOPESFILM_ACESTEP_URL = base;
});
after(() => server.close());

const ctx = (key = 'k-0123456789', model) => ({ key, model, root: '/project', signal: new AbortController().signal, say: () => {}, read: async () => new Uint8Array() });
const jpeg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const mp4 = Buffer.from('....ftypisom....mp4data');

test('Openverse: keyless, commercial licences by default, each picture with its author and licence', async () => {
  reply = (c) => c.url.pathname === '/v1/images/'
    ? [200, { results: [{ url: `${base}/f/1.jpg`, title: 'Fox', creator: 'Ana', license: 'by', license_version: '4.0', foreign_landing_url: 'https://x/1' }] }]
    : [200, jpeg(800, 600), 'image/jpeg'];
  const r = await openverse.run('image-search', { out: 'fox', prompt: 'fox', n: 1 }, ctx(''));
  const q = seen.find((c) => c.url.pathname === '/v1/images/');
  assert.equal(q.url.searchParams.get('license_type'), 'commercial');
  assert.equal(q.headers.authorization, undefined, 'no key, no token');
  assert.equal(r.receipt.images[0].credit, '"Fox" by Ana (CC BY 4.0) via Openverse');
  assert.equal(r.files[0].path, 'assets/image/fox.jpg');
});

test('Openverse music: tracks of the music category landed with their credit', async () => {
  reply = (c) => c.url.pathname === '/v1/audio/'
    ? [200, { results: [{ url: `${base}/f/a.mp3`, title: 'Calm', creator: 'Bo', license: 'cc0', license_version: '1.0', duration: 61000, foreign_landing_url: 'https://x/a' }] }]
    : [200, Buffer.from('mp3'), 'audio/mpeg'];
  const r = await openverse.run('web-music', { out: 'calm', prompt: 'calm' }, ctx(''));
  assert.equal(seen.filter((c) => c.url.pathname === '/v1/audio/').at(-1).url.searchParams.get('category'), 'music');
  assert.equal(r.receipt.tracks[0].dur, 61);
  assert.match(r.receipt.tracks[0].credit, /Calm" by Bo/);
});

test('Wikimedia Commons: pictures at 1920 px with the author and licence, sent with a user agent; clips only WebM or MP4', async () => {
  seen.length = 0;
  reply = (c) => {
    if (c.url.pathname === '/w/api.php') {
      const video = /filetype:video/.test(c.url.searchParams.get('gsrsearch'));
      return [200, { query: { pages: {
        1: { index: 2, title: 'File:Ogv.ogv', imageinfo: [{ url: `${base}/f/o.ogv`, mime: 'application/ogg', descriptionurl: 'https://c/o' }] },
        2: { index: 1, title: 'File:Sea.webm', imageinfo: [{ url: `${base}/f/s.webm`, mime: 'video/webm', duration: 12, width: 1280, height: 720, descriptionurl: 'https://c/s', extmetadata: { Artist: { value: '<a href="x">Cy</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
        3: { index: 3, title: 'File:Sea.jpg', imageinfo: [{ url: `${base}/f/big.jpg`, thumburl: `${base}/f/s.jpg`, mime: 'image/jpeg', descriptionurl: 'https://c/j', extmetadata: { Artist: { value: 'Di' }, LicenseShortName: { value: 'CC0' } } }] },
      } } }].map((x) => video ? x : x);
    }
    return c.url.pathname.endsWith('.jpg') ? [200, jpeg(1920, 1080), 'image/jpeg'] : [200, Buffer.from('webm'), 'video/webm'];
  };
  const p = await wikimedia.run('image-search', { out: 'sea', prompt: 'sea' }, ctx(''));
  assert.equal(seen.find((c) => c.url.pathname === '/w/api.php').url.searchParams.get('iiurlwidth'), '1920');
  assert.ok(seen.filter((c) => c.url.pathname.startsWith('/f/')).every((c) => /Lopes.Film/.test(c.headers['user-agent'])));
  assert.match(p.receipt.images[0].credit, /by Di \(CC0\) via Wikimedia Commons/);
  const v = await wikimedia.run('video-search', { out: 'sea', prompt: 'sea' }, ctx(''));
  assert.equal(v.files[0].path, 'assets/video/sea.webm');
  assert.match(v.receipt.clips[0].credit, /by Cy \(CC BY-SA 4.0\)/);
  assert.deepEqual([v.receipt.clips[0].w, v.receipt.clips[0].dur], [1280, 12]);
});

test('NASA: the large picture and the medium clip are picked from each item\'s file list', async () => {
  reply = (c) => {
    if (c.url.pathname === '/search') return [200, { collection: { items: [{ href: `${base}/asset/a1`, data: [{ nasa_id: 'a1', title: 'Moon', photographer: 'Neil' }] }] } }];
    if (c.url.pathname === '/asset/a1') return [200, [`${base}/m/a1~orig.jpg`, `${base}/m/a1~large.jpg`, `${base}/m/a1~medium.mp4`, `${base}/m/a1~orig.mp4`]];
    return c.url.pathname.endsWith('.jpg') ? [200, jpeg(1000, 800), 'image/jpeg'] : [200, mp4, 'video/mp4'];
  };
  const i = await nasa.run('image-search', { out: 'moon', prompt: 'moon' }, ctx(''));
  assert.ok(seen.some((c) => c.url.pathname === '/m/a1~large.jpg'));
  assert.equal(i.receipt.images[0].credit, '"Moon" · Neil / NASA');
  const v = await nasa.run('video-search', { out: 'moon', prompt: 'moon', orientation: 'portrait' }, ctx(''));
  assert.ok(seen.some((c) => c.url.pathname === '/m/a1~medium.mp4'));
  assert.deepEqual(v.receipt.notes, ['NASA cannot filter by shape: --orientation was not applied']);
});

test('Unsplash: Client-ID key, 1920 px picture, the download told to Unsplash', async () => {
  seen.length = 0;
  reply = (c) => c.url.pathname === '/search/photos'
    ? [200, { results: [{ urls: { raw: `${base}/p/raw?ixid=1`, regular: `${base}/p/reg` }, links: { html: 'https://u/p', download_location: `${base}/p/dl` }, user: { name: 'Eve' } }] }]
    : c.url.pathname === '/p/dl' ? [200, {}] : [200, jpeg(1920, 1280), 'image/jpeg'];
  const r = await unsplash.run('image-search', { out: 'u', prompt: 'tree' }, ctx('ak-1234567890'));
  assert.equal(seen[0].headers.authorization, 'Client-ID ak-1234567890');
  const raw = seen.find((c) => c.url.pathname === '/p/raw');
  assert.equal(raw.url.searchParams.get('w'), '1920');
  assert.ok(seen.some((c) => c.url.pathname === '/p/dl'));
  assert.equal(r.receipt.images[0].credit, 'Photo by Eve on Unsplash');
});

test('Coverr: the key, the clips of the shape asked for', async () => {
  seen.length = 0;
  reply = (c) => c.url.pathname === '/videos'
    ? [200, { hits: [{ title: 'Wide', is_vertical: false, duration: 9, urls: { mp4: `${base}/v/w.mp4` } }, { title: 'Tall', is_vertical: true, duration: 7, urls: { mp4_download: `${base}/v/t.mp4` } }] }]
    : [200, mp4, 'video/mp4'];
  const r = await coverr.run('video-search', { out: 'c', prompt: 'city', orientation: 'portrait' }, ctx('cv-1234567890'));
  assert.equal(seen[0].headers.authorization, 'Bearer cv-1234567890');
  assert.equal(seen[0].url.searchParams.get('urls'), 'true');
  assert.equal(r.receipt.clips.length, 1);
  assert.match(r.receipt.clips[0].credit, /"Tall" · Video from Coverr/);
});

test('web search: SearXNG (JSON, and a clear word when JSON is off), Wikipedia (language is the model), Jina (bearer key)', async () => {
  reply = () => [200, { results: [{ title: 'Blender', url: 'https://blender.org', content: 'Free 3D', publishedDate: '2026-01-01' }] }];
  const s = await searxng.run('web-search', { query: 'blender' }, ctx(''));
  assert.equal(s.receipt.provider, 'searxng');
  assert.equal(s.receipt.hits[0].url, 'https://blender.org');
  reply = () => [403, 'forbidden', 'text/plain'];
  await assert.rejects(searxng.run('web-search', { query: 'x' }, ctx('')), /turn it on in the instance's settings\.yml/);

  reply = () => [200, { query: { search: [{ title: 'Ouro Preto', snippet: 'cidade <span class="searchmatch">histórica</span> &amp; mineira', timestamp: '2026-02-02T00:00:00Z' }] } }];
  const w = await wikipedia.run('web-search', { query: 'ouro preto' }, ctx('', 'pt'));
  assert.equal(w.receipt.hits[0].excerpt, 'cidade histórica & mineira');
  assert.match(w.receipt.hits[0].url, /\/wiki\/Ouro_Preto$/);
  assert.ok(seen.at(-1).headers['user-agent'].includes('Lopes.Film'));

  reply = () => [200, { data: [{ title: 'Jina', url: 'https://jina.ai', description: 'Search' }] }];
  const j = await jina.run('web-search', { query: 'jina' }, ctx('jina-key-0123456789'));
  assert.equal(seen.at(-1).headers.authorization, 'Bearer jina-key-0123456789');
  assert.equal(seen.at(-1).headers['x-respond-with'], 'no-content');
  assert.equal(j.receipt.hits[0].title, 'Jina');
});

test('ACE-Step: health check, task sent, polled until done, the file downloaded; a server not running says how to start it', async () => {
  seen.length = 0;
  let polls = 0;
  reply = (c) => {
    if (c.url.pathname === '/health') return [200, { data: { status: 'ok' } }];
    if (c.url.pathname === '/release_task') return [200, { data: { task_id: 't1', status: 'queued' } }];
    if (c.url.pathname === '/query_result') return [200, { data: [{ task_id: 't1', status: ++polls < 2 ? 0 : 1, result: JSON.stringify([{ file: '/v1/audio?path=%2Ftmp%2Fa.mp3' }]) }] }];
    if (c.url.pathname === '/v1/audio') return [200, Buffer.from('mp3bytes'), 'audio/mpeg'];
    return [404, {}];
  };
  const r = await acestep.run('music', { out: 'theme', prompt: 'warm lo-fi', sec: 20 }, ctx(''));
  const task = JSON.parse(await new Promise((done) => done(JSON.stringify({}))));
  assert.deepEqual(task, {});
  assert.equal(r.files[0].path, 'assets/audio/music/theme.mp3');
  assert.equal(r.receipt.dur, 20);
  assert.ok(seen.some((c) => c.url.pathname === '/v1/audio' && c.url.searchParams.get('path') === '/tmp/a.mp3'));
  process.env.LOPESFILM_ACESTEP_URL = 'http://127.0.0.1:9';
  await assert.rejects(acestep.run('music', { out: 'x', prompt: 'y' }, ctx('')), /uv run acestep-api/);
  process.env.LOPESFILM_ACESTEP_URL = base;
});

test('Stable Audio Open: health check, one request for the sound, a WAV saved with its length; a server not running says how to start it', async () => {
  seen.length = 0;
  const wav = Buffer.alloc(44 + 64000);
  wav.write('RIFF', 0); wav.writeUInt32LE(32000, 28); /* 32000 bytes a second: 2 s */
  reply = (c) => (c.url.pathname === '/health' ? [200, { ok: true }] : c.url.pathname === '/generate' ? [200, wav, 'audio/wav'] : [404, {}]);
  process.env.LOPESFILM_SFX_URL = base;
  const r = await stableaudio.run('sfx', { out: 'whoosh', prompt: 'fast whoosh', sec: 2 }, ctx(''));
  assert.equal(r.files[0].path, 'assets/audio/sfx/whoosh.wav');
  assert.equal(r.receipt.dur, 2);
  assert.equal(wavSeconds(new Uint8Array(wav)), 2);
  assert.equal(wavSeconds(new Uint8Array(10)), null);
  process.env.LOPESFILM_SFX_URL = 'http://127.0.0.1:9';
  await assert.rejects(stableaudio.run('sfx', { out: 'x', prompt: 'y' }, ctx('')), /INICIAR\.bat/);
  delete process.env.LOPESFILM_SFX_URL;
});
