// @ts-check
/**
 * `lopesfilm get`: media for a project (voice-over, music, sound effects, transcripts, pictures, video) from a provider
 * the person connected with their own key (providers/). The CLI sends the verb and its options to Studio (`/api/get`);
 * here they are checked, a provider is picked (`--via`, else the person's choice in Studio's Settings; none chosen,
 * nothing runs), it runs, and what comes back lands in the project: files under assets/ only, and timed speech's
 * transcript beside it (transcripts.mjs). The answer is the receipt the agent reads, without what it cost.
 *
 * Who makes the media, with which model and for what price is the person's business, chosen in Studio: the agent is
 * told what it can get here now, and for what is not connected, which services make it.
 *
 * A video clip spends a lot, so the person confirms it first, in the Studio page showing the project (an `ask` event on
 * its stream, answered with POST /api/get/asks/:id) while the CLI waits. With no page open, the agent is told to ask
 * the person and run it again with `--yes`.
 *
 * A provider whose account has no balance left for a run (code 'balance', the same for every provider) is said once to
 * the person, in the Studio pages showing the project (a `notice` event, with where to top it up), and to the agent,
 * which stops. Nothing anyone reads here carries an amount: that is on each provider's own page.
 *
 * Subtitle translation (`subtitleTranslator`, for captions.mjs) is the person's agent's own model's work in an app with
 * a chat (`askAgent`), else it goes through the provider chosen for `translate`.
 *
 * Web search and reading web pages (WEB_VERBS) are listed only for an agent without web tools of its own: the app's
 * own agents say so with LOPESFILM_GET_WEB=1 (the CLI asks for them); an agent like Claude Code or Codex searches with
 * its own. Either can run them.
 */
import { recordUsage } from './usage.mjs';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILM_FILE, clipKind } from '../../src/film-doc.mjs';
import { spokenLines } from './captions.mjs';
import { dropTranscripts, readTranscript, transcriptIsCurrent, transcriptPath, writeTranscript } from './transcripts.mjs';
import { inside } from './files.mjs';
import { compoundOuter } from './parts.mjs';
import { HttpError, json, readJson } from './http.mjs';
import { kindOf, modelFor, providerKey } from './keys.mjs';
import { chooseProvider, freshProviders, listProviders, providerSettings } from './providers/index.mjs';
import { addedDir } from './providers/added.mjs';
import { ensureWhisper, runWhisper, whisperAvailable } from './providers/whisper-fallback.mjs';
import { mediaSeconds, translatedLines, translationAsk } from './providers/common.mjs';
import { cleanAudio, DENOISE, DEREVERB, EQ, HUM, VOICE_FX } from './audio-clean.mjs';
import { upscale, STYLES as UPSCALE_STYLES } from './upscale.mjs';
import { eyes } from './eyes.mjs';
import { webDownload } from './webdl.mjs';
import { runListening } from './listening.mjs';
import { cutoutVideo, stabilize, STABILIZE_LEVELS, stems, trackFace, STEM_MODES, track, trackSubject } from './media-fx.mjs';
import { effectcraft, FORMAT_NAMES as MOTION_FORMATS } from './effectcraft.mjs';
import { design, DESIGNS, IMAGE_FORMATS } from './designcraft.mjs';
import { interpolate, MODES as INTERPOLATE_MODES } from './interpolate.mjs';
import { autoEdit } from './autoedit.mjs';
import { soundcraft, FORMATS as MIX_FORMATS } from './soundcraft.mjs';
import { anicraft, FORMATS as ANIMATION_FORMATS } from './anicraft.mjs';
import { browse } from './research-browser.mjs';
import { CALL_TIMEOUT_SEC, callService, servicesHelp } from './custom-services.mjs';

/**
 * @typedef {import('./http.mjs').Req} Req @typedef {import('./http.mjs').Res} Res
 * @typedef {import('./providers/contract.mjs').Provider} Provider
 * @typedef {import('./providers/contract.mjs').RunResult} RunResult
 * @typedef {import('./providers/contract.mjs').Spend} Spend
 * @typedef {import('./providers/contract.mjs').Verb} Verb
 * @typedef {import('./captions.mjs').TranslateLines} TranslateLines
 */

/**
 * An option: `value` names what it takes in the help (none: a switch). `path`: a project file it names, which must be
 * a recording (`speech`) or a picture.
 * @typedef {{ value?: string, required?: boolean, repeat?: boolean, choices?: string[], min?: number, max?: number,
 *   integer?: boolean, default?: string | number, alias?: string, path?: 'speech' | 'picture' | 'clip' | 'media' }} Option
 * @typedef {{ help: string, dir?: string, timeoutSec: number, options: Record<string, Option> }} VerbSpec
 */

const out = /** @type {Option} */ ({ value: 'name', required: true });
const prompt = /** @type {Option} */ ({ value: 'text', required: true });

