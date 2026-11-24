/**
 * The AI usage ledger: one line per AI call that was made, kept in ~/.lopesfilm/usage.jsonl.
 * It records what was called (verb, service, model, where it ran) and, where the service has a price range
 * (ai-advice.mjs), the estimate for it. It never invents a price: a call without a range counts only as a call.
 *
 *   GET /api/ai-usage → { days: 30, calls, minUsd, maxUsd, byService: [...], byDay: [...], today: {...} }
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { studioHome } from './projects.mjs';
import { SERVICES, estimate } from './ai-advice.mjs';

export const usageFile = () => join(studioHome(), 'usage.jsonl');

/** the verb of /api/get → the service of ai-advice, when the verb has a price range */
const VERB_SERVICE = { voice: 'narrator', tts: 'narrator', music: 'music', image: 'image', video: 'video', 'face-swap': 'faceswap', faceswap: 'faceswap', upscale: 'upscale' };
/** providers that run on this computer: no cost per use */
const LOCAL = /^(local|localimage|localvideo|acestep|piper|whisper)/i;

/** @param {{ verb: string, via?: string, model?: string, units?: number }} call */
export async function recordUsage(call) {
  const service = /** @type {Record<string, string>} */ (VERB_SERVICE)[call.verb];
  if (!service && !call.via) return;
  /* where it ran is known only when the call named the service; else the person's choice in Settings decided, and the ledger says nothing about its price */
  const local = call.via ? LOCAL.test(call.via) : null;
  let range = null;
  if (service && local === false) { try { const e = estimate(service, call.units ?? 1); range = { minUsd: e.minUsd, maxUsd: e.maxUsd }; } catch { /* no range */ } }
  const line = { ts: Date.now(), verb: call.verb, service: service ?? null, via: call.via ?? null, model: call.model ?? null, local, ...(range ?? {}) };
  try { await mkdir(dirname(usageFile()), { recursive: true }); await appendFile(usageFile(), `${JSON.stringify(line)}\n`); } catch { /* the ledger is best effort */ }
}

/** @param {number} [days] @param {number} [now] */
export async function readUsage(days = 30, now = Date.now()) {
  const from = now - days * 864e5;
  const text = await readFile(usageFile(), 'utf8').catch(() => '');
  const rows = text.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).filter((r) => r && r.ts >= from);
  const round = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
  const sum = (/** @type {any[]} */ list) => ({
    calls: list.length, apiCalls: list.filter((r) => r.local === false).length,
    minUsd: round(list.reduce((a, r) => a + (r.minUsd ?? 0), 0)), maxUsd: round(list.reduce((a, r) => a + (r.maxUsd ?? 0), 0)),
  });
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const byService = [...new Set(rows.map((r) => r.service ?? r.verb))].map((id) => {
    const list = rows.filter((r) => (r.service ?? r.verb) === id);
    return { id, label: SERVICES.find((s) => s.id === id)?.label ?? id, ...sum(list), local: list.filter((r) => r.local === true).length };
  }).sort((a, b) => b.maxUsd - a.maxUsd || b.calls - a.calls);
  return { days, ...sum(rows), byService, today: sum(rows.filter((r) => r.ts >= start.getTime())), approx: true };
}
