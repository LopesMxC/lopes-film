/**
 * The agent's cursor: while an agent edits the film, a pointer glides over the timeline to each clip it changes and
 * clicks, cuts, types, adjusts or drags it, so the work can be followed live. It only reads the timeline (what changed
 * comes from lib/agent-cursor.ts) and draws above it without taking any pointer event. A big edit (many clips changed
 * at once: effects, captions, cuts) is shared among up to six cursors working side by side. While the agent is only
 * thinking, four of them keep busy over the timeline, each doing its own thing: dragging a dashed selection over a few
 * clips, linking one clip to another, sweeping a highlighter along a clip or dropping crosshair guides.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n';
import { agentActions, blockKey, lanesFor, type AgentAction } from '@/lib/agent-cursor';
import { agentStage, type StageEntry } from '@/lib/agent-stage';
import { agentRun, type RunStep } from '@/lib/agent-run';
import { useAgentWorking } from '@/lib/agent-working';
import { assetToolOf } from './ResourceInspector';
import { uiZoom, useUiPrefs } from '@/lib/ui-prefs';
import type { TimelineBlock, TimelineTrack } from '@/lib/timeline-layout';

const STEP_MS = 560;
/** how quickly a cursor settles on what it points at (seconds, smooth-damp): slow enough to be followed with the eye, never jerks */
const FLY_S = 0.085;
/** and how lazily it drifts over the film while the agent is only thinking or running commands */
const DRIFT_S = 0.2;
/** how long it stays on one clip before looking at the next, while it has nothing to change (ms) */
const LOOK_MS = [260, 620] as const;

/** Critically damped spring toward a goal (the "smooth damp" of animation engines): continuous in position and speed, so
    a new goal at any moment bends the path instead of breaking it. */
function damp(from: number, goal: number, speed: number, smooth: number, dt: number): [number, number] {
  const w = 2 / smooth, x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const d = from - goal;
  const tmp = (speed + w * d) * dt;
  return [goal + (d + tmp) * e, (speed - w * tmp) * e];
}
type Mode = 'look' | 'select' | 'link' | 'highlight' | 'measure';
/** what each cursor does while it has nothing to change; a lane starts at its own place in the list so they never match */
const MODES: Mode[] = ['select', 'link', 'highlight', 'measure', 'select', 'link', 'highlight', 'measure', 'look'];
interface Sim {
  panel: Panel; x: number; y: number; vx: number; vy: number; gx: number; gy: number; smooth: number; look: number; seeded: boolean; step: number;
  mode: Mode; phase: 0 | 1; phaseEnd: number; ax: number; ay: number; tx: number; ty: number; trail: Array<[number, number]>;
}
const newSim = (): Sim => ({ panel: 'timeline', x: 0, y: 0, vx: 0, vy: 0, gx: 0, gy: 0, smooth: DRIFT_S, look: 0, seeded: false, step: 0, mode: 'look', phase: 0, phaseEnd: 0, ax: 0, ay: 0, tx: 0, ty: 0, trail: [] });
const IDLE_MS = 2200;
/** the cursors used to roam the timeline while the agent only thought; now they stay away until there is a change to make */
const ROAM = false;
const DRAGGING = new Set(['create', 'move', 'duplicate']);
/** what a cursor draws at its clip besides the ring, by the kind of work: a slider it drags, a frame it pulls, a switch it flips */
const SLIDERS = new Set(['volume', 'speed', 'layer']);
/** the most cursors at once, and how many actions in one change it takes to bring each one in */
const LANES = 8;
/** the cursors that stay up while the agent works (the others come in with a big change): a small crew, each taking its turn at the panels */
const CREW = 3;
/** the panels the cursors visit, each with what they point at in it (its controls, its cards) and the panel as a whole */
const PANELS = ['viewer', 'inspector', 'library', 'timeline', 'chat'] as const;
type Panel = (typeof PANELS)[number];
const PANEL_AT: Record<Panel, { items: string; whole: string }> = {
  viewer: { items: '', whole: '[data-viewer-picture]' },
  inspector: { items: '[data-inspector-panel] input:not([type=hidden]), [data-inspector-panel] button, [data-inspector-panel] [role=slider], [data-inspector-panel] select', whole: '[data-inspector-panel]' },
  library: { items: '[data-library-card], [data-library-audio], [data-library-voice], [data-media-key]', whole: '[data-workspace-library]:not([hidden])' },
  timeline: { items: '[data-block-id]', whole: '[data-timeline]' },
  chat: { items: '#of-chat button, #of-chat textarea', whole: '#of-chat' },
};
/** what a cursor points at in a panel: its controls that are on screen, or else the panel cut in a grid of places */
function panelRects(panel: Panel): DOMRect[] {
  const at = PANEL_AT[panel];
  const seen = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 6 && r.height > 6 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth; };
  const items = at.items ? [...document.querySelectorAll(at.items)].filter(seen).map((el) => el.getBoundingClientRect()) : [];
  if (items.length >= 2) return items;
  const whole = document.querySelector(at.whole);
  if (!whole || !seen(whole)) return items;
  const w = whole.getBoundingClientRect();
  const cells: DOMRect[] = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) cells.push(new DOMRect(w.left + (w.width * (col + 0.12)) / 3, w.top + (w.height * (row + 0.12)) / 3, (w.width * 0.76) / 3, (w.height * 0.76) / 3));
  return cells;
}
const LANE_COLOR = ['var(--accent)', '#5cc8ff', '#ffa45c', '#7be0a4', '#f58bd0', '#ffd34d', '#a78bfa', '#2dd4bf'];
const MODE_LABEL: Record<Mode, string> = { look: 'working', select: 'select', link: 'link', highlight: 'highlight', measure: 'measure' };
interface Lane { queue: AgentAction[]; playing: boolean; timer: number | null }

type Rect = { left: number; top: number; width: number; height: number };
/** what each cursor is called on the screen, as an editor's crew would be: cut-01, grade-02… */
const ROLE = ['cut', 'grade', 'broll', 'audio', 'title', 'fx', 'mix', 'sync'];

/** `pick`: it is at the library's item (no clip is carried yet); `carry`: the name of what it drags to the timeline */
interface Pose { x: number; y: number; rect: Rect | null; action: AgentAction; tick: number; pick?: boolean; carry?: string; standby?: boolean; field?: string;
  /** what it points at, found again every frame: the box and the cursor stay on it while it moves (a list scrolls, a
      panel opens, the clip is drawn) instead of where it was when the cursor set off. `f`: where across it the cursor is. */
  follow?: () => Element | null; f?: number }

/** What the agent brings in is taken from the library's panel: the item for this clip (its own file if it is in the project's
    media, else one of its kind), where it is drawn and what it is called. */