/** The verbs, their options and where their files go. A provider takes the options it can honor and says so for the rest. */
export const VERBS = /** @type {Record<string, VerbSpec>} */ ({
  voice: {
    help: 'Find voices for tts: voiceId, name, language, gender and description.',
    timeoutSec: 60,
    options: { language: { value: 'code' }, gender: { value: 'gender', choices: ['m', 'f'] }, prompt: { value: 'text' },
      limit: { value: 'n', min: 1, max: 100, integer: true, default: 5, alias: 'n' } },
  },
  tts: {
    help: 'Voice-over: one line spoken. Returns src, dur and its transcript: a WebVTT of the text in pause-separated cues, in source seconds. Its word timing is kept, so never run asr on it.',
    dir: 'assets/audio/vo', timeoutSec: 300,
    options: { out, text: { value: 'text', required: true }, voice: { value: 'voiceId', required: true } },
  },
  sfx: {
    help: 'A sound effect. Returns src, its measured dur and, when measured, attack (seconds into the file where the hit is) and peakDb. --sec is a request: the dur returned is what it is.',
    dir: 'assets/audio/sfx', timeoutSec: 300,
    options: { out, prompt, sec: { value: 'seconds', min: 0.5, max: 22 } },
  },
  music: {
    help: 'Music. Returns src and its measured dur. --sec is a request and the track is often longer: play the part you need with a media fragment on the clip\'s src (#t=in,out).',
    dir: 'assets/audio/music', timeoutSec: 300,
    options: { out, prompt, sec: { value: 'seconds', min: 3, max: 300 } },
  },
  asr: {
    help: 'Transcribe a recording in the project. Returns a preview of the text and its transcript: a WebVTT of the whole text in pause-separated cues, each labeled with the pause before it; cut only in pauses of 0.12 s or more. What is transcribed already is not done again (--force redoes a recording; synthesized speech never needs it).',
    timeoutSec: 900,
    options: { src: { value: 'path', required: true, path: 'speech' }, force: {} },
  },
  cutout: {
    help: 'Take the background out of a picture in the project: the same picture as a PNG, what it is of kept and the rest transparent. Returns its path and size.',
    dir: 'assets/image', timeoutSec: 300,
    options: { src: { value: 'path', required: true, path: 'picture' }, out },
  },
  'image-search': {
    help: 'Find pictures on the web and download them (1 to 8). Returns their paths and sizes.',
    dir: 'assets/image', timeoutSec: 300,
    options: { out, prompt, n: { value: 'n', min: 1, max: 8, integer: true, default: 1, alias: 'limit' } },
  },
  'video-search': {
    help: 'Find video clips on the web and download them (1 to 4), each with who made it and its page, the credit the film gives it; --orientation landscape, portrait or square. Returns their paths, lengths and sizes.',
    dir: 'assets/video', timeoutSec: 600,
    options: { out, prompt, n: { value: 'n', min: 1, max: 4, integer: true, default: 1, alias: 'limit' },
      orientation: { value: 'orientation', choices: ['landscape', 'portrait', 'square'] } },
  },
  'audio-clean': {
    help: 'Clean a recording on this computer (no service needed): remove noise and hum (neural, light|medium|strong), --dereverb light|medium|strong takes room echo down, --voice isolates the voice from the background, make a voice clearer; --fx adds a voice effect (echo, cave, muffled, radio, megaphone, telephone, robot, underwater, deep, high, alien, monster; --amount 0-100); --video keeps a video file, its picture kept, and cleans its sound (an .mp4 out), shape the tone, set the loudness. Returns the cleaned file under assets/audio/clean.',
    dir: 'assets/audio/clean', timeoutSec: 600,
    options: { src: { value: 'path', required: true, path: 'speech' }, out, video: {},
      denoise: { value: 'level', choices: Object.keys(DENOISE), default: 'medium' }, dereverb: { value: 'level', choices: Object.keys(DEREVERB), default: 'off' }, voice: {},
      eq: { value: 'preset', choices: Object.keys(EQ), default: 'flat' }, hum: { value: 'hz', choices: HUM, default: 'off' },
      fx: { value: 'effect', choices: ['none', ...Object.keys(VOICE_FX)], default: 'none' }, amount: { value: 'percent', min: 0, max: 100, integer: true, default: 60 },
      normalize: { value: 'lufs|off', default: '-16' } },
  },
  stabilize: {
    help: 'Steady a shaky video on this computer (no service needed; vid.stab): --level light, medium (default) or strong. The picture is zoomed a little at the edges. Returns the new clip.',
    dir: 'assets/video', timeoutSec: 1800,
    options: { src: { value: 'path', required: true, path: 'media' }, out, level: { value: 'level', choices: STABILIZE_LEVELS, default: 'medium' } },
  },
  'camera-track': {
    help: 'Follow the camera in a video on this computer: a JSON with, for every frame, how far the picture moved (dx, dy, rot) and the running path (x, y, angle), to keep a title or a graphic on the scene. Returns its path.',
    dir: 'assets/data', timeoutSec: 1800,
    options: { src: { value: 'path', required: true, path: 'media' }, out },
  },
  'subject-track': {
    help: 'Follow one subject through a video on this computer: the box around it on its first frame (--x, --y, --w, --h, 0 to 1 of the picture), from --from seconds (to --to). A JSON with the box on every frame, for a title, a blur or a graphic to follow it. Returns its path.',
    dir: 'assets/data', timeoutSec: 1800,
    options: {
      src: { value: 'path', required: true, path: 'media' }, out,
      x: { value: 'n', min: 0, max: 1, required: true }, y: { value: 'n', min: 0, max: 1, required: true },
      w: { value: 'n', min: 0, max: 1, required: true }, h: { value: 'n', min: 0, max: 1, required: true },
      from: { value: 'n', min: 0 }, to: { value: 'n', min: 0 },
    },
  },
  'face-track': {
    help: 'Follow a face through a video on this computer, with no box drawn: the largest face found by itself, then the same one (--from seconds, to --to; a moment with a face turned to the camera). A JSON with the face box on every frame (x, y, w, h, 0 to 1 of the picture), smoothed, for a zoom or a framing that keeps the face where you want it, or a title that follows it. The first time it installs its detector (about 180 MB). Returns its path.',
    dir: 'assets/data', timeoutSec: 1800,
    options: { src: { value: 'path', required: true, path: 'media' }, out, from: { value: 'n', min: 0 }, to: { value: 'n', min: 0 } },
  },
  'cutout-video': {
    help: 'Take the background out of a short video on this computer (the local IS-Net, frame by frame, slow): a transparent WebM at --fps (default 12; at most 240 frames). Needs the local background model installed. Returns the new clip.',
    dir: 'assets/video', timeoutSec: 3600,
    options: { src: { value: 'path', required: true, path: 'media' }, out, fps: { value: 'n', min: 1, max: 30, integer: true, default: 12 } },
  },
  stems: {
    help: 'Split a song on this computer by phase (no AI model, an approximation): --mode voice (the centre of the stereo picture) or instrumental (the rest). Returns the new sound.',
    dir: 'assets/audio', timeoutSec: 600,
    options: { src: { value: 'path', required: true, path: 'speech' }, out, mode: { value: 'mode', choices: STEM_MODES, default: 'voice' } },
  },
  upscale: {
    help: 'Make a picture or a short video larger and sharper on this computer (no service needed; Real-ESRGAN on the graphics card, fetched the first time, about 45 MB). --scale 2 (default), 3 (--style fast only) or 4; --style photo (real pictures and footage), anime (drawings) or fast (light, quick: the default for a video). A video is taken apart, each frame upscaled and put together again with its sound, up to about 30 s; it takes minutes. Returns the new file under assets/image (png) or assets/video (mp4) and its size: use it in film.html in place of the original.',
    dir: 'assets/image', timeoutSec: 3600,
    options: { src: { value: 'path', required: true, path: 'media' }, out, scale: { value: 'n', min: 2, max: 4, integer: true, default: 2 }, style: { value: 'style', choices: UPSCALE_STYLES } },
  },
  eyes: {
    help: 'Eye contact on this computer (no service needed; fetched the first time, about 5 MB): where the person on screen looks away from the lens (down at a script, to the side) the eyes are moved back to look at it, frame by frame, the sound kept. A closed eye and a head turned away are left alone. --strength 0 to 1 (0.9 default). Takes a video of the project (or a picture) and returns the corrected file under assets/video (mp4) or assets/image (png): use it in film.html in place of the original. Tell the person it was applied.',
    dir: 'assets/video', timeoutSec: 3600,
    options: { src: { value: 'path', required: true, path: 'media' }, out, strength: { value: '0-1', min: 0, max: 1, default: 0.9 } },
  },
  effectcraft: {
    help: 'Motion graphics on this computer (no service needed; Skill de Motion, an After Effects-style studio with 300+ effects, shape/text/3D layers and keyframes; fetched the first time, about 60 MB). You build a composition with --steps, a JSON list of commands run in order, e.g. [{"id":"comp.new","params":{"name":"Main","width":1920,"height":1080,"frameRate":30,"duration":4}},{"id":"layer.newText","params":{"text":"Lopes","size":120,"fill":[1,1,1,1],"position":[960,540]}}], or with --script, a .jsx of the After Effects object model in the project; --project keeps the .ecproj (default assets/motion/<out>.ecproj, built on again when it exists), --comp names what is rendered (Main). --format webm (default: transparent background, to lay over the film), mov (ProRes 4444, transparent) or mp4 (opaque). Returns the file under assets/video: use it in film.html as a <video> clip. The commands and their parameters are listed by the program itself (see the motion skill); --commands [filter] lists them (e.g. --commands layer) instead of rendering.',
    dir: 'assets/video', timeoutSec: 1800,
    options: { out: { ...out, required: false }, commands: { value: 'filter' }, project: { value: 'path' }, comp: { value: 'name' }, steps: { value: 'json' }, script: { value: 'path' }, format: { value: 'format', choices: MOTION_FORMATS, default: 'webm' }, start: { value: 's', min: 0 }, end: { value: 's', min: 0 }, fps: { value: 'n', min: 1, max: 120, integer: true } },
  },
  figcraft: {
    help: 'Design on this computer (no service needed; FigCraft, a Figma-style studio: frames, auto layout, components, text, vectors, gradients, effects; fetched the first time, about 100 MB). For title cards, lower thirds, thumbnails, social frames, app screens and overlays. You build with --steps, a JSON list of commands run in order, e.g. [{"id":"frame.create","params":{"name":"Card","width":1280,"height":300,"x":0,"y":0,"props":{"fill":"none"}}},{"id":"node.create","params":{"type":"rectangle","x":40,"y":60,"width":700,"height":160,"parent":2,"props":{"fill":"#E0384E","cornerRadius":6}}},{"id":"text.create","params":{"text":"Lopes","x":70,"y":100,"parent":2,"props":{"fontSize":64,"fill":"#FFFFFF"}}}] (a command answers with the id of what it made: use it as the parent of the next). --node names the frame or layer to export (its name or id), --format png (default, transparent where nothing is drawn), webp, jpg, svg or pdf, --scale 2 for twice the size; --project keeps the .figcraft (default assets/design/<out>.figcraft, built on again when it exists, so later calls may give only --steps that change it). Returns the picture under assets/image: use it as an image clip, or animate it with effectcraft. --commands <word> lists the commands and their parameters that match (e.g. gradient, auto layout) instead of drawing.',
    dir: 'assets/image', timeoutSec: 900,
    options: { out: { ...out, required: false }, commands: { value: 'filter' }, project: { value: 'path' }, steps: { value: 'json' }, node: { value: 'name|id' }, page: { value: 'name' }, format: { value: 'format', choices: IMAGE_FORMATS.figcraft, default: 'png' }, scale: { value: 'n', min: 0.1, max: 8 } },
  },
  vectorcraft: {
    help: 'Vector drawing on this computer (no service needed; Skill de Vetor, an Illustrator-style studio: paths, shapes, pen tool, gradients, type, boolean operations, effects; fetched the first time, about 120 MB). For logos, icons, shapes and illustrations. You build with --steps, a JSON list of commands run in order, e.g. [{"id":"file.new","params":{"width":800,"height":800,"units":"Pixels"}},{"id":"shape.ellipse","params":{"x":100,"y":100,"width":600,"height":600}},{"id":"text.create","params":{"x":300,"y":380,"text":"L","size":200}}] (start a new project with file.new; units "Pixels" make the picture that many pixels). --format png (default, transparent background), svg, pdf, jpg, webp, gif or tif, --scale 2 for twice the size; --project keeps the .vectorcraft (default assets/design/<out>.vectorcraft, opened again when it exists). Returns the picture under assets/image. --commands <word> lists the commands that match (e.g. shape, gradient, pathfinder) instead of drawing.',
    dir: 'assets/image', timeoutSec: 900,
    options: { out: { ...out, required: false }, commands: { value: 'filter' }, project: { value: 'path' }, steps: { value: 'json' }, format: { value: 'format', choices: IMAGE_FORMATS.vectorcraft, default: 'png' }, scale: { value: 'n', min: 0.1, max: 8 } },
  },
  interpolate: {
    help: 'Smooth slow motion or a higher frame rate on this computer (no service needed; RIFE on the graphics card, fetched the first time, about 430 MB). It invents the frames between the frames of a clip. --mode slow (default) with --factor 2 to 8 plays the clip that many times slower and smooth (the sound is dropped); --mode fps with --fps 60 raises the clip to that rate, same length, sound kept. Clips of up to 600 frames (about 20 s at 30 fps): cut longer ones first. Returns the file under assets/video.',
    dir: 'assets/video', timeoutSec: 3600,
    options: { src: { value: 'path', required: true, path: 'media' }, out, mode: { value: 'mode', choices: INTERPOLATE_MODES, default: 'slow' }, factor: { value: 'n', min: 2, max: 8, integer: true, default: 2 }, fps: { value: 'n', min: 24, max: 120, integer: true, default: 60 } },
  },
  autoedit: {
    help: 'Cut the dead parts out of a clip on this computer (no service needed; auto-editor, fetched the first time, about 45 MB). By default it removes the silences (what is below --threshold percent of loudness, 4 by default) and keeps --margin seconds (0.2) around the speech; --speedup 8 speeds the silences up instead of cutting them; --edit takes an auto-editor expression ("motion:threshold=2%" cuts what does not move). Returns the file under assets/video, with the seconds before and after. A cut like this is a first pass: look at it before building on it.',
    dir: 'assets/video', timeoutSec: 1800,
    options: { src: { value: 'path', required: true, path: 'media' }, out, threshold: { value: 'percent', min: 0, max: 100, default: 4 }, margin: { value: 's', min: 0, max: 5, default: 0.2 }, speedup: { value: 'x', min: 1.1, max: 20 }, edit: { value: 'expr' } },
  },
  soundcraft: {
    help: 'Mix sound on this computer (no service needed; Skill SoundMaker, a Pro Tools-style studio with EQ, compressor, gate, de-esser, reverb, delay and more; fetched the first time, about 15 MB). You build the mix with --steps, a JSON list of commands run in order, e.g. [{"id":"session.new","params":{"name":"mix","sample_rate":48000}},{"id":"file.import_audio","params":{"path":"assets/audio/voice.wav"}},{"id":"file.import_audio","params":{"path":"assets/audio/music/song.mp3"}},{"id":"mix.volume","params":{"tracks":[2],"db":-14}}] (paths are relative to the project; each import answers with its track and clip ids; --commands <word> lists the commands, --commands plugins the effects). The mix is written to assets/audio/mix/<out>.wav (or --format flac) and its loudness is measured: LUFS, peak and true peak, so check it (about -16 LUFS for the web) before using it in film.html in place of the separate tracks. --session keeps the .scraft (default assets/audio/sessions/<out>.scraft, opened again when it exists); --start and --end bounce a part.',
    dir: 'assets/audio', timeoutSec: 900,
    options: { out: { ...out, required: false }, commands: { value: 'filter' }, session: { value: 'path' }, steps: { value: 'json' }, format: { value: 'format', choices: MIX_FORMATS, default: 'wav' }, start: { value: 's', min: 0 }, end: { value: 's', min: 0 } },
  },
  anicraft: {
    help: 'Animate on this computer (no service needed; Skill 2D, an Adobe Animate-style 2D vector studio: shapes, text, layers, keyframes, classic, shape and motion tweens, easing, symbols, filters; fetched the first time, about 20 MB). You build with --steps, a JSON list of commands run in order, e.g. [{"id":"draw.rect","params":{"x":20,"y":120,"w":100,"h":100,"fill":"#E0384E","stroke":"none"}},{"id":"edit.select_all","params":{}},{"id":"modify.convert_to_symbol","params":{"name":"box"}},{"id":"timeline.insert_keyframe","params":{"frame":29}},{"id":"timeline.goto","params":{"frame":29}},{"id":"edit.select_all","params":{}},{"id":"element.set_transform","params":{"x":500,"y":170}},{"id":"timeline.create_tween","params":{"frame":0,"easing":"ease-out"}}] (a new project is --width x --height at --fps, 1280x720 at 30 by default; frames in steps are 0-based, --from/--to/--frame are 1-based; set_transform puts the centre of the object at x,y; draw shapes with "stroke":"none" unless an outline is wanted; a tween moves a symbol, so convert the drawing to one first). --format webm (default: transparent background, to lay over the film as a <video>; keep pure green #00FF00 out of the drawing), mp4 (opaque; --background "#rrggbb" for the colour), gif, lottie (a .json, transparent, for the lottie adapter) or png (one frame, --frame). --project keeps the .anicraft (default assets/design/<out>.anicraft, built on again when it exists, so later calls may give only --steps that change it). --commands <words> lists the commands and their parameters that match (e.g. tween easing) instead of rendering. Returns the file under assets/video (assets/image for png).',
    dir: 'assets/video', timeoutSec: 1800,
    options: { out: { ...out, required: false }, commands: { value: 'words' }, project: { value: 'path' }, steps: { value: 'json' }, format: { value: 'format', choices: ANIMATION_FORMATS, default: 'webm' }, width: { value: 'px', min: 16, max: 4096, integer: true }, height: { value: 'px', min: 16, max: 4096, integer: true }, fps: { value: 'n', min: 1, max: 120, integer: true }, from: { value: 'frame', min: 1, integer: true }, to: { value: 'frame', min: 1, integer: true }, frame: { value: 'frame', min: 1, integer: true }, scale: { value: 'n', min: 0.1, max: 4 }, background: { value: '#rrggbb' } },
  },
  browse: {
    help: 'Open a web page in the person\'s own browser, so they see the reference you are looking at (once they linked it in Studio: the setup guide, Settings). It shows the page; to read one yourself use web-fetch, to find one web-search. Returns the address opened.',
    timeoutSec: 30,
    options: { url: { value: 'https://…', required: true } },
  },
  'web-music': {
    help: 'Find music or sound effects on the web (Jamendo, Openverse, Freesound) and download them (1 to 4), licensed for use: each comes with its artist, licence and page, the credit the film gives it. With Freesound (--via freesound) the whole library is searched by default (--kind all, no length filter; with no --prompt, its most downloaded), --kind sfx keeps to sound effects (under 30 s, in assets/audio/sfx), --kind music to longer pieces (assets/audio/music), --id one sound by its Freesound number; read the freesound skill first (lopesfilm skill freesound). Returns their paths and lengths. Play the part you need with a media fragment on the clip\'s src (#t=in,out).',
    dir: 'assets/audio/music', timeoutSec: 600,
    options: { out, prompt: { ...prompt, required: false }, n: { value: 'n', min: 1, max: 4, integer: true, default: 1, alias: 'limit' }, kind: { value: 'kind', choices: ['all', 'music', 'sfx'], default: 'all' }, id: { value: 'n', min: 1, integer: true } },
  },
  image: {
    help: 'Make one picture, or a new one from pictures in the project (--ref, up to 16; with --mask, a PNG whose transparent part is what is redrawn of the first; or --markup, a transparent PNG the size of the first with what to change drawn or written on it). --quality low is quick and costs least, max is finest and slowest; --size 1k, 2k or 4k. --format gif makes a looping animation of --frames (2 to 16) frames of --frame-ms each: a GIF clip plays its frames by the film\'s time, looping, so one round lasts frames × frame-ms. --format svg makes a vector picture from the prompt alone, its shapes elements a page can change. Returns its path and size.',
    dir: 'assets/image', timeoutSec: 300,
    options: { out, prompt, ratio: { value: 'ratio', choices: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'], default: '3:2' },
      quality: { value: 'level', choices: ['low', 'medium', 'high', 'xhigh', 'max'], default: 'low' },
      size: { value: 'size', choices: ['1k', '2k', '4k'], default: '1k' }, transparent: {},
      ref: { value: 'path', path: 'picture', repeat: true }, mask: { value: 'path', path: 'picture' }, markup: { value: 'path', path: 'picture' },
      format: { value: 'format', choices: ['png', 'gif', 'svg'], default: 'png' },
      frames: { value: 'n', min: 2, max: 16, integer: true, default: 9 }, 'frame-ms': { value: 'ms', min: 20, max: 2000, integer: true, default: 200 } },
  },
  video: {
    help: 'Make one video clip. --resolution 480p to 4K, as the model makes them (720p, or its nearest, when not asked): a bigger one costs more. Returns src, dur, its size and preview frames. It spends a lot: the person confirms it in Studio first (--yes when they already agreed). The same request again returns the same clip; --force makes a new one. A person who speaks on screen speaks in the clip, the voice and the lips made together, never a voice laid over a clip made without it: write the words in the prompt, in quotes, and keep the clip\'s own sound (--voice gives a recording of whose voice it is, the same across clips); or give a recording with --audio and the lips follow it word for word (at fal: omnihuman-v2 or kling-avatar-v2 from a picture of the person, --first-frame; sync-3 for a clip, --video). --video makes it from a clip in the project, trimmed to the part to make again (references/ is the place for another\'s footage); what it keeps is the model\'s way, chosen with --model: at fal, kling-o3-edit changes what the prompt names and keeps the rest; kling-o3-reference makes a new clip with its camera and motion; seedance-2.0 takes it as a reference (@Video1 in the prompt); luma-ray-3.2 redraws it, its performance kept; minimax-h3-max-recast puts the people of --input-reference in place of its own, one picture each; at OpenRouter, a Seedance model takes it as a reference too, given a web address (Lopes.Film\'s service gives one; your own key cannot); at Google and OpenRouter, gemini-omni-1.2-flash edits it as the prompt says, or continues it when the prompt asks (a clip of 15 s at most to edit, 30 s in all once continued; --duration: the 3 to 10 s a continuation adds, else the clip\'s own length).',
    dir: 'assets/video', timeoutSec: 1200,
    options: { out, prompt, force: {}, duration: { value: 'seconds', min: 2, max: 30, integer: true, default: 5 },
      resolution: { value: 'size', choices: ['480p', '720p', '768p', '1080p', '2K', '4K'] },
      'aspect-ratio': { value: 'ratio', choices: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9', '9:21', '3:2', '2:3', 'adaptive'] },
      'first-frame': { value: 'path', path: 'picture' }, 'last-frame': { value: 'path', path: 'picture' },
      'input-reference': { value: 'path', path: 'picture', repeat: true }, video: { value: 'path', path: 'clip' },
      audio: { value: 'path', path: 'speech' }, voice: { value: 'path', path: 'speech' } },
  },
  'web-download': {
    help: 'Fetch a video (or with --audio only its sound, as MP3) from a link: YouTube, Vimeo, Instagram, TikTok, X and about a thousand sites (yt-dlp, on this computer, fetched the first time). --height caps the picture (default 1080); --from / --to (seconds) take only a part. Saved under assets/video (or assets/audio). Only for what the person has the right to use: their own uploads, material under a licence that allows it, or a reference for study.',
    dir: 'assets/video', timeoutSec: 1800,
    options: { url: { value: 'url', required: true }, out: { value: 'name' }, audio: {}, height: { value: 'n', min: 144, max: 4320, integer: true }, from: { value: 'n', min: 0 }, to: { value: 'n', min: 0 } },
  },
  'youtube-music': {
    help: 'A song or track from YouTube as MP3 into assets/audio/music (yt-dlp, on this computer): --query is its name ("artist - title") or a YouTube link; the first result is taken. Credit it in the film; only what the person has the right to use (their own music, a licence that allows it). Returns the file.',
    dir: 'assets/audio/music', timeoutSec: 1800,
    options: { query: { value: 'text', required: true }, out: { value: 'name' }, from: { value: 'n', min: 0 }, to: { value: 'n', min: 0 } },
  },
  listen: {
    help: 'Hear a sound or a video\'s sound on this computer (earshot): what it sounds like in words, with calibrated tags and its loudness, brightness and length. With --query, how well it fits that description (strong / plausible / weak / no match). Installs earshot the first time (about 1.4 GB).',
    timeoutSec: 1800,
    options: { src: { value: 'path', required: true, path: 'speech' }, query: { value: 'text' } },
  },
  'sound-find': {
    help: 'The best moments for a description inside a long sound or video (earshot find): start and end seconds of each, best first (--top, default 5). E.g. --query "a single door slam".',
    timeoutSec: 1800,
    options: { src: { value: 'path', required: true, path: 'speech' }, query: { value: 'text', required: true }, top: { value: 'n', min: 1, max: 20, integer: true, default: 5 } },
  },
  'sound-review': {
    help: 'Listen through a whole film or soundtrack (earshot): --mode timeline (default) is a second-by-second account (what is heard, hits against cuts, loudness); --mode critique scores it against professional launch films and says what to fix first.',
    timeoutSec: 3600,
    options: { src: { value: 'path', required: true, path: 'speech' }, mode: { value: 'mode', choices: ['timeline', 'critique'], default: 'timeline' } },
  },
  earshot: {
    help: 'Any earshot command, run in the project folder on this computer (earshot.md in the listen skill): --args "sfx list --kind hit", "sfx render ui_pop_soft -o assets/audio/sfx/pop.wav", "kit render audio/kit.json --out assets/audio/kit", "rank \\"a soft whoosh\\" assets/audio/sfx --top 5", "sheet film.mp4 -o assets/data/sheet.png". Paths inside the project. Returns what it printed.',
    timeoutSec: 3600,
    options: { args: { value: 'text', required: true } },
  },
  'rea-video': {
    help: 'Any rea-video command, run in the project folder on this computer (the breakdown skill): --args "stems assets/video/ref.mp4 -o assets/breakdown/ref-stems" (original, voice and music as three tracks), "review assets/breakdown/ref", "remake-plan assets/breakdown/ref". Paths inside the project. Returns what it printed.',
    timeoutSec: 3600,
    options: { args: { value: 'text', required: true } },
  },
  breakdown: {
    help: 'Break a reference video down shot by shot (rea-video, on this computer): for each shot whether it was filmed, AI-generated or made in code, framing, camera moves, light, text and sound, and how to remake it. Writes VIDEO.md (layered, for agents), report.html (for the person) and the shots\' frames under assets/breakdown/<out>/. --lang en (default) or zh. Installs rea-video the first time (about 600 MB).',
    dir: 'assets/breakdown', timeoutSec: 3600,
    options: { src: { value: 'path', required: true, path: 'clip' }, out, lang: { value: 'lang', choices: ['en', 'zh'], default: 'en' }, stems: {} },
  },
  'web-search': {
    help: 'Search the web (up to 3 --query at once). Returns the pages that match: title, URL and an excerpt of each. web-fetch reads a whole page.',
    timeoutSec: 120,
    options: { query: { value: 'text', required: true, repeat: true } },
  },
  'web-fetch': {
    help: 'Read public web pages (up to 3 --url at once): each page\'s text is saved as Markdown. Returns its path, title and how it starts.',
    dir: 'assets/fetch', timeoutSec: 120,
    options: { url: { value: 'url', required: true, repeat: true } },
  },
  call: {
    help: 'A request to one of the person\'s own services (below): how to call it is in the person\'s words or the service\'s docs. Studio adds its key as Authorization: Bearer, or where you write {key} (a --header, the --path\'s query), as the docs say; you never see the key. Its answer comes back as it is: text or JSON here, a file saved under assets/<service>/. What it means is yours to read.',
    timeoutSec: CALL_TIMEOUT_SEC,
    options: { service: { value: 'id', required: true }, path: { value: '/path', default: '/' },
      method: { value: 'method', choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }, json: { value: 'json' },
      form: { value: 'name=value', repeat: true }, file: { value: 'name=path', repeat: true }, body: { value: 'path' },
      header: { value: 'Name: value', repeat: true }, out: { value: 'name' } },
  },
});

/** Listed only for an agent without web tools of its own (see the top). */
export const WEB_VERBS = ['web-search', 'web-fetch'];

/** Where the person connects a service and picks its models, said the same way everywhere. */
export const WHERE_TO_CONNECT = 'In Studio, the Lopes.Film logo at the top left opens Settings: under Services the person chooses the model '
  + 'for each kind of media, and connects its service there (signing in, or with their own key).';
/** The services that make `verb`, by name: "fal.ai, Google or OpenAI". @param {string} verb */
const makers = (verb) => {
  const names = listProviders().filter((p) => /** @type {readonly string[]} */ (p.verbs).includes(verb)).map((p) => p.name).sort((a, b) => a.localeCompare(b));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0] ?? 'no service here makes it yet';
};
/** What is not connected here, which services make each, and where the person connects one. @param {string[]} verbs */
const notConnected = (verbs) => `Not connected here: ${verbs.map((v) => `${v} (${makers(v)})`).join(', ')}. `
  + `Each works only once the person connects a service that makes it. ${WHERE_TO_CONNECT}`;
/** Whether any of the services, connected or not, can make `verb`. */
const offered = (/** @type {string} */ verb) => listProviders().some((p) => /** @type {readonly string[]} */ (p.verbs).includes(verb));
/** The whole of `lopesfilm get` when nothing is connected. */
const nothing = () => 'Nothing is connected for media here: each kind works only once the person connects a service that makes it (below). '
  + 'Until then, take what Lopes.Film\'s own library has (its verbs are free and need nothing connected), make sound and pictures in code, '
  + 'or use a service the person has a key for (with its API docs), and save them under assets/. '
  + `\`lopesfilm get <what> --help\` shows what one kind takes (${Object.keys(VERBS).filter((v) => !WEB_VERBS.includes(v) && offered(v)).join(', ')}).`;

/** What `call` says when the person has added no service of their own. */
const NO_OWN_SERVICES = 'The person has added no services of their own. In Studio, the Lopes.Film logo at the top left opens Settings: '
  + 'they add one under Services (its address, its key if it takes one, and what it does).';

/** Each kind of media, in words (finding voices is part of voice-over). */
const WORDS = /** @type {Record<string, string>} */ ({
  tts: 'voice-over', music: 'music', sfx: 'sound effects', asr: 'transcripts', cutout: 'backgrounds taken out', image: 'images', 'image-search': 'image search', 'video-search': 'video search', 'web-music': 'web music', 'audio-clean': 'audio cleanup', stabilize: 'video stabilization', 'camera-track': 'camera tracking', 'subject-track': 'subject tracking', 'face-track': 'face tracking', 'web-download': 'downloads from links', 'youtube-music': 'music from YouTube', listen: 'listening', 'sound-find': 'sound search', 'sound-review': 'sound review', breakdown: 'video breakdowns', earshot: 'listening', 'rea-video': 'video breakdowns', 'cutout-video': 'video background removal', stems: 'voice and music split', upscale: 'upscaling', eyes: 'eye contact', effectcraft: 'motion graphics', figcraft: 'design', vectorcraft: 'vector drawings', interpolate: 'smooth slow motion', autoedit: 'automatic cuts', soundcraft: 'sound mixing', anicraft: 'animation', browse: 'browser',
  video: 'video', translate: 'subtitle translation', 'web-search': 'web search',
});
/** The media services `get` can use, by name (none comes first), what each makes, and where the person connects them. */
export const services = () => `Media services, each used with the person's own key: ${listProviders()
  .map((p) => ({ name: p.name, makes: p.verbs.filter((v) => WORDS[v]).map((v) => WORDS[v]).join(', ') }))
  /* Local services, with no model installed, make nothing yet */
  .filter((p) => p.makes)
  .sort((a, b) => a.name.localeCompare(b.name)).map((p) => `${p.name} (${p.makes})`).join(', ')}. ${WHERE_TO_CONNECT} ${ADD_ONE()}`;

/** How a service that is not built in is added: a provider module of its own, read like the built-in ones. */
const ADD_ONE = () => `A service not listed is added as a provider: ${join(addedDir(), '<id>', 'provider.mjs')}, whose default export follows `
  + `${fileURLToPath(new URL('./providers/contract.mjs', import.meta.url))} (as ${fileURLToPath(new URL('./providers/openrouter.mjs', import.meta.url))} does), `
  + 'written from the service\'s API docs; once the person adds its key in Settings → Services, it makes media like the others, on the canvas too. '
  + 'Try it with `lopesfilm get <verb> --via <id>`.';

/** How long the person has to answer a question about spending. */
const ASK_WAIT_MS = 15 * 60_000;
/** The most a file sent to a provider may be (a recording's speech, a frame). */
const MAX_INPUT_BYTES = 48 << 20;
/** Receipt fields about money: the person sees what was spent on the provider's own page, the agent sees what landed. */
const BILLING = new Set(['budget', 'balance', 'spent', 'plan', 'planName', 'price', 'prices', 'usd', 'cost', 'costUsd', 'charged']);

/** Why a get did not run; `code` is the CLI's exit status (2: not a project or a wrong command, 1: it did not run). */
export class GetError extends Error {
  /** @param {string} message @param {1 | 2} [code] @param {'balance'} [reason] why it did not run, for a page to say in its own words */
  constructor(message, code = 1, reason) {
    super(message);
    this.code = code;
    this.reason = reason;
  }
}
const usage = (/** @type {string} */ message) => new GetError(message, 2);

/* ── options ─────────────────────────────────────────────────────────────── */

/** An option as the help writes it: `--out <name>`, `[--n <n>]`. @param {string} name @param {Option} o */
export function flagHelp(name, o) {
  const flag = o.value ? `--${name} <${o.choices ? o.choices.join('|') : o.value}>` : `--${name}`;
  return o.required ? flag : `[${flag}]`;
}

/**
 * The verb's options from what the CLI sent (`{ name: string | true | (string | true)[] }`): known, typed, checked and
 * with their defaults. Paths must be files of the project of the right kind. Throws a GetError (exit 2) saying what is
 * wrong.
 * @param {string} root @param {string} verb @param {Record<string, unknown>} given
 */
export async function checkArgs(root, verb, given) {
  const spec = VERBS[verb];
  if (!spec) throw usage(`there is no ${verb || 'verb'}; there is ${Object.keys(VERBS).join(', ')}`);
  const all = Object.entries(spec.options).map(([n, o]) => flagHelp(n, o)).join(' ');
  /** @type {Record<string, unknown>} */
  const args = {};
  for (const [flag, raw] of Object.entries(given)) {
    const name = spec.options[flag] ? flag : Object.keys(spec.options).find((n) => spec.options[n].alias === flag);
    if (!name) throw usage(`${verb} has no --${flag}; it takes ${all}`);
    const option = spec.options[name];
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length > 1 && !option.repeat) throw usage(`--${name} is given once`);
    if (!option.value) {
      /* a switch given as false (a form's unchecked box) is a switch not given */
      if (values.every((v) => v === false || v === 'false')) continue;
      if (values.some((v) => v !== true && v !== 'true')) throw usage(`--${name} takes no value`);
      args[name] = true;
      continue;
    }
    const typed = values.map((given) => {
      /* a number from Studio's own forms (the inspector's) is the same value as the typed one */
      const v = typeof given === 'number' && Number.isFinite(given) ? String(given) : given;
      if (typeof v !== 'string' || !v.trim()) throw usage(`--${name} needs a value: ${flagHelp(name, option)}`);
      if (option.choices && !option.choices.includes(v)) throw usage(`--${name} is one of ${option.choices.join(', ')}`);
      if (option.min === undefined) return v;
      const n = Number(v);
      if (!Number.isFinite(n) || (option.integer && !Number.isInteger(n)) || n < option.min || n > /** @type {number} */ (option.max)) {
        throw usage(`--${name} is ${option.integer ? 'a whole number' : 'a number'} from ${option.min} to ${option.max}`);
      }
      return n;
    });
    args[name] = option.repeat ? typed : typed[0];
  }
  for (const [name, option] of Object.entries(spec.options)) {
    if (args[name] === undefined && option.default !== undefined) args[name] = option.default;
    if (args[name] === undefined && option.required) throw usage(`${verb} needs ${flagHelp(name, option)}`);
  }
  if (typeof args.out === 'string' && (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,120}$/u.test(args.out) || /\.[a-z0-9]{2,4}$/i.test(args.out))) {
    throw usage('--out is a simple name, without a folder or an extension (e.g. --out intro)');
  }
  for (const [name, option] of Object.entries(spec.options)) {
    if (!option.path || args[name] === undefined) continue;
    for (const rel of /** @type {string[]} */ ([args[name]].flat())) await projectFile(root, rel, name, option.path);
  }
  if (args['last-frame'] && !args['first-frame']) throw usage('--last-frame needs --first-frame');
  if (args['first-frame'] && args['input-reference']) throw usage('--first-frame and --input-reference do not go together');
  return args;
}

