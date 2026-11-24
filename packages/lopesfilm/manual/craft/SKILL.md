---
name: craft
description: Draw title cards, lower thirds, thumbnails, logos, icons and illustrations on this computer with figcraft (Figma-style) and vectorcraft (Illustrator-style), then lay them over the film or animate them with effectcraft. Use when the person wants a graphic, a logo, a thumbnail, a social frame or an overlay made, not found.
category: customize
---

# Draw it, then use it

`figcraft` (interface and layout design) and `vectorcraft` (vector drawing) make a picture from a list of commands and write it under `assets/image`. Transparent where nothing is drawn, so a PNG goes straight over the film as an image clip.

| Wanted | Use |
|---|---|
| title card, lower third, thumbnail, social frame, text over a shape | `figcraft` |
| logo, icon, shape, illustration, a path to trace | `vectorcraft` |
| the same, moving | draw it, then animate it with `effectcraft` (import the PNG/SVG as a layer) |

## How a call goes

`--steps` is a JSON list run in order. Each command answers with the id of what it made; use it as `parent` of the next one (figcraft frames are id 2 in a new project, then 3, 4…, but read the answer).

```
lopesfilm get figcraft --out lower-third --node "Lower third" --steps '[
 {"id":"frame.create","params":{"name":"Lower third","width":1280,"height":300,"x":0,"y":0,"props":{"fill":"none"}}},
 {"id":"node.create","params":{"type":"rectangle","x":40,"y":60,"width":700,"height":160,"parent":2,"props":{"fill":"#E0384E","cornerRadius":6}}},
 {"id":"text.create","params":{"text":"Lopes","x":70,"y":100,"parent":2,"props":{"fontSize":64,"fill":"#FFFFFF"}}}]'
```

```
lopesfilm get vectorcraft --out logo --steps '[
 {"id":"file.new","params":{"width":800,"height":800,"units":"Pixels"}},
 {"id":"shape.ellipse","params":{"x":100,"y":100,"width":600,"height":600}}]'
```

- Look before you use: `--commands gradient` (or `text`, `auto layout`, `pathfinder`…) lists the commands that match and their parameters. Do not guess a parameter.
- Later calls with the same `--out` open the project again (`assets/design/<out>.figcraft` or `.vectorcraft`): give only the steps that change it. In figcraft use `node.set` with `ids` and `props` to change a layer.
- `--format svg` keeps it sharp at any size; `--scale 2` doubles a PNG. A picture for a 4K film is drawn at its final size or `--scale 2`.
- Both programs are young: a command that fails says why, and the whole step list is undone. Fix the step and send the list again.
- Look at the picture (the look tool) before it goes into the film. Text that does not fit and colors that clash are found there.
- The author of anything made here is the person, never the program.

## Moving: `anicraft`

2D animation with keyframes and tweens (Adobe Animate-style). `--format webm` (default) is transparent, to lay over the film; `lottie` is a transparent `.json` for the lottie adapter; `mp4`, `gif` and `png` (one frame) too.

```
lopesfilm get anicraft --out box --width 1280 --height 720 --steps '[
 {"id":"draw.rect","params":{"x":20,"y":120,"w":100,"h":100,"fill":"#E0384E","stroke":"none"}},
 {"id":"edit.select_all","params":{}},
 {"id":"modify.convert_to_symbol","params":{"name":"box"}},
 {"id":"timeline.insert_keyframe","params":{"frame":29}},
 {"id":"timeline.goto","params":{"frame":29}},
 {"id":"edit.select_all","params":{}},
 {"id":"element.set_transform","params":{"x":500,"y":170}},
 {"id":"timeline.create_tween","params":{"frame":0,"easing":"ease-out"}}]'
```

- A tween moves a **symbol**: draw, select, convert, then keyframe, go to that frame, change it, tween from the first keyframe. `element.set_transform` puts the object's centre at x,y.
- Steps count frames from 0; `--from`, `--to` and `--frame` from 1. The project is kept: later calls give only the steps that change it.
- `--commands tween easing` lists commands and parameters; do not guess one. Shapes have a dark outline by default: say `"stroke":"none"`.
- The transparent video is made on a green key: keep pure #00FF00 out of the drawing. For soft shadows or glows use `lottie` or `mp4` with `--background`.
