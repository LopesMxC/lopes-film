---
name: remotion
description: Remotion projects made right here in the chat, with no bundler and no compile step: write or paste TSX/JSX components, compositions, Sequence, TransitionSeries, springs, shapes, paths, noise, Lottie, captions. Use when the person asks for Remotion, brings a Remotion project or template, or wants a React composition.
category: customize
---

# Remotion, in the chat

The host reads **TSX, JSX and TypeScript as they are** (it translates each file when the page asks for it) and gives the
page React and Remotion's API on this film's clock. So a Remotion project runs here as written: no `npm install`, no
`npx remotion`, no bundler, nothing to compile. Rendering is `lopesfilm render`, not Remotion's CLI.

## Lay it out

```
remo/                    a folder in the project (any name)
  index.html             <script type="module" src="./src/index.tsx"></script>  (nothing else is needed)
  src/index.tsx          registerRoot(RemotionRoot)
  src/Root.tsx           <Composition id="Main" component={Main} durationInFrames={300} fps={30} width={1920} height={1080} />
  src/Main.tsx …         components; imports as in Remotion: './Title', 'remotion', '@remotion/transitions'
  public/ or assets/     files for staticFile('logo.png') (either folder finds the file)
```

Use it as a clip: `<iframe src="remo/index.html#t=0,10" at="0">` in film.html (the page sets its own length: durations ÷ fps).
With several compositions, **a clip's src cannot carry `?composition=`** (film.html reads a src as a file path, so
`index.html?composition=Intro` is refused). Give each composition a page of its own beside `index.html`, named like its id and
holding the same one line: `remo/Intro.html` draws `<Composition id="Intro">`, `remo/Outro.html` draws `Outro`, and
`index.html` draws the first. Then `<iframe src="remo/Intro.html" at="0">`. (Opened alone in a browser, `index.html?composition=Intro`
still works; `getInputProps()` reads `?props={"a":1}`.)

## What is there

- **remotion**: `useCurrentFrame`, `useVideoConfig`, `AbsoluteFill`, `Sequence`, `Series`, `Loop`, `Freeze`, `interpolate`,
  `interpolateColors`, `spring`, `measureSpring`, `Easing`, `random`, `Img`, `Video`/`OffthreadVideo`, `staticFile`,
  `delayRender`/`continueRender`, `Composition`, `Still`, `Folder`, `registerRoot`.
- **@remotion/transitions** (+ `/fade`, `/slide`, `/wipe`, `/flip`, `/clock-wipe`, `/iris`, `/none`): `TransitionSeries`, `linearTiming`, `springTiming`.
- **@remotion/shapes**, **paths** (length, point, `evolvePath`, `interpolatePath` for paths of the same shape), **noise**,
  **layout-utils** (`measureText`, `fitText`), **animation-utils** (`makeTransform`, `interpolateStyles`), **captions**
  (`parseSrt`, `createTikTokStyleCaptions`), **media-utils** (durations, `getAudioData`, `visualizeAudio`), **motion-blur**
  (`Trail`, `CameraMotionBlur`), **lottie**, **gif**, **preload** (does nothing: files are local).
- **@remotion/google-fonts/<Name>**: `loadFont()` fetches the font once (it is kept on this computer), then renders offline.
- `import './style.css'`, `import data from './data.json'`, `import logo from './logo.png'` work. A package the project
  needs can be copied to `assets/vendor/<name>.module.js` and imported by its name.

## What is not there (say so, and build it with what is)

- **`<Audio>` draws nothing.** Sound belongs to the film's timeline: put music and voice in film.html (`lopesfilm skill media`).
- **Tailwind** is not compiled: write plain CSS or inline styles. **@remotion/three** and React Three Fiber: use three.js
  directly (`lopesfilm skill lopesfilm-3d`). Rive, Skia, `@remotion/player`, `@remotion/media-parser`, the cloud and Lambda
  packages: not here; an import of one fails with a message saying so.
- `noise2D/3D/4D` values differ from Remotion's (the same kind of noise, not the same numbers).
- Frames are pure: no `useState` set by timers, no `setInterval`, no `Date.now()`, no `Math.random()` (`random('seed')`).

## The official Remotion skills

Skills → Discover lists Remotion's own (`remotion-best-practices` and the others). Use them for how the API is meant to be
used and for animation craft; skip what they say about `npx remotion`, the Studio, bundling, Tailwind and `<Audio>`.

## Check it

`lopesfilm look` at the first frame, mid-scene, scene boundaries and the last. A blank page: read the browser's error
(a missing file, a package that is not in the layer, a delayRender never continued). `lopesfilm skill motion` has the craft
rules (timing, easing, stagger, hierarchy) that apply equally here.
