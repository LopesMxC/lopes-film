// @remotion/lottie: a Lottie animation drawn at the frame's own time (lottie-web, light build, bundled here).
import React, { useContext, useEffect, useRef } from 'react';
import lottie from './vendor/lottie.mjs';
import { Frame, continueRender, delayRender } from './react.mjs';

const h = React.createElement;
export const getLottieMetadata = (data) => {
  const fps = data.fr ?? 30, frames = (data.op ?? 0) - (data.ip ?? 0);
  return { width: data.w, height: data.h, fps, durationInFrames: Math.max(1, Math.floor(frames)), durationInSeconds: frames / fps };
};
export function Lottie({ animationData, playbackRate = 1, loop = false, direction = 'forward', style, className, renderer = 'svg', onAnimationLoaded }) {
  const { frame, config } = useContext(Frame);
  const box = useRef(null);
  const anim = useRef(null);
  const hold = useRef(0);
  useEffect(() => {
    hold.current = delayRender('Lottie');
    const a = lottie.loadAnimation({ container: box.current, renderer, loop: false, autoplay: false, animationData });
    anim.current = a;
    const ready = () => { continueRender(hold.current); onAnimationLoaded?.(a); draw(a); };
    a.addEventListener('DOMLoaded', ready);
    return () => { a.destroy(); anim.current = null; };
  }, [animationData]);
  const draw = (a) => {
    const total = a.totalFrames, rate = a.frameRate || 30;
    let f = (frame / config.fps) * playbackRate * rate;
    if (direction === 'backward') f = total - f;
    f = loop ? ((f % total) + total) % total : Math.min(Math.max(f, 0), total - 1);
    a.goToAndStop(f, true);
  };
  useEffect(() => { if (anim.current?.isLoaded) draw(anim.current); });
  return h('div', { ref: box, style, className });
}
