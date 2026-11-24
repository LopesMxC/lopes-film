// @ts-check
/**
 * Video and audio tools that run on this computer, with ffmpeg and the local models; nothing is sent anywhere:
 *   stabilize   a shaky clip made steady (vid.stab: two passes, the camera path smoothed, the edges zoomed away)
 *   track       the camera's motion frame by frame, saved as JSON (for pinning a title or a graphic to a moving shot)
 *   cutout-video  the background taken out of a clip, frame by frame, with the local IS-Net (a transparent WebM)
 *   stems       voice and the rest of a recording: demucs (AI) when installed, otherwise an approximation by phase
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inside } from './files.mjs';
import { ffmpeg } from '../../src/shared.mjs';
import { ffmpegFilters } from './audio-clean.mjs';

/** @param {string} file @returns {Promise<{ fps: number, seconds: number, width: number, height: number, audio: boolean }>} */
async function probe(file) {
  const out = await new Promise((ok, fail) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,r_frame_rate,width,height:format=duration', '-of', 'json', file], { windowsHide: true });
    let s = ''; p.stdout.on('data', (d) => { s += d; }); p.on('error', fail); p.on('close', () => ok(s));
  });
  const j = JSON.parse(String(out));
  const v = (j.streams ?? []).find((/** @type {any} */ s) => s.codec_type === 'video');
  if (!v) throw new Error('that is not a video ffmpeg can read');
  const [a, b] = String(v.r_frame_rate || '30/1').split('/').map(Number);
  return { fps: b ? a / b : 30, seconds: Number(j.format?.duration) || 0, width: v.width, height: v.height, audio: (j.streams ?? []).some((/** @type {any} */ s) => s.codec_type === 'audio') };
}

/** @param {string} root @param {string} sub @param {string} name @param {string} ext @param {string} input */
async function target(root, sub, name, ext, input) {
  const rel = `assets/${sub}/${name}.${ext}`;
  const abs = join(root, rel);
  if (abs === input) throw new Error('--out must not be the name of the file it works on');
  await mkdir(dirname(abs), { recursive: true });
  return { rel, abs };
}

const STRENGTH = /** @type {Record<string, { smoothing: number, zoom: number, shakiness: number, tripod?: boolean }>} */ ({
  light: { smoothing: 15, zoom: 0, shakiness: 5 },
  medium: { smoothing: 30, zoom: 0, shakiness: 8 },
  strong: { smoothing: 60, zoom: 0, shakiness: 10 },
});
export const STABILIZE_LEVELS = Object.keys(STRENGTH);

/**
 * @param {string} root
 * @param {{ src: string, out: string, level?: string }} a
 * @param {AbortSignal} [signal]
 */
export async function stabilize(root, a, signal) {
  const filters = await ffmpegFilters();
  if (filters && !(filters.has('vidstabdetect') && filters.has('vidstabtransform'))) throw new Error('this ffmpeg has no video stabilizer (vid.stab); a full ffmpeg build does');
  const level = STRENGTH[a.level ?? 'medium'];
  if (!level) throw new Error(`level is one of ${STABILIZE_LEVELS.join(', ')}`);
  const input = inside(root, a.src);
  const { rel, abs } = await target(root, 'video', a.out, 'mp4', input);
  const tmp = await mkdtemp(join(tmpdir(), 'lopesfilm-stab-'));
  try {
    /* the motion file by a plain name in ffmpeg's own folder: a Windows path (C:\\…) in a filter's options breaks on its colon */
    const tripod = 'tripod' in level ? ':tripod=1' : '';
    await ffmpeg(['-i', input, '-vf', `vidstabdetect=shakiness=${level.shakiness}:accuracy=15:stepsize=6${tripod}:result=motion.trf`, '-f', 'null', '-'], { what: 'reading the camera motion', cwd: tmp }).done;
    await ffmpeg(['-i', input, '-vf', `vidstabtransform=input=motion.trf:smoothing=${level.smoothing}:optzoom=2:zoomspeed=0.2:interpol=bicubic${tripod}:crop=keep,unsharp=5:5:0.6:3:3:0.3`,
      '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', abs], { what: 'steadying the clip', cwd: tmp }).done;
  } finally { await rm(tmp, { recursive: true, force: true }); }
  void signal;
  return { src: rel, level: a.level ?? 'medium', note: 'The picture is zoomed a little at the edges to hide the borders the steadying moves.' };
}