function libraryItemFor(action: AgentAction): { rect: Rect; label: string; el: HTMLElement } | null {
  const q = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8; });
  let pool: HTMLElement[] = [];
  if (action.src) pool = q(`[data-media-key="${CSS.escape(action.src)}"]`);
  if (!pool.length) pool = q(action.media === 'sfx' || action.media === 'music' ? '[data-library-audio]' : action.media === 'voice' ? '[data-library-voice]' : action.media === 'caption' ? '[data-library-card]' : '[data-library-card], [data-media-key]');
  if (!pool.length) pool = q('[data-library-card], [data-library-audio], [data-media-key]');
  const el = pool[Math.abs([...action.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % Math.max(1, pool.length)];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return { rect: { left: r.left, top: r.top, width: r.width, height: r.height }, label: label || '…', el };
}
/** The library's panel is opened and closed by the project's view (it listens for this). */
const askLibrary = (open: boolean) => window.dispatchEvent(new CustomEvent('lopesfilm:agent-library', { detail: { open } }));
const BRINGS = new Set(['create', 'duplicate']);

/** Where in the inspector a setting is changed: the section a hand opens for it (by the property, else by the kind of change). */
const SECTION_OF_PROP: Record<string, string> = {
  volume: 'sound', muted: 'sound', gainDb: 'sound', duck: 'sound', speed: 'timing', box: 'position', rotate: 'position', scale: 'position',
  layer: 'position', zIndex: 'position', opacity: 'appearance', fade: 'fades', fadeIn: 'fades', fadeOut: 'fades', motion: 'motion',
  filter: 'filter', adjust: 'adjust', mask: 'mask', transition: 'transition',
};
const SECTION_OF_KIND: Partial<Record<string, string>> = { volume: 'sound', speed: 'timing', layer: 'position', transform: 'position', adjust: 'appearance' };
const sectionFor = (kind: string, prop?: string) => (prop && SECTION_OF_PROP[prop]) || SECTION_OF_KIND[kind] || null;
/** The clip is selected and the inspector opened at the section (ProjectView listens), then the control a hand would use there is
    found: the section's first field, slider or switch on screen. */
const askInspect = (key: string, section: string) => window.dispatchEvent(new CustomEvent('lopesfilm:agent-inspect', { detail: { key, section } }));
function controlIn(section: string): Rect | null {
  const box = [...document.querySelectorAll<HTMLElement>(`[data-film-inspector] [data-section="${CSS.escape(section)}"]`)].find((el) => !el.closest('[hidden]'));
  if (!box) return null;
  const seen = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 6 && r.height > 6 && r.top >= 0 && r.bottom <= window.innerHeight; };
  const el = [...box.querySelectorAll('input:not([type=hidden]), [role=slider], select, textarea, [role=switch], button[aria-pressed]')].find(seen)
    ?? [...box.querySelectorAll('button')].find(seen) ?? (seen(box) ? box : null);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
/** Where the cursors wait while the agent thinks: the middle of the picture (else of the window), side by side. */
function standbyAt(i: number): { x: number; y: number } {
  const pic = document.querySelector('[data-viewer-picture]')?.getBoundingClientRect();
  const cx = pic && pic.width > 40 ? pic.left + pic.width / 2 : window.innerWidth / 2;
  const cy = pic && pic.height > 40 ? pic.top + pic.height / 2 : window.innerHeight / 2;
  return { x: cx + (i - 1) * 130 - 30, y: cy + (i === 1 ? -26 : 14) };
}
const STANDBY: AgentAction = { kind: 'adjust', id: '', at: 0.5, media: 'video' };

const blocksOf = (tracks: readonly TimelineTrack[]): TimelineBlock[] => tracks.flatMap((track) => track.blocks.map((b) => ({ ...b, row: track.lane })));
const blockEl = (id: string) => () => document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
/** the control a hand would use in the inspector's section (controlIn), as an element, to follow */
const controlEl = (section: string) => () => {
  const box = [...document.querySelectorAll<HTMLElement>(`[data-film-inspector] [data-section="${CSS.escape(section)}"]`)].find((el) => !el.closest('[hidden]'));
  return box?.querySelector('input:not([type=hidden]), [role=slider], select, textarea, [role=switch], button[aria-pressed], button') ?? box ?? null;
};
const rectOf = (id: string): Rect | null => {
  const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** Where on the timeline film second `atMs` is, measured off a clip drawn there: a small box at it, in the middle of the
    timeline's height when the row is not known. Null when no clip is drawn to measure by. */
function dropAt(blocks: readonly TimelineBlock[], atMs: number): Rect | null {
  for (const b of blocks) {
    const r = rectOf(b.id);
    if (!r || !(b.endMs > b.startMs) || r.width < 8) continue;
    const pxPerMs = r.width / (b.endMs - b.startMs);
    const x = r.left + (atMs - b.startMs) * pxPerMs;
    const tl = document.querySelector('[data-timeline]')?.getBoundingClientRect();
    const y = tl && tl.height > 40 ? tl.top + tl.height / 2 : r.top + r.height / 2;
    return { left: x, top: y - 14, width: Math.max(28, Math.min(120, pxPerMs * 2000)), height: 28 };
  }
  return null;
}

export function AgentCursor({ tracks }: { tracks: readonly TimelineTrack[] }) {
  const [ui] = useUiPrefs();
  /* turned off in Settings: the agent's edits show at once, with no cursor */
  React.useEffect(() => { if (!ui.agentCursors) agentStage.flush(); }, [ui.agentCursors]);
  if (!ui.agentCursors) return null;
  return <AgentCursorOn tracks={tracks} still={ui.cursorIdle === 'still'} />;
}

function AgentCursorOn({ tracks, still }: { tracks: readonly TimelineTrack[]; still: boolean }) {
  /* the page's CSS zoom (a browser; the desktop app zooms the window instead), read again when the size changes */
  const [{ scale }] = useUiPrefs();
  const zoom = React.useMemo(() => uiZoom(), [scale]);
  const t = useT();
  const stillRef = React.useRef(still);
  stillRef.current = still;
  const working = useAgentWorking();
  const [poses, setPoses] = React.useState<Array<Pose | null>>(Array.from({ length: LANES }, () => null));
  const before = React.useRef<TimelineBlock[] | null>(null);
  const beforeTracks = React.useRef<readonly TimelineTrack[]>(tracks);
  /** what each action still to play stands for: the clip as it was, to aim at its place on the film as drawn */
  const entries = React.useRef(new Map<AgentAction, StageEntry>());
  const tracksNow = React.useRef(tracks);
  tracksNow.current = tracks;
  const rects = React.useRef(new Map<string, Rect>());
  const lanes = React.useRef<Lane[]>(Array.from({ length: LANES }, () => ({ queue: [], playing: false, timer: null })));
  const idle = React.useRef<number | null>(null);
  /** every short timer a step sets (so leaving cancels them) and whether the cursors opened the library themselves */
  const timers = React.useRef(new Set<number>());
  const openedLibrary = React.useRef(false);
  const later = React.useCallback((fn: () => void, ms: number) => { const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms); timers.current.add(id); }, []);
  /* where each cursor points now (the animation loop springs to it), and where the first one was last drawn */
  const targets = React.useRef<Array<{ x: number; y: number } | null>>(Array.from({ length: LANES }, () => null));
  const last_ = React.useRef<{ x: number; y: number } | null>(null);
  const tick = React.useRef(0);
  /* what the agent has done so far this time, for the status pill */
  const [done, setDone] = React.useState({ n: 0, kind: '' });
  const workingRef = React.useRef(working);
  workingRef.current = working;
  /* `showing`: the cursor is up. An agent is told by its tab saying so (app), or by the film changing with no hand of the
     person's on it (a key, a click, a touch within the last 2 s): that holds in a browser, and when the tab's word is late */
  const [showing, setShowing] = React.useState(false);
  const input = React.useRef(Date.now());
  const opened = React.useRef(Date.now());
  React.useEffect(() => {
    const mark = () => { input.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, mark, { capture: true, passive: true });
    return () => { for (const e of events) window.removeEventListener(e, mark, { capture: true } as EventListenerOptions); };
  }, []);

  const setPose = React.useCallback((i: number, next: Pose | null) => setPoses((p) => p.map((x, k) => (k === i ? next : x))), []);
  const clearAll = React.useCallback(() => { for (const id of timers.current) window.clearTimeout(id); timers.current.clear(); if (openedLibrary.current) { openedLibrary.current = false; askLibrary(false); } agentStage.flush(); entries.current.clear(); targets.current = Array.from({ length: LANES }, () => null); setPoses(Array.from({ length: LANES }, () => null)); setShowing(false); setDone({ n: 0, kind: '' }); }, []);
  const play = React.useCallback((i: number) => {
    const lane = lanes.current[i];
    if (lane.playing) return;
    const action = lane.queue.shift();
    if (action) setDone((d) => ({ n: d.n + 1, kind: action.kind }));
    if (!action) {
      /* every cursor out of work: after a short pause they all go, so none is on screen with nothing to do */
      if (!workingRef.current && lanes.current.every((l) => !l.playing && !l.queue.length) && idle.current === null) {
        idle.current = window.setTimeout(() => { idle.current = null; clearAll(); }, IDLE_MS);
      }
      return;
    }
    lane.playing = true;
    if (idle.current !== null) { window.clearTimeout(idle.current); idle.current = null; }
    const rect = rectOf(action.id) ?? rects.current.get(action.id) ?? null;
    const entry = entries.current.get(action);
    /* a cut is made at its millisecond on the clip as it is drawn now (whole), not at the end of its first half */
    const aimAt = (r: Rect, f: number, extra: Partial<Pose> = {}) => {
      const x = r.left + Math.max(2, Math.min(r.width - 2, r.width * f));
      const y = r.top + r.height / 2;
      targets.current[i] = { x, y };
      setPose(i, { x, y, rect: r, action, tick: ++tick.current, f, ...extra });
    };
    const was = entry?.before;
    const f = action.kind === 'cut' && action.ms !== undefined && was && was.endMs > was.startMs ? (action.ms - was.startMs) / (was.endMs - was.startMs) : action.at;
    const finish = (ms: number) => {
      lane.timer = window.setTimeout(() => {
        lane.playing = false; lane.timer = null;
        /* a cursor with nothing left to do goes back to wait in the middle while the agent still works; else it leaves */
        if (!lane.queue.length) {
          if (workingRef.current && i < CREW) { const at = standbyAt(i); targets.current[i] = at; setPose(i, { ...at, rect: null, action: STANDBY, tick: ++tick.current, standby: true }); }
          else { targets.current[i] = null; setPose(i, null); }
        }
        play(i);
      }, ms);
    };
    const apply = () => { entries.current.delete(action); agentStage.apply(action); };
    /* real time: the longer the line behind it, the faster it goes, so it never lags behind the agent */
    const pace = Math.max(320, STEP_MS - lane.queue.length * 60);
    if (!rect) { apply(); finish(0); return; }
    if (BRINGS.has(action.kind)) {
      /* what comes in is taken from the library: to its item (opening the panel if it is shut), then dragged onto the timeline */
      const go = (item: { rect: Rect; label: string; el?: HTMLElement } | null) => {
        if (!item) { aimAt(rect, f, { follow: blockEl(action.id) }); later(apply, Math.min(560, pace * 0.55)); finish(pace); return; }
        const el = item.el;
        aimAt(item.rect, 0.5, { pick: true, ...(el ? { follow: () => el } : {}) });
        later(() => aimAt(rectOf(action.id) ?? rect, f, { carry: item.label, follow: blockEl(action.id) }), 230);
        later(apply, 230 + 210);
        finish(230 + 210 + 80);
      };
      /* the panel takes a moment to open and fill: look for the item again every 120 ms for up to 3 s; the item is scrolled
         into view in its list first, then measured, so the cursor points at where it really is */
      const find = (tries: number) => {
        const found = libraryItemFor(action);
        if (found) {
          found.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          later(() => go(libraryItemFor(action)), 70);
        } else if (tries > 0) later(() => find(tries - 1), 60);
        else go(null);
      };
      if (!openedLibrary.current && !libraryItemFor(action)) { openedLibrary.current = true; askLibrary(true); }
      find(25);
      return;
    }
    if (action.kind === 'track') {
      /* lifted from the row it is on, carried, put down on the other */
      aimAt(rect, 0.5, { pick: true, follow: blockEl(action.id) });
      later(apply, 200);
      later(() => { const r2 = rectOf(action.id); if (r2) aimAt(r2, 0.5, { carry: was?.title ?? '', follow: blockEl(action.id) }); }, 200 + 30);
      finish(200 + 220);
      return;
    }
    const section = sectionFor(action.kind);
    const block = blocksOf(tracksNow.current).find((b) => b.id === action.id);
    if (section && block) {
      /* a setting: the clip is clicked (selected), the inspector opens at its section, the cursor goes to the control and
         the change lands as it gets there */
      aimAt(rect, 0.5, { follow: blockEl(action.id) });
      later(() => askInspect(block.clipId ?? block.id, section), 160);
      later(() => {
        const field = controlIn(section);
        if (field) aimAt(field, 0.5, { field: section, follow: controlEl(section) });
        later(apply, field ? 200 : 0);
        finish(field ? 200 + 120 : 60);
      }, 160 + 170);
      return;
    }
    aimAt(rect, f, { follow: blockEl(action.id) });
    /* the cursor has arrived: now the film shows what it did */
    later(apply, Math.min(300, pace * 0.5));
    finish(pace);
  }, [clearAll, setPose]);

  React.useLayoutEffect(() => {
    const now = blocksOf(tracks);
    const was = before.current;
    before.current = now;
    /* remember where each clip is drawn, for the next change to point at a clip that is gone by then */
    const frame = requestAnimationFrame(() => { for (const b of now) { const r = rectOf(b.id); if (r) rects.current.set(b.id, r); } });
    const wasTracks = beforeTracks.current;
    beforeTracks.current = tracks;
    /* the agent's edits made for real (lib/agent-run) are shown by the cursor that makes them: not replayed here */
    if (agentRun.busy()) return () => cancelAnimationFrame(frame);
    const byAgent = workingRef.current || (Date.now() - input.current > 2000 && Date.now() - opened.current > 4000);
    if (was && byAgent) {
      const actions = agentActions(was, now);
      if (actions.length) {
        setShowing(true);
        /* what a step stands for: the film as it was, so the timeline can show it so until the cursor gets there */
        agentStage.flush(); entries.current.clear();
        const wasBy = new Map(was.map((b) => [blockKey(b), b]));
        const nowBy = new Map(now.map((b) => [b.id, b]));
        const staged: StageEntry[] = actions.map((a) => {
          if (a.kind === 'delete') {
            const b = was.find((x) => x.id === a.id) ?? null;
            const row = wasTracks.find((tr) => tr.blocks.some((x) => x.id === a.id));
            return { action: a, before: b, lane: row?.lane, index: row?.index };
          }
          const cur = nowBy.get(a.id);
          return { action: a, before: cur ? wasBy.get(blockKey(cur)) ?? null : null };
        });
        for (const e of staged) entries.current.set(e.action, e);
        agentStage.push(staged);
        /* a big change is shared among several cursors, each taking every nth action, so they work side by side */
        const n = lanesFor(actions.length);
        actions.forEach((a, k) => lanes.current[k % n].queue.push(a));
        /* one frame later: the timeline has redrawn the film as it was, and the cursors aim at that */
        requestAnimationFrame(() => { for (let i = 0; i < n; i++) play(i); });
      }
    }
    return () => cancelAnimationFrame(frame);
  }, [tracks, play]);

  /* the agent's edits made for real: the first cursor goes to the clip (taking new media from the library), and the editor
     makes the edit once it has arrived */
  React.useEffect(() => agentRun.register({
    leave: () => { later(() => {
      if (lanes.current.some((l) => l.playing || l.queue.length)) return;
      /* the agent still at work: the cursor goes back to wait in the middle with the others; done: they all go */
      if (workingRef.current) { const at = standbyAt(0); targets.current[0] = at; setPose(0, { ...at, rect: null, action: STANDBY, tick: ++tick.current, standby: true }); }
      else clearAll();
    }, 700); },
    aim: (step: RunStep) => new Promise<void>((resolve) => {
      setShowing(true);
      if (idle.current !== null) { window.clearTimeout(idle.current); idle.current = null; }
      const blocks = blocksOf(tracksNow.current);
      const block = step.clip ? blocks.find((b) => b.clipId === step.clip) : undefined;
      const row = step.track !== undefined ? tracksNow.current[step.track] : undefined;
      const at = step.at !== undefined ? step.at * 1000 : undefined;
      const near = row?.blocks.reduce<TimelineBlock | undefined>((best, b) => (!best || Math.abs(b.startMs - (at ?? 0)) < Math.abs(best.startMs - (at ?? 0)) ? b : best), undefined) ?? block ?? (BRINGS.has(step.kind) ? undefined : blocks[0]);
      const action: AgentAction = { kind: step.kind, id: block?.id ?? near?.id ?? '', at: step.kind === 'delete' ? 0.5 : 0.5, media: block?.kind ?? near?.kind ?? 'video', ...(step.src ? { src: step.src } : {}) };
      const aim = (r: Rect, f: number, extra: Partial<Pose> = {}) => {
        const x = r.left + Math.max(2, Math.min(r.width - 2, r.width * f));
        const y = r.top + r.height / 2;
        targets.current[0] = { x, y };
        setPose(0, { x, y, rect: r, action, tick: ++tick.current, f, ...extra });
      };
      const fraction = (b: TimelineBlock) => (step.kind === 'cut' && at !== undefined && b.endMs > b.startMs ? Math.max(0.05, Math.min(0.95, (at - b.startMs) / (b.endMs - b.startMs))) : 0.5);
      const land = () => {
        const target = block ?? near;
        /* a clip brought in is not drawn yet: the cursor drops it where it goes on the timeline (its second), the box
           then moves onto it once it is there (below) */
        const r = target ? rectOf(target.id) : BRINGS.has(step.kind) ? dropAt(blocks, at ?? 0) : null;
        if (r && target) aim(r, fraction(target), { ...(BRINGS.has(step.kind) ? { carry: step.src?.split('/').pop() ?? '' } : {}), follow: blockEl(target.id) });
        else if (r) aim(r, 0.5, { carry: step.src?.split('/').pop() ?? '' });
        /* a setting: from the clip to its control in the inspector, and the edit is made as the cursor reaches it */
        const section = step.kind === 'delete' || step.kind === 'cut' || step.kind === 'move' || step.kind === 'trim' || BRINGS.has(step.kind) ? null : sectionFor(step.kind, step.prop);
        if (section && target && r) {
          later(() => askInspect(target.clipId ?? target.id, section), 170);
          later(() => { const field = controlIn(section); if (field) aim(field, 0.5, { field: section, follow: controlEl(section) }); later(resolve, field ? 200 : 0); }, 170 + 170);
          return;
        }
        later(resolve, 300);
        /* what it brought in is a clip now: the cursor and its box go onto the new clip itself, not the one beside it */
        if (BRINGS.has(step.kind)) {
          const known = new Set(blocksOf(tracksNow.current).map((b) => b.id));
          const name = step.src?.split('/').pop() ?? '';
          later(() => {
            const fresh = blocksOf(tracksNow.current).filter((b) => !known.has(b.id));
            const made = fresh.find((b) => name && (b.title === name || name.startsWith(b.title))) ?? fresh[0];
            const r2 = made ? rectOf(made.id) : null;
            if (made && r2) aim(r2, 0.5, { carry: name, follow: blockEl(made.id) });
          }, 420);
        }
      };
      if (!BRINGS.has(step.kind)) { land(); return; }
      /* new media: from the library's item to the timeline */
      const find = (tries: number) => {
        const found = libraryItemFor(action);
        if (found) { found.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); later(() => { const item = libraryItemFor(action) ?? found; const el = item.el; aim(item.rect, 0.5, { pick: true, follow: () => el }); later(land, 380); }, 70); }
        else if (tries > 0) later(() => find(tries - 1), 60);
        else land();
      };
      if (!openedLibrary.current && !libraryItemFor(action)) { openedLibrary.current = true; askLibrary(true); }
      find(25);
    }),
  }), [later, setPose, clearAll]);

  /* while the agent works the crew is up: the cursors with nothing to do wait in the middle of the picture, ready */
  React.useEffect(() => {
    if (!working) return;
    setShowing(true);
    setPoses((p) => p.map((x, i) => {
      if (x || i >= CREW) return x;
      const at = standbyAt(i);
      targets.current[i] = at;
      return { ...at, rect: null, action: STANDBY, tick: ++tick.current, standby: true };
    }));
  }, [working]);
  /* the agent working one of the project's files (`lopesfilm get audio-clean --src …`): a cursor takes the file from the
     library, goes to the tool in its inspector (the loudness slider, Remove noise, Stabilize…) and stays on it while it
     runs; done, it goes to the new file in the library, then back to wait */
  React.useEffect(() => {
    const held = new Map<string, number>();
    const rectOfEl = (el: Element | null): Rect | null => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 4 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null; };
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ phase: string; verb: string; src: string; args?: Record<string, unknown>; made?: string }>).detail;
      if (!d) return;
      const tool = assetToolOf(d.verb, d.args);
      const kind: AgentAction['kind'] = tool === 'volume' ? 'volume' : 'adjust';
      const act = (src: string): AgentAction => ({ ...STANDBY, kind, id: src, src });
      setShowing(true);
      if (d.phase === 'start') {
        const i = [...Array(CREW).keys()].find((k) => !lanes.current[k]!.playing && !lanes.current[k]!.queue.length && ![...held.values()].includes(k)) ?? 0;
        held.set(d.src + d.verb, i);
        lanes.current[i]!.playing = true;
        const go = (r: Rect | null, extra: Partial<Pose>) => { if (!r) return; const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; targets.current[i] = at; setPose(i, { ...at, rect: r, action: act(d.src), tick: ++tick.current, ...extra }); };
        if (!openedLibrary.current && !document.querySelector(`[data-media-key="${CSS.escape(d.src)}"]`)) { openedLibrary.current = true; askLibrary(true); }
        later(() => {
          const card = document.querySelector<HTMLElement>(`[data-media-key="${CSS.escape(d.src)}"]`);
          card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          go(rectOfEl(card), { pick: true });
          later(() => {
            /* the slider is dragged to its value; a tool is pressed and held while it runs */
            const control = document.querySelector(`[data-asset-tools] [data-asset-tool="${tool}"]`);
            go(rectOfEl(control), { field: 'asset' });
            if (tool === 'volume') later(() => go(rectOfEl(document.querySelector('[data-asset-tools] [data-asset-tool="volume-apply"]')), { field: 'asset' }), 380);
          }, card ? 340 : 100);
        }, 100);
        return;
      }
      const i = held.get(d.src + d.verb) ?? 0;
      held.delete(d.src + d.verb);
      const release = () => {
        lanes.current[i]!.playing = false;
        if (workingRef.current) { const at = standbyAt(i); targets.current[i] = at; setPose(i, { ...at, rect: null, action: STANDBY, tick: ++tick.current, standby: true }); }
        else { targets.current[i] = null; setPose(i, null); }
        play(i);
      };
      if (d.phase === 'done' && d.made) {
        /* the new file shows in the library a moment later: the cursor goes to it */
        later(() => {
          const card = document.querySelector<HTMLElement>(`[data-media-key="${CSS.escape(d.made!)}"]`);
          card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const r = rectOfEl(card);
          if (r) { const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; targets.current[i] = at; setPose(i, { ...at, rect: r, action: { ...act(d.made!), kind: 'create' }, tick: ++tick.current, pick: true }); }
          later(release, r ? 480 : 0);
        }, 400);
      } else release();
    };
    window.addEventListener('lopesfilm:agent-asset', on);
    return () => window.removeEventListener('lopesfilm:agent-asset', on);
  }, [later, setPose, play]);

  /* what the agent makes or changes in the project's media (a generated sound, a cleaned clip, a download) is shown being
     taken in: a waiting cursor goes to its card in the library, picks it up, and goes back to wait */
  React.useEffect(() => {
    if (!working) return undefined;
    const keys = () => new Set([...document.querySelectorAll<HTMLElement>('[data-media-key]')].map((el) => el.dataset.mediaKey ?? ''));
    const known = keys();
    let queue: string[] = [];
    let busyLane = false;
    const visit = () => {
      if (busyLane) return;
      const key = queue.shift();
      if (!key) return;
      const i = [...Array(CREW).keys()].find((k) => !lanes.current[k]!.playing && !lanes.current[k]!.queue.length);
      const el = document.querySelector<HTMLElement>(`[data-media-key="${CSS.escape(key)}"]`);
      if (i === undefined || !el) { visit(); return; }
      busyLane = true;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      later(() => {
        const r = el.getBoundingClientRect();
        if (r.width > 6) {
          const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          targets.current[i] = at;
          setPose(i, { ...at, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, action: { ...STANDBY, kind: 'create', id: key, src: key }, tick: ++tick.current, pick: true });
        }
        later(() => {
          if (!lanes.current[i]!.playing && workingRef.current) { const back = standbyAt(i); targets.current[i] = back; setPose(i, { ...back, rect: null, action: STANDBY, tick: ++tick.current, standby: true }); }
          busyLane = false; visit();
        }, 600);
      }, 70);
    };
    const seen = new MutationObserver(() => {
      const now = keys();
      const fresh = [...now].filter((k) => k && !known.has(k));
      /* many at once is the library opening or another folder shown, not something made: only a few at a time are new */
      if (fresh.length && fresh.length <= 3) queue.push(...fresh);
      for (const k of now) known.add(k);
      visit();
    });
    seen.observe(document.body, { childList: true, subtree: true });
    return () => { seen.disconnect(); queue = []; };
  }, [working, later, setPose]);

  /* an agent that says it is done (app) ends the show once what is queued has played */
  React.useEffect(() => {
    if (working || !showing) return;
    const done = window.setTimeout(() => { if (lanes.current.every((l) => !l.playing && !l.queue.length)) clearAll(); }, IDLE_MS * 2);
    return () => window.clearTimeout(done);
  }, [working, showing, clearAll]);
  React.useEffect(() => () => {
    agentStage.flush();
    for (const id of timers.current) window.clearTimeout(id);
    if (openedLibrary.current) askLibrary(false);
    for (const l of lanes.current) if (l.timer !== null) window.clearTimeout(l.timer);
    if (idle.current !== null) window.clearTimeout(idle.current);
  }, []);

  /* one animation loop moves every cursor, 60 times a second, straight on the page (no React render per frame): each
     cursor springs to what it points at; with nothing to change and the agent still going (reading, thinking, running
     commands, rendering) it keeps moving, over the clips and the playhead, the way a person looks over the film */
  const sims = React.useRef<Sim[]>(Array.from({ length: LANES }, newSim));
  const nodes = React.useRef<Array<HTMLDivElement | null>>(Array.from({ length: LANES }, () => null));
  /* what each cursor draws besides itself: a selection box, a link, a highlighter band, crosshair guides, a short trail */
  const art = React.useRef<Array<{ box: HTMLDivElement | null; band: HTMLDivElement | null; hx: HTMLDivElement | null; vx: HTMLDivElement | null; link: SVGLineElement | null; trail: SVGPolylineElement | null }>>(
    Array.from({ length: LANES }, () => ({ box: null, band: null, hx: null, vx: null, link: null, trail: null })));
  const roamLabels = React.useRef<Array<HTMLSpanElement | null>>(Array.from({ length: LANES }, () => null));
  const roleLabels = React.useRef<Array<HTMLSpanElement | null>>(Array.from({ length: LANES }, () => null));
  const labelRef = React.useRef((panel: Panel, mode: Mode) => `${panel} · ${mode}`);
  labelRef.current = (panel, mode) => `${t(`agentCursor.panel.${panel}`)} · ${t(`agentCursor.${MODE_LABEL[mode]}`)}`;
  const labelOf = (panel: Panel, mode: Mode) => labelRef.current(panel, mode);
  const standbyLabel = React.useRef('');
  standbyLabel.current = t('agentCursor.standby');
  const reduce = React.useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  /* the cursors are up only while there is something for them to do on the timeline: not while the agent only thinks */
  const alive = showing;
  const posesRef = React.useRef(poses);
  posesRef.current = poses;
  /* each cursor stays on what it points at while that moves: measured again every frame, moved when it has */
  React.useEffect(() => {
    let raf = 0;
    const loop = () => {
      posesRef.current.forEach((p, i) => {
        if (!p?.follow || !p.rect) return;
        const el = p.follow();
        if (!el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        if (Math.abs(r.left - p.rect.left) < 0.5 && Math.abs(r.top - p.rect.top) < 0.5 && Math.abs(r.width - p.rect.width) < 0.5 && Math.abs(r.height - p.rect.height) < 0.5) return;
        const f = p.f ?? 0.5;
        const x = r.left + Math.max(2, Math.min(r.width - 2, r.width * f));
        const y = r.top + r.height / 2;
        const moved = { ...p, x, y, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
        posesRef.current = posesRef.current.map((x2, k) => (k === i ? moved : x2));
        targets.current[i] = { x, y };
        /* only over the same pose: one set meanwhile (the next step) is left as it is */
        setPoses((now) => (now[i] === p ? now.map((x2, k) => (k === i ? moved : x2)) : now));
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  React.useEffect(() => {
    if (!alive) return undefined;
    let raf = 0;
    let last = performance.now();
    /* each cursor takes the panels in turn (a step apart from the others): the picture, the inspector, the library, the
       timeline, the chat; the panels shut or off screen are passed over */
    const visible = (sim: Sim, i: number) => {
      for (let k = 0; k < PANELS.length; k++) {
        const panel = PANELS[(sim.step + i * 2 + k) % PANELS.length]!;
        const rects = panelRects(panel);
        if (rects.length) { sim.panel = panel; return rects; }
      }
      return [];
    };
    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      for (let i = 0; i < LANES; i++) {
        const el = nodes.current[i];
        const sim = sims.current[i]!;
        const lane = lanes.current[i]!;
        if (!el) { sim.seeded = false; continue; }
        const acting = lane.playing;
        if (!sim.seeded) {
          /* comes in from the middle of the window, so it is seen arriving, not appearing */
          const p = posesRef.current[i];
          sim.x = last_.current?.x ?? window.innerWidth * (0.35 + 0.15 * i); sim.y = last_.current?.y ?? window.innerHeight * 0.55;
          sim.gx = p?.x ?? sim.x; sim.gy = p?.y ?? sim.y; sim.look = 0; sim.seeded = true;
        }
        const doing = sim.mode !== 'look';
        const waiting = !acting && Boolean(posesRef.current[i]?.standby);
        if ((acting || Boolean(posesRef.current[i]?.rect)) && targets.current[i]) {
          sim.gx = targets.current[i]!.x; sim.gy = targets.current[i]!.y; sim.smooth = FLY_S; sim.look = now + 400; sim.mode = 'look';
        } else if (waiting) {
          /* waiting in the middle: the picture may have moved (a panel opened), so the place is measured again */
          /* while the agent thinks they wait in the middle of the picture, going round a figure of eight (∞) together,
             each a third of the way behind the one before; the middle is measured again, a panel may have moved it */
          if (now >= sim.look) { const pic = standbyAt(1); targets.current[i] = { x: pic.x + 30, y: pic.y + 26 }; sim.look = now + 500; }
          const c = targets.current[i];
          if (c) {
            const ph = (now / 1000) * 1.15 + (i * Math.PI * 2) / CREW;
            const A = reduce.current || stillRef.current ? 0 : Math.min(150, window.innerWidth * 0.09), B = A * 0.48;
            if (A) { sim.gx = c.x + A * Math.sin(ph); sim.gy = c.y + B * Math.sin(ph) * Math.cos(ph); }
            else { const at = standbyAt(i); sim.gx = at.x; sim.gy = at.y; }
          }
          sim.smooth = 0.1; sim.mode = 'look';
        } else if (ROAM && doing && workingRef.current) {
          /* a task of its own: first to where it starts, then the drag itself, then it is over */
          if (now >= sim.phaseEnd) {
            if (sim.phase === 0) {
              sim.phase = 1; sim.gx = sim.tx; sim.gy = sim.ty; sim.smooth = sim.mode === 'measure' ? 0.26 : 0.12;
              sim.phaseEnd = now + (sim.mode === 'measure' ? 800 : 520 + ((sim.step * 131 + i * 71) % 300));
            } else { sim.mode = 'look'; sim.look = now + 250; }
          }
        } else if (ROAM && workingRef.current && now >= sim.look) {
          /* nothing to change: look at the next clip (the lanes a step apart), else drift around the window; now and then, a task */
          sim.step++;
          const all = visible(sim, i);
          if (all.length > 1 && !reduce.current && (sim.step + i) % 3 !== 0 && i < CREW) {
            const mode = MODES[(sim.step + i * 2) % MODES.length]!;
            const a = all[(sim.step * 2 + i * 3) % all.length]!, b = all[(sim.step * 2 + i * 3 + 2 + (i % 3)) % all.length]!;
            sim.mode = mode;
            if (mode === 'select') { sim.ax = Math.min(a.left, b.left) - 6; sim.ay = Math.min(a.top, b.top) - 5; sim.tx = Math.max(a.right, b.right) + 6; sim.ty = Math.max(a.bottom, b.bottom) + 5; }
            else if (mode === 'link') { sim.ax = a.right - 3; sim.ay = a.top + a.height / 2; sim.tx = b.left + 3; sim.ty = b.top + b.height / 2; }
            else if (mode === 'highlight') { sim.ax = a.left + 3; sim.ay = a.top + a.height / 2; sim.tx = a.right - 3; sim.ty = a.top + a.height / 2; }
            else { sim.ax = a.left + a.width * 0.4; sim.ay = a.top + a.height * 0.5; sim.tx = b.left + b.width * 0.6; sim.ty = b.top + b.height * 0.5; }
            sim.phase = 0; sim.gx = sim.ax; sim.gy = sim.ay; sim.smooth = FLY_S * 2; sim.phaseEnd = now + 260;
          } else if (all.length) {
            const r = all[(sim.step * 2 + i * 3) % all.length]!;
            sim.gx = r.left + Math.min(r.width - 4, 10 + ((sim.step * 61 + i * 29) % Math.max(14, r.width - 20)));
            sim.gy = r.top + r.height * (0.3 + 0.4 * ((sim.step * 37) % 10) / 10);
            sim.smooth = DRIFT_S;
          } else {
            const a = now / 1000 + i * 2.1;
            sim.gx = window.innerWidth * (0.5 + 0.18 * Math.sin(a * 0.7 + i)); sim.gy = window.innerHeight * (0.5 + 0.14 * Math.cos(a * 0.9));
            sim.smooth = DRIFT_S;
          }
          sim.look = now + LOOK_MS[0] + ((sim.step * 173 + i * 97) % (LOOK_MS[1] - LOOK_MS[0]));
        }
        const roamLabel = roamLabels.current[i];
        if (roamLabel) {
          const text = waiting ? 'standby' : `${sim.mode === 'look' ? 'view' : sim.mode} · ${sim.panel}`;
          if (roamLabel.dataset.text !== text) { roamLabel.dataset.text = text; roamLabel.textContent = waiting ? standbyLabel.current : labelOf(sim.panel, sim.mode); }
          roamLabel.style.display = waiting ? '' : 'none';
          const role = roleLabels.current[i]; if (role) role.style.display = waiting ? 'none' : '';
        }
        /* a breath of movement on top, so even resting on a clip it is alive */
        const t = now / 1000;
        const wob = 0;
        const gx = sim.gx + wob * (Math.sin(t * 2.3 + i * 1.7) * 3.2 + Math.sin(t * 5.1 + i) * 1.1);
        const gy = sim.gy + wob * (Math.cos(t * 1.9 + i * 2.2) * 3.2 + Math.cos(t * 4.3 + i) * 1.1);
        [sim.x, sim.vx] = damp(sim.x, gx, sim.vx, sim.smooth, dt);
        [sim.y, sim.vy] = damp(sim.y, gy, sim.vy, sim.smooth, dt);
        last_.current = { x: sim.x, y: sim.y };
        el.style.transform = `translate3d(${sim.x.toFixed(2)}px, ${sim.y.toFixed(2)}px, 0)`;
        /* the drawing of its task (nothing while it only looks) */
        const a = art.current[i]!;
        const drawing = sim.mode !== 'look' && sim.phase === 1 && !acting;
        const guide = acting && lane.queue.length >= 0 && posesRef.current[i]?.action.kind === 'cut' ? 1 : sim.mode === 'measure' && !acting ? 1 : 0;
        if (a.box) {
          const on = drawing && sim.mode === 'select';
          a.box.style.opacity = on ? '1' : '0';
          if (on) { const l = Math.min(sim.ax, sim.x), t = Math.min(sim.ay, sim.y); a.box.style.transform = `translate3d(${l.toFixed(1)}px, ${t.toFixed(1)}px, 0)`; a.box.style.width = `${Math.abs(sim.x - sim.ax).toFixed(1)}px`; a.box.style.height = `${Math.abs(sim.y - sim.ay).toFixed(1)}px`; }
        }
        if (a.band) {
          const on = drawing && sim.mode === 'highlight';
          a.band.style.opacity = on ? '1' : '0';
          if (on) { const l = Math.min(sim.ax, sim.x); a.band.style.transform = `translate3d(${l.toFixed(1)}px, ${(sim.ay - 8).toFixed(1)}px, 0)`; a.band.style.width = `${Math.abs(sim.x - sim.ax).toFixed(1)}px`; }
        }
        if (a.link) {
          const on = (drawing || (sim.mode === 'link' && sim.phase === 0)) && sim.mode === 'link';
          a.link.parentElement!.style.opacity = on ? '1' : '0';
          if (on) { a.link.setAttribute('x1', sim.ax.toFixed(1)); a.link.setAttribute('y1', sim.ay.toFixed(1)); a.link.setAttribute('x2', sim.x.toFixed(1)); a.link.setAttribute('y2', sim.y.toFixed(1)); }
        }
        if (a.hx && a.vx) {
          a.hx.style.opacity = a.vx.style.opacity = guide ? '1' : '0';
          if (guide) { a.hx.style.transform = `translate3d(0, ${sim.y.toFixed(1)}px, 0)`; a.vx.style.transform = `translate3d(${sim.x.toFixed(1)}px, 0, 0)`; }
        }
        if (a.trail) {
          sim.trail.push([sim.x, sim.y]); if (sim.trail.length > 9) sim.trail.shift();
          const fast = Math.hypot(sim.vx, sim.vy) > 90;
          a.trail.parentElement!.style.opacity = fast && !reduce.current ? '1' : '0';
          if (fast) a.trail.setAttribute('points', sim.trail.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' '));
        }
        /* it leans into its speed a little: a pointer that is going somewhere looks it */
        const sp = Math.hypot(sim.vx, sim.vy);
        const svg = el.firstElementChild as SVGElement | null;
        if (svg) svg.style.transform = `rotate(${Math.max(-14, Math.min(14, sim.vx / 160)).toFixed(1)}deg) scale(${(1 + Math.min(0.08, sp / 9000)).toFixed(3)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive]);
  const status = (
    <>
      <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden" style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}>
        <div className="h-full w-1/3" style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', animation: 'agent-sweep 1.1s linear infinite' }} />
      </div>
      <div className="absolute bottom-[62px] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-medium shadow-[0_8px_24px_-8px_rgba(0,0,0,.7)]"
        style={{ background: 'color-mix(in srgb, #0b0b0f 88%, var(--accent))', color: 'var(--text, #fff)', border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)' }}>
        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)', animation: 'agent-pulse 900ms ease-in-out infinite' }} />
        <span>{t('agentCursor.name')} · {done.kind ? t(`agentCursor.${done.kind}`) : t('agentCursor.working')}</span>
        <span className="tabular-nums opacity-70">· {t('agentCursor.crew').replace('{n}', String(poses.filter(Boolean).length))}</span>
        {done.n ? <span className="tabular-nums opacity-70">· {t('agentCursor.changes').replace('{n}', String(done.n))}</span> : null}
      </div>
      <style>{'@keyframes agent-sweep{from{transform:translateX(-100%)}to{transform:translateX(300%)}}@keyframes agent-pulse{0%,100%{transform:scale(.8);opacity:.6}50%{transform:scale(1.25);opacity:1}}'}</style>
    </>
  );
  if (!alive || !poses.some(Boolean)) return null;
  /* on the page itself: a transformed or clipped ancestor would move or cut a fixed overlay. The places it draws at are
     the screen's (getBoundingClientRect), but the page is zoomed by the interface size (lib/ui-prefs.ts): the overlay
     takes the zoom back off, or every box and cursor lands off its item, toward the top left */
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[10050]" style={zoom !== 1 ? { zoom: 1 / zoom } : undefined}>
      {status}
      {poses.map((p, lane) => {
        if (!p) return null;
        const color = LANE_COLOR[lane]!;
        const action = p?.action;
        const rect = p?.rect ?? null;
        const drag = Boolean(rect && action && (DRAGGING.has(action.kind) || p?.carry) && !p?.pick);
        return (
          <React.Fragment key={lane}>
            <div ref={(el) => { art.current[lane]!.box = el; }} className="absolute left-0 top-0" style={{ opacity: 0, border: `1px dashed ${color}`, background: `color-mix(in srgb, ${color} 14%, transparent)`, willChange: 'transform, width, height' }} />
            <div ref={(el) => { art.current[lane]!.band = el; }} className="absolute left-0 top-0" style={{ opacity: 0, height: 16, background: `color-mix(in srgb, ${color} 38%, transparent)`, borderRadius: 2, willChange: 'transform, width' }} />
            <div ref={(el) => { art.current[lane]!.hx = el; }} className="absolute left-0 top-0 w-full" style={{ opacity: 0, height: 1, background: color, boxShadow: `0 0 6px ${color}`, willChange: 'transform' }} />
            <div ref={(el) => { art.current[lane]!.vx = el; }} className="absolute left-0 top-0 h-full" style={{ opacity: 0, width: 1, background: color, boxShadow: `0 0 6px ${color}`, willChange: 'transform' }} />
            <svg className="absolute inset-0 h-full w-full" style={{ opacity: 0 }}>
              <line ref={(el) => { art.current[lane]!.link = el; }} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 5" />
            </svg>
            <svg className="absolute inset-0 h-full w-full" style={{ opacity: 0 }}>
              <polyline ref={(el) => { art.current[lane]!.trail = el; }} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".45" />
            </svg>
            {rect ? <div key={`ring-${p!.tick}`} className="absolute rounded-[5px]" style={{
              left: rect.left - 2, top: rect.top - 2, width: rect.width + 4, height: rect.height + 4,
              border: `1.5px solid ${color}`, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)`,
              animation: 'agent-ring 260ms ease-out both',
            }} /> : null}
            {rect && action && SLIDERS.has(action.kind) ? <div key={`sl-${p!.tick}`} className="absolute rounded-full" style={{ left: rect.left + rect.width / 2 - 28, top: rect.top - 12, width: 56, height: 6, background: 'rgba(0,0,0,.55)', border: `1px solid ${color}` }}>
              <div className="h-full rounded-full" style={{ background: color, animation: 'agent-slide 420ms ease-in-out both' }} />
            </div> : null}
            {rect && action?.kind === 'transform' ? <div key={`tf-${p!.tick}`} className="absolute rounded-[3px]" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, border: `1.5px dashed ${color}`, animation: 'agent-frame 420ms ease-in-out both' }} /> : null}
            {rect && action?.kind === 'toggle' ? <div key={`tg-${p!.tick}`} className="absolute rounded-full" style={{ left: rect.left + rect.width / 2 - 14, top: rect.top - 14, width: 28, height: 12, background: 'rgba(0,0,0,.55)', border: `1px solid ${color}` }}>
              <div className="h-full w-[10px] rounded-full" style={{ background: color, animation: 'agent-flip 360ms ease-in-out both' }} />
            </div> : null}
            {/* placed by the animation loop (transform written 60 times a second); hidden until it has a first position */}
            <div ref={(el) => { nodes.current[lane] = el; }} className="absolute left-0 top-0" style={{ willChange: 'transform', transform: 'translate3d(-100px,-100px,0)' }}>
              <svg width="20" height="22" viewBox="0 0 20 22" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.55))', transformOrigin: '2px 1.5px', willChange: 'transform' }}>
                <path d="M2 1.5 17 11.2l-6.6 1.3L7.6 19.5 2 1.5Z" fill={color} stroke="#0b0b0b" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span key={`ping-${p?.tick ?? 0}-${rect ? 1 : 0}`} className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full"
                style={{ border: `2px solid ${color}`, animation: rect ? 'agent-ping 520ms ease-out both' : 'agent-ping 1500ms ease-out infinite', opacity: drag ? 0 : 1 }} />
              {drag ? <span className="absolute left-4 top-5 flex h-5 min-w-9 max-w-[140px] items-center overflow-hidden whitespace-nowrap rounded-[3px] px-1.5 text-[10px] font-medium leading-none" style={{ background: `color-mix(in srgb, ${color} 70%, #0b0b0b)`, border: `1px solid ${color}`, opacity: .9, color: '#fff' }}>{p?.carry ?? ''}</span> : null}
              <span className="absolute left-4 top-3 whitespace-nowrap rounded-[4px] px-1.5 py-[2px] font-mono text-[10px] font-semibold leading-4"
                style={{ background: color, color: '#0b0b0b', transform: drag ? 'translateY(22px)' : undefined, transition: 'transform 180ms ease-out' }}>
                {ROLE[lane % ROLE.length]}-{String(lane + 1).padStart(2, '0')} · <span ref={(el) => { roleLabels.current[lane] = el; }}>{p?.standby ? t('agentCursor.standby') : action && rect ? `${t(`agentCursor.${p?.pick ? 'library' : action.kind}`)}${p?.field ? ` · ${t('agentCursor.panel.inspector')}` : ''}` : t('agentCursor.working')}</span><span ref={(el) => { roamLabels.current[lane] = el; }} style={{ display: 'none' }} />
              </span>
            </div>
          </React.Fragment>
        );
      })}
      <style>{'@keyframes agent-ping{from{transform:scale(.3);opacity:.9}to{transform:scale(1.6);opacity:0}}@keyframes agent-slide{from{width:25%}to{width:85%}}@keyframes agent-frame{0%{transform:scale(1)}60%{transform:scale(1.06,1.18)}100%{transform:scale(1)}}@keyframes agent-flip{from{transform:translateX(0)}to{transform:translateX(16px)}}@keyframes agent-ring{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}@media (prefers-reduced-motion:reduce){[style*="agent-ping"]{animation:none!important}}'}</style>
    </div>,
    document.body,
  );
}
