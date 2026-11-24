// Remotion's API on this page's clock, so a composition written for Remotion draws here. Not Remotion itself: the parts
// that decide a picture from the frame (hooks, Sequence, interpolate, spring, Easing), registerRoot / Composition, and
// the media tags in their simplest form. Sound belongs to the film's timeline, so <Audio> draws nothing.
import React, { useContext, useLayoutEffect, useRef } from 'react';
import { Frame, continueRender, delayRender, mount } from './react.mjs';

export { delayRender, continueRender };
const h = React.createElement;

export const useCurrentFrame = () => useContext(Frame).frame;
export const useVideoConfig = () => useContext(Frame).config;
/** `?props={...}` in the page's address, as `npx remotion render --props` would give. */
export const getInputProps = () => { try { return JSON.parse(new URLSearchParams(location.search).get('props') ?? '{}'); } catch { return {}; } };
/* the folder's root, where public/ is (this file is served from <root>/__film/compat/); the host finds a file in public/ or assets/ */
const rootUrl = () => { try { return new URL('../../', import.meta.url).href; } catch { return ''; } };
export const staticFile = (path) => `${rootUrl()}public/${String(path).replace(/^\/+/, '')}`;
export const getStaticFiles = () => [];
export const watchStaticFile = () => ({ cancel() {} });
export const prefetch = (src) => ({ free() {}, waitUntilDone: () => Promise.resolve(src) });
export const useCurrentScale = () => 1;
export const useDelayRender = () => ({ delayRender, continueRender, cancelRender: (e) => { throw e instanceof Error ? e : new Error(String(e)); } });
export const Internals = {};
export const Config = {};
export const cancelRender = (error) => { throw error instanceof Error ? error : new Error(String(error)); };
export const getRemotionEnvironment = () => ({ isRendering: true, isPlayer: false, isStudio: false, isProduction: true });

export function AbsoluteFill({ style, children, ...rest }) {
  return h('div', { ...rest, style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', ...style } }, children);
}

/** Children see a frame that starts at 0 at `from`; before it and after `durationInFrames` they are not there. */
export function Sequence({ from = 0, durationInFrames = Infinity, children, layout = 'absolute-fill', style, name: _name, premountFor: _p, postmountFor: _q, className, showInTimeline: _s }) {
  const { frame, config } = useContext(Frame);
  const local = frame - from;
  if (local < 0 || local >= durationInFrames) return null;
  const inner = h(Frame.Provider, { value: { frame: local, config: { ...config, durationInFrames: Math.min(durationInFrames, config.durationInFrames - from) } } }, children);
  return layout === 'none' ? inner : h(AbsoluteFill, { style, className }, inner);
}

/** Sequences one after another: `<Series.Sequence durationInFrames offset>` (offset shifts it, negative overlaps). */
export function Series({ children }) {
  let at = 0;
  return h(React.Fragment, null, React.Children.toArray(children).map((child, i) => {
    const { durationInFrames, offset = 0, ...rest } = child.props;
    const from = at + offset;
    at = from + durationInFrames;
    return h(Sequence, { key: i, from, durationInFrames, ...rest });
  }));
}
Series.Sequence = function SeriesSequence({ children }) { return children; };

/** Shows its children at one frame. */
export function Freeze({ frame, children }) {
  const { config } = useContext(Frame);
  return h(Frame.Provider, { value: { frame, config } }, children);
}

/** Repeats its children every `durationInFrames`. */
export function Loop({ durationInFrames, times = Infinity, children, layout = 'absolute-fill' }) {
  const { frame, config } = useContext(Frame);
  if (frame >= durationInFrames * times) return null;
  const inner = h(Frame.Provider, { value: { frame: frame % durationInFrames, config: { ...config, durationInFrames } } }, children);
  return layout === 'none' ? inner : h(AbsoluteFill, null, inner);
}

// ---- numbers -------------------------------------------------------------------------------------------------------

export const Easing = (() => {
  const bezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (u) => ((ax * u + bx) * u + cx) * u, Y = (u) => ((ay * u + by) * u + cy) * u, dX = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) { const e = X(u) - x; if (Math.abs(e) < 1e-6) return Y(u); const d = dX(u); if (Math.abs(d) < 1e-6) break; u -= e / d; }
      let lo = 0, hi = 1; u = x;
      while (lo < hi) { const e = X(u); if (Math.abs(e - x) < 1e-6) break; if (x > e) lo = u; else hi = u; u = (hi - lo) / 2 + lo; if (hi - lo < 1e-9) break; }
      return Y(u);
    };
  };
  const bounce = (t) => t < 1 / 2.75 ? 7.5625 * t * t : t < 2 / 2.75 ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75 : t < 2.5 / 2.75 ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375 : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  const E = {
    linear: (t) => t, ease: bezier(0.42, 0, 1, 1), quad: (t) => t * t, cubic: (t) => t * t * t,
    poly: (n) => (t) => t ** n, sin: (t) => 1 - Math.cos((t * Math.PI) / 2), circle: (t) => 1 - Math.sqrt(1 - t * t),
    exp: (t) => 2 ** (10 * (t - 1)), elastic: (b = 1) => (t) => 1 - Math.cos((t * Math.PI) / 2) ** 3 * Math.cos(t * b * Math.PI),
    back: (s = 1.70158) => (t) => t * t * ((s + 1) * t - s), bounce, bezier,
    in: (f) => f, out: (f) => (t) => 1 - f(1 - t), inOut: (f) => (t) => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2),
  };
  return E;
})();