/**
 * The camera's motion for each frame (what the picture moved by, in pixels, and turned by, in radians), and the path
 * those add up to, from ffmpeg's own motion search: the numbers a title or a graphic follows to stay on the scene.
 * @param {string} root @param {{ src: string, out: string }} a
 */
export async function track(root, a) {
  const input = inside(root, a.src);
  const info = await probe(input);
  const { rel, abs } = await target(root, 'data', a.out, 'json', input);
  const tmp = await mkdtemp(join(tmpdir(), 'lopesfilm-track-'));
  try {
    const log = join(tmp, 'motion.log');
    await ffmpeg(['-i', input, '-vf', 'deshake=filename=motion.log', '-f', 'null', '-'], { what: 'following the camera', cwd: tmp }).done;
    const rows = (await readFile(log, 'utf8')).split('\n').slice(1).filter(Boolean).map((l) => l.split(',').map(Number));
    let x = 0, y = 0, r = 0;
    const frames = rows.map((c, n) => {
      x += c[0] || 0; y += c[3] || 0; r += c[6] || 0;
      return { n, t: Number((n / info.fps).toFixed(4)), dx: c[0] || 0, dy: c[3] || 0, rot: c[6] || 0, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), angle: Number(r.toFixed(5)) };
    });
    await writeFile(abs, JSON.stringify({ src: a.src, fps: info.fps, width: info.width, height: info.height, frames }, null, 1));
    return { src: rel, frames: frames.length, fps: info.fps, note: 'Per frame: dx, dy (pixels the picture moved), rot (radians) and the running path x, y, angle. Move a graphic by minus the path to keep it on the scene.' };
  } finally { await rm(tmp, { recursive: true, force: true }); }
}

const CUTOUT_MAX_FRAMES = 240;
/**
 * The background taken out of a clip, frame by frame, with the local IS-Net (the same model as the picture cutout):
 * the frames become a transparent WebM. Slow: one model run per frame, so the clip is limited and sampled.
 * @param {string} root @param {{ src: string, out: string, fps?: number }} a @param {AbortSignal} [signal] @param {(line: string) => void} [say]
 */
