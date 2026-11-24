# React and other libraries in a page

A page is a function of `t` (SPEC §3). A library that keeps its own clock (React state, a GSAP ticker, a Lottie player)
is put under that rule by a small layer the host serves beside every page. Nothing is loaded unless the page asks.

Two ways to load it. Pick one per page.

**A script tag** (globals `React`, `ReactDOM`, `Remotion`, `FilmCompat`, `htm`):

```html
<script src="__film/compat.js"></script>
<script>
  const { html, mount } = FilmCompat;
  const { useCurrentFrame, interpolate } = Remotion;
  function Title() {
    const f = useCurrentFrame();                       // t × fps, fractions kept
    return html`<h1 style=${{ opacity: interpolate(f, [0, 20], [0, 1], { extrapolateRight: 'clamp' }) }}>Hello</h1>`;
  }
  mount(Title, { fps: 30, duration: 4 });              // sets film.duration too
</script>
```

**Modules with an import map** (the paths start with `./`):

```html
<script type="importmap">{"imports":{
  "react":"./__film/compat/react.mjs","react-dom":"./__film/compat/react-dom.mjs",
  "react-dom/client":"./__film/compat/react-dom-client.mjs","react/jsx-runtime":"./__film/compat/jsx-runtime.mjs",
  "remotion":"./__film/compat/remotion.mjs","film-compat":"./__film/compat/film-compat.mjs"}}</script>
<script type="module">
  import React from 'react';
  import { registerRoot, Composition, AbsoluteFill, useCurrentFrame } from 'remotion';
  …
  registerRoot(Root);   // draws the <Composition> named by ?composition=id, else the one named like the page file (Intro.html → Intro), else the first, at its own size, scaled to fit
</script>
```

**TSX, JSX and TypeScript need no compile.** The host translates `.tsx`, `.jsx`, `.ts` (and a `.js` that imports React or
Remotion) when a page asks for them (`src/code-modules.mjs`, sucrase vendored in `src/compat/vendor`):

- `react`, `react-dom`, `remotion`, `@remotion/*` resolve to the layer from any file, and a page that names them gets the
  import map by itself (a page that has its own import map keeps it);
- `./Title` finds `Title.tsx` (or `.ts`, `.jsx`, a folder's `index`); `import './a.css'`, `import d from './d.json'`, and
  `import logo from './logo.png'` give a stylesheet put in the page, the data, and the file's address;
- a bare name the project carries (`assets/vendor/<name>.module.js`) is found, so `import * as THREE from 'three'` works;
- `<script type="text/tsx">…</script>` (or `text/jsx`) in a page is translated into a module script;
- `staticFile('x')` is `public/x`; a file in `public/` or `assets/` is found under either name;
- a Google font (`@remotion/google-fonts/Inter`) is fetched once into `~/.lopesfilm/cache/gfonts` and served from there.

Not compiled: Tailwind, PostCSS, CSS modules, decorators beyond what TypeScript's syntax strips, type checking.

## What is there

- **React 19**: `mount(componentOrElement, { fps, duration | durationInFrames, width, height, fit, root, props })`.
  Every `film.frame(t)` renders synchronously (`flushSync`) at frame `t × fps` and waits for `delayRender` holds.
- **Remotion API**: `useCurrentFrame`, `useVideoConfig`, `AbsoluteFill`, `Sequence`, `Series`, `Freeze`, `Loop`,
  `interpolate`, `interpolateColors`, `spring`, `measureSpring`, `Easing`, `random`, `Img`, `Video`/`OffthreadVideo`
  (muted, seeked to the frame), `staticFile`, `delayRender`/`continueRender`, `registerRoot`, `Composition`, `Still`.
  `Audio` draws nothing: sound belongs to the film's timeline. Not there: `<Player>`, Tailwind, React Three Fiber.
- **`@remotion/*` packages**: `transitions` (+ `/fade /slide /wipe /flip /clock-wipe /iris /none`), `shapes`, `paths`, `noise`,
  `media-utils`, `layout-utils`, `animation-utils`, `captions`, `motion-blur`, `lottie`, `gif`, `preload`, `google-fonts/<Name>`.
  Another one fails at import with a message saying it is not in the layer. Where Remotion's own numbers are not
  reproducible (`noise`, `visualizeAudio`), the layer's are the same kind, not the same values.
- **Adapters** (`FilmCompat`, all in `film-compat`): `gsap(timeline?)`, `anime(...instances)`, `lottie(animation)`,
  `three(renderer, scene, camera, update?)`, and `onFrame(fn)` for anything else (`fn(t)` is called for every frame).

```js
FilmCompat.gsap(tl);                        // tl = gsap.timeline(); paused, then tl.time(t)
FilmCompat.gsap();                          // tweens made so far outside a timeline, moved to 0 (call right after making them)
FilmCompat.anime(anime.animate(…, { autoplay: false }));
FilmCompat.lottie(lottie.loadAnimation({ …, autoplay: false }));
FilmCompat.three(renderer, scene, camera, (t) => mixer.setTime(t));   // renderer: { preserveDrawingBuffer: true }
```

Opened as an ordinary web page (no host) the same page plays itself in a loop.

## Rules that still hold

- Give GSAP tweens explicit start and end values (`fromTo`): a `to` remembers what was on screen the first time it ran.
- Keep React state out of the picture: anything that depends on history (a counter in `useState` updated by a timer or an
  effect) is not a function of `t`. Derive it from `useCurrentFrame()`.
- Load libraries from files in the project, not a CDN: the film must render offline.
- The layer is built into `src/compat/built` (`node scripts/build-compat.mjs`) and served at `__film/compat.js` and
  `__film/compat/*.mjs`. htm, sucrase and lottie-web (all MIT) are vendored in `src/compat/vendor`.
