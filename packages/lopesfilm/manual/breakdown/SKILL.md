---
name: breakdown
description: Take a reference video apart shot by shot with rea-video on this computer: for each shot whether it was filmed, AI-generated or made in code, its framing, camera moves, light, colour, on-screen text, sound and pacing, and how to remake it; written as VIDEO.md for you and a report for the person. Read it when the person gives a reference video and asks how it was made, to remake it, to make something like it, or to learn its style; and with yt-dlp (get web-download) when the reference is a link.
category: customize
---

# A reference video, broken down (rea-video)

1. **Get the video into the project.** A file the person gave is already there. A link: `lopesfilm get web-download
   --url <link> --out ref` (yt-dlp; `--audio` for only the sound, `--from/--to` seconds for a part, `--height 720`
   to keep it small). Only what the person has the right to use; a reference for study is fine.
2. **Break it down**: `lopesfilm get breakdown --src assets/video/ref.mp4 --out ref [--lang en|zh] [--stems]`
   (minutes; the first use installs rea-video, about 600 MB). It writes `assets/breakdown/ref/`:
   - `VIDEO.md`: layered. Read its top for the whole (verdict, structure, pacing), then only the shots a question needs.
   - `report.html`: for the person: tell them it is there.
   - `shots/`, `frames/`, `storyboard.jpg`: the frames of each shot; look at them to check the uncertain calls.
   - with `--stems`: `stems/` voice, music and original as three tracks (also `get rea-video --args "stems …"`).
3. **Check it**: without a vision model it tells filmed from AI or 3D by pixel statistics only, so its confidence is
   limited. You can see images: open the shots it is least sure of and correct it (`get rea-video --args "review
   assets/breakdown/ref"` lists them; `apply-review` takes your answers, per `reference/rea-video.md`).
4. **Use it**: remake in Lopes.Film, not in another tool. Shots made in code (kinetic type, UI, charts, cards) become
   pages (the motion and gsap skills) with the timings VIDEO.md gives; filmed shots become a shot list for the person
   or stock/footage searches; AI shots become `get video` / `get image` prompts from the per-shot prompts it wrote;
   its sound layer (music, effects, hits on cuts) becomes `<audio>` clips placed the same way (the listen skill).
   To keep the style for later, write a skill from it (the from-video skill).

The full rea-video guide is `reference/rea-video.md` with its `reference/references/`; where it says to run
`rea-video …`, run it through `get rea-video --args`, and where it suggests Remotion, HyperFrames or another editor,
Lopes.Film's own pages are the place. rea-video is by JuneYaooo, Apache-2.0 licence.
