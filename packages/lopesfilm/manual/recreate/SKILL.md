---
name: recreate
description: Rebuild a reference video as the person's own film, with their copy, brand and footage, and check the result against the reference with numbers. Read it when the person gives a video or link and says "make one like this", "recreate this", "same style for my product", or wants a film that moves and is paced like another one.
category: edit
---

# Recreate a reference video

The person gives a video and wants **their own film made the way that one is made**: same structure, pacing, type scale,
density, camera and motion, with their words, brand and material. You take it apart with numbers, rebuild it, then
measure the rebuild against the reference. "It looks about right" is not a result; a number that holds is.

What is the person's and what is not: the **technique** (timing, easing, layout, type scale, transitions) is free to
follow. The reference's own footage, music, voice, logos and wording are not yours to reuse; they are replaced with the
person's. If the reference is the person's own finished film and only details change, say so and keep the rest.

## 0. Before anything
- A local copy of the video (a link is fetched or the person attaches it); `lopesfilm measure probe <video>` gives size,
  frame rate, length, sound. Never claim to have watched a video you only know from a cover or a description.
- Look at the person's own material first (the project's files, brand, logo, product copy). That is the content.
- Ask once, in one batch, only what you cannot find (brand, claims, numbers, logo, which parts stay). Then work to the end.
- Live action or a talking head: rebuild the structure (cuts, captions, inserts, pacing) around the person's footage;
  say plainly that you cannot reproduce footage you do not have.

## 1. Take it apart
1. `lopesfilm measure shots <video>`: the shots with their times, movement and colours, and a motion sheet to complete
   (the path is printed). `measure cuts` and `measure events` say where it cuts, where nothing moves, and which cuts land
   on a sound onset (a cut "on the beat").
2. For every cut: `measure frames <video> --range a,b` a little before and after it. Is it a hard cut, a dissolve, a
   whip, a mask wipe? One picture a second shows none of that.
3. For every shot, `lopesfilm look <video> <t>` at its middle, then write in the sheet: what is on screen, what enters
   and from where, what holds, what leaves, what the text does. Keep an object's identity across cuts when it is the same object.
4. Measure what you will have to match:
   - **Moves**: `measure curve <video> --start a --end b --roi x,y,w,h` returns when it starts, its duration, overshoot and
     the closest ease (with the CSS `cubic-bezier`). Do this for the hero move of each shot, not for every one.
   - **Type**: `measure ink <video> --at t --roi x,y,w,h` gives height as a share of the picture, position and colour.
   - **Colour and light**: `measure colors <video> --at t --grid 8x6`: palette, gradient direction, how dark the back is.
   - **Sound**: `measure events` for onsets; keep the soundtrack's structure and re-time it to the new cut, replace any
     voice that names the reference's brand or product.
5. Interactions change the content: if a pointer drags a card, rebuild the card following it, the neighbours making room
   and the final order, not just the pointer.

## 2. Rebuild
- One page per shot (or per group of shots that share a layout), clips at the times of the sheet, hard cuts kept hard.
  A page is a function of time (`window.film.frame(t)`): derive every position from `t` so the same t draws the same picture.
- Put the measured ease and duration in (`transition-timing-function: cubic-bezier(…)`, WAAPI or the library's ease). Put
  the measured type height in, the measured colours in, the measured holds in.
- Match **density**: a screen full of tiles stays full; **depth**: a tilted orbit stays tilted; **type character**: the
  closest available face of the same kind (pixel, mono, wide display), not a system font; **back layers**: lines, grids,
  texture, vignette. A line that is clearly visible in the reference is equally visible in yours; never darker or lower in contrast.
- Simplifying a dense or 3D passage into a few flat cards is a defect to fix, not an approximation to ship.
- Text that is longer than the original wraps and gets a longer hold; do not shrink it below the measured size.
- Small shapes that carry meaning (a pointer, an icon, a logo mark): `measure frames --roi` a close crop first, then draw
  the real contour as an SVG path. A triangle is not a pointer.

## 3. Check against the reference
Render, then for **every shot** (the opening, the densest frame, a moment in the middle of each move, the end card):
`lopesfilm measure compare <reference> <remake> --t <remake s> --ref-t <reference s> --region x,y,w,h --ref-region x,y,w,h`
for each text or logo element, paired with the element that replaces it. It fails when the remake is darker, sparser,
less coloured, or when an element is smaller than 0.8 of the reference or cut off. Fix by geometry, size, wrapping,
timing or the missing layer; **never by deleting what the reference shows**. Then:
- `measure curve` the remake in the same region and compare the table and the ease with the reference's.
- Play both at normal speed and look at joins and short events; numbers do not see a wrong shape or a bad join.
- Two fixes in a row that do not reduce the difference at the same moment: change the approach once; if it still fails,
  write the gap down and move on.

## 4. Say what you did
Briefly: what was rebuilt faithfully, what the person's content replaced, the assumptions you made, and **every gap you
could not close** (a moment that fails a check, an effect you only approximated, a font you substituted). Never claim a
faithful result that was not measured.
