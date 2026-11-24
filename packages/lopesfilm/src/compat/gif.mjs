// @remotion/gif: an animated GIF drawn at the frame's own time (the browser's ImageDecoder).
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Frame, continueRender, delayRender } from './react.mjs';

const h = React.createElement;
const cache = new Map();
async function frames(src) {
  if (!cache.has(src)) {
    cache.set(src, (async () => {
      const res = await fetch(src);
      const dec = new ImageDecoder({ data: res.body, type: 'image/gif' });
      await dec.tracks.ready;
      const count = dec.tracks.selectedTrack.frameCount, out = [];
      for (let i = 0; i < count; i++) { const { image } = await dec.decode({ frameIndex: i }); out.push({ image, ms: Math.max(10, (image.duration ?? 100000) / 1000) }); }
      return out;
    })());
  }
  return cache.get(src);
}
export function Gif({ src, width, height, fit = 'fill', playbackRate = 1, loopBehavior = 'loop', style, className }) {
  const { frame, config } = useContext(Frame);
  const canvas = useRef(null);
  const [list, setList] = useState(null);
  useEffect(() => {
    const hold = delayRender(`Gif ${src}`);
    frames(src).then(setList, (e) => { throw e; }).finally(() => continueRender(hold));
  }, [src]);
  useEffect(() => {
    if (!list || !canvas.current) return;
    const total = list.reduce((s, f) => s + f.ms, 0);
    let t = ((frame / config.fps) * 1000 * playbackRate);
    t = loopBehavior === 'loop' ? t % total : Math.min(t, total - 1);
    let i = 0;
    while (i < list.length - 1 && t >= list[i].ms) { t -= list[i].ms; i++; }
    const img = list[i].image, c = canvas.current, g = c.getContext('2d');
    c.width = img.displayWidth; c.height = img.displayHeight;
    g.drawImage(img, 0, 0);
  });
  return h('canvas', { ref: canvas, className, style: { width, height, objectFit: fit, ...style } });
}