/** A file of the project the option names, of the kind it wants. @param {string} root @param {string} rel @param {string} name @param {'speech' | 'picture' | 'clip' | 'media'} want */
async function projectFile(root, rel, name, want) {
  let abs;
  try { abs = inside(root, rel); } catch { throw usage(`--${name} ${rel} is not a path inside the project`); }
  if (!(await stat(abs).catch(() => null))?.isFile()) throw usage(`--${name} ${rel} is not in the project`);
  const kind = clipKind(rel);
  if (want === 'speech' ? kind !== 'sound' && kind !== 'video' : want === 'clip' ? kind !== 'video' : want === 'media' ? kind !== 'video' && kind !== 'still' : kind !== 'still') {
    throw usage(`--${name} wants ${want === 'speech' ? 'a sound or video file' : want === 'clip' ? 'a video file' : want === 'media' ? 'a picture or a video file' : 'a picture'}; ${basename(rel)} is not one`);
  }
  /* a recording's transcript is written beside it, and files and folders starting with a dot are the tools' (.git) */
  /* from the project a timeline or compound film is in: its files are named from its own folder (`../../assets/a.mp4`),
     whose `..` is not a tools' folder */
  if (want === 'speech' && relative(compoundOuter(root), abs).split(sep).some((part) => part.startsWith('.'))) {
    throw usage(`--${name} ${rel} belongs to the tools (a name starting with a dot), and its transcript would go beside it: copy it elsewhere in the project first`);
  }
}

