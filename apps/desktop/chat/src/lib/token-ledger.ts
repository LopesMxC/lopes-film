/**
 * The token meter under the composer: what the agent used in this project (tokens in, of them read from the cache, and
 * out), what the cache saved (cached tokens are billed at a fraction of fresh ones), and what it comes to in dollars,
 * with the average per turn. Every turn is counted once, from its log, when it ends; the sums are kept on this computer.
 *
 * The dollars are an ESTIMATE from list prices per model family (PRICES) — a subscription account (Claude Code, Codex
 * signed in) is not billed per token, so for it the figure is "what this would cost on the API". Never a bill.
 */
import { modelCalls, type RawCall } from './model-calls.ts';

/** US$ per million tokens: fresh input, input read from the cache, cache write, output. */
export interface Price { input: number; cacheRead: number; cacheWrite: number; output: number }

/** List prices by model family, matched on the model's name; the first match wins, `other` otherwise. */
const PRICES: Array<[RegExp, Price]> = [
  [/opus/i, { input: 15, cacheRead: 1.5, cacheWrite: 18.75, output: 75 }],
  [/haiku/i, { input: 1, cacheRead: 0.1, cacheWrite: 1.25, output: 5 }],
  [/sonnet|claude/i, { input: 3, cacheRead: 0.3, cacheWrite: 3.75, output: 15 }],
  [/gpt-?5.*mini|mini/i, { input: 0.25, cacheRead: 0.025, cacheWrite: 0.25, output: 2 }],
  [/gpt|codex|o[134]\b/i, { input: 1.25, cacheRead: 0.125, cacheWrite: 1.25, output: 10 }],
  [/gemini.*flash/i, { input: 0.3, cacheRead: 0.075, cacheWrite: 0.3, output: 2.5 }],
  [/gemini/i, { input: 1.25, cacheRead: 0.31, cacheWrite: 1.25, output: 10 }],
  [/deepseek/i, { input: 0.28, cacheRead: 0.028, cacheWrite: 0.28, output: 0.42 }],
  [/kimi|moonshot/i, { input: 0.6, cacheRead: 0.15, cacheWrite: 0.6, output: 2.5 }],
];
const OTHER: Price = { input: 3, cacheRead: 0.3, cacheWrite: 3.75, output: 15 };

export const priceOf = (model: string | null | undefined): Price => PRICES.find(([re]) => re.test(model ?? ''))?.[1] ?? OTHER;

/** One turn's tokens: fresh input, read from the cache, written to it, output (reasoning is part of it). */
export interface Spent { input: number; cacheRead: number; cacheWrite: number; output: number }
export const NONE: Spent = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

export const costOf = (s: Spent, p: Price): number =>
  (s.input * p.input + s.cacheRead * p.cacheRead + s.cacheWrite * p.cacheWrite + s.output * p.output) / 1e6;

/** What the cache saved: those tokens read from it, as they would have cost fresh, less what they cost. */
export const savedOf = (s: Spent, p: Price): number => (s.cacheRead * (p.input - p.cacheRead)) / 1e6;

/** The tokens of a turn's log (its calls); zeros when the log has none. */
export function spentIn(calls: RawCall[] | null | undefined): Spent {
  const total = { ...NONE };
  for (const call of modelCalls(calls ?? [])) {
    const u = (call.answer?.usage ?? {}) as Record<string, unknown>;
    total.input += Number(u.input) || 0;
    total.cacheRead += Number(u.cacheRead) || 0;
    total.cacheWrite += Number(u.cacheWrite) || 0;
    total.output += Number(u.output) || 0;
  }
  return total;
}

/** A counted turn: its tokens and what they came to. */
export interface Counted extends Spent { usd: number; savedUsd: number }
export interface Ledger { turns: Record<string, Counted> }

export function count(spent: Spent, model: string | null | undefined): Counted {
  const price = priceOf(model);
  return { ...spent, usd: costOf(spent, price), savedUsd: savedOf(spent, price) };
}

export interface Totals { turns: number; used: number; input: number; cached: number; output: number; saved: number; usd: number; savedUsd: number; avgUsd: number }

/** The sums over the turns counted (`only`: just those ids). Used = every token in or out; saved = read from the cache. */
export function totals(ledger: Ledger, only?: ReadonlySet<string>): Totals {
  let n = 0, input = 0, cached = 0, output = 0, usd = 0, savedUsd = 0;
  for (const [id, c] of Object.entries(ledger.turns)) {
    if (only && !only.has(id)) continue;
    const used = c.input + c.cacheRead + c.cacheWrite + c.output;
    if (!used) continue;
    n += 1; input += c.input + c.cacheWrite; cached += c.cacheRead; output += c.output; usd += c.usd; savedUsd += c.savedUsd;
  }
  return { turns: n, used: input + cached + output, input, cached, output, saved: cached, usd, savedUsd, avgUsd: n ? usd / n : 0 };
}

const KEY = (project: string) => `lopesfilm.tokens:${project}`;
export function loadLedger(project: string): Ledger {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(project)) ?? 'null');
    if (raw && typeof raw === 'object' && raw.turns && typeof raw.turns === 'object') return raw as Ledger;
  } catch { /* none kept */ }
  return { turns: {} };
}
export function saveLedger(project: string, ledger: Ledger): void {
  try { localStorage.setItem(KEY(project), JSON.stringify(ledger)); } catch { /* not kept */ }
}

/** 1 234 → "1,2k", 3 400 000 → "3,4M" */
export const short = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.round(n));

export const dollars = (n: number): string => (n === 0 ? '$0.00' : n < 0.01 ? '<$0.01' : `$${n.toFixed(n < 10 ? 2 : 1)}`);
