---
name: gsap
description: GSAP in a film page: titles, kinetic type, logo reveals, SVG drawing and morphing, motion paths, split text, scrambled text, physics, with every GSAP plugin served by Studio offline. Read it when a page animates with GSAP, when the person names GSAP or one of its plugins (SplitText, MorphSVG, DrawSVG, MotionPath, ScrambleText, Physics2D, CustomEase…), or when a title needs per-letter or per-line motion.
category: customize
---

# GSAP in a film page

A film page is a function of time (the motion skill): GSAP does not run on its own clock here. Build **one timeline**,
hand it to `FilmCompat.gsap(tl)`, and Studio sets it to the film's time on every frame, so preview and export match to
the frame.

## Loading it (no network: Studio serves GSAP 3.15 and every plugin)

As modules (preferred). The page gets the import map by itself:

```html
<script type="module">
  import { gsap } from 'gsap';
  import { SplitText } from 'gsap/SplitText';
  import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
  import * as FilmCompat from 'film-compat';
  gsap.registerPlugin(SplitText, DrawSVGPlugin);

  const tl = gsap.timeline();
  const title = SplitText.create('#title', { type: 'chars,words' });
  tl.fromTo(title.chars, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.03 }, 0)
    .fromTo('#line path', { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.2, ease: 'power2.inOut' }, 0.2);
  FilmCompat.gsap(tl);
</script>
```

As plain scripts: `<script src="__film/gsap/umd/gsap.min.js"></script>`, then each plugin as
`__film/gsap/umd/<Plugin>.min.js` (e.g. `SplitText.min.js`), then `<script src="__film/compat.js"></script>` and
`FilmCompat.gsap(tl)`. A page in a folder names them with the way up (`../__film/…`). Never load GSAP from a CDN.

## Rules that keep it exact

- **One `gsap.timeline()` per page**, every tween added to it with a position (`0`, `'<'`, `'+=0.2'`, a label), and
  `FilmCompat.gsap(tl)` once at the end. Two timelines: nest one in the other (`tl.add(other, 1.5)`).
- **`fromTo` always**: a `to` remembers whatever was on screen when it first ran, and frames are not drawn in order.
- No `repeat: -1`, no `yoyo` forever, no `onComplete` that starts something: give the timeline its real length; a loop is
  `repeat: n` with a finite n.
- No `gsap.delayedCall`, `setTimeout`, `requestAnimationFrame` or `ticker` for timing: the film's time is the only clock.
- Randomness is computed once, before the timeline is built, from a seeded generator of your own (`gsap.utils.random` has no seed): the same values on every frame and every export.
- SplitText: split once, after fonts load (`await document.fonts.ready`), before building the timeline.
- Physics2D / PhysicsProps / Inertia work: they are tweens with a computed path, so they seek like any other.

## Plugins, and which make sense in a film

| Use them | What for |
|---|---|
| SplitText | per-letter, word or line reveals, masks (`mask: 'lines'`) |
| DrawSVG | strokes drawing on (logos, underlines, maps) |
| MorphSVG | one shape becoming another |
| MotionPath (+ MotionPathHelper while drafting) | things travelling along a curve, with `autoRotate` |
| ScrambleText, Text | decoding, typing text |
| CustomEase, CustomBounce, CustomWiggle, EasePack (RoughEase, SlowMo, ExpoScaleEase) | the feel of a move |
| Physics2D, PhysicsProps, Inertia | throws, falls, confetti that lands |
| Flip | a layout that rearranges (record state, change, `Flip.from`) inside the timeline |
| Pixi, Easel | when the page draws on a PixiJS / EaselJS canvas |

Not for a film (nothing scrolls, drags or is clicked in a video): ScrollTrigger, ScrollSmoother, ScrollTo, Draggable,
Observer, GSDevTools. A scroll-driven idea becomes a timeline that moves the same things over time.

## Reference

The official GSAP skills (GreenSock, MIT) are in `reference/`: `gsap-core.md` (tweens, easing, stagger),
`gsap-timeline.md` (position parameter, labels, nesting), `gsap-plugins.md` (every plugin's options),
`gsap-utils.md` (`clamp`, `mapRange`, `snap`, `random`, `wrap`…) and `gsap-performance.md`. Read the one the job needs;
where they speak of scroll, React hooks or the browser's clock, the rules above win.

GSAP is free to use with all its plugins (GSAP's Standard "No Charge" License, gsap.com/standard-license).