/* ── running ─────────────────────────────────────────────────────────────── */

/**
 * The question asked in Studio: 'allow', 'deny', 'timeout', or null when no page shows the project.
 * @typedef {(spend: Spend) => Promise<'allow' | 'deny' | 'timeout' | null>} Ask
 */

/**
 * What the person is told in Studio, without a question: a provider whose account has no balance left for a run.
 * @typedef {{ kind: 'balance', provider: string, providerId: string }} Notice
 */

/**
 * Run `verb` for the project at `root` and land what it makes. Resolves with the receipt for the agent; throws a
 * GetError (or a provider's own Error) saying why it did not run.
 * `model`: the provider's model for this run, instead of the person's choice for this kind of media.
 * @param {string} root @param {string} verb @param {Record<string, unknown>} given
 * `tell`: says a Notice to the person in Studio.
 * @param {{ via?: string, model?: string, yes?: boolean, ask?: Ask, tell?: (notice: Notice) => void, signal?: AbortSignal }} [options]
 */
export async function runGet(root, verb, given, { via, model, yes = false, ask, tell, signal = new AbortController().signal } = {}) {
  const args = await checkArgs(root, verb, given);
  if (verb === 'call') {
    const { custom } = await providerSettings();
    const service = custom.find((s) => s.id === args.service);
    if (!service) throw usage(custom.length ? `There is no service ${args.service}: there is ${custom.map((s) => s.id).join(', ')}` : NO_OWN_SERVICES);
    const { service: _, ...rest } = args;
    try { return await callService(root, service, /** @type {Parameters<typeof callService>[2]} */ (rest), signal); }
    catch (e) { throw /** @type {{ status?: number }} */ (e)?.status === 400 ? usage(/** @type {Error} */ (e).message) : e; }
  }
  if (verb === 'audio-clean') {
    const done = await cleanAudio(root, /** @type {Parameters<typeof cleanAudio>[1]} */ (args), signal).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'browse') {
    try { return show(browse(String(args.url))); } catch (e) { throw new GetError(/** @type {Error} */ (e).message); }
  }
  if (verb === 'effectcraft') {
    const done = await effectcraft(root, /** @type {any} */ (args), signal, () => {}).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'figcraft' || verb === 'vectorcraft') {
    const done = await design(DESIGNS[verb], root, /** @type {any} */ (args), signal, () => {}).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'anicraft') {
    const done = await anicraft(root, /** @type {any} */ (args), signal, () => {}).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'soundcraft') {
    const done = await soundcraft(root, /** @type {any} */ (args), signal, () => {}).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'interpolate' || verb === 'autoedit') {
    const run = verb === 'interpolate' ? interpolate : autoEdit;
    const done = await run(root, /** @type {any} */ (args), signal, () => {}).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'web-download' || verb === 'youtube-music') {
    const done = await webDownload(root, /** @type {any} */ (verb === 'youtube-music' ? { ...args, music: true } : args), signal).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'listen' || verb === 'sound-find' || verb === 'sound-review' || verb === 'breakdown' || verb === 'earshot' || verb === 'rea-video') {
    const done = await runListening(root, verb, /** @type {any} */ (args), signal).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'stabilize' || verb === 'camera-track' || verb === 'subject-track' || verb === 'face-track' || verb === 'cutout-video' || verb === 'stems') {
    const a = /** @type {any} */ (args);
    const done = await (verb === 'stabilize' ? stabilize(root, a, signal) : verb === 'camera-track' ? track(root, a) : verb === 'subject-track' ? trackSubject(root, a) : verb === 'face-track' ? trackFace(root, a, signal) : verb === 'stems' ? stems(root, a) : cutoutVideo(root, a, signal, () => {})).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'upscale' || verb === 'eyes') {
    const run = verb === 'upscale' ? upscale : eyes;
    const done = await run(root, /** @type {any} */ (args), signal, () => {}).catch((e) => { throw new GetError(e.message); });
    return show(done);
  }
  if (verb === 'asr' && args.force !== true && await transcriptIsCurrent(root, String(args.src))) {
    return show(await speechReceipt(root, 'asr', String(args.src), { skip: true, note: 'It has a transcript already, made since the file last changed (--force makes it again).' }));
  }
  const settings = await providerSettings();
  /* `--via` names one: when it cannot, it says why (no such provider, not this verb, no key) */
  /* transcripts: Whisper large-v3-turbo on this computer comes first; the online service (Voice Studio, ...) only when the
     person chose it in Settings → Services, or names it with --via */
  const whisperFirst = verb === 'asr' && !via && settings.asrService !== true;
  let provider = whisperFirst ? null : await chooseProvider(/** @type {Verb} */ (verb), { via: via ?? null, settings }).catch((e) => { throw usage(e.message); });
  const said = /** @type {string[]} */ ([]);
  /* captions need no service: with none chosen (or none working) they are made on this computer by Whisper */
  const whisperWay = verb === 'asr' && !via;
  if (!provider && whisperWay && await ensureWhisper({ say: (line) => { said.push(line); }, signal })) provider = listProviders().find((p) => p.id === 'local') ?? null;
  /* Whisper cannot run here (turned off, not fetched): the online service the person has, as before */
  if (!provider && whisperFirst) provider = await chooseProvider('asr', { settings }).catch(() => null);
  if (!provider) {
    throw new GetError(`${notConnected([verb])} Tell the person. Until then, make it in code, or use a service the person has a key for (with its API docs), and save it under assets/.`);
  }

  /* the model named for this run: one the provider has for this kind of media */
  const kind = /** @type {Verb} */ (kindOf(verb));
  const offered = provider.models?.[kind] ?? [];
  if (model !== undefined && !offered.some((m) => m.id === model)) {
    throw usage(offered.length ? `--model is one of ${offered.map((m) => m.id).join(', ')} with ${provider.name}` : `${provider.name} names no models for ${verb}`);
  }
  const runModel = model ?? modelFor(settings, provider, verb);

  const spec = VERBS[verb];
  const clock = deadline(spec.timeoutSec + 60, signal);
  /** @param {Spend} spend */
  const approve = async (spend) => {
    if (yes) return;
    clock.pause();
    try { await approved(spend, ask ? await ask(spend) : null); } finally { clock.resume(); }
  };
  const ctx = {
    key: providerKey(provider, settings)?.key ?? '',
    model: runModel,
    root,
    signal: clock.signal,
    say: (/** @type {string} */ line) => { said.push(line); },
    read: (/** @type {string} */ path) => readInput(root, path, verb === 'asr' && path === args.src, clock.signal, provider.speechFormat),
  };
  try {
    if (verb === 'video' && !yes) {
      const words = typeof args.prompt === 'string' ? args.prompt : '';
      const named = offered.find((m) => m.id === runModel)?.name ?? runModel;
      /* a clip that speaks a recording is as long as it; one made from another, about as long as that one */
      const from = typeof args.audio === 'string' ? await mediaSeconds(root, args.audio) : typeof args.video === 'string' ? await mediaSeconds(root, args.video) : null;
      await approve({ kind: 'video', provider: provider.name, ...(named ? { model: named } : {}), seconds: from !== null ? Math.round(from) : Number(args.duration),
        ...(words ? { prompt: words.length > 200 ? `${words.slice(0, 199).trimEnd()}…` : words } : {}) });
    }
    /** @type {Awaited<ReturnType<typeof provider.run>>} */
    let result;
    try { result = await provider.run(/** @type {Verb} */ (verb), args, ctx); }
    catch (e) {
      /* the service could not make the transcript (not running, offline, no balance): Whisper here does, free */
      if (!whisperWay || provider.id === 'local' || clock.timedOut() || signal?.aborted) throw e;
      clock.pause();
      let ready = false;
      try { ready = await ensureWhisper({ say: ctx.say, signal }); } finally { clock.resume(); }
      if (!ready) throw e;
      ctx.say(`${provider.name} could not make the transcript (${String(/** @type {Error} */ (e).message).split('\n')[0].slice(0, 160)}): made on this computer with Whisper instead.`);
      try { result = await runWhisper(args, ctx); } catch { throw e; }
    }
    await land(root, verb, args, result);
    return [...said, show(await receiptFor(root, verb, args, result.receipt))].join('\n');
  } catch (e) {
    if (clock.timedOut()) throw new GetError(`${provider.name} did not finish within ${spec.timeoutSec + 60} s, so Studio stopped waiting. Nothing landed in the project; try again later.`);
    if (/** @type {{ code?: string, limit?: boolean }} */ (e)?.code === 'balance' && /** @type {{ limit?: boolean }} */ (e).limit) {
      throw new GetError(`This did not run: the ${provider.name} key reached the spending limit set on it. The person can raise or remove that limit where `
        + `the key was made (${provider.keysUrl}), or use another key. Nothing was made. Stop and tell them; do not run it again until they say so.`, 1, 'balance');
    }
    if (/** @type {{ code?: string }} */ (e)?.code === 'balance') {
      tell?.({ kind: 'balance', provider: provider.name, providerId: provider.id });
      throw new GetError(`This did not run: ${provider.name} doesn't have enough balance. The person can top it up at ${provider.billingUrl}, `
        + 'or switch to another service. Nothing was made. Stop and tell them; do not run it again until they say so.', 1, 'balance');
    }
    throw e;
  } finally {
    clock.clear();
  }
}

