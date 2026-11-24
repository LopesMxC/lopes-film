/**
 * The person's interface choices (Settings → General → Interface), kept in localStorage `lopesfilm.ui` and shared by every
 * page of Studio: where the library's tabs sit and whether they are named, the size of everything, motion, the agent's
 * cursors and how they wait. Applied to <html> (`data-ui-*`, zoom) so CSS and components read them without a render.
 */
import React from 'react';

export interface UiPrefs {
  /** the library's category tabs: above it (default), under it, or as a column at its left or right */
  libraryTabs: 'top' | 'bottom' | 'left' | 'right';
  /** the tabs' names under their icons */
  libraryTabNames: boolean;
  /** everything at this size (percent) */
  scale: 90 | 100 | 110 | 125;
  /** animations of the interface: as designed, or none */
  motion: 'full' | 'reduced';
  /** the agent's cursors over the editor while it works */
  agentCursors: boolean;
  /** how they wait while the agent thinks: going round a figure of eight, or still */
  cursorIdle: 'infinity' | 'still';
  /** panels' corners: round (default) or square */
  corners: 'round' | 'square';
}

const KEY = 'lopesfilm.ui';
export const UI_DEFAULTS: UiPrefs = { libraryTabs: 'top', libraryTabNames: true, scale: 100, motion: 'full', agentCursors: true, cursorIdle: 'infinity', corners: 'round' };

function read(): UiPrefs {
  try { return { ...UI_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<UiPrefs>) }; } catch { return UI_DEFAULTS; }
}
let current = typeof window === 'undefined' ? UI_DEFAULTS : read();
const listeners = new Set<() => void>();

/** <html> says the choices, for CSS: zoom for the size, data-ui-motion, data-ui-corners. */
export function applyUiPrefs(p: UiPrefs = current): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  /* in the desktop app, the window's own zoom (preload's setZoom): the page's pixels stay one kind, so whatever is placed
     by a measure (menus, the agent's cursors, the library over the chat) lands right. In a browser, a CSS zoom */
  const native = (globalThis as { lopesfilmNative?: { setZoom?: (factor: number) => void } }).lopesfilmNative?.setZoom;
  if (native) { el.style.zoom = ''; native(p.scale / 100); }
  else el.style.zoom = p.scale === 100 ? '' : String(p.scale / 100);
  el.dataset.uiMotion = p.motion;
  el.dataset.uiCorners = p.corners;
}

export function getUiPrefs(): UiPrefs { return current; }

/**
 * How much the page is zoomed (the size chosen, 1 at 100%). The page lays out in zoomed pixels, but the window's size
 * (innerWidth, innerHeight) stays in the screen's: divided by it (lib/use-workspaces.ts), or the panels Studio places by
 * the window's size (the library over the chat) come out short of the ones CSS places, and do not line up.
 */
export function uiZoom(): number {
  if (typeof document === 'undefined') return 1;
  const z = parseFloat(document.documentElement.style.zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Hears the size change (any other choice too). */
export function onUiPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setUiPrefs(patch: Partial<UiPrefs>): void {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* this page only */ }
  applyUiPrefs(current);
  for (const l of [...listeners]) l();
}

if (typeof window !== 'undefined') {
  applyUiPrefs(current);
  /* chosen in another page of Studio (another tab): this one follows */
  window.addEventListener('storage', (e) => { if (e.key === KEY) { current = read(); applyUiPrefs(current); for (const l of [...listeners]) l(); } });
}

/** The choices, kept current, and a way to change them. */
export function useUiPrefs(): [UiPrefs, (patch: Partial<UiPrefs>) => void] {
  const p = React.useSyncExternalStore((on) => { listeners.add(on); return () => { listeners.delete(on); }; }, () => current, () => UI_DEFAULTS);
  return [p, setUiPrefs];
}
