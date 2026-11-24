---
name: motion
description: Motion graphics as code in a page: titles, lower thirds, kinetic type, data animations, scene-by-scene compositions with React, GSAP, anime.js, Lottie or three.js. Use when the person asks for animated graphics, an intro, an explainer, animated charts or a React/Remotion-style composition.
category: customize
---

# Motion that is a function of t

A motion piece is one page (a clip, `<iframe src="title.html">` in film.html) that draws any moment `t`. The host
serves a layer for it (`COMPAT.md` in the Lopes.Film package): React, a Remotion-shaped API (`useCurrentFrame`,
`Sequence`, `interpolate`, `spring`, `Easing`, `registerRoot`) and adapters for GSAP, anime.js, Lottie and three.js.
Load it with `<script src="__film/compat.js"></script>` and write `React.createElement` or the `html` tag in a plain page,
or write `.tsx`/`.jsx` files and import `react` and `remotion`: the host translates them as they are asked for
(`lopesfilm skill remotion`). Do not load a library from a CDN: copy it into the project.

## Pick the tool by the job

- **Layout that changes with time, data, many parts**: React + `mount`. Every frame is derived from `useCurrentFrame()`.
- **A hand-timed sequence of tweens**: GSAP, one `gsap.timeline()` per page, `FilmCompat.gsap(tl)`, every tween a `fromTo`. Studio serves GSAP and every plugin offline (`import { gsap } from 'gsap'`, `gsap/SplitText`…): the gsap skill.
- **Small property animations**: CSS `@keyframes` or `animation-delay`. The host holds CSS and WAAPI at `t` already; no layer needed.
- **Vector illustration from a designer**: Lottie, `FilmCompat.lottie(anim)`. **3D**: three.js, `FilmCompat.three(...)`.
- **Anything with history** (a trail, a physics run, a counter): compute it from `t`, or precompute once before the first frame.

## Make it good

1. **One idea per shot, two seconds to read it.** A title needs about 0.3 s per word plus a second to land. Cut text before you speed it up.
2. **Ease everything.** Movement in uses ease-out, movement out uses ease-in, a move on screen ease-in-out. Linear is for
   loops and scrubbing. A spring (`damping` 14–20, `stiffness` 120–180) for things that arrive; `damping` 200 for no bounce.
3. **Stagger, do not sync.** Parts of a group start 3–6 frames apart (at 30 fps), in reading order, with `delay = i * step`.
   Anything that moves more than 40% of the screen is slower than something that moves 5%.
4. **Anticipate and settle.** Large moves have a small move the other way first, and end 2–4% past the target, then rest.
5. **Hold.** Every state rests for at least half a second before the next begins. Motion is the exception, stillness the frame.
6. **Hierarchy by motion.** One element moves at a time in the foreground; the background drifts at a fifth of the speed.
7. **Type**: two sizes at most per frame, the headline at 6–9% of the frame height, safe margins of 5% (8% on vertical video).
   Check contrast over footage; put text on a scrim or a blur, not on a busy picture.
8. **Colour from the project**: take the accent from the brand or the footage; neutral base, one accent, no gradients by habit.
9. **Number animations** count with `Math.round(interpolate(...))`; use tabular numerals (`font-variant-numeric: tabular-nums`) so the digits do not jitter.
10. **Loop-safe ends.** The last frame equals the first when the piece is meant to loop; otherwise it ends on a held, readable frame.

## Structure a composition

- Time in **seconds** in the plan, frames in the code: `const S = (s) => s * fps`.
- A scene is a component that takes its own local frame (`<Sequence from={S(2)} durationInFrames={S(3)}>`); scenes never read the global frame.
- Put every number (timings, sizes, colours) in one `const T = { … }` at the top, so a revision is one edit.
- Overlap scenes by 6–10 frames with a cross-fade or a shared moving element; hard cuts are for beats of the music.
- Give the page `film.duration` (`mount` does) and the stage's aspect: lay out in `%`/`vw`/`vh` or use `registerRoot` with `width`/`height`
  so 16:9, 9:16 and 1:1 are one change.

## Rules that keep it correct

- A frame is a function of `t` and of nothing drawn before it. No `setInterval`, no `useState` driven by timers or effects, no
  `Math.random()` (use `random('seed')`), no `Date.now()` for animation.