/** Go on when the person said yes; otherwise say what the agent does now. @param {Spend} spend @param {'allow' | 'deny' | 'timeout' | null} answer */
function approved(spend, answer) {
  if (answer === 'allow') return;
  if (answer === null) {
    throw new GetError('A video clip is expensive, so the person confirms it first, and no Studio page is showing this project to ask them in. Ask the person; once they agree, run the same command again with --yes.');
  }
  if (answer === 'timeout') {
    throw new GetError('The person did not confirm this video clip in time, so it was not made. Carry on without it (a still picture or motion graphics instead) and mention it in one line.');
  }
  throw new GetError('The person chose not to make this video clip. Carry on without it (a still picture or motion graphics instead); do not run it again unless they ask.');
}

/**
 * A time limit that stops while the person is being asked (they may take minutes; the provider does not).
 * @param {number} seconds @param {AbortSignal} outer
 */
function deadline(seconds, outer) {
  const controller = new AbortController();
  let left = seconds * 1000, since = Date.now(), fired = false;
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  const start = () => { since = Date.now(); timer = setTimeout(() => { fired = true; controller.abort(); }, Math.max(0, left)); };
  start();
  return {
    signal: AbortSignal.any([outer, controller.signal]),
    pause() { clearTimeout(timer); left -= Date.now() - since; },
    resume: start,
    clear() { clearTimeout(timer); },
    timedOut: () => fired,
  };
}

