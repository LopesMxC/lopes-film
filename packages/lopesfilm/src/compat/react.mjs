// React under the page's clock: `mount` draws one React tree, and the frame it is given is a function of t.
import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import htm from './vendor/htm.mjs';
import { configure, onFrame, waitFor } from './core.mjs';

/** What `useCurrentFrame` and `useVideoConfig` read: the frame is t × fps (fractions kept, so motion blur sees them). */
export const Frame = createContext(/** @type {{ frame: number, config: { id: string, width: number, height: number, fps: number, durationInFrames: number, defaultProps: object } }} */ ({
  frame: 0, config: { id: 'film', width: 1920, height: 1080, fps: 30, durationInFrames: 1, defaultProps: {} },
}));

/** `html\`<${Box} x=${1}>text</${Box}>\`` — JSX's shape without a build step (htm, bound to React). */
export const html = htm.bind(React.createElement);

const holds = new Map();
let holdId = 0;
/** Remotion's delayRender: the frame is not complete until every hold is let go (`continueRender`). */
export function delayRender(label = '') {
  const id = ++holdId;
  holds.set(id, label);
  return id;
}
export function continueRender(id) { holds.delete(id); }

async function settled(limitMs = 30000) {
  const end = Date.now() + limitMs;
  while (holds.size) {
    if (Date.now() > end) throw new Error(`delayRender not continued within ${limitMs / 1000} s: ${[...holds.values()].join(', ') || '(no label)'}`);
    await new Promise((r) => setTimeout(r, 8));
  }
}

/**
 * Draws `element` (a React element, or a component) at every frame of the film.
 * @param {React.ReactNode | React.ComponentType<any>} what
 * @param {{ fps?: number, width?: number, height?: number, duration?: number, durationInFrames?: number, fit?: boolean, id?: string, props?: object, root?: Element }} [options]
 *   `duration` in seconds or `durationInFrames`; the page's `film.duration` follows it. `root`: where it is drawn (a new full-page div by default). `fit`: with `width` and `height`, lay it out at that size and scale it into the page.
 */
export function mount(what, options = {}) {
  const fps = options.fps ?? 30;
  const durationInFrames = options.durationInFrames ?? (options.duration ? Math.round(options.duration * fps) : 1);
  const config = {
    id: options.id ?? 'film', fps, durationInFrames, defaultProps: options.props ?? {},
    width: options.width ?? window.innerWidth, height: options.height ?? window.innerHeight,
  };
  let root = options.root;
  if (!root) {
    root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;overflow:hidden';
    document.body.append(root);
  }
  if (options.fit && options.width && options.height) {
    /* drawn at its own size, as a composition lays itself out, and scaled into the page */
    const box = document.createElement('div');
    const place = () => {
      const k = Math.min(innerWidth / options.width, innerHeight / options.height);
      box.style.cssText = `position:absolute;left:${(innerWidth - options.width * k) / 2}px;top:${(innerHeight - options.height * k) / 2}px;`
        + `width:${options.width}px;height:${options.height}px;transform:scale(${k});transform-origin:0 0;overflow:hidden`;
    };
    place();
    addEventListener('resize', place);
    root.append(box);
    root = box;
  }
  const reactRoot = createRoot(root);
  let set = () => {};
  const element = typeof what === 'function' ? React.createElement(what, config.defaultProps) : what;
  const Clock = () => {
    const [frame, setFrame] = useState(0);
    useLayoutEffect(() => { set = setFrame; });
    return React.createElement(Frame.Provider, { value: { frame, config } }, element);
  };
  /* the first render is made now, so `film.ready` can wait for what it holds (images, delayRender) */
  flushSync(() => reactRoot.render(React.createElement(Clock)));
  configure({ duration: durationInFrames / fps });
  const off = onFrame(async (t) => {
    flushSync(() => set(t * fps));
    await new Promise((r) => queueMicrotask(r));
    await settled();
  });
  waitFor(() => settled());
  return { unmount() { off(); reactRoot.unmount(); }, config };
}
