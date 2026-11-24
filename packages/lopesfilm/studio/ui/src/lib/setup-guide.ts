/**
 * The first-run guide's logic, with no React: whether it has been done, which skills fit which agent, and the order of
 * its steps. Kept in localStorage `lopesfilm.setup`, so it shows on the first run, after every update (the key carries the version) and again when asked (`openSetupGuide`).
 */
import type { HostAgentId } from './host';

export const SETUP_KEY = 'lopesfilm.setup';
export const SETUP_EVENT = 'lopesfilm:setup';

export const STEPS = ['welcome', 'agent', 'models', 'browser', 'skills', 'packs', 'look', 'tour'] as const;
export type SetupStep = (typeof STEPS)[number];

/** The skills the guide offers, by uid, in the order shown. */
export const GUIDE_SKILLS = ['lopesfilm/economy', 'lopesfilm/cutting', 'lopesfilm/design', 'lopesfilm/edit', 'lopesfilm/media', 'lopesfilm/canvas'] as const;

/** Agents that work in a small context window or a thin skills reader: they get the lean set, to keep their tokens for the work. */
const LEAN = new Set<HostAgentId>(['qwen', 'kimi', 'minimax', 'codebuddy', 'deepseek', 'opencode', 'antigravity', 'byok']);

/** The skills that fit an agent: all six for the capable ones, the lean four for the small-context ones. */
export function recommendedSkills(agent: HostAgentId | null): string[] {
  if (agent === 'lopesfilm') return ['lopesfilm/edit', 'lopesfilm/media', 'lopesfilm/canvas', 'lopesfilm/cutting'];
  if (agent && LEAN.has(agent)) return ['lopesfilm/economy', 'lopesfilm/cutting', 'lopesfilm/edit', 'lopesfilm/media'];
  return [...GUIDE_SKILLS];
}

/** The guide is done for a version: it comes back after every update (a new version is a new key), not only on the first run. */
export function setupDone(storage: Pick<Storage, 'getItem'> = localStorage, version?: string): boolean {
  try { return storage.getItem(SETUP_KEY) === (version ? `done:${version}` : 'done'); } catch { return true; }
}

export function markSetupDone(storage: Pick<Storage, 'setItem'> = localStorage, version?: string): void {
  try { storage.setItem(SETUP_KEY, version ? `done:${version}` : 'done'); } catch { /* nothing to keep it in */ }
}

/** Show the guide again (Settings → General). */
export function openSetupGuide(): void {
  try { localStorage.removeItem(SETUP_KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(SETUP_EVENT));
}