export async function cutoutVideo(root, a, signal = new AbortController().signal, say = () => {}) {
  const { default: local, runLocal } = await import('./providers/local.mjs');
  await local.refresh?.();
  const model = (local.models?.cutout ?? [])[0];
  if (!model) throw new Error('No local background model is installed: install IS-Net in Settings → Services → Local services.');
  const input = inside(root, a.src);
  const info = await probe(input);
  const fps = Math.min(info.fps, Math.max(1, a.fps ?? 12));
  if (info.seconds * fps > CUTOUT_MAX_FRAMES) throw new Error(`that is ${Math.round(info.seconds * fps)} frames at ${fps} fps; the limit is ${CUTOUT_MAX_FRAMES} (cut the clip shorter, or lower --fps)`);
  const { rel, abs } = await target(root, 'video', a.out, 'webm', input);
  const tmp = await mkdtemp(join(tmpdir(), 'lopesfilm-vcut-'));
  try {
    await mkdir(join(tmp, 'in')); await mkdir(join(tmp, 'out'));
    await ffmpeg(['-i', input, '-vf', `fps=${fps},scale='min(960,iw)':-2`, join(tmp, 'in', 'f%05d.png')], { what: 'reading the frames' }).done;
    const names = (await readdir(join(tmp, 'in'))).filter((f) => f.endsWith('.png')).sort();
    if (!names.length) throw new Error('ffmpeg read no frames from that clip');
    /* one model process for every frame (loading IS-Net per frame took longer than the frames themselves) */
    await runLocal(['cutout-many', model.id, join(tmp, 'in'), join(tmp, 'out')], signal);
    const made = (await readdir(join(tmp, 'out'))).filter((f) => f.endsWith('.png'));
    if (made.length < names.length) throw new Error(`the model cut out ${made.length} of ${names.length} frames`);
    say(`background: ${made.length} frames`);
    await ffmpeg(['-framerate', String(fps), '-i', join(tmp, 'out', 'f%05d.png'), ...(info.audio ? ['-i', input, '-map', '0:v', '-map', '1:a?', '-c:a', 'libopus'] : []), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28', '-shortest', abs], { what: 'putting the frames together' }).done;
  } finally { await rm(tmp, { recursive: true, force: true }); }
  return { src: rel, frames: i0(a, fps, info), fps, model: model.id, note: 'A WebM with transparency, at a lower frame rate than the original.' };
}
/** @param {any} a @param {number} fps @param {{ seconds: number }} info */
const i0 = (a, fps, info) => Math.round(info.seconds * fps);

export const STEM_MODES = ['voice', 'instrumental'];
/** The python that has demucs (Meta's AI separation model), or null. @returns {Promise<string | null>} */
export async function demucsPython() {
  for (const py of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    const ok = await new Promise((done) => {
      const p = spawn(py, ['-c', 'import demucs'], { windowsHide: true, stdio: 'ignore' });
      p.on('error', () => done(false)); p.on('close', (c) => done(c === 0));
    });
    if (ok) return py;
  }
  return null;
}

/**
 * Voice / the rest of a song or recording. With demucs installed (pip install demucs; runs on the GPU when there is one)
 * it is a real AI separation; without it, an approximation by phase.
 * @param {string} root @param {{ src: string, out: string, mode?: string }} a
 */
export async function stems(root, a) {
  const mode = a.mode ?? 'voice';
  if (!STEM_MODES.includes(mode)) throw new Error(`mode is one of ${STEM_MODES.join(', ')}`);
  const input = inside(root, a.src);
  const { rel, abs } = await target(root, 'audio', a.out, 'wav', input);
  const py = await demucsPython();
  if (py) {
    const dir = await mkdtemp(join(tmpdir(), 'lf-demucs-'));
    try {
      const wav = join(dir, 'in.wav');
      await ffmpeg(['-i', input, '-vn', '-ar', '44100', '-ac', '2', wav], { what: 'reading the sound' }).done;
      await new Promise((ok, fail) => {
        const p = spawn(py, ['-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs', '-o', join(dir, 'out'), wav], { windowsHide: true });
        let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-600); });
        p.on('error', fail); p.on('close', (c) => (c === 0 ? ok(undefined) : fail(new Error(`demucs failed: ${err.trim().split('\n').pop()}`))));
      });
      const made = join(dir, 'out', 'htdemucs', 'in', mode === 'voice' ? 'vocals.wav' : 'no_vocals.wav');
      await ffmpeg(['-i', made, '-ar', '44100', abs], { what: 'saving the result' }).done;
      return { src: rel, mode, engine: 'demucs', note: 'Separated with the demucs AI model, on this computer.' };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  const af = mode === 'voice'
    ? 'pan=mono|c0=0.5*c0+0.5*c1,highpass=f=120,lowpass=f=9000,acompressor=threshold=-22dB:ratio=3'
    : 'pan=stereo|c0=c0-c1|c1=c1-c0,volume=1.5';
  await ffmpeg(['-i', input, '-vn', '-af', af, '-ar', '44100', abs], { what: 'splitting the sound' }).done;
  return { src: rel, mode, engine: 'phase', note: 'An approximation by phase, not an AI separation (install demucs for the real one: pip install demucs). A centred voice comes out cleanly, but instruments in the centre leak in.' };
}

/**
 * A subject followed through a clip: the box drawn around it on one frame (x, y, w, h, 0 to 1 of the picture), found
 * again in every frame after it by matching its picture (the sum of differences in grey, in a window around where it
 * last was), the remembered picture taking in a little of each new frame so a subject that turns or changes light is
 * not lost. Saved as JSON: per frame its time in the clip and the box, 0 to 1, and how sure the match was.
 * @param {string} root
 * @param {{ src: string, out: string, x: number, y: number, w: number, h: number, from?: number, to?: number }} a
 */
export async function trackSubject(root, a) {
  for (const k of /** @type {const} */ (['x', 'y', 'w', 'h'])) {
    if (typeof a[k] !== 'number' || !Number.isFinite(a[k]) || a[k] < 0 || a[k] > 1) throw new Error(`${k} is a number from 0 to 1 (of the picture)`);
  }
  if (a.w < 0.01 || a.h < 0.01) throw new Error('the box is too small: draw it around the subject');
  const input = inside(root, a.src);
  const info = await probe(input);
  const from = Math.max(0, a.from ?? 0);
  const to = Math.min(info.seconds || Infinity, a.to ?? Infinity, from + 120);
  const W = 320, H = Math.max(2, Math.round((W * info.height) / info.width / 2) * 2);
  const { rel, abs } = await target(root, 'data', a.out, 'json', input);
  /* the frames in grey, small: enough to follow a subject, light enough for a long clip */
  const raw = await new Promise((ok, fail) => {
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-ss', String(from), '-i', input, ...(Number.isFinite(to) ? ['-t', String(Math.max(0.05, to - from))] : []),
      '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'];
    const p = spawn('ffmpeg', args, { windowsHide: true });
    /** @type {Buffer[]} */ const parts = []; let err = '';
    p.stdout.on('data', (d) => parts.push(d)); p.stderr.on('data', (d) => { err += d; });
    p.on('error', fail); p.on('close', (c) => (c === 0 ? ok(Buffer.concat(parts)) : fail(new Error(`ffmpeg: ${err.trim() || c}`))));
  });
  const size = W * H;
  const count = Math.floor(/** @type {Buffer} */ (raw).length / size);
  if (!count) throw new Error('ffmpeg read no frames from that clip');
  const frame = (/** @type {number} */ n) => /** @type {Buffer} */ (raw).subarray(n * size, (n + 1) * size);
  const tw = Math.max(6, Math.round(a.w * W)), th = Math.max(6, Math.round(a.h * H));
  let bx = Math.min(W - tw, Math.round(a.x * W)), by = Math.min(H - th, Math.round(a.y * H));
  /* the remembered picture of the subject, as floats so it can take in each new frame a little */
  const tpl = new Float32Array(tw * th);
  const first = frame(0);
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) tpl[j * tw + i] = first[(by + j) * W + bx + i];
  const R = Math.max(12, Math.round(Math.max(tw, th) * 0.9));
  let vx = 0, vy = 0;
  /* a step of 2 inside the box keeps it fast; the match is checked to the pixel around the best */
  const sad = (/** @type {Buffer} */ f, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ step) => {
    let s = 0;
    for (let j = 0; j < th; j += step) { const row = (y + j) * W + x, tr = j * tw; for (let i = 0; i < tw; i += step) s += Math.abs(f[row + i] - tpl[tr + i]); }
    return s / (Math.ceil(th / step) * Math.ceil(tw / step));
  };
  const frames = [{ t: Number(from.toFixed(4)), x: bx / W, y: by / H, w: tw / W, h: th / H, sure: 1 }];
  const fps = info.fps || 30;
  for (let n = 1; n < count; n++) {
    const f = frame(n);
    let best = Infinity, nx = bx, ny = by;
    /* searched around where it was, and around where its last move would take it */
    const px = Math.round(bx + vx), py = Math.round(by + vy);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = px + dx, y = py + dy;
      if (x < 0 || y < 0 || x + tw > W || y + th > H) continue;
      const s = sad(f, x, y, 2);
      if (s < best) { best = s; nx = x; ny = y; }
    }
    const cx = nx, cy = ny;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x + tw > W || y + th > H) continue;
      const s = sad(f, x, y, 1);
      if (s < best || (dx === 0 && dy === 0)) { if (s <= best) { best = s; nx = x; ny = y; } }
    }
    vx = (nx - bx) * 0.7; vy = (ny - by) * 0.7;
    bx = nx; by = ny;
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) tpl[j * tw + i] = tpl[j * tw + i] * 0.9 + f[(by + j) * W + bx + i] * 0.1;
    frames.push({ t: Number((from + n / fps).toFixed(4)), x: Number((bx / W).toFixed(4)), y: Number((by / H).toFixed(4)), w: Number((tw / W).toFixed(4)), h: Number((th / H).toFixed(4)), sure: Number(Math.max(0, 1 - best / 64).toFixed(3)) });
  }
  await writeFile(abs, JSON.stringify({ src: a.src, fps, width: info.width, height: info.height, from, frames }, null, 1));
  return { src: rel, frames: frames.length, fps, path: frames.filter((_, i) => i % Math.max(1, Math.round(frames.length / 120)) === 0).map((f) => ({ t: f.t, x: f.x + f.w / 2, y: f.y + f.h / 2 })), note: 'Per frame: t (seconds in the clip), the box x, y, w, h (0 to 1 of the picture) and sure (0 to 1). A graphic placed at the box\'s centre follows the subject.' };
}
