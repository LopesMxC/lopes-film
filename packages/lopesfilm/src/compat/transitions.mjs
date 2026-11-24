// @remotion/transitions: scenes that overlap while a presentation (fade, slide, wipe …) plays over the overlap.
import React, { useContext } from 'react';
import { Frame } from './react.mjs';
import { AbsoluteFill, Sequence, measureSpring, spring } from './remotion.mjs';

const h = React.createElement;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export const linearTiming = ({ durationInFrames, easing = (t) => t }) => ({
  getDurationInFrames: () => durationInFrames,
  getProgress: ({ frame }) => easing(clamp01(frame / durationInFrames)),
});
export const springTiming = ({ config = {}, durationInFrames: forced, durationRestThreshold, reverse = false } = {}) => ({
  getDurationInFrames: ({ fps }) => forced ?? measureSpring({ fps, config, threshold: durationRestThreshold }),
  getProgress: ({ frame, fps }) => {
    const d = forced ?? measureSpring({ fps, config, threshold: durationRestThreshold });
    const p = spring({ frame, fps, config, durationInFrames: forced, durationRestThreshold, reverse });
    return clamp01(frame >= d ? 1 : p);
  },
});

function Transition() { return null; }
function TSequence({ children }) { return children; }
Transition.displayName = 'TransitionSeries.Transition';
TSequence.displayName = 'TransitionSeries.Sequence';

/** Sequence, Transition, Sequence …: each scene starts where the one before ends, less the overlap a transition between them takes. */
export function TransitionSeries({ children, style, className, name }) {
  const { frame, config } = useContext(Frame);
  const items = React.Children.toArray(children).filter(Boolean);
  const scenes = [];
  let at = 0;
  let pending = null;
  for (const item of items) {
    const kind = item.type === Transition || item.type?.displayName === Transition.displayName ? 'transition' : 'sequence';
    if (kind === 'transition') { pending = item.props; continue; }
    const { durationInFrames, offset = 0 } = item.props;
    let enter = null;
    if (pending && scenes.length) {
      const d = pending.timing.getDurationInFrames({ fps: config.fps });
      enter = { ...pending, d };
      at -= d;
      scenes[scenes.length - 1].leave = enter;
    }
    pending = null;
    const start = at + offset;
    scenes.push({ item, start, duration: durationInFrames, enter, leave: null });
    at = start + durationInFrames;
  }
  const wrap = (scene, local, node) => {
    const parts = [];
    if (scene.enter && local < scene.enter.d) parts.push({ t: scene.enter, direction: 'entering', f: local });
    if (scene.leave && local >= scene.duration - scene.leave.d) parts.push({ t: scene.leave, direction: 'exiting', f: local - (scene.duration - scene.leave.d) });
    return parts.reduce((inner, { t, direction, f }) => {
      const P = t.presentation?.component ?? ((p) => p.children);
      return h(P, { presentationProgress: t.timing.getProgress({ frame: f, fps: config.fps }), presentationDirection: direction,
        presentationDurationInFrames: t.d, passedProps: t.presentation?.props ?? {}, children: inner });
    }, node);
  };
  return h(AbsoluteFill, { style, className, name }, scenes.map((scene, i) => {
    const local = frame - scene.start;
    if (local < 0 || local >= scene.duration) return null;
    const inner = h(Frame.Provider, { value: { frame: local, config: { ...config, durationInFrames: scene.duration } } },
      h(AbsoluteFill, { style: scene.item.props.style, className: scene.item.props.className }, scene.item.props.children));
    return h(React.Fragment, { key: i }, wrap(scene, local, inner));
  }));
}
TransitionSeries.Sequence = TSequence;
TransitionSeries.Transition = Transition;
/** The overlap's length of the whole series (scenes' total less the transitions'): `calculateTransitionDuration`-style helper. */
export const useTransitionProgress = () => ({ isInTransition: false, progress: 0 });
export { Sequence };
