import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  COOLDOWN_MS, MAX_COOLDOWN_MS, clearExhausted, isExhausted, isLimitError, markExhausted, pickFallback, readRouterSettings, resetTime, runRouted,
} from '../chat/src/lib/ai-router.ts';

const roster = (...agents) => agents.map(([id, status = 'ready', shown = true]) => ({ id, shown, status }));
beforeEach(() => clearExhausted());

test('only a limit that is used up counts, not a passing rate limit or another failure', () => {
  assert.ok(isLimitError(new Error("You've hit your usage limit. It resets 3pm")));
  assert.ok(isLimitError(new Error('Claude usage limit reached')));
  assert.ok(isLimitError(new Error('insufficient_quota')));
  assert.ok(isLimitError('credit balance is too low'));
  assert.ok(isLimitError(new Error('5-hour limit reached')));
  assert.ok(!isLimitError(new Error('429 Too Many Requests: slow down')), 'a passing rate limit is not the plan used up');
  assert.ok(!isLimitError(new Error('ECONNRESET')));
  assert.ok(!isLimitError(new Error('')));
  assert.ok(!isLimitError(undefined));
});

test('when it resets is read from the message, kept within bounds', () => {
  const now = new Date(2026, 10, 13, 10, 0, 0).getTime();
  assert.equal(new Date(resetTime('resets 3pm', now)).getHours(), 15);
  assert.equal(new Date(resetTime('resets at 15:30', now)).getMinutes(), 30);
  /* a time already past today is tomorrow's */
  assert.ok(resetTime('resets 9am', now) > now + 20 * 3_600_000);
  assert.equal(resetTime('no time here', now), null);
  assert.equal(resetTime('resets 99:99', now), null);
  /* the longest an agent is left alone, whatever was read */
  assert.ok(markExhausted('claude', 'resets 9am', now) - now <= MAX_COOLDOWN_MS);
  assert.equal(markExhausted('codex', 'nothing', now), now + COOLDOWN_MS);
});

test('an agent that ran out is left alone until its window is over, then tried again', () => {
  const now = 1_000_000;
  markExhausted('claude', '', now);
  assert.ok(isExhausted('claude', now + 1));
  assert.ok(!isExhausted('claude', now + COOLDOWN_MS + 1));
  assert.ok(!isExhausted('claude', now + 1), 'forgotten once over');
});

test('the next agent is the first ready one in the person\'s order, then the roster\'s', () => {
  const r = roster(['claude'], ['codex'], ['opencode'], ['qwen', 'waiting'], ['cursor', 'ready', false]);
  assert.equal(pickFallback('claude', r), 'codex');
  assert.equal(pickFallback('claude', r, { enabled: true, order: ['opencode'] }), 'opencode');
  /* not signed in, not switched on, or itself out of limit: passed over */
  assert.equal(pickFallback('claude', roster(['claude'], ['qwen', 'waiting'], ['cursor', 'ready', false], ['codex'])), 'codex');
  markExhausted('codex');
  assert.equal(pickFallback('claude', r), 'opencode');
  assert.equal(pickFallback('claude', roster(['claude'])), null);
  assert.equal(pickFallback('claude', null), null);
});

test('a turn that hits the limit goes on with the next agent, told where it comes from', async () => {
  const calls = [];
  const seen = [];
  const out = await runRouted({
    agent: 'claude',
    roster: () => roster(['claude'], ['codex']),
    run: async (agent, from) => {
      calls.push([agent, from]);
      if (agent === 'claude') throw new Error("You've hit your limit");
      return 'done';
    },
    onSwitch: (from, to) => seen.push([from, to]),
  });
  assert.equal(out.result, 'done');
  assert.equal(out.agent, 'codex');
  assert.deepEqual(calls, [['claude', null], ['codex', 'claude']]);
  assert.deepEqual(seen, [['claude', 'codex']]);
  assert.ok(isExhausted('claude'));
});

