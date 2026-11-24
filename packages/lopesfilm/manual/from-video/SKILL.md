---
name: from-video
description: Make a new skill from a reference video: study how it is made (structure, pacing, framing, type, colour, motion, sound) and write that as a skill that makes films the same way. Read it when the person gives a reference video and asks for a skill, a style, "make films like this", or to learn from a video.
category: customize
---

# A skill from a reference video

The person gives a video they like. You turn **how it is made** into a skill that any later film can follow. The skill
describes technique and numbers, never the video's own words, pictures, music or footage.

## 1. Study it
0. Numbers first: `lopesfilm measure shots <video>` (shots, lengths, movement, colours), `measure events` (holds, sound onsets,
   cuts on the beat), `measure curve … --roi` for the hero move (ease and duration), `measure ink … --roi` for type size,
   `measure colors … --at t` for palette and light. Quote these numbers in the skill, not adjectives.
1. `lopesfilm look <the video>` for the contact sheet and the sound; then `look <t>` for single frames at full size at the
   hook, each change of scene and the end, and `look <a>-<b>` for a stretch where something moves. Get the transcript as
   `lopesfilm skill media` says.
2. Write down, with numbers:
   - **Structure**: the beats in order with their start and length (hook, body, payoff), total length, aspect ratio.
   - **Pacing**: how long each shot or scene holds (shortest, typical, longest), how often something changes on screen.
   - **Framing**: shot sizes, where the subject sits, safe margins, punch-ins or camera moves.
   - **Type**: how many typefaces, weight and case, size as a share of the frame height, position, how long text stays, what is emphasised and how.
   - **Colour**: base palette and accent as hex values read from frames, contrast, any grade (warm, cold, flat, grainy).
   - **Motion**: what moves, in which direction, how long, the easing (fast-in slow-out, spring, linear), transitions and what they are (cut, whip, fade, mask).
   - **Sound**: voice or music, tempo, level of music under speech, effects and where they land (on the cut, on the word).
   - **Rules it follows**: what is always true across the video (always one accent colour, text always lower third, a cut on every beat).
3. If something cannot be told from the frames (a font, a plugin), say what it looks like and name the closest free option.

## 2. Write the skill
Make a folder named in lowercase words with dashes (`punchy-explainer`) with a `SKILL.md`:

```
---
name: punchy-explainer
description: <when to read it: the kind of film and the words a person would use. One or two sentences.>
category: edit
---

# <Name>

<one paragraph: what films made this way feel like, and what they are for>

## Structure   (the beats and their lengths)
## Pacing      (numbers)
## Frame and type
## Colour
## Motion
## Sound
## Rules       (the always/never list)
## Check       (what to look at with `lopesfilm look` before saying it is done)
```

- Every section holds numbers and rules that someone could follow without seeing the video. "Fast and energetic" is not a rule; "a change on screen every 1.2–2 s, text of 8% height, cut on the beat" is.
- Short: 40–90 lines. Each rule once. Put what differs from the person's other skills; skip what any film does.
- Do not copy the video's text, narration, music, logos or footage, and do not name its author as the source of anything but "reference". Do not put the video file in the skill.
- If the person wants a film rebuilt like the video, that is the `recreate` skill, not this one. If the video is the person's own, say so in the description; if it is someone else's, the skill is about the technique only.

## 3. Install it
Put the folder in the project's `skills/` folder, then `lopesfilm skill add <folder>`. It appears in the person's Skills,
turned on. Tell the person its name and the three rules that define it. Offer to make a short test film with it.
