/**
 * Lopes.Film's AI router: when the agent a turn runs on has used up its limit (its plan's window, its credits), the turn
 * goes on with the next agent that is ready, with the conversation so far, instead of stopping the project. Reads no
 * React, so `node --test` can use it.
 *
 * What counts as "the limit is up" is narrow on purpose: a plan or balance used up, or a usage window that says when
 * it resets. A passing 429 (too many requests) or any other failure is not: it would move the project to another
 * agent for nothing, so it is still shown as an error.
 *
 * An agent that ran out is left alone until its window is over (`until`: the reset time its message names, else
 * `COOLDOWN_MS` from now), so the next messages go straight to the next agent instead of failing first on the empty one.
 */
import type { LocalAgentId, RosterAgent } from './desktop-bridge';

/** how long an agent that ran out is left alone when its message does not say when it resets */
export const COOLDOWN_MS = 30 * 60_000;
/** the longest an agent is left alone, whatever its message says (a mistaken reading must not bench it for days) */
export const MAX_COOLDOWN_MS = 8 * 60 * 60_000;

const LIMIT = new RegExp([
  /free usage limit reached/,
  /quota (?:exceeded|exhausted)/,
  /insufficient[_ ](?:quota|balance|credits)/,
  /(?:usage|spending|credit) limit (?:reached|exceeded)/,
  /(?:you['’]ve|you have|you've) (?:hit|reached|used) (?:your|the) .{0,40}limit/,
  /\b(?:5-hour|five-hour|weekly|daily|monthly) (?:usage )?limit\b/,
  /out of (?:extra )?usage/,
  /credit balance is too low/,
  /(?:额度|余额)(?:已)?(?:用尽|耗尽|不足)/,
].map((r) => r.source).join('|'), 'i');

/** Whether an error says the agent's own limit is used up (not a passing rate limit). */
export function isLimitError(error: unknown): boolean {
  /* the app's own agent says a service with no balance left the same way for every service (src/pi-config.mjs outOfBalance) */
  const code = (error as { code?: unknown; balance?: unknown } | null)?.code;
  if (code === 'balance' || (error as { balance?: unknown } | null)?.balance) return true;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String((error as { message?: unknown } | null)?.message ?? '');
  return !!message && LIMIT.test(message);
}

const CLOCK = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

/**
 * When the limit resets, from what the message says ("resets 3pm", "resets at 15:30"): the next such time of day on
 * `now`'s own clock, as ms since 1970; null when it names none. Kept within MAX_COOLDOWN_MS by the caller.
 */
export function resetTime(message: string, now: number): number | null {
  const m = CLOCK.exec(message);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** Agents that ran out, by id: the time they are left alone until (ms since 1970). */
const exhausted = new Map<string, number>();

/** Mark an agent as out of limit until its window is over. @returns the time it is left alone until */
export function markExhausted(agent: string, message = '', now = Date.now()): number {
  const named = resetTime(message, now);
  const until = Math.min(named ?? now + COOLDOWN_MS, now + MAX_COOLDOWN_MS);
  exhausted.set(agent, until);
  return until;
}

/** Whether an agent is still being left alone. */
export function isExhausted(agent: string, now = Date.now()): boolean {
  const until = exhausted.get(agent);
  if (until == null) return false;
  if (until <= now) { exhausted.delete(agent); return false; }
  return true;
}

/** Forget what ran out (the person signed in to another account, or asked to try it again). */
export function clearExhausted(agent?: string): void {
  if (agent) exhausted.delete(agent); else exhausted.clear();
}

export interface RouterSettings {
  /** on by default: a project that stops at a limit is what it is for */
  enabled: boolean;
  /** the agents to go on with, in order; the ones not listed follow, in the roster's own order */
  order: LocalAgentId[];
}

export const DEFAULT_ROUTER: RouterSettings = { enabled: true, order: [] };
const STORE_KEY = 'lopesfilm.router';

/** The person's settings (kept on this computer), a bad or missing record read as the defaults. */
export function readRouterSettings(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): RouterSettings {
  try {
    const raw = JSON.parse(storage?.getItem(STORE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_ROUTER };
    return {
      enabled: raw.enabled !== false,
      order: Array.isArray(raw.order) ? raw.order.filter((id: unknown): id is LocalAgentId => typeof id === 'string') : [],
    };
  } catch { return { ...DEFAULT_ROUTER }; }
}

export function writeRouterSettings(settings: RouterSettings, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  try { storage?.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* not kept: the defaults next time */ }
}

type Candidate = Pick<RosterAgent, 'id' | 'shown' | 'status'>;

/**
 * The agent to go on with, when `from` ran out (or is still left alone): the first in the person's order, then the
 * roster's, that is switched on, ready and not out of limit itself. null when there is none.
 */
export function pickFallback(from: LocalAgentId, roster: readonly Candidate[] | null, settings: RouterSettings = DEFAULT_ROUTER, now = Date.now()): LocalAgentId | null {
  if (!roster?.length) return null;
  const ids = roster.map((a) => a.id);
  const ranked = [...settings.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !settings.order.includes(id))];
  for (const id of ranked) {
    if (id === from) continue;
    const a = roster.find((x) => x.id === id);
    if (a?.shown && a.status === 'ready' && !isExhausted(id, now)) return id;
  }
  return null;
}

/** The key a model of an agent is left alone by (its agent's own id alone is the whole agent). */
export const modelKey = (agent: string, model: string) => `${agent}:${model}`;

/**
 * The model to go on with when `from` ran out, among the models set up for the same agent (the app's own key has one
 * per service): the next in their order that is not out itself, wrapping around. null when none is left.
 */
export function pickModelFallback(agent: LocalAgentId, from: string | null, models: readonly string[], now = Date.now()): string | null {
  const at = from ? models.indexOf(from) : -1;
  for (let i = 1; i <= models.length; i++) {
    const id = models[(at + i + models.length) % models.length]!;
    if (id !== from && !isExhausted(modelKey(agent, id), now)) return id;
  }
  return null;
}

/** When a limit that was hit is over, as `markExhausted` reads it (ms since 1970). */
export function limitUntil(message = '', now = Date.now()): number {
  return Math.min(resetTime(message, now) ?? now + COOLDOWN_MS, now + MAX_COOLDOWN_MS);
}

export interface RoutedRun<T> {
  result: T;
  /** the agent the turn ended on */
  agent: LocalAgentId;
  /** the model the turn ended on, when it was one of the agent's own models */
  model: string | null;
  /** each switch made on the way: from, to */
  switches: Array<{ from: LocalAgentId; to: LocalAgentId; model?: string }>;
}

/**
 * Runs a turn with `run(agent, switched, model)` on `agent`; when that one's limit is up, again on the next one
 * (`switched`: the agent it comes from, so the caller gives the new session what was said so far). When the agent has
 * more than one model set up (`models`, the app's own key), the next of them comes first: the same agent and session,
 * only the model changes (`model`; null: the one the person picked). Any other error goes up as it is. `roster` is
 * read again at each switch: an agent can sign out meanwhile.
 */
export async function runRouted<T>({ agent, model: first = null, models = () => [], roster, settings = DEFAULT_ROUTER, run, onSwitch, rotate, now = Date.now }: {
  agent: LocalAgentId;
  /** the model the person picked on the agent, if it has several */
  model?: string | null;
  models?: (agent: LocalAgentId) => readonly string[];
  roster: () => readonly Candidate[] | null;
  settings?: RouterSettings;
  run: (agent: LocalAgentId, switchedFrom: LocalAgentId | null, model: string | null) => Promise<T>;
  onSwitch?: (from: LocalAgentId, to: LocalAgentId, model?: string) => void;
  /** the agent's own accounts, shared: called when its limit is up with when it is over; true once the next account is the active one (the turn then goes on in it, as the same agent) */
  rotate?: (agent: LocalAgentId, until: number) => Promise<boolean>;
  now?: () => number;
}): Promise<RoutedRun<T>> {
  const switches: RoutedRun<T>['switches'] = [];
  let current = agent;
  let model: string | null = first;
  let from: LocalAgentId | null = null;
  const moveTo = (to: LocalAgentId, to_model: string | null) => {
    switches.push({ from: current, to, ...(to_model ? { model: to_model } : {}) });
    onSwitch?.(current, to, to_model ?? undefined);
    if (to !== current) from = current;
    current = to;
    model = to_model;
  };
  /* the next place to go on when `current` (on `model`) is used up: another model of the same agent, else the next agent */
  const next = (): boolean => {
    const own = models(current);
    if (own.length > 1) {
      const other = pickModelFallback(current, model ?? own[0]!, own, now());
      if (other) { moveTo(current, other); return true; }
      markExhausted(current, '', now());
    }
    const other = pickFallback(current, roster(), settings, now());
    if (!other) return false;
    moveTo(other, null);
    return true;
  };
  /* one left alone from an earlier turn: straight to the next one */
  if (settings.enabled) {
    const own = models(current);
    const key = model ?? own[0] ?? null;
    if (isExhausted(current, now()) || (own.length > 1 && key && isExhausted(modelKey(current, key), now()))) next();
  }
  for (;;) {
    try {
      return { result: await run(current, from, model), agent: current, model, switches };
    } catch (error) {
      if (!settings.enabled || !isLimitError(error)) throw error;
      const said = error instanceof Error ? error.message : String(error);
      /* another account of the same agent first: its limit is its own, not the agent's */
      if (rotate && (await rotate(current, limitUntil(said, now())).catch(() => false))) {
        switches.push({ from: current, to: current });
        onSwitch?.(current, current);
        from = current;
        continue;
      }
      const own = models(current);
      if (own.length > 1) markExhausted(modelKey(current, model ?? own[0]!), said, now());
      else markExhausted(current, said, now());
      if (!next()) throw error;
    }
  }
}

/**
 * The message for the model that takes a turn over when the one before ran out of limit part-way: the same task, the
 * same bar. What it was asked is kept word for word; the note only tells it where the work may stand.
 */
export function withTakeOver(text: string): string {
  return '<takeover>The model that began this task ran out of usage part-way and you are carrying on in its place. Do the task'
    + ' below exactly as the person wrote it, to the same standard: the same goal, tone, structure, length, language and'
    + ' format, and nothing less careful. It may already have changed some of the project\'s files: look at them first,'
    + ' keep what is right, finish or redo what is not, and do not start the project over or undo its good work.</takeover>\n\n'
    + text;
}
