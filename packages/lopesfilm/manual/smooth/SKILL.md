---
name: smooth
description: Smooth slow motion and 60 fps with interpolate (RIFE), and first-pass cuts of silences and dead stretches with autoedit (auto-editor), both on this computer. Use for slow motion, a choppy clip, a talking-head recording full of pauses, or a clip that drags.
category: edit
---

# Slow motion and tight cuts

## interpolate (RIFE)

Invents the frames between the frames, on the graphics card.

- `lopesfilm get interpolate --src assets/video/a.mp4 --out a-slow --mode slow --factor 4` plays the clip 4 times slower and smooth. The sound is dropped (it would no longer fit): put new sound under it.
- `--mode fps --fps 60` raises the rate, same length, sound kept. Worth it for a screen recording or a pan that stutters; not for 24 fps film that is meant to look like film.
- Up to 600 frames (about 20 s at 30 fps). Cut the part you need first, then smooth it: it is minutes of work on a mid-range card, so smooth only the shot that needs it.
- Fast, large movement and cuts inside the clip make artifacts (ghosting). Look at the result; if it smears, use a smaller `--factor` or a shorter clip.

## autoedit (auto-editor)

Takes the silences out of a recording.

- `lopesfilm get autoedit --src assets/video/a.mp4 --out a-tight` cuts what is below 4 % loudness and keeps 0.2 s around the speech.
- Noisy room: raise `--threshold` (6 to 10). Lets breaths through: lower it. Too choppy: raise `--margin` (0.3 to 0.5).
- `--speedup 6` speeds the pauses up instead of cutting them, for a demo where the waiting should still be seen.
- `--edit "motion:threshold=2%"` cuts what does not move (screen recordings, static shots).
- The answer says the seconds before and after. It is a first pass: read the transcript or look at the cuts before building on it, and keep the original.
