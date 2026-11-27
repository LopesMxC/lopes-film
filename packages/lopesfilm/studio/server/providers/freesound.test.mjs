import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import freesound, { licenceOf, lengthFilter, search } from './freesound.mjs';

const sound = (id, over = {}) => ({ id, name: `Whoosh ${id}`, username: 'someone', license: 'https://creativecommons.org/licenses/by/4.0/', duration: 2.5, url: `https://freesound.org/s/${id}/`, previews: { 'preview-hq-mp3': `PREVIEW${id}` }, tags: ['whoosh'], num_downloads: 3, ...over });

async function fake(t) {
  const seen = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    seen.push(u);
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (u.pathname === '/apiv2/search/text/') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ count: 2, next: null, results: [1, 2].map((i) => { const s = sound(i); s.previews['preview-hq-mp3'] = `${origin}/p/${i}.mp3`; return s; }) }));
    }
    if (u.pathname.startsWith('/apiv2/sounds/')) {
      const s = sound(Number(u.pathname.split('/')[3])); s.previews['preview-hq-mp3'] = `${origin}/p/9.mp3`;
      res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(s));
    }
    res.setHeader('content-type', 'audio/mpeg'); res.end(Buffer.from('ID3fake'));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.LOPESFILM_FREESOUND_URL = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { delete process.env.LOPESFILM_FREESOUND_URL; server.close(); });
  return seen;
}
const ctx = () => ({ key: 'K', signal: new AbortController().signal, model: undefined });

test('licences read as short credits', () => {
  assert.equal(licenceOf('https://creativecommons.org/licenses/by-nc/4.0/'), 'CC BY-NC 4.0');
  assert.equal(licenceOf('https://creativecommons.org/publicdomain/zero/1.0/'), 'CC0');
  assert.match(lengthFilter('sfx'), /0 TO 30/);
  assert.equal(lengthFilter('all'), '');
});

test('a search sends the token and the length filter, and keeps what has a preview', async (t) => {
  const seen = await fake(t);
  const r = await search({ key: 'K', query: 'whoosh', kind: 'sfx', signal: ctx().signal });
  assert.equal(r.found.length, 2);
  assert.equal(seen[0].searchParams.get('token'), 'K');
  assert.match(seen[0].searchParams.get('filter'), /duration:\[0 TO 30\]/);
});

test('web-music by words lands the previews under assets/audio/sfx with their credit', async (t) => {
  await fake(t);
  const r = await freesound.run('web-music', { prompt: 'whoosh', kind: 'sfx', out: 'w', n: 2 }, ctx());
  assert.deepEqual(r.files.map((f) => f.path), ['assets/audio/sfx/w.mp3', 'assets/audio/sfx/w_2.mp3']);
  assert.match(r.receipt.tracks[0].credit, /by someone on Freesound \(CC BY 4\.0\)/);
  assert.equal(r.receipt.skill, 'freesound');
});

test('with no kind the whole library is searched: no length filter, and no words browse it', async (t) => {
  const seen = await fake(t);
  const all = await search({ key: 'K', query: '', kind: 'all', signal: ctx().signal });
  assert.equal(all.found.length, 2);
  assert.equal(seen[0].searchParams.has('filter'), false);
  const r = await freesound.run('web-music', { out: 'b', n: 1 }, ctx());
  assert.equal(seen.filter((u) => u.pathname === '/apiv2/search/text/').at(-1).searchParams.get('sort'), 'downloads_desc');
  assert.equal(r.files[0].path, 'assets/audio/sfx/b.mp3', 'a sound under 30 s lands in sfx');
});

test('web-music by id takes that one sound; its length says where it lands', async (t) => {
  await fake(t);
  const r = await freesound.run('web-music', { id: 77, out: 'x', kind: 'music' }, ctx());
  assert.equal(r.files[0].path, 'assets/audio/music/x.mp3');
  assert.equal(r.receipt.tracks[0].title, 'Whoosh 77');
});
