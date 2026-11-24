import { test } from 'node:test';
import assert from 'node:assert/strict';
import { count, costOf, dollars, priceOf, savedOf, short, spentIn, totals } from '../chat/src/lib/token-ledger.ts';

test('prices follow the model family, an unknown one is priced as Sonnet', () => {
  assert.equal(priceOf('claude-opus-4-1').input, 15);
  assert.equal(priceOf('claude-haiku-4-5').output, 5);
  assert.equal(priceOf('gpt-5-codex').input, 1.25);
  assert.equal(priceOf('something-new').input, 3);
  assert.equal(priceOf(null).input, 3);
});

test('cost and what the cache saved, in dollars', () => {
  const p = priceOf('claude-sonnet-4-5');
  const s = { input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0, output: 100_000 };
  assert.equal(costOf(s, p).toFixed(4), (3 + 0.3 + 1.5).toFixed(4));
  assert.equal(savedOf(s, p).toFixed(4), (3 - 0.3).toFixed(4));
});

test('a turn is counted from its log, the totals average per turn and skip empty ones', () => {
  assert.deepEqual(spentIn([]), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
  const a = count({ input: 1000, cacheRead: 9000, cacheWrite: 0, output: 500 }, 'claude-sonnet-4-5');
  const b = count({ input: 2000, cacheRead: 0, cacheWrite: 0, output: 1000 }, 'claude-sonnet-4-5');
  const empty = count({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, null);
  const sum = totals({ turns: { a, b, empty } });
  assert.equal(sum.turns, 2);
  assert.equal(sum.used, 13500);
  assert.equal(sum.saved, 9000);
  assert.equal(sum.avgUsd.toFixed(6), ((a.usd + b.usd) / 2).toFixed(6));
  assert.equal(totals({ turns: { a, b } }, new Set(['a'])).turns, 1);
});

test('short numbers and dollars', () => {
  assert.equal(short(950), '950');
  assert.equal(short(1234), '1.2k');
  assert.equal(short(3_400_000), '3.4M');
  assert.equal(dollars(0), '$0.00');
  assert.equal(dollars(0.004), '<$0.01');
  assert.equal(dollars(1.234), '$1.23');
});
