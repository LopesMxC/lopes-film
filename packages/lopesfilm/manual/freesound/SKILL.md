---
name: freesound
description: Sound effects and music from Freesound: how to search it well, what its licences ask for, how to place and credit what you take. Read it every time you pull a sound or a piece of music from Freesound (`get web-music --via freesound`, the Library's Freesound tab).
category: edit
---

# Freesound

Freesound is a library of sounds made by people, each under its own Creative Commons licence. It needs the person's key
(Settings → Services → Freesound); with none, tell them where to add it and use the offline library (`get sfx-search`).

## Search
- Words in English, short and concrete: "door slam wood", "rain window", "crowd cheer", not a sentence.
- `get web-music --via freesound --kind sfx --prompt "<words>" --out <name> --n 3` for effects only (under 30 s, saved in `assets/audio/sfx/`); `--kind music` for pieces over 30 s only, in `assets/audio/music/`; with no `--kind` the whole library is searched, no length filter (under 30 s lands in sfx, longer in music), and with no `--prompt` it takes the most downloaded. `--id <number>` takes one sound the person picked in the Library tab.
- Take 2 or 3 to choose from, then listen before judging (the listen skill): never say a sound fits without hearing it.
- What lands is Freesound's high-quality MP3 preview. It is enough for a film; say so if the person asks for the original file.

## Licences (the receipt says each one)
- CC0: no credit needed.
- CC BY: credit the author. CC BY-NC: credit, and only for work that is not commercial: ask the person before using it in an ad or a paid film. Sampling+ or unclear: do not use.
- Credit every sound in the film's end card or description, as the receipt's `credit` gives it: `"name" by author on Freesound (licence)`. Keep the page address with the project's notes.

## Placing
- Effects land on the frame the thing happens (the sound skill's rules); trim with a media fragment (`#t=in,out`) rather than editing the file.
- A long ambience under a scene: loop or crossfade, level 15–20 dB under speech.
- Never use the same Freesound clip for different things in one film; vary pitch and level a little on repeats.

## Check
Each sound used has its credit in the film; no NC sound is in a commercial film; every file plays.