/** A project file for a provider: as it is, or (`speech`) the sound alone, small. @param {string} root @param {string} rel @param {boolean} speech @param {AbortSignal} signal @param {'mp3'} [speechFormat] */
async function readInput(root, rel, speech, signal, speechFormat) {
  const abs = inside(root, rel);
  const bytes = speech ? await speechOf(abs, signal, speechFormat) : await readFile(abs);
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new GetError(speech
      ? `${rel} is too long to transcribe in one go (${Math.round(bytes.length / 1e6)} MB of speech even compressed, about ${Math.round(bytes.length / 3000 / 3600)} hours). Split it into parts first.`
      : `${rel} is too large to send (${Math.round(bytes.length / 1e6)} MB); use a smaller picture.`);
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * The speech of a recording, as transcription needs it: mono, 16 kHz, low bitrate, in the same format as the file (its
 * name and extension go with it). An hour of video is gigabytes; its speech this way is about 11 MB.
 * @param {string} abs @param {AbortSignal} signal @param {'mp3'} [speechFormat]
 */
async function speechOf(abs, signal, speechFormat) {
  // A provider may require MP3 regardless of the source container. Stream it without temporary files.
  if (speechFormat === 'mp3') {
    return new Promise((done, fail) => {
      execFile('ffmpeg', ['-nostdin', '-v', 'error', '-i', abs, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-af', 'aresample=async=1:first_pts=0', '-c:a', 'libmp3lame', '-b:a', '32k', '-f', 'mp3', 'pipe:1'],
        { signal, windowsHide: true, encoding: 'buffer', maxBuffer: MAX_INPUT_BYTES }, (error, out) => {
          if (error) return fail(new GetError('Could not prepare MP3 speech for transcription. Check the audio track, FFmpeg and recording length. No audio was uploaded.'));
          done(out);
        });
    });
  }
  const ext = extname(abs).toLowerCase();
  const format = ['.mp4', '.m4a', '.m4v', '.mov', '.3gp'].includes(ext) ? { codec: ['-c:a', 'aac', '-b:a', '32k'], f: 'mp4' }
    : ext === '.mp3' ? { codec: ['-c:a', 'libmp3lame', '-b:a', '32k'], f: 'mp3' }
    : ext === '.wav' ? { codec: ['-c:a', 'pcm_s16le'], f: 'wav' }
    : { codec: ['-c:a', 'libopus', '-b:a', '24k'], f: ext === '.webm' ? 'webm' : 'matroska' };
  const dir = await mkdtemp(join(tmpdir(), 'lopesfilm-speech-'));
  const to = join(dir, `speech${ext || '.mka'}`);
  try {
    await new Promise((done, fail) => {
      execFile('ffmpeg', ['-y', '-v', 'error', '-i', abs, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', ...format.codec, '-f', format.f, to], { signal, windowsHide: true }, (error, _out, stderr) => {
        if (!error) return done(undefined);
        if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return fail(new GetError('Transcribing needs ffmpeg (macOS: brew install ffmpeg · Debian/Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg).'));
        if (signal.aborted) return fail(error);
        fail(new GetError(`Could not read a sound track from ${basename(abs)} to transcribe it (${String(stderr).trim().split('\n').pop()?.slice(0, 160)}). Check that the file has sound.`));
      });
    });
    return await readFile(to);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Whether `abs` is inside `root` once links are followed: the nearest folder of it that is there decides. */
async function landsInside(/** @type {string} */ root, /** @type {string} */ abs) {
  const top = await realpath(root);
  for (let dir = dirname(abs); ; dir = dirname(dir)) {
    const real = await realpath(dir).catch(() => null);
    if (real) return real === top || real.startsWith(`${top}${sep}`);
    if (dirname(dir) === dir) return false;
  }
}

/** A path a provider may write: under assets/, with nothing odd in it. @param {unknown} path @returns {path is string} */
function landable(path) {
  return typeof path === 'string' && path.startsWith('assets/') && !/[\\\u0000-\u001f:]/.test(path)
    && !path.split('/').some((part) => !part || part === '.' || part === '..');
}

/** A row's word times, as `{ token, startSec, endSec? }` (rows carry `start` / `end`). @param {unknown} raw */
function wordsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((w) => {
    if (!w || typeof w !== 'object' || typeof w.token !== 'string' || !w.token) return [];
    const start = Number(w.startSec ?? w.start), end = Number(w.endSec ?? w.end);
    return Number.isFinite(start) && start >= 0 ? [{ token: w.token, startSec: start, ...(Number.isFinite(end) && end >= start ? { endSec: end } : {}) }] : [];
  });
}

/**
 * Land what a provider made: its files under assets/ (nothing else, no `..`), and for speech, its transcript beside it
 * (transcripts.mjs): a voice-over's or a transcript's timed words, or a transcript's own text (a service that times no
 * words), its lines spread over the speech. A voice-over without word times gets none: `get asr` makes it.
 * @param {string} root @param {string} verb @param {Record<string, unknown>} args @param {RunResult} result
 */
async function land(root, verb, args, result) {
  for (const file of result.files ?? []) {
    if (!landable(file?.path) || file.path.endsWith('.vtt')) continue;
    const abs = join(root, file.path);
    /* a link the project brings under assets/ is not written through to wherever it leads */
    if (!(await landsInside(root, abs))) continue;
    if ((await lstat(abs).catch(() => null))?.isSymbolicLink()) await rm(abs);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.bytes);
    /* a sound or video made again under its name: the old take's subtitles go (its own are written below) */
    const kind = clipKind(file.path);
    if (kind === 'sound' || kind === 'video') await dropTranscripts(root, file.path);
  }
  if (verb !== 'tts' && verb !== 'asr') return;
  for (const row of result.index ?? []) {
    /* asr: beside the recording --src names, checked already (in the project, not the tools'); tts: beside the
       provider's file, under assets/ */
    const src = verb === 'asr' ? String(args.src) : row?.src;
    const words = wordsOf(row?.words);
    const text = typeof row.text === 'string' && row.text.trim() ? row.text : words.map((w) => w.token).join(' ');
    /* a voice-over's transcript needs its timed words; a transcript's own text is enough on its own */
    if ((verb === 'tts' && (!landable(src) || !words.length)) || !text) continue;
    const dur = Number(row.dur);
    const lines = spokenLines(text, words, Number.isFinite(dur) && dur > 0 ? dur * 1000 : undefined);
    if (!lines.length) continue;
    const speaker = typeof row.cast === 'string' && row.cast.trim() ? row.cast.trim() : undefined;
    await writeTranscript(root, src, { lines, ...(speaker ? { speaker } : {}) });
    if (verb === 'asr') break;
  }
}

/**
 * The receipt as the agent reads it. Voice-over and transcripts say the same few things whoever made them: what was
 * said comes from the transcript, when there is one. What the provider sent beyond that stays out of the agent's way.
 * @param {string} root @param {string} verb @param {Record<string, unknown>} args @param {Record<string, unknown> | unknown[]} receipt
 */
async function receiptFor(root, verb, args, receipt) {
  const facts = Array.isArray(receipt) ? { results: receipt } : receipt ?? {};
  if (verb !== 'tts' && verb !== 'asr') return facts;
  return speechReceipt(root, verb, String(verb === 'asr' ? args.src : facts.src ?? ''), facts);
}

/**
 * tts and asr receipts: the same fields, in the same order, every time. `transcript`: its path, or why there is none.
 * @param {string} root @param {'tts' | 'asr'} verb @param {string} src @param {Record<string, unknown>} r
 */
async function speechReceipt(root, verb, src, r) {
  const read = await readTranscript(root, src);
  const transcript = read ? transcriptPath(src) : 'none: the service does not time words; `get asr --src` makes one';
  if (verb === 'tts') return { src, dur: r.dur, voiceId: r.voiceId ?? r.voice, skip: r.skip, note: r.note, transcript };
  const text = read ? read.lines.map((l) => l.text).join(' ') : typeof r.text === 'string' ? r.text : '';
  return { src, dur: r.dur, text: text.slice(0, 400), ...(text.length > 400 ? { textOmitted: text.length - 400 } : {}), skip: r.skip, note: r.note, transcript };
}

/** A receipt as text, without what it cost. @param {unknown} receipt */
function show(receipt) {
  /** @type {(v: unknown) => unknown} */
  const visible = (v) => Array.isArray(v) ? v.map(visible)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !BILLING.has(k)).map(([k, x]) => [k, visible(x)])) : v;
  return JSON.stringify(visible(receipt), null, 2);
}

