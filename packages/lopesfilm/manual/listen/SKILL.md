---
name: listen
description: Hear sound you cannot hear, with earshot on this computer: what a sound or a film's audio is, how well it fits a description, the best moments in a long recording, a second-by-second review of a film's sound, and 252 sound effects made in code that render in seconds. Read it before choosing, trimming or judging any sound, before saying how something sounds, and when a code-made film needs its effects.
category: edit
---

# Listening (earshot)

You cannot hear. Never say how audio sounds, or that a sound fits, without a reading behind it, and quote the number
when you report ("strong match, z +3.9", "-14.2 LUFS"). Everything runs on this computer; the first use installs
earshot (about 1.4 GB, once) and each call loads its models first (20–60 s).

## The verbs

- `lopesfilm get listen --src <sound or video>`: what it sounds like, in words, with calibrated tags, loudness,
  brightness and length.
- `lopesfilm get listen --src <file> --query "a deep thocky key press"`: how well it fits (strong / plausible / weak /
  no match), with what it sounds like instead.
- `lopesfilm get sound-find --src <long recording> --query "a single door slam" [--top 5]`: the best moments, as
  start and end seconds to trim the clip to (`#t=start,end` in film.html).
- `lopesfilm get sound-review --src <film.mp4> [--mode timeline|critique]`: the whole film's sound second by second
  (what is heard, hits against cuts, loudness), or scored against professional launch films with what to fix first.
  Render the film first (`lopesfilm render`) and review the file.
- `lopesfilm get earshot --args "<command>"`: any earshot command in the project folder, paths relative to it.

## Sound effects made in code (no service, no cost, no licence to worry about)

1. `get earshot --args "sfx list --category ui_pop"` (or `--kind hit`, `whoosh`, `riser`, `click`…; `sfx list`
   alone lists the 252) shows each sound's id, length and peak time.
2. `get earshot --args "sfx render ui_pop/soft -o assets/audio/sfx/pop.wav [--pitch E5] [--dur 0.8 --apex 0.32]"`
   writes it and says its onset and peak: place the `<audio>` clip so the **peak** lands on the cut or the hit
   (`at` = moment − peak).
3. A whole film: `get earshot --args "kit init --preset launch -o assets/audio/kit.json"`, edit the roles, then
   `kit render assets/audio/kit.json --out assets/audio/kit` and place each take by its sync point.

## Loops

- **Choose**: `get earshot --args "rank \"a soft felt mallet hit\" assets/audio/sfx --top 5"`, then `listen --query`
  on the winner. Several candidates: rank, never guess by file name.
- **Trim**: `sound-find`, then use the times it gives.
- **Check the mix**: render, `sound-review`, fix what it lists first, render again, review again.

The full earshot guide (every command, the MCP server, forge and fit) is `reference/earshot.md`; where it says to run
`earshot …` directly, run it through `get earshot --args`. earshot is by Leon Lin, MIT licence.
