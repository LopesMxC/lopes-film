/**
 * What an agent just did to the film, read from the clips the timeline drew before and after: the steps its cursor
 * plays (components/AgentCursor.tsx). A clip is told by its id in film.html (else the timeline's own); what changed in it
 * says the action: new (create), gone (delete), a new clip starting where another now ends (a cut), moved, longer or
 * shorter (trim), its words changed (type), or any other setting (adjust).
 */
import type { TimelineBlock } from './timeline-layout.ts';

export type AgentActionKind = 'create' | 'delete' | 'cut' | 'move' | 'trim' | 'track' | 'type' | 'duplicate' | 'rename' | 'volume' | 'speed' | 'layer' | 'toggle' | 'transform' | 'adjust';
export interface AgentAction {
  kind: AgentActionKind;
  /** the clip acted on (its timeline id) */
  id: string;
  /** where along the clip: 0 its start, 1 its end (a cut: the cut, the clip's end; a trim: the edge moved) */
  at: 0 | 0.5 | 1;
  /** the clip's kind, for the media being made or dragged */
  media: TimelineBlock['kind'];
  /** A cut: the clip that is made of its second half. */
  pair?: string;
  /** The file of the clip made or copied, for the cursor to find it in the library. */
  src?: string;
  /** A cut: the film millisecond it is made at, so the cursor can go to it on the clip as it was. */
  ms?: number;
}

/** The most steps one change of the film plays: more would make the cursor lag behind the agent. */
export const MOST_STEPS = 12;

/** How many cursors work a change of this many actions: one for a small edit, up to eight for a big one. */
export const lanesFor = (n: number): 1 | 2 | 3 | 4 | 6 | 8 => (n >= 8 ? 8 : n >= 6 ? 6 : n >= 4 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1);

export const blockKey = (b: TimelineBlock) => b.clipId ?? b.cue?.id ?? b.id;
const keyOf = blockKey;
const near = (a: number, b: number) => Math.abs(a - b) < 2;
/** the settings an adjust is about: anything of the clip's that is not where it is or what it says */
const SETTINGS = ['gainDb', 'volume', 'speed', 'z', 'off', 'disabled', 'duck', 'silent', 'cast'] as const;
/** which kind of adjust it is, by the first setting that changed: the cursor works each its own way */
function adjustKind(a: TimelineBlock, b: TimelineBlock): AgentActionKind {
  const changed = (ks: readonly (typeof SETTINGS[number])[]) => ks.some((k) => a[k] !== b[k]);
  if (changed(['gainDb', 'volume', 'duck', 'silent'])) return 'volume';
  if (changed(['speed'])) return 'speed';
  if (changed(['z'])) return 'layer';
  if (changed(['off', 'disabled'])) return 'toggle';
  if (JSON.stringify(a.box) !== JSON.stringify(b.box)) return 'transform';
  return 'adjust';
}

export function agentActions(before: readonly TimelineBlock[], after: readonly TimelineBlock[]): AgentAction[] {
  const was = new Map(before.map((b) => [keyOf(b), b]));
  const now = new Map(after.map((b) => [keyOf(b), b]));
  /** @type {AgentAction[]} */
  const out: AgentAction[] = [];
  const cutFrom = new Set<string>();
  /* a new clip that starts where one of the same source now ends (and was longer) is the second half of a cut */
  const secondHalf = new Set<string>();
  for (const [key, b] of now) {
    if (was.has(key) || b.src === undefined) continue;
    const first = [...now.values()].find((o) => keyOf(o) !== key && was.has(keyOf(o)) && o.src === b.src && near(o.endMs, b.startMs) && was.get(keyOf(o))!.endMs > o.endMs + 1);
    if (first) { secondHalf.add(key); if (!cutFrom.has(keyOf(first))) { cutFrom.add(keyOf(first)); out.push({ kind: 'cut', id: first.id, at: 1, media: first.kind, pair: b.id, ms: first.endMs }); } }
  }
  for (const [key, b] of now) {
    let old = was.get(key);
    /* the same clip known before by another key (its block drawn before its film was read, or renamed): the one of the
       same file at the same place that is gone under its old key. Not new, so no cursor brings it in */
    if (!old && b.src !== undefined) old = [...was.entries()].find(([k, o]) => !now.has(k) && o.src === b.src && near(o.startMs, b.startMs) && near(o.endMs, b.endMs))?.[1];
    if (!old) {
      if (secondHalf.has(key)) continue;
      /* a new clip that is another's twin (same file, same length) while that one stays: a copy, dragged out with Alt */
      const twin = b.src !== undefined && [...was.values()].some((o) => o.src === b.src && near(o.endMs - o.startMs, b.endMs - b.startMs) && now.has(keyOf(o)));
      out.push({ kind: b.words !== undefined || b.kind === 'caption' ? 'type' : twin ? 'duplicate' : 'create', id: b.id, at: 0.5, media: b.kind, src: b.src });
      continue;
    }
    if (cutFrom.has(key)) continue;
    const dur = b.endMs - b.startMs, oldDur = old.endMs - old.startMs;
    /* the clip is now on another film.html track: lifted out of its row and put down on the other */
    if (b.row !== undefined && old.row !== undefined && b.row !== old.row) { out.push({ kind: 'track', id: b.id, at: 0.5, media: b.kind }); continue; }
    if (!near(b.startMs, old.startMs) && near(dur, oldDur)) out.push({ kind: 'move', id: b.id, at: 0.5, media: b.kind });
    else if (!near(b.startMs, old.startMs) || !near(b.endMs, old.endMs)) out.push({ kind: 'trim', id: b.id, at: near(b.startMs, old.startMs) ? 1 : 0, media: b.kind });
    else if ((b.words ?? '') !== (old.words ?? '')) out.push({ kind: 'type', id: b.id, at: 0.5, media: b.kind });
    else if (b.title !== old.title) out.push({ kind: 'rename', id: b.id, at: 0.5, media: b.kind });
    else if (SETTINGS.some((s) => b[s] !== old[s]) || JSON.stringify(b.box) !== JSON.stringify(old.box)) out.push({ kind: adjustKind(old, b), id: b.id, at: 0.5, media: b.kind });
  }
  for (const [key, b] of was) if (!now.has(key)) out.push({ kind: 'delete', id: b.id, at: 0.5, media: b.kind });
  return out.slice(0, MOST_STEPS);
}