- Wait for what it needs: fonts (`document.fonts.load('700 64px Name')` inside `delayRender`), images (`Img`), models.
- Sound is not in the page: music and effects go on the film's timeline (`lopesfilm skill media`).
- Look before you say it is done: `lopesfilm look` at the first frame, the middle of each scene, and the last. Check the
  frame at `t = 0` and at the exact boundary between scenes; those are where it breaks.

## When it does not work

- Blank page: the layer did not load (the path is `__film/compat.js`, relative to the page), or `film.ready` waits for a
  `delayRender` never continued (the error names it after 30 s).
- A GSAP tween ends up in the wrong place: it was a `to`; make it `fromTo`.
- WebGL draws empty: the renderer needs `preserveDrawingBuffer: true`.
- It differs between renders: something reads a real clock or `Math.random()`.

## Matching a reference
When a film must move like another one, do not guess the feel: `lopesfilm measure curve <video> --start a --end b --roi x,y,w,h`
gives the start, duration, overshoot and the closest ease (with its `cubic-bezier`), and `measure ink` the type size. Use those
numbers, then measure your own render the same way. The `recreate` skill has the whole method.

## Audio spectrum (the circular one of Premiere and DaVinci Resolve)

For a music visualizer, a podcast or a voice-over over a picture, do not draw bars from a made-up curve: copy `audio-spectrum-circular.html` (next to this file in the manual's folder) into the project and use it as a clip over the picture. It reads the real sound (the file is decoded once; each frame is an FFT, so it is the same on scrub, preview and export), draws mirrored radial bars around a ring with peak dots and glow, and has a transparent background. Set `data-audio="assets/audio/<file>"` (and `data-offset` seconds if the clip starts later in the sound) on its `<body>`, and `--c1`/`--c2`, `--bars`, `--radius`, `--reach`, `--sens`, `--spin` as CSS variables for the look. Set `film.duration` to the clip's length.


## After Effects-style motion with Skill de Motion (the effectcraft verb)

Use it when a title, lower third, logo sting, shape animation or effect needs to look like After Effects work. For plain HTML/CSS/GSAP titles the design skill is quicker; Skill de Motion is for what those cannot do (300+ effects, glows, blurs, particles, 3D layers, expressions).

## The flow

1. `get effectcraft --commands layer` lists the commands of a family (`comp`, `layer`, `effect`, `keyframe`…) with their parameters. Look before you guess a parameter name.
2. Build and render in one call with `--steps` (a JSON list run in order). The first step makes the composition:

```
get effectcraft --out titulo --steps '[
  {"id":"comp.new","params":{"name":"Main","width":1920,"height":1080,"frameRate":30,"duration":4}},
  {"id":"layer.newText","params":{"text":"Lopes","size":160,"fill":[1,1,1,1],"position":[960,540]}}
]'
```

3. The result is `assets/video/titulo.webm`, VP9 with a **transparent** background. Lay it over the film as a `<video>` clip on a track above the footage. `--format mov` gives ProRes 4444 (also transparent, large); `--format mp4` is opaque.
4. The project is kept at `assets/motion/<out>.ecproj`. To change it, call again with the same `--out` (or `--project`) and only the new steps: they are added to what is there.

## Rules

- Colours are `[r,g,b,a]` from 0 to 1. Positions are pixels from the top left of the composition.
- Make the composition the size of the film (read it from the project) and the frame rate too.
- Keep titles short and the animation under 5 s. Check the first render before making more: the render is on the CPU, a 4 s 1080p clip takes a few seconds to a minute.
- `--script file.jsx` runs a script with the After Effects object model instead of steps, for what is easier to write as code (loops over many layers).
- Say what was made and where; if the program is not fetched yet the first call fetches it (about 60 MB).

## 3D models (.glb, .gltf, .fbx)
Put a model on the timeline like any file (`lopesfilm edit '[{"op":"insert","clip":{"src":"assets/models/car.glb","time":[0,5]}}]'`, or a drag in Studio): Studio makes `scenes/3d-<name>.html`, a page that shows it with three.js (served offline, `__film/three/three-model.mjs`: `THREE`, `GLTFLoader`, `FBXLoader`, `DRACOLoader`, `RoomEnvironment`), lit, framed to fit, over a transparent background, its own animation played on the film's time and turning slowly. Make it do what the film needs by editing that page: the constants at its top (`TURN`, `CAMERA`, `CLIP`, `SCALE`, `LIGHT`), or its update function for camera moves, a reveal, text beside it. Everything moves from `t` alone (`FilmCompat.three`), never from a clock.

