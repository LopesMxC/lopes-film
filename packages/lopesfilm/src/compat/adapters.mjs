// Libraries that keep their own time, put under the page's: each is told t instead of running by itself.
import { onFrame, waitFor } from './core.mjs';

const lib = (name) => window[name];

/**
 * GSAP. With a timeline (`gsap.timeline()`, the exact way): it is paused and set to t. Without: every tween made with
 * gsap.to / fromTo … outside a timeline, which GSAP starts at the moment it was made; they are moved back to start at 0,
 * so call this right after making them. GSAP's own clock is stopped (`lagSmoothing(0)`, no ticker).
 * Give tweens explicit start and end values (`fromTo`): a `to` remembers whatever was on screen the first time it ran.
 */
export function gsap(timeline, g = lib('gsap')) {
  /* imported as a module (`import { gsap } from 'gsap'`) GSAP is no global: a timeline given is all it needs */
  if (!g && timeline) { timeline.pause(); return onFrame((t) => { timeline.time(t, false); }); }
  if (!g) throw new Error('gsap is not loaded: load it before the page uses FilmCompat.gsap (or give it the timeline, or the gsap you imported as its second argument)');
  g.ticker.lagSmoothing(0);
  let tl = timeline;
  if (tl) tl.pause();
  else {
    /* the root timeline drops what has finished, so a seek back would find nothing: its tweens go into a timeline of their own */
    const root = g.globalTimeline;
    g.ticker.remove(g.updateRoot);
    const base = root.time();
    tl = g.timeline({ paused: true });
    for (const child of root.getChildren(false, true, true)) if (child !== tl) tl.add(child, Math.max(0, child.startTime() - base));
  }
  return onFrame((t) => { tl.time(t, false); });
}

/** anime.js (v3 and v4): every instance given is paused and sought to t. */
export function anime(...instances) {
  const list = instances.flat();
  for (const a of list) a.pause?.();
  return onFrame((t) => { for (const a of list) a.seek(t * 1000); });
}

/** lottie-web: the animation is drawn at t (milliseconds from its first frame). Waits for the file to load. */
export function lottie(animation) {
  animation.pause?.();
  if (animation.isLoaded === false) {
    waitFor(new Promise((done) => {
      animation.addEventListener('DOMLoaded', done);
      animation.addEventListener('data_ready', done);
    }));
  }
  /* past its last frame lottie draws nothing new: the end stays at the last frame */
  const last = () => ((animation.totalFrames || 1) - 1) / (animation.frameRate || 30) * 1000;
  return onFrame((t) => { animation.goToAndStop(Math.min(t * 1000, last()), false); });
}

/**
 * Three.js. `update(t)` moves the scene (a mixer's `setTime(t)`, a camera path), then the frame is rendered. Make the
 * renderer with `preserveDrawingBuffer: true` (SPEC §2), and do not call `renderer.setAnimationLoop` yourself.
 */
export function three(renderer, scene, camera, update) {
  renderer.setAnimationLoop?.(null);
  return onFrame((t) => { update?.(t); renderer.render(scene, camera); });
}