test('the next turn goes straight to the next agent, without failing first on the empty one', async () => {
  markExhausted('claude');
  const calls = [];
  const out = await runRouted({ agent: 'claude', roster: () => roster(['claude'], ['codex']), run: async (a, from) => { calls.push([a, from]); return 'ok'; } });
  assert.deepEqual(calls, [['codex', 'claude']]);
  assert.equal(out.agent, 'codex');
});

test('any other error goes up as it is, and so does the limit when no agent is left', async () => {
  await assert.rejects(runRouted({ agent: 'claude', roster: () => roster(['claude'], ['codex']), run: async () => { throw new Error('ECONNRESET'); } }), /ECONNRESET/);
  assert.ok(!isExhausted('claude'), 'a plain failure benches nobody');
  await assert.rejects(runRouted({ agent: 'claude', roster: () => roster(['claude']), run: async () => { throw new Error('usage limit reached'); } }), /usage limit reached/);
});

test('every agent can run out in turn, each tried once', async () => {
  const tried = [];
  await assert.rejects(runRouted({
    agent: 'claude',
    roster: () => roster(['claude'], ['codex'], ['opencode']),
    run: async (a) => { tried.push(a); throw new Error('quota exceeded'); },
  }), /quota exceeded/);
  assert.deepEqual(tried, ['claude', 'codex', 'opencode']);
});

test('turned off, the limit is an error like any other', async () => {
  await assert.rejects(runRouted({ agent: 'claude', settings: { enabled: false, order: [] }, roster: () => roster(['claude'], ['codex']), run: async () => { throw new Error('usage limit reached'); } }), /usage limit reached/);
});

test('settings: on by default, a bad record read as the defaults', () => {
  const store = (value) => ({ getItem: () => value });
  assert.deepEqual(readRouterSettings(store(null)), { enabled: true, order: [] });
  assert.deepEqual(readRouterSettings(store('{bad')), { enabled: true, order: [] });
  assert.deepEqual(readRouterSettings(store('{"enabled":false,"order":["codex",5]}')), { enabled: false, order: ['codex'] });
});

test('a service with no balance left counts as a limit, however its message is worded', () => {
  assert.ok(isLimitError(Object.assign(new Error("OpenAI doesn't have enough balance for this."), { code: 'balance', balance: { provider: 'OpenAI', url: null } })));
});

test('a model that ran out goes on with the next one set up, in the same agent, with the same message', async () => {
  const calls = [];
  const run = async (agent, from, model) => {
    calls.push([agent, from, model]);
    if (model !== 'c') throw Object.assign(new Error('no balance'), { code: 'balance' });
    return 'done';
  };
  const out = await runRouted({ agent: 'byok', model: 'a', models: () => ['a', 'b', 'c'], roster: () => roster(['byok'], ['claude']), run });
  assert.equal(out.result, 'done');
  assert.deepEqual(calls, [['byok', null, 'a'], ['byok', null, 'b'], ['byok', null, 'c']]);
  assert.equal(out.model, 'c');
  /* next turn: the two that ran out are left alone */
  const again = [];
  await runRouted({ agent: 'byok', model: 'a', models: () => ['a', 'b', 'c'], roster: () => roster(['byok']), run: async (agent, from, model) => { again.push(model); return 1; } });
  assert.deepEqual(again, ['c']);
});

test('every model out: the next agent is asked, told where it comes from; none left: the error stands', async () => {
  const run = async (agent, from, model) => {
    if (agent === 'byok') throw Object.assign(new Error('x'), { code: 'balance' });
    return `${agent}<-${from}`;
  };
  const out = await runRouted({ agent: 'byok', model: 'a', models: (id) => (id === 'byok' ? ['a', 'b'] : []), roster: () => roster(['byok'], ['claude']), run });
  assert.equal(out.result, 'claude<-byok');
  clearExhausted();
  await assert.rejects(runRouted({ agent: 'byok', model: 'a', models: () => ['a', 'b'], roster: () => roster(['byok']), run }), /x/);
});