/** Maps `input` from `inputRange` to `outputRange` (more than two points allowed); beyond the ends: extend, clamp, identity or wrap. */
export function interpolate(input, inputRange, outputRange, options = {}) {
  if (inputRange.length !== outputRange.length) throw new Error('inputRange and outputRange must be the same length');
  const { extrapolateLeft = 'extend', extrapolateRight = 'extend', easing = (t) => t } = options;
  const n = inputRange.length;
  let i = 1;
  while (i < n - 1 && input > inputRange[i]) i++;
  const [a, b] = [inputRange[i - 1], inputRange[i]];
  const [c, d] = [outputRange[i - 1], outputRange[i]];
  let x = input;
  if (x < inputRange[0]) {
    if (extrapolateLeft === 'clamp') x = inputRange[0];
    else if (extrapolateLeft === 'identity') return x;
    else if (extrapolateLeft === 'wrap') { const span = inputRange[n - 1] - inputRange[0]; x = inputRange[n - 1] - ((inputRange[0] - x) % span); }
  } else if (x > inputRange[n - 1]) {
    if (extrapolateRight === 'clamp') x = inputRange[n - 1];
    else if (extrapolateRight === 'identity') return x;
    else if (extrapolateRight === 'wrap') { const span = inputRange[n - 1] - inputRange[0]; x = inputRange[0] + ((x - inputRange[0]) % span); }
  }
  if (a === b) return x <= a ? c : d;
  return c + (d - c) * easing((x - a) / (b - a));
}

