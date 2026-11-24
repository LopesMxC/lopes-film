---
name: lopesfilm-3d
description: 3D elements in a Lopes.Film film from a .glb or .gltf file the person drops in (a model, a product, a character, a set). Read it when the person adds, mentions or asks for a 3D model, a .glb, a rotating object or a 3D scene.
category: function
---

# 3D from a .glb

A `.glb` goes in the project's `assets/` folder like any file; the host serves it (`model/gltf-binary`). A page draws
it with three.js, still one shot per page and still **a pure function of t**.

## The page

- Load three.js and `GLTFLoader` from a file in the project (`assets/vendor/three.module.js`, `GLTFLoader.js`); copy them
  from the `three` package with `npm pack three` if they are not there. Never from a CDN: the film must render offline.
- Make the renderer once: `new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: true })`,
  `setPixelRatio(1)`, sized to the stage.
- Load the model once, before the first frame: `frame(t)` returns a Promise that awaits the load, so the picture is
  never captured empty.
- `frame(t)` sets everything from t, then renders once: the model's rotation (`rotation.y = t * speed`), the camera, the
  light, an animation clip (`mixer.setTime(t)`, never `mixer.update(dt)`). No `requestAnimationFrame`, no clock, no
  `Math.random()` (a seeded one is fine).
- Fit it: compute `Box3().setFromObject(model)`, centre it, and put the camera at a distance that frames its size, so
  any model fits the stage.
- Light it: an `HemisphereLight` plus one `DirectionalLight`; a model with no light is black.
- A person may want to change it in Studio: keep text and titles as DOM elements over the canvas, not in WebGL.

## The workbench: a 3D film shows the work being done

When the film is *about* making something in 3D (a model, a product, a scene, a build), show the making: a terminal
typing the commands next to a Blender-style modeler, with a cursor that moves, clicks and drags, and key caps (Tab, E,
Shift A) at the bottom. Start from `templates/workbench.html` in this skill's folder: copy it into the project as a
page and change only `SCRIPT` at its top.

- `term`: the lines the terminal types (`cmd`, typed letter by letter) or prints (`out`). Write the person's real steps.
- `mouse`: waypoints `[t, x, y, click]`. Send the cursor to what the step touches (the viewport for a drag, the panels
  for a value) a moment *before* the matching line or key cap, so the click looks like the cause.
- `keys`: key caps `[t, seconds, 'Shift', 'A']`, one per command the modeler would take from the keyboard.
- `build`: when the cube grows, edit mode starts, the face extrudes, the bevel and smooth shading land, the view orbits.
  Keep these times in step with `term`.

It draws with canvas 2D, so it needs no three.js and no model file, and it is a pure function of t like every page.
For the person's own model, keep this page as the making and cut to the `.glb` page above for the result. Look at two
or three frames with `lopesfilm look` before saying it is done.

## When it does not work

A blank picture is almost always the load not awaited, a wrong path, or a missing `preserveDrawingBuffer`. Check the
file size (a Draco-compressed .glb needs `DRACOLoader` and its decoder files in the project too) and look at the shot
before telling the person it is done.

## Other libraries and React

The host serves a compatibility layer for pages that use React, the Remotion API, GSAP, anime.js, Lottie or three.js
(`<script src="__film/compat.js">`, then `FilmCompat.three(renderer, scene, camera, (t) => …)` for the page above). It
puts the library's own clock under `t`; see COMPAT.md in the Lopes.Film package.
