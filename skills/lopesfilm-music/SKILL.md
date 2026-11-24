---
name: lopesfilm-music
description: Find a song on the web, download it and put it in the film. Use when the person asks for a track, a song or background music they name or describe, or says "search music" / "put this music in the video".
category: function
---

# Music from the web, into the film

1. **Look in the library first**: `lopesfilm get music-search --prompt "<mood>"` (free, offline). If a match fits, `--take` it.
2. **Otherwise search the web**: `lopesfilm get web-music --prompt "<title, artist or mood>" --out <name> --n 3` downloads up
   to 3 licensed tracks (Jamendo; the person adds its free key in Settings → Services). Each comes with its artist,
   licence and page.
3. **Pick one** by length and mood; tell the person which, and its licence. A "NC" licence is for non-commercial use:
   say so before it goes into a film that earns money.
4. **Put it in the film**: an `<audio src="assets/audio/music/<name>.mp3#t=in,out" volume="0.5">` clip in film.html at the
   second it starts, lasting the film (or the part). Music under speech: `volume` 0.2–0.35. Fade the end by shortening
   the clip, not by cutting mid-phrase.
5. **Credit it**: add the track's `credit` line to the end of the film or its description.

Never download a song from a service that does not offer it for download (YouTube, Spotify, SoundCloud streams): it is
not licensed for a film. If the person wants a specific commercial song, say so, and offer a licensed track in its mood.
