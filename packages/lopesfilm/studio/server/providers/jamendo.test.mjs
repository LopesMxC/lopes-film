import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import jamendo, { licenceOf } from './jamendo.mjs';

let server;
let hits = [];
const seen = [];
before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    seen.push(url);
    if (url.pathname === '/v3.0/tracks/') {
      const base = `http://127.0.0.1:${server.address().port}`;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ headers: { status: url.searchParams.get('client_id') === 'bad' ? 'failed' : 'success', error_message: 'Invalid client_id' }, results: hits.map((h) => ({ ...h, audiodownload: h.audiodownload ? `${base}${h.audiodownload}` : '' })) }));
    } else if (url.pathname === '/dl/ok.mp3') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(Buffer.from('ID3-fake-mp3-bytes'));
    } else res.writeHead(404).end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  process.env.OPENFILM_JAMENDO_URL = process.env.LOPESFILM_JAMENDO_URL = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); delete process.env.LOPESFILM_JAMENDO_URL; delete process.env.OPENFILM_JAMENDO_URL; });
const ctx = (key = 'k') => ({ key, model: undefined, root: '/p', signal: new AbortController().signal, say: () => {}, read: async () => undefined });

test('a licence address becomes a short credit', () => {
  assert.equal(licenceOf('https://creativecommons.org/licenses/by-nc/3.0/'), 'CC BY-NC');
  assert.equal(licenceOf(''), 'see page');
});

test('it finds music, downloads the ones that can be, and says who made them and under what licence', async () => {
  hits = [
    { name: 'No Download', artist_name: 'X', duration: 100, shareurl: 'https://j/x', license_ccurl: 'https://creativecommons.org/licenses/by/3.0/', audiodownload: '' },
    { name: 'Calm Piano', artist_name: 'Ana', duration: 123, shareurl: 'https://j/calm', license_ccurl: 'https://creativecommons.org/licenses/by-sa/3.0/', audiodownload: '/dl/ok.mp3' },
  ];
  const r = await jamendo.run('web-music', { out: 'theme', prompt: 'calm piano', n: 1 }, ctx());
  const q = seen.at(-2) ?? seen.at(-1);
  const search = seen.find((u) => u.pathname === '/v3.0/tracks/');
  assert.equal(search.searchParams.get('search'), 'calm piano');
  assert.equal(search.searchParams.get('audiodownload_allowed'), 'true');
  assert.equal(r.files.length, 1);
  assert.equal(r.files[0].path, 'assets/audio/music/theme.mp3');
  assert.equal(r.index[0].dur, 123);
  assert.match(r.index[0].from.credit, /"Calm Piano" by Ana on Jamendo \(CC BY-SA\)/);
  assert.equal(r.receipt.tracks[0].page, 'https://j/calm');
  assert.ok(q);
});

test('nothing downloadable: said, not an empty success; a refused key: said as such', async () => {
  hits = [{ name: 'None', audiodownload: '' }];
  await assert.rejects(jamendo.run('web-music', { out: 'a', prompt: 'x' }, ctx()), /found no music/);
  await assert.rejects(jamendo.run('web-music', { out: 'a', prompt: 'x' }, ctx('bad')), /did not accept your key/);
  await assert.rejects(jamendo.run('music', { out: 'a', prompt: 'x' }, ctx()), /does not do music/);
});