/** The tools that change one of the project's files (`--src`): what the asset's inspector offers too. */
export const ASSET_EDITS = new Set(['audio-clean', 'stems', 'stabilize', 'cutout-video', 'upscale', 'eyes', 'interpolate', 'autoedit', 'cutout']);

/* ── what there is, and subtitle translation ─────────────────────────────── */

/**
 * What the agent can get here now: the verbs something connected makes, with their options, and `note`, what is not
 * connected (null: everything is). With nothing connected, no verbs and a note saying what to do instead. `only`: that
 * one verb, connected or not. `web`: with web search and reading web pages (WEB_VERBS), for an agent without its own.
 * @param {string} [only] @param {{ web?: boolean }} [options]
 * `services`: the services there are and where the person connects them (services()).
 * @returns {Promise<{ verbs: { verb: string, help: string, dir?: string, options: Record<string, Option> }[], note: string | null, services: string }>}
 */
export async function catalog(only, { web = false } = {}) {
  if (only !== undefined && !VERBS[only]) throw new HttpError(400, `there is no ${only}; there is ${Object.keys(VERBS).join(', ')}`);
  /* what each service offers now, to name the ones that would make what is not connected */
  await freshProviders();
  const settings = await providerSettings();
  /* the person's own services: `call`, listed with each of them, whenever there is one */
  const own = settings.custom;
  const listed = Object.entries(VERBS).filter(([verb]) => (only === undefined
    ? (verb === 'call' ? own.length > 0 : (web || !WEB_VERBS.includes(verb)) && offered(verb))
    : verb === only));
  const all = await Promise.all(listed.map(async ([verb, spec]) => ({
    verb, help: verb === 'call' && own.length ? `${spec.help} The person's services: ${servicesHelp(own).join('; ')}` : spec.help,
    ...(spec.dir ? { dir: spec.dir } : {}), options: spec.options,
    usable: verb === 'call' ? own.length > 0 : verb === 'audio-clean' || verb === 'stabilize' || verb === 'camera-track' || verb === 'subject-track' || verb === 'face-track' || verb === 'cutout-video' || verb === 'stems' || verb === 'web-download' || verb === 'youtube-music' || verb === 'listen' || verb === 'sound-find' || verb === 'sound-review' || verb === 'breakdown' || verb === 'earshot' || verb === 'rea-video' || verb === 'upscale' || verb === 'eyes' || verb === 'effectcraft' || verb === 'figcraft' || verb === 'vectorcraft' || verb === 'interpolate' || verb === 'autoedit' || verb === 'soundcraft' || verb === 'anicraft' || verb === 'browse' ? true : Boolean(await chooseProvider(/** @type {Verb} */ (verb), { settings })) || (verb === 'asr' && whisperAvailable()),
  })));
  const missing = all.filter((v) => !v.usable && v.verb !== 'call').map((v) => v.verb);
  if (only === undefined && !all.some((v) => v.usable)) return { verbs: [], note: nothing(), services: services() };
  const notes = [...(missing.length ? [notConnected(missing)] : []), ...(only === 'call' && !own.length ? [NO_OWN_SERVICES] : [])];
  return {
    verbs: all.filter((v) => only !== undefined || v.usable).map(({ usable: _, ...v }) => v),
    note: notes.length ? notes.join(' ') : null,
    services: services(),
  };
}

/**
 * One question answered by the person's agent's own model, with no chat (an app with a chat, studio-process.mjs):
 * its words, whole. Throws `code: 'no-agent'` when no agent is ready.
 * @typedef {{ agent: string, options: Record<string, string | number | boolean> }} WritingModel
 * @typedef {{ mimeType: string, data: string }} WritingImage
 * @typedef {(text: string, signal?: AbortSignal, model?: WritingModel, images?: WritingImage[]) => Promise<string>} AskAgent
 */

/** The JSON in an agent's answer: all of it, or from its first `{` to its last `}` when the agent wrapped it in words. */
const jsonIn = (/** @type {string} */ answer) => {
  const from = answer.indexOf('{'), to = answer.lastIndexOf('}');
  return from >= 0 && to > from ? answer.slice(from, to + 1) : answer;
};

/**
 * Subtitle translation for captions.mjs: by the person's agent's own model when Studio is in an app with a chat
 * (`askAgent`), else through the provider chosen for `translate`; null when neither can. With no agent ready, the
 * provider does it when there is one, else it is `code: 'not-connected'`.
 * @param {string} root @param {{ askAgent?: AskAgent | null }} [options] @returns {Promise<TranslateLines | null>}
 */
export async function subtitleTranslator(root, { askAgent = null } = {}) {
  const byProvider = await providerTranslator(root);
  if (!askAgent) return byProvider;
  return async (job) => {
    const ask = translationAsk(job.lines, job.language);
    let answer;
    try {
      answer = await askAgent(`${ask.system}\n\n${ask.user}`, job.signal);
    } catch (e) {
      if (/** @type {{ code?: unknown }} */ (e)?.code !== 'no-agent') throw e;
      if (byProvider) return byProvider(job);
      throw Object.assign(new Error('No agent is connected to translate the subtitles.'), { code: 'not-connected' });
    }
    return translatedLines(jsonIn(answer), ask.count);
  };
}

/** Subtitle translation through the provider chosen for `translate`; null when none can. @param {string} root */
async function providerTranslator(root) {
  const settings = await providerSettings();
  const provider = await chooseProvider('translate', { settings });
  if (!provider) return null;
  const key = providerKey(provider, settings)?.key ?? '';
  return async ({ signal = new AbortController().signal, ...job }) => {
    const result = await provider.run('translate', job, {
      key, model: modelFor(settings, provider, 'translate'), root, signal, say: () => {}, read: (path) => readInput(root, path, false, signal),
    }).catch((e) => {
      /* the person asked for it in Studio: said to them, with where to top it up */
      if (e?.code === 'balance' && e.limit) throw new Error(`The ${provider.name} key reached the spending limit set on it. Raise or remove that limit at ${provider.keysUrl}, or use another key, then try again.`);
      if (e?.code === 'balance') throw new Error(`${provider.name} doesn't have enough balance for this. Top it up at ${provider.billingUrl}, or switch to another service, then try again.`);
      throw e;
    });
    const lines = result.receipt?.lines;
    if (!Array.isArray(lines)) throw new Error(`${provider.name} answered without the translated lines.`);
    return /** @type {string[]} */ (lines);
  };
}