const colour = (s) => {
  s = String(s).trim();
  let m = /^#([\da-f]{3,8})$/i.exec(s);
  if (m) {
    let v = m[1];
    if (v.length <= 4) v = [...v].map((x) => x + x).join('');
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), v.length === 8 ? parseInt(v.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error(`interpolateColors: ${s} is not #hex or rgb()`);
};
/** Colours (#hex, rgb(), rgba()) mixed in sRGB, like Remotion's. */
export function interpolateColors(input, inputRange, outputRange) {
  const c = outputRange.map(colour);
  const [r, g, b, a] = [0, 1, 2, 3].map((k) => interpolate(input, inputRange, c.map((x) => x[k]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(4)})`;
}

/** The same number for the same seed, whatever was drawn before (a string or a number). */
export function random(seed) {
  if (seed === null) return Math.random();
  let a = 1779033703 ^ 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 3432918353); a = (a << 13) | (a >>> 19); }
  a = Math.imul(a ^ (a >>> 16), 2246822507); a = Math.imul(a ^ (a >>> 13), 3266489909); a ^= a >>> 16;
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const DEFAULT_SPRING = { damping: 10, mass: 1, stiffness: 100, overshootClamping: false };
function springAt(frame, fps, config) {
  const { damping: c, mass: m, stiffness: k, overshootClamping } = { ...DEFAULT_SPRING, ...config };
  const t = Math.max(0, frame) / fps;
  const zeta = c / (2 * Math.sqrt(k * m)), w0 = Math.sqrt(k / m);
  let x;
  if (zeta < 1) {
    const w1 = w0 * Math.sqrt(1 - zeta * zeta);
    x = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(w1 * t) + ((zeta * w0) / w1) * Math.sin(w1 * t));
  } else if (zeta === 1) {
    x = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  } else {
    const w2 = w0 * Math.sqrt(zeta * zeta - 1);
    x = 1 - Math.exp(-zeta * w0 * t) * (Math.cosh(w2 * t) + ((zeta * w0) / w2) * Math.sinh(w2 * t));
  }
  return overshootClamping ? Math.min(1, x) : x;
}
/** A damped spring from `from` to `to` (0 → 1), starting at frame `delay`; `durationInFrames` stretches it to end there. */
export function spring({ frame, fps, config = {}, from = 0, to = 1, durationInFrames, delay = 0, reverse = false, durationRestThreshold = 0.005 }) {
  let f = frame - delay;
  if (reverse) f = (durationInFrames ?? measureSpring({ fps, config, threshold: durationRestThreshold })) - f;
  if (durationInFrames) f = (f * measureSpring({ fps, config, threshold: durationRestThreshold })) / durationInFrames;
  return from + (to - from) * springAt(f, fps, config);
}
/** How many frames a spring takes to settle within `threshold` of its end. */
export function measureSpring({ fps, config = {}, threshold = 0.005 }) {
  let last = 0;
  for (let f = 0; f < fps * 30; f++) {
    if (Math.abs(1 - springAt(f, fps, config)) > threshold) last = f + 1;
  }
  return last;
}

// ---- media ---------------------------------------------------------------------------------------------------------

/** An image; the frame waits for it (delayRender) unless it already loaded. */
export function Img({ src, onLoad, onError, ...rest }) {
  const ref = useRef(null);
  const hold = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !el.complete) {
      hold.current = delayRender(`Img ${src}`);
      const done = () => { continueRender(hold.current); };
      el.addEventListener('load', done, { once: true });
      el.addEventListener('error', done, { once: true });
    }
  }, [src]);
  return h('img', { ...rest, ref, src, onLoad, onError });
}

/** A video shown at the frame's own time (the file's `startFrom`/`endAt` in frames, `playbackRate`); muted — its sound is the timeline's. */
export function Video({ src, startFrom = 0, playbackRate = 1, style, ...rest }) {
  const { frame, config } = useContext(Frame);
  const ref = useRef(null);
  const time = (startFrom + frame * playbackRate) / config.fps;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = delayRender(`Video ${src}`);
    const go = () => {
      el.currentTime = time + 0.001;
      if (el.seeking) el.addEventListener('seeked', () => continueRender(id), { once: true }); else continueRender(id);
    };
    if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true });
  }, [time, src]);
  return h('video', { ref, src, muted: true, preload: 'auto', style, ...rest });
}
export const OffthreadVideo = Video;
export const Html5Video = Video;
/** Sound belongs to the film's timeline (SPEC §5): put music and voice in film.html; a composition draws no sound. */
export const Audio = () => null;
export const Html5Audio = Audio;
export const Artifact = () => null;
export const IFrame = ({ src, ...rest }) => h('iframe', { src, ...rest });
export const AnimatedImage = Img;

// ---- the project's entry ------------------------------------------------------------------------------------------

const found = [];
/** Remotion's <Composition>: registerRoot reads these; drawn alone it draws nothing. */
export function Composition(props) { found.push(props); return null; }
export const Still = (props) => Composition({ durationInFrames: 1, fps: 30, ...props });
export function Folder({ children }) { return children ?? null; }

/**
 * Remotion's registerRoot: renders `Root` once to read its <Composition>s, then draws the one asked for
 * (`?composition=id` in the page's address, else the one named like the page's file: `Intro.html` draws `Intro`, else the
 * first) with that composition's size, rate and length. A film.html clip's src has no query, so the file name is how a
 * film picks a composition: `<iframe src="remo/Intro.html">`.
 */
export function registerRoot(Root, options = {}) {
  const probe = document.createElement('div');
  found.length = 0;
  const m = mount(h(Root), { root: probe });
  m.unmount();
  const wanted = options.composition ?? new URLSearchParams(location.search).get('composition');
  const file = decodeURIComponent(location.pathname.split('/').pop() ?? '').replace(/\.html?$/i, '').toLowerCase();
  const c = found.find((x) => x.id === wanted) ?? (wanted ? null : found.find((x) => String(x.id).toLowerCase() === file)) ?? found[0];
  if (!c) throw new Error('registerRoot: no <Composition> found in the root');
  const Component = c.component ?? (() => c.lazyComponent?.());
  return mount(h(Component, c.defaultProps ?? {}), {
    id: c.id, fps: c.fps ?? 30, width: c.width, height: c.height, fit: true, durationInFrames: c.durationInFrames ?? 1, props: c.defaultProps,
  });
}

export { Frame as RemotionContext };
