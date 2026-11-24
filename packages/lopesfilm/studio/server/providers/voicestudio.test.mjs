import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import voicestudio, { voicesOf } from './voicestudio.mjs';
import { wav } from './common.mjs';

/** A fake Voice Studio on 127.0.0.1: `reply` answers each request; `seen` keeps them. */
let server;
let reply = () => [404, {}];
const seen = [];

before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const call = { method: req.method, url: new URL(req.url, 'http://x'), headers: req.headers, body: Buffer.concat(chunks) };
    seen.push(call);
    const [status, body] = await reply(call);
    if (body instanceof Uint8Array) res.writeHead(status, { 'content-type': 'audio/wav' }).end(body);
    else res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  process.env.LOPESFILM_VOICESTUDIO_URL = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); delete process.env.LOPESFILM_VOICESTUDIO_URL; });

const ctx = (files = {}, key = '') => ({ key, model: undefined, root: '/project', signal: new AbortController().signal, say: () => {}, read: async (p) => files[p] });
const form = (call) => new Request('http://x', { method: 'POST', headers: { 'content-type': call.headers['content-type'] }, body: call.body }).formData();

test('it connects with no key, and does voices, voice-over and transcription', () => {
  assert.equal(voicestudio.keyless, true);
  assert.deepEqual(voicestudio.verbs, ['voice', 'tts', 'asr']);
});

test('voices: a list, `{ voices }` or `{ data }`; an id is what speaks a voice', () => {
  const row = { voice_id: 'v1', name: 'Ana', language: 'pt' };
  assert.deepEqual(voicesOf([row])[0], { voiceId: 'v1', id: 'v1', name: 'Ana', language: 'pt', gender: null, description: null });
  assert.equal(voicesOf({ voices: [row] }).length, 1);
  assert.equal(voicesOf({ data: [{ id: 'x' }] })[0].name, 'x');
  assert.deepEqual(voicesOf({ nothing: true }), []);
  assert.deepEqual(voicesOf([{ name: 'no id' }]), []);
});

test('voices are asked of /v1/audio/voices, with no authorization from this computer', async () => {
  reply = () => [200, { voices: [{ voice_id: 'a', name: 'Ana' }, { voice_id: 'b', name: 'Bia' }] }];
  const r = await voicestudio.run('voice', { limit: 1, gender: 'f' }, ctx());
  assert.equal(seen.at(-1).url.pathname, '/v1/audio/voices');
  assert.equal(seen.at(-1).headers.authorization, undefined);
  assert.deepEqual(r.receipt.voices.map((v) => v.voiceId), ['a']);
  assert.match(r.receipt.notes[0], /--gender does not narrow/);
});

test('voice-over: WAV from /v1/audio/speech, its length from the file, nothing billed', async () => {
  reply = () => [200, wav(new Uint8Array(48000), 24000)];
  const r = await voicestudio.run('tts', { out: 'line', text: 'Olá.', voice: 'v1' }, ctx());
  const call = seen.at(-1);
  assert.equal(call.url.pathname, '/v1/audio/speech');
  assert.deepEqual(JSON.parse(call.body), { model: 'tts-1', input: 'Olá.', voice: 'v1', response_format: 'wav' });
  assert.equal(r.files[0].path, 'assets/audio/vo/line.wav');
  assert.equal(r.index[0].dur, 1);
  assert.equal(r.cost, undefined, 'it runs on this computer: free');
  await assert.rejects(voicestudio.run('tts', { out: 'x', text: 'hi' }, ctx()), /--voice is required/);
});

test('transcription: word timestamps, as OpenAI\'s endpoint gives them', async () => {
  reply = () => [200, { text: 'Hi there', language: 'en', duration: 1.25, words: [{ word: 'Hi', start: 0, end: 0.2 }, { word: 'there', start: 0.25, end: 0.6 }] }];
  const mp3 = new Uint8Array(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(100)]));
  const r = await voicestudio.run('asr', { src: 'assets/audio/talk.mp3' }, ctx({ 'assets/audio/talk.mp3': mp3 }));
  const sent = await form(seen.at(-1));
  assert.equal(seen.at(-1).url.pathname, '/v1/audio/transcriptions');
  assert.equal(sent.get('response_format'), 'verbose_json');
  assert.deepEqual(sent.getAll('timestamp_granularities[]'), ['word']);
  assert.deepEqual(r.index[0].words, [{ token: 'Hi', start: 0, end: 0.2 }, { token: 'there', start: 0.25, end: 0.6 }]);
});

test('a key goes as a bearer to this computer, but never over plain http to another one', async () => {
  reply = () => [200, []];
  await voicestudio.run('voice', {}, ctx({}, 'secret-key-12345'));
  assert.equal(seen.at(-1).headers.authorization, 'Bearer secret-key-12345');
  const was = process.env.LOPESFILM_VOICESTUDIO_URL;
  process.env.LOPESFILM_VOICESTUDIO_URL = 'http://192.168.1.50:3900';
  try {
    const before = seen.length;
    await assert.rejects(voicestudio.run('voice', {}, ctx({}, 'secret-key-12345')), /only over https or to this computer/);
    assert.equal(seen.length, before, 'nothing was sent');
  } finally { process.env.LOPESFILM_VOICESTUDIO_URL = was; }
});

test('Voice Studio not running: the person is told to start it', async () => {
  const was = process.env.LOPESFILM_VOICESTUDIO_URL;
  process.env.LOPESFILM_VOICESTUDIO_URL = 'http://127.0.0.1:1';
  try { await assert.rejects(voicestudio.run('voice', {}, ctx()), /Start Voice Studio/); } finally { process.env.LOPESFILM_VOICESTUDIO_URL = was; }
});
