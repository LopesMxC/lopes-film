/**
 * The theme: light, dark or the system's, dark until the person chooses. The choice is kept in localStorage `lopesfilm.theme` and shown as
 * `<html data-theme>`; index.html applies it before the first paint, this keeps it current afterwards, in every page
 * of Studio that is open.
 */
import React from 'react';

export type ThemeMode = 'light' | 'dark' | 'system' | 'coffee' | 'night' | 'oled' | 'forest' | 'ocean' | 'sunset' | 'grape' | 'graphite' | 'contrast';
/** Dark variations: `<html data-theme>` stays `dark` (all the dark rules apply) and `<html data-skin>` carries the variation. */
export const SKINS = ['coffee', 'night', 'oled', 'forest', 'ocean', 'sunset', 'grape', 'graphite', 'contrast'] as const;
export const isSkin = (mode: string): mode is (typeof SKINS)[number] => (SKINS as readonly string[]).includes(mode);

const listeners = new Set<() => void>();

/** The colour of the accent (buttons, selection, the playhead), apart from light and dark: the brand's own, or another. */
export const ACCENTS = [
  { id: 'brand', dark: '', light: '' },
  { id: 'blue', dark: '#5b8def', light: '#2f5fd0' },
  { id: 'green', dark: '#3fb67a', light: '#1f7a4d' },
  { id: 'amber', dark: '#e0a63a', light: '#9a6a0a' },
  { id: 'violet', dark: '#9b7cf0', light: '#6a45c9' },
  { id: 'cyan', dark: '#38bdd6', light: '#0e7f96' },
  { id: 'rose', dark: '#ec6aa5', light: '#b8326f' },
  { id: 'lime', dark: '#c8f501', light: '#5c7300' },
] as const;
export type AccentId = (typeof ACCENTS)[number]['id'];

const ACCENT_KEY = 'lopesfilm.accent';
function savedAccent(): AccentId {
  try {
    const value = localStorage.getItem(ACCENT_KEY);
    return ACCENTS.some((a) => a.id === value) ? (value as AccentId) : 'brand';
  } catch { return 'brand'; }
}
function applyAccent(id: AccentId) {
  if (id === 'brand') delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = id;
}
export function setAccent(id: AccentId) {
  try { localStorage.setItem(ACCENT_KEY, id); } catch { /* not kept past this page */ }
  keepLook({ accent: id });
  applyAccent(id);
  for (const listener of listeners) listener();
}
/** The chosen accent and a way to change it; every user of it sees the change. */
export function useAccent(): [AccentId, (id: AccentId) => void] {
  const id = React.useSyncExternalStore((on) => { listeners.add(on); return () => listeners.delete(on); }, savedAccent, () => 'brand' as AccentId);
  return [id, setAccent];
}

const KEY = 'lopesfilm.theme';
/** the app keeps the choice too (the page's own storage can be lost): main.mjs `desktop:look` */
function keepLook(look: { theme?: string; accent?: string }) {
  try { (window as unknown as { lopesfilmNative?: { look?: { set?: (l: object) => void } } }).lopesfilmNative?.look?.set?.(look); } catch { /* no app */ }
}
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function saved(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'system' || isSkin(value ?? '') ? (value as ThemeMode) : 'dark';
  } catch { return 'dark'; }
}

function apply(mode: ThemeMode) {
  const el = document.documentElement;
  if (isSkin(mode)) { el.dataset.theme = 'dark'; el.dataset.skin = mode; return; }
  delete el.dataset.skin;
  el.dataset.theme = mode === 'system' ? (dark().matches ? 'dark' : 'light') : mode;
}


/* "System" follows the system while Studio is open, not only when it starts */
if (typeof window !== 'undefined') dark().addEventListener('change', () => { if (saved() === 'system') apply('system'); });
/* a theme chosen in another of Studio's pages (another tab of the app, another window) is this one's too */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== ACCENT_KEY) return;
    apply(saved());
    applyAccent(savedAccent());
    for (const listener of listeners) listener();
  });
}

export function setThemeMode(mode: ThemeMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* not kept past this page */ }
  keepLook({ theme: mode });
  apply(mode);
  for (const listener of listeners) listener();
}

/** The chosen theme and a way to change it; every user of it sees the change. */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = React.useSyncExternalStore((on) => { listeners.add(on); return () => listeners.delete(on); }, saved, () => 'dark' as ThemeMode);
  return [mode, setThemeMode];
}

/* a choice already made in this page's storage is handed to the app once, so it has it from now on (never a default:
   an empty storage must not overwrite the choice the app kept) */
if (typeof window !== 'undefined') {
  try {
    const theme = localStorage.getItem(KEY), accent = localStorage.getItem(ACCENT_KEY);
    if (theme || accent) keepLook({ ...(theme ? { theme } : {}), ...(accent ? { accent } : {}) });
  } catch { /* no storage */ }
}
