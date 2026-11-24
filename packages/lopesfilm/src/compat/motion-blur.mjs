// @remotion/motion-blur: the last frames drawn faintly behind the current one (Trail), or several moments inside a frame mixed (CameraMotionBlur).
import React, { useContext } from 'react';
import { Frame } from './react.mjs';
import { AbsoluteFill } from './remotion.mjs';

const h = React.createElement;
const at = (frame, ctx, node, key, opacity) => h(Frame.Provider, { key, value: { ...ctx, frame } }, h(AbsoluteFill, { style: { opacity } }, node));
export function Trail({ children, layers, lagInFrames, trailOpacity }) {
  const ctx = useContext(Frame);
  return h(AbsoluteFill, null, Array.from({ length: layers }, (_, i) => layers - 1 - i).map((i) => at(ctx.frame - i * lagInFrames, ctx, children, i, i === 0 ? 1 : trailOpacity)));
}
export function CameraMotionBlur({ children, shutterAngle = 180, samples = 10 }) {
  const ctx = useContext(Frame);
  const spread = shutterAngle / 360;
  /* painted one over another with 1/(n+1) opacity each: the mean of the samples */
  return h(AbsoluteFill, null, Array.from({ length: samples }, (_, i) => at(ctx.frame + (i / samples - 0.5) * spread, ctx, children, i, 1 / (i + 1))));
}