/**
 * Transcription for Studio's "make subtitles" (captions.mjs): `get asr` for one source, through the provider chosen for
 * it. The person asked for it in Studio, so it asks nothing more. Throws `code: 'not-connected'` when nothing can.
 * @returns {Promise<import('./captions.mjs').Transcribe>}
 */
export async function subtitleTranscriber() {
  return async (root, src, signal) => {
    if (!(await chooseProvider('asr', { settings: await providerSettings() }).catch(() => null)) && !whisperAvailable()) {
      throw Object.assign(new Error(notConnected(['asr'])), { code: 'not-connected' });
    }
    await runGet(root, 'asr', { src }, { yes: true, signal });
  };
}

/* ── asking the person ───────────────────────────────────────────────────── */

/**
 * Questions for the person in the Studio pages showing a project: an `{ type: 'ask', ask }` event on its stream, until
 * one page answers (or 15 minutes pass, or the run is called off); then `{ type: 'asked', id }` so every page drops it.
 * A Notice is told the same way, as `{ type: 'notice', notice }`, and wants no answer.
 * `roots`: the projects pages are watching now.
 * @typedef {{ type: 'ask', ask: Spend & { id: string } } | { type: 'asked', id: string } | { type: 'notice', notice: Notice & { id: string } }} AskEvent
 * @param {{ emit: (root: string, event: AskEvent) => void, roots: () => string[] }} pages
 */
export function createAsks(pages) {
  /** @type {Map<string, { root: string, event: { type: 'ask', ask: Spend & { id: string } }, settle: (answer: 'allow' | 'deny' | 'timeout') => void }>} */
  const waiting = new Map();
  const real = (/** @type {string} */ path) => { try { return realpathSync(path); } catch { return resolve(path); } };
  return {
    /** @param {string} root @param {Spend} spend @param {AbortSignal} [signal] @returns {Promise<'allow' | 'deny' | 'timeout' | null>} */
    ask(root, spend, signal) {
      const shown = pages.roots().find((r) => real(r) === real(root));
      if (!shown) return Promise.resolve(null);
      const id = randomUUID();
      const event = /** @type {const} */ ({ type: 'ask', ask: { id, ...spend } });
      return new Promise((done) => {
        const settle = (/** @type {'allow' | 'deny' | 'timeout'} */ answer) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
          waiting.delete(id);
          pages.emit(shown, { type: 'asked', id });
          done(answer);
        };
        const cancel = () => settle('timeout');
        const timer = setTimeout(cancel, ASK_WAIT_MS);
        timer.unref();
        signal?.addEventListener('abort', cancel, { once: true });
        waiting.set(id, { root: shown, event, settle });
        pages.emit(shown, event);
      });
    },
    /** The person's answer from a page; false when nothing waits for it (answered elsewhere, or too late). @param {string} id @param {boolean} allow */
    answer(id, allow) {
      const one = waiting.get(id);
      one?.settle(allow ? 'allow' : 'deny');
      return Boolean(one);
    },
    /** Tell the pages showing the project (none showing it: nobody is told). @param {string} root @param {Notice} notice */
    tell(root, notice) {
      const shown = pages.roots().find((r) => real(r) === real(root));
      if (shown) pages.emit(shown, { type: 'notice', notice: { id: randomUUID(), ...notice } });
    },
    /** The questions waiting in a project, for a page that opens meanwhile. @param {string} root */
    pending(root) {
      return [...waiting.values()].filter((w) => w.root === root).map((w) => w.event);
    },
  };
}

/* ── the route ───────────────────────────────────────────────────────────── */

/**
 * Studio's `/api/get` (the CLI, with the launch key; a page answers asks with its cookie):
 *   GET  /api/get[?verb=][&web=1] → { verbs: [{ verb, help, dir?, options }], note, services }: what can be got here now
 *                           (see catalog; `web=1` for an agent without web tools of its own)
 *   POST /api/get           { folder, verb, args, via?, model?, yes? } → { ok: true, text } once it is done, or
 *                           { ok: false, code, text, reason? }: code 2, not a project or a wrong command; 1, it did not run
 *                           (`reason` 'balance': the service's account had too little left)
 *   POST /api/get/asks/:id  { allow } → { answered }: the person's answer to a question about spending
 *   POST /api/get/library   { verb, args } → { code, lines }: a search of Lopes.Film's own library (src/library-search.mjs),
 *                           answered with the library and its model kept loaded here, so it takes milliseconds
 * @param {Req} req @param {Res} res @param {string[]} parts the path after /api/get @param {ReturnType<typeof createAsks>} asks
 */
export async function getRoute(req, res, parts, asks, place = null, emit = null) {
  if (!parts.length && req.method === 'GET') {
    const query = new URL(req.url ?? '', 'http://studio').searchParams;
    return json(res, 200, await catalog(query.get('verb') ?? undefined, { web: query.get('web') === '1' }));
  }
  if (parts[0] === 'asks' && parts[1] && req.method === 'POST') {
    const { allow } = /** @type {{ allow?: unknown }} */ (await readJson(req));
    return json(res, 200, { answered: asks.answer(parts[1], allow === true) });
  }
  if (parts[0] === 'library' && parts.length === 1 && req.method === 'POST') {
    const { verb, args } = /** @type {{ verb?: unknown, args?: unknown }} */ (await readJson(req));
    const { LIBRARY_VERBS, libraryGet } = await import('../../src/library-search.mjs');
    const given = args && typeof args === 'object' && !Array.isArray(args) ? /** @type {Record<string, string | true>} */ (args) : {};
    if (typeof verb !== 'string' || !(verb in LIBRARY_VERBS) || 'take' in given) throw new HttpError(400, 'a search of the library, please');
    return json(res, 200, await libraryGet(verb, given));
  }
  if (parts.length || req.method !== 'POST') throw new HttpError(404, 'no such API');
  const body = /** @type {{ folder?: unknown, verb?: unknown, args?: unknown, via?: unknown, model?: unknown, yes?: unknown }} */ (await readJson(req));
  /* the CLI gone (Ctrl-C): the run stops with it */
  const controller = new AbortController();
  res.once('close', () => { if (!res.writableEnded) controller.abort(); });
  let editFailed = () => {};
  try {
    const root = resolve(String(body.folder ?? ''));
    if (!(await stat(join(root, FILM_FILE)).catch(() => null))?.isFile()) throw usage(`${root} is not a project; \`lopesfilm open\` makes one`);
    const given = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? /** @type {Record<string, unknown>} */ (body.args) : {};
    /* what a run makes (a voice, a picture, a clip, a track) goes on the timeline as soon as it is made, the person watching,
       not when the agent finishes: the files that were not there before it ran, by the editor's own insert */
    const verb = String(body.verb ?? '');
    const before = place && PLACED.has(verb) && body.place !== false ? await mediaIn(root) : null;
    /* an agent changing one of the project's files: the page's cursor works that asset's own controls while it runs */
    const assetEdit = emit && ASSET_EDITS.has(verb) && typeof given.src === 'string' && /** @type {{ by?: unknown }} */ (body).by !== 'studio'
      ? (/** @type {'start' | 'done' | 'failed'} */ phase, /** @type {string | undefined} */ made) => emit(root, { type: 'asset-edit', phase, verb, src: String(given.src), args: given, ...(made ? { made } : {}) })
      : null;
    assetEdit?.('start');
    if (assetEdit) editFailed = () => assetEdit('failed');
    const text = await runGet(root, verb, given, {
      ...(typeof body.via === 'string' && body.via ? { via: body.via } : {}),
      ...(typeof body.model === 'string' && body.model ? { model: body.model } : {}),
      yes: body.yes === true,
      ask: (spend) => asks.ask(root, spend, controller.signal),
      tell: (notice) => asks.tell(root, notice),
      signal: controller.signal,
    });
    if (assetEdit) { let made; try { made = JSON.parse(text).src; } catch { /* text */ } assetEdit('done', typeof made === 'string' ? made : undefined); }
    void recordUsage({ verb, ...(typeof body.via === 'string' ? { via: body.via } : {}), ...(typeof body.model === 'string' ? { model: body.model } : {}) });
    let out = text;
    if (before && place) {
      const made = [...(await mediaIn(root))].filter((f) => !before.has(f)).sort();
      if (made.length) {
        const done = await place(root, made.map((src) => ({ op: 'insert', clip: { src } })), 'get').catch(() => null);
        if (done?.ok) {
          /* the receipt is JSON: it says what was put on the timeline, inside it */
          try {
            const receipt = JSON.parse(text);
            if (receipt && typeof receipt === 'object' && !Array.isArray(receipt)) out = JSON.stringify({ ...receipt, onTimeline: made }, null, text.includes('\n') ? 2 : 0);
          } catch { out = `${text}\nPlaced on the timeline as it was made: ${made.join(', ')}.`; }
        }
      }
    }
    json(res, 200, { ok: true, text: out });
  } catch (e) {
    editFailed();
    if (controller.signal.aborted) return;
    json(res, 200, { ok: false, code: e instanceof GetError ? e.code : 1, text: e instanceof Error ? e.message : String(e), ...(e instanceof GetError && e.reason ? { reason: e.reason } : {}) });
  }
}

/** The verbs whose result is a picture, a clip or a sound to put in the film. */
const PLACED = new Set(['voice', 'tts', 'sfx', 'music', 'image', 'video', 'web-music', 'image-search', 'video-search']);
const PLAYABLE = /\.(mp4|webm|mov|m4v|mp3|wav|m4a|ogg|png|jpe?g|webp|gif)$/i;
/** The playable files under a project's assets/ (project-relative). @param {string} root @returns {Promise<Set<string>>} */
async function mediaIn(root) {
  const found = new Set();
  const walk = async (/** @type {string} */ dir) => {
    for (const e of await readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) await walk(rel);
      else if (PLAYABLE.test(e.name)) found.add(rel);
    }
  };
  await walk('assets');
  return found;
}
