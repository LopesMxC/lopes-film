/**
 * The agent's edits made for real (`lopesfilm edit`): each operation the agent sends is walked to by a cursor on the
 * timeline, and only when the cursor has arrived does the editor make the edit (the function a mouse uses). While it runs,
 * the cursor's replay of changes (lib/agent-cursor) stands aside, so nothing is shown twice.
 */
import type { AgentActionKind } from './agent-cursor.ts';

/** Where a cursor must go for one operation: the clip, and what it does there. */
export interface RunStep {
  kind: AgentActionKind;
  /** the clip of film.html it goes to (none: nothing on the timeline to point at) */
  clip?: string;
  /** a clip brought in: its file, for the cursor to take it from the library */
  src?: string;
  /** film seconds the clip lands at, or the cut is made at */
  at?: number;
  /** the track (index) it lands on */
  track?: number;
  /** a setting changed: which (the cursor opens the inspector's section for it) */
  prop?: string;
}

type Loose = Record<string, unknown>;
const PROP_KIND: Record<string, AgentActionKind> = {
  volume: 'volume', speed: 'speed', layer: 'layer', zIndex: 'layer', muted: 'toggle', hidden: 'toggle', locked: 'toggle',
  box: 'transform', rotate: 'transform', scale: 'transform', opacity: 'adjust', motion: 'transform',
  at: 'move', track: 'track', start: 'trim', end: 'trim', title: 'rename', text: 'type', words: 'type', fade: 'adjust',
};

/** What a cursor does for an operation, or null when there is nothing to point at (a stage size, a track order). */
export function stepFor(op: Loose): RunStep | null {
  const clip = typeof op.clip === 'string' ? op.clip : undefined;
  switch (op.op) {
    case 'remove': return clip ? { kind: 'delete', clip } : null;
    case 'move': return clip ? { kind: typeof op.track === 'number' || typeof op.newTrack === 'number' ? 'track' : 'move', clip, at: Number(op.at), ...(typeof op.track === 'number' ? { track: op.track } : {}) } : null;
    case 'cut': case 'split': return clip ? { kind: 'cut', clip, at: Number(op.at) } : null;
    case 'insert': {
      const c = op.clip as Loose | undefined;
      const track = typeof op.track === 'number' ? op.track : typeof op.track === 'object' && op.track ? Number((op.track as Loose).insert) : undefined;
      return { kind: typeof op.from === 'string' ? 'duplicate' : 'create', ...(typeof op.from === 'string' ? { clip: op.from } : {}), ...(typeof c?.src === 'string' ? { src: c.src } : {}), ...(typeof op.at === 'number' ? { at: op.at } : {}), ...(track !== undefined && Number.isFinite(track) ? { track } : {}) };
    }
    case 'props': {
      const first = (op.edits as Loose[] | undefined)?.[0];
      if (!first || typeof first.clip !== 'string') return null;
      return { kind: PROP_KIND[String(first.prop)] ?? 'adjust', clip: first.clip, prop: String(first.prop) };
    }
    case 'set': case 'fields': return clip ? { kind: 'adjust', clip } : null;
    default: return null;
  }
}

interface Handler { aim: (step: RunStep) => Promise<void>; leave: () => void }
let handler: Handler | null = null;
let busy = 0;

export const agentRun = {
  /** the cursor layer says it can take steps (AgentCursor mounts); the returned function says it can not any more */
  register: (h: Handler) => { handler = h; return () => { if (handler === h) handler = null; }; },
  /** the cursor goes to the step and resolves once it has arrived (at once when no cursor is up) */
  aim: (step: RunStep): Promise<void> => (handler ? handler.aim(step) : Promise.resolve()),
  /** the job is over: the cursor leaves */
  leave: () => handler?.leave(),
  begin: () => { busy += 1; },
  /** a moment after the last edit lands, so the timeline's redraw is not taken for a change by someone else */
  end: () => { window.setTimeout(() => { busy = Math.max(0, busy - 1); }, 250); },
  busy: () => busy > 0,
};
