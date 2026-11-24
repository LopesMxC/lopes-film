---
name: sound
description: Sound design and mixing: dialogue clarity, music choice and ducking, sound effects, ambience, silence, loudness. Read it when the person asks for better sound, a mix, music and effects added, or to fix audio that is quiet, noisy or uneven.
category: edit
---

# Sound

Half of how a film feels is what you hear. Dialogue is the priority; everything else supports it.

## Layers (bottom to top)
1. **Ambience / room tone**: a low continuous bed under every scene so cuts do not drop to dead silence. Same bed across a scene.
2. **Music**: sets the feeling. 
3. **Effects**: things that happen on screen (a click, a whoosh on a move, an impact on a reveal).
4. **Dialogue / voice-over**: always on top and always clear.

## Dialogue
- Even level across clips: matched by ear and by loudness, not by eye.
- Remove noise (hum, hiss) lightly: if the voice sounds underwater, undo it. Cut breaths that are loud; keep the small ones.
- Silence for 0.2–0.4 s before a key line makes it land; do not fill every gap.

## Music
- Pick by feeling and tempo, not by genre: slow and sparse under narration, driving when only pictures speak.
- Level: 15–20 dB under speech, ducked a further 6–10 dB for the length of a spoken line, with a 0.3 s ease in and out.
- Start music on a cut or a beat, never mid-phrase; end on a bar line or fade over 1–2 s. Use `lopesfilm skill media` to find tracks and effects in the library.
- Do not use the same loop for more than about 60 s without a change (a layer added or removed).

## Effects
- On the frame the thing appears or hits, not before it; whooshes start 3–6 frames earlier so they peak on arrival.
- Three or four kinds per film, used consistently (the same click for every button). Quiet and short beats loud and long.
- Vary pitch and level slightly on repeats so it does not sound like a machine.

## Levels and delivery
- Overall loudness around -14 LUFS for online video (-16 for speech-only); peaks below -1 dBTP. Never let it clip.
- Check on speakers and in headphones, and at low volume: the words must still be clear.

## Check
Listen to the first 5 s, every cut where sound changes, the loudest moment and the end. Fix what pulls you out of the film.

## Mix on this computer: `soundcraft`

`lopesfilm get soundcraft --out mix --steps '[{"id":"session.new","params":{"name":"mix"}},{"id":"file.import_audio","params":{"path":"assets/audio/voice.wav"}},{"id":"file.import_audio","params":{"path":"assets/audio/music/song.mp3"}},{"id":"mix.volume","params":{"tracks":[2],"db":-14}}]'` mixes the tracks with a Pro Tools-style engine (EQ, compressor, gate, de-esser, reverb, delay; `--commands plugins` lists them, `--commands <word>` lists commands) and writes `assets/audio/mix/mix.wav` with its LUFS and peaks. Each import answers with its track id: use it in the next steps. Read the loudness it answers (about -16 LUFS for the web) and fix the levels before the mix goes under the film. The session is kept: a later call with the same `--out` changes it.
