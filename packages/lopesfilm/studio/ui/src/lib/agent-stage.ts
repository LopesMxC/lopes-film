/**
 * The agent's edit, shown the way hands would make it. The film on disk already has the whole change, but the timeline
 * draws the film as it was and lets each cursor put its own action in as it reaches the clip: a clip appears where it
 * is dropped, a cut divides its clip, a move slides, a trim pulls its edge, a removal takes the clip away, words
 * are typed, a setting is changed. What is still waiting is the "pending" list here; AgentCursor empties it step by step.
 */
import type { AgentAction } from './agent-cursor.ts';
import type { TimelineBlock, TimelineTrack } from './timeline-layout.ts';

/** One step still to play: the action, the clip as it was before (none for a new one), and where a removed clip was. */
export interface StageEntry { action: AgentAction; before: TimelineBlock | null; lane?: string; index?: number }
export interface StageState { pending: readonly StageEntry[] }

const EMPTY: StageState = { pending: [] };
let state: StageState = EMPTY;
const listeners = new Set<() => void>();
const emit = (next: StageState) => { state = next; for (const l of [...listeners]) l(); };

export const agentStage = {
  get: () => state,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  /** Entries join the list (a change that comes while another still plays joins after it, see flush). */
  push: (entries: readonly StageEntry[]) => { if (entries.length) emit({ pending: [...state.pending, ...entries] }); },
  /** That action has been played: the timeline now shows its result. */
  apply: (action: AgentAction) => { if (state.pending.some((e) => e.action === action)) emit({ pending: state.pending.filter((e) => e.action !== action) }); },
  /** Everything waiting is shown at once (a new change came, the cursors left, the page closed). */
  flush: () => { if (state.pending.length) emit(EMPTY); },
};

/** The settings an adjust or a type puts back to what they were. */
const BACK = ['words', 'title', 'gainDb', 'volume', 'speed', 'z', 'off', 'disabled', 'duck', 'silent', 'cast', 'box'] as const;

/** The tracks as they look while the pending steps have not been played: a new clip held back, a cut clip whole, a moved
    one where it was, a removed one still there. Same array when nothing is pending, same track when it is unaffected. */
export function stageTracks(tracks: readonly TimelineTrack[], pending: readonly StageEntry[]): readonly TimelineTrack[] {
  if (!pending.length) return tracks;
  const hold = new Set<string>();
  const back = new Map<string, Partial<TimelineBlock>>();
  const back_ = (id: string, patch: Partial<TimelineBlock>) => back.set(id, { ...back.get(id), ...patch });
  const put: StageEntry[] = [];
  /* a clip that changed track is still on the one it came from: out of its new row, into the old one */
  const lift = new Map<string, StageEntry>();
  for (const e of pending) {
    const { action: a, before } = e;
    if (a.kind === 'delete') { if (before) put.push(e); continue; }
    if (!before) { hold.add(a.id); continue; }
    if (a.kind === 'track') { lift.set(a.id, e); continue; }
    if (a.kind === 'cut') { if (a.pair) hold.add(a.pair); back_(a.id, { startMs: before.startMs, endMs: before.endMs }); }
    else if (a.kind === 'move' || a.kind === 'trim') back_(a.id, { startMs: before.startMs, endMs: before.endMs });
    else for (const k of BACK) back_(a.id, { [k]: before[k] } as Partial<TimelineBlock>);
  }
  /* where each lifted clip goes back to: its old row (else any row of its old track); none found, it stays put */
  const home = new Map<string, { to: TimelineTrack; block: TimelineBlock }>();
  for (const [id, e] of lift) {
    const block = tracks.flatMap((tr) => tr.blocks).find((b) => b.id === id);
    const to = tracks.find((tr) => tr.lane === e.lane && tr.index === e.index) ?? tracks.find((tr) => tr.lane === e.lane);
    if (block && to && e.before) home.set(id, { to, block: { ...block, startMs: e.before.startMs, endMs: e.before.endMs } });
  }
  return tracks.map((tr) => {
    const add = put.filter((e) => e.lane === tr.lane && e.index === tr.index);
    const back_in = [...home.values()].filter((h) => h.to === tr).map((h) => h.block);
    if (!add.length && !back_in.length && !home.size && !tr.blocks.some((b) => hold.has(b.id) || back.has(b.id))) return tr;
    const blocks = tr.blocks.filter((b) => !home.has(b.id) || home.get(b.id)!.to === tr)
      .map((b) => (home.get(b.id)?.to === tr ? home.get(b.id)!.block : hold.has(b.id) ? { ...b, agentHold: true } : back.has(b.id) ? { ...b, ...back.get(b.id)! } : b));
    for (const e of add) blocks.push(e.before!);
    for (const b of back_in) if (!blocks.some((x) => x.id === b.id)) blocks.push(b);
    return blocks.length === tr.blocks.length && blocks.every((b, k) => b === tr.blocks[k]) ? tr : { ...tr, blocks };
  });
}
