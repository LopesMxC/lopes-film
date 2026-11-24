// lopesfilm measure: numbers from a reference video, so a film can be rebuilt from what is measured, not from a guess.
// Everything here reads a video file with ffmpeg/ffprobe and does its own arithmetic; nothing is drawn in a browser.
// Subcommands: probe, cuts, events, shots, frames, curve, ink, colors, extract, compare.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { UsageError, homeFor } from './shared.mjs';

const SUBCOMMANDS = ['probe', 'cuts', 'events', 'shots', 'frames', 'curve', 'ink', 'colors', 'extract', 'compare'];
/** Small gray frames for whole-film passes: enough to see a cut or a move, cheap to decode. */
const SCAN_W = 64;
const SCAN_H = 36;
/** ffmpeg's crop takes w:h:x:y; a region here is x,y,w,h. */
const cropFilter = ([x, y, w, h]) => `crop=${w}:${h}:${x}:${y}`;
const round = (v, d = 2) => Number(v.toFixed(d));
const sec = (t) => `${round(t, 2)}s`;
const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

function run(bin, args, { text = false } = {}) {
  const r = spawnSync(bin, args, { maxBuffer: 1 << 30, windowsHide: true });
  if (r.error) throw new Error(r.error.code === 'ENOENT' ? `${bin} is not installed: Lopes.Film needs ffmpeg and ffprobe on the PATH` : `${bin}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${bin} failed: ${String(r.stderr).trim().split('\n').slice(-2).join(' ')}`);
  return text ? r.stdout.toString() : r.stdout;
}

function mustExist(file, what = 'video') {
  if (!file) throw new UsageError(`say which ${what}: lopesfilm measure <subcommand> <${what}> …`);
  const path = resolve(file);
  if (!existsSync(path) || !statSync(path).isFile()) throw new UsageError(`${file}: not a file`);
  return path;
}

const num = (v, name) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UsageError(`--${name} is a number of seconds, not ${v}`);
  return n;
};

/** `x,y,w,h` in pixels of the source picture. */
function box(value, name, w, h) {
  if (value === undefined) return null;
  const p = String(value).split(',').map(Number);
  if (p.length !== 4 || !p.every(Number.isInteger)) throw new UsageError(`--${name} is four whole numbers x,y,w,h, not "${value}"`);
  const [x, y, bw, bh] = p;
  if (x < 0 || y < 0 || bw < 2 || bh < 2 || x + bw > w || y + bh > h) throw new UsageError(`--${name} ${value} must lie inside the ${w}×${h} picture and be at least 2×2`);
  return p;
}

/** Where pictures go: the project's cache when run inside one, else a folder in the temp directory. */
function outFolder(sub) {
  const root = homeFor('.');
  const dir = existsSync(join(root, 'film.html')) ? join(root, '.film', 'cache', 'measure', sub) : join(tmpdir(), 'lopesfilm-measure', sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function probe(file) {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,nb_frames,duration,pix_fmt,sample_rate,channels,color_space,color_transfer,color_range', '-of', 'json', file], { text: true }));
  const v = (j.streams ?? []).find((s) => s.codec_type === 'video');
  const a = (j.streams ?? []).find((s) => s.codec_type === 'audio');
  if (!v) throw new UsageError(`${basename(file)} has no picture`);
  const rate = (s) => { const [n, d] = String(s ?? '0/1').split('/').map(Number); return d ? n / d : 0; };
  const fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate) || 30;
  const duration = Number(v.duration) || Number(j.format?.duration) || 0;
  return {
    width: v.width, height: v.height, fps, fpsText: v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v.r_frame_rate, duration,
    frames: Number(v.nb_frames) || Math.round(duration * fps), codec: v.codec_name, pixFmt: v.pix_fmt,
    audio: a ? { codec: a.codec_name, rate: Number(a.sample_rate), channels: a.channels, duration: Number(a.duration) || duration } : null,
    color: [v.color_space, v.color_transfer, v.color_range].filter(Boolean).join(' / '),
  };
}

/** Every picture of a stretch, as gray bytes at w×h, at the video's own rate: [{t, px}]. Optionally cropped first. */
function grayFrames(file, info, { from = 0, to, w = SCAN_W, h = SCAN_H, crop = null } = {}) {
  const span = to == null ? [] : ['-t', String(Math.max(0.001, to - from))];
  const filter = `${crop ? `${cropFilter(crop)},` : ''}scale=${w}:${h}:flags=area,format=gray`;
  const raw = run('ffmpeg', ['-v', 'error', '-nostdin', '-ss', String(from), ...span, '-i', file, '-an', '-vf', filter, '-f', 'rawvideo', '-']);
  const size = w * h;
  const out = [];
  for (let i = 0; (i + 1) * size <= raw.length; i++) out.push({ t: from + i / info.fps, px: raw.subarray(i * size, (i + 1) * size) });
  return out;
}

/** One picture as RGB bytes at its own size (or scaled to w×h). */
function rgbAt(file, t, { w, h, crop = null } = {}) {
  const filter = `${crop ? `${cropFilter(crop)},` : ''}${w ? `scale=${w}:${h}:flags=area,` : ''}format=rgb24`;
  const raw = run('ffmpeg', ['-v', 'error', '-nostdin', '-ss', String(t), '-i', file, '-frames:v', '1', '-an', '-vf', filter, '-f', 'rawvideo', '-']);
  return raw;
}

/** Mean absolute difference between neighbouring pictures: d[i] is how much picture i differs from picture i-1 (0–255). */
function differences(frames) {
  const d = new Float64Array(frames.length);
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].px;
    const b = frames[i].px;
    let s = 0;
    for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]);
    d[i] = s / a.length;
  }
  return d;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Hard cuts: a jump far above the pictures around it. Dissolves and whips: a run of strong change. */
function findCuts(d, fps, { threshold } = {}) {
  const cuts = [];
  const floor = threshold ?? 4;
  for (let i = 1; i < d.length; i++) {
    const around = [];
    for (let k = Math.max(1, i - 6); k <= Math.min(d.length - 1, i + 6); k++) if (k !== i) around.push(d[k]);
    if (d[i] >= floor && d[i] >= 4 * Math.max(1, median(around))) cuts.push({ index: i, t: i / fps, strength: d[i] });
  }
  /* the same cut seen on two pictures in a row (a flash): keep the stronger */
  const merged = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c.index - last.index <= 1) { if (c.strength > last.strength) merged[merged.length - 1] = c; } else merged.push(c);
  }
  const cutAt = new Set(merged.map((c) => c.index));
  const transitions = [];
  let run0 = -1;
  for (let i = 1; i <= d.length; i++) {
    const hot = i < d.length && d[i] >= 5 && !cutAt.has(i);
    if (hot && run0 < 0) run0 = i;
    if (!hot && run0 >= 0) { if (i - run0 >= 5) transitions.push({ from: run0 / fps, to: i / fps, level: mean([...d.slice(run0, i)]) }); run0 = -1; }
  }
  return { cuts: merged, transitions };
}

/** Sound onsets: a sudden rise of the level against the last 200 ms. Times in seconds. */
function soundOnsets(file) {
  const raw = run('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-']);
  const step = 160; /* 20 ms */
  const levels = [];
  for (let i = 0; i + step * 2 <= raw.length; i += step * 2) {
    let s = 0;
    for (let k = 0; k < step; k++) { const v = raw.readInt16LE(i + k * 2); s += v * v; }
    levels.push(Math.sqrt(s / step));
  }
  const peak = Math.max(1, ...levels);
  const onsets = [];
  for (let i = 10; i < levels.length; i++) {
    const before = mean(levels.slice(i - 10, i));
    if (levels[i] > 0.08 * peak && levels[i] > 2.5 * Math.max(before, 0.01 * peak)) {
      const t = i * 0.02;
      if (!onsets.length || t - onsets[onsets.length - 1] > 0.12) onsets.push(t);
    }
  }
  const loud = levels.map((v) => v / peak);
  return { onsets, loud };
}

/* ----------------------------------------------------------------------------------------------- the subcommands */

function cmdProbe(file) {
  const i = probe(file);
  const lines = [
    `${basename(file)}: ${i.width}×${i.height} at ${round(i.fps, 3)} fps (${i.fpsText}), ${sec(i.duration)}, ${i.frames} pictures, ${i.codec} ${i.pixFmt}`,
    `aspect ${round(i.width / i.height, 3)} (${i.height > i.width ? 'vertical' : i.height === i.width ? 'square' : 'landscape'})${i.color ? `, colour ${i.color}` : ''}`,
    i.audio ? `sound: ${i.audio.codec}, ${i.audio.rate} Hz, ${i.audio.channels} ch, ${sec(i.audio.duration)}` : 'sound: none',
    `for film.html: <meta name="viewport" content="width=${i.width}, height=${i.height}"> and a duration of ${sec(i.duration)}; use the picture's length, not the sound's`,
  ];
  return { ok: true, lines, files: [] };
}

function scan(file, info) {
  const frames = grayFrames(file, info);
  return { frames, d: differences(frames) };
}

function shotsOf(d, info, found) {
  const marks = [0, ...found.cuts.map((c) => c.index), d.length];
  const shots = [];
  for (let k = 0; k + 1 < marks.length; k++) {
    const a = marks[k];
    const b = marks[k + 1];
    if (b <= a) continue;
    const inside = Array.from(d.slice(a + 1, b));
    shots.push({ from: a / info.fps, to: b / info.fps, length: (b - a) / info.fps, motion: mean(inside), peak: Math.max(0, ...inside) });
  }
  return shots;
}

function describeMotion(level) {
  return level < 0.6 ? 'still' : level < 2 ? 'gentle' : level < 6 ? 'moving' : 'busy';
}

function cmdCuts(file, o) {
  const info = probe(file);
  const { d } = scan(file, info);
  const found = findCuts(d, info.fps, { threshold: num(o.threshold, 'threshold') });
  const shots = shotsOf(d, info, found);
  const lens = shots.map((s) => s.length).sort((a, b) => a - b);
  const lines = [`${basename(file)}: ${found.cuts.length} hard cut${found.cuts.length === 1 ? '' : 's'} in ${sec(info.duration)}, ${shots.length} shot${shots.length === 1 ? '' : 's'}`];
  for (const c of found.cuts) lines.push(`  cut at ${sec(c.t)} (picture ${c.index}, change ${round(c.strength, 1)})`);
  for (const t of found.transitions) lines.push(`  soft change ${sec(t.from)}–${sec(t.to)} (a dissolve, whip or fast move; level ${round(t.level, 1)}): look at it picture by picture`);
  if (lens.length) lines.push(`shot length: shortest ${sec(lens[0])}, typical ${sec(lens[lens.length >> 1])}, longest ${sec(lens[lens.length - 1])}, a change of shot every ${sec(info.duration / shots.length)} on average`);
  lines.push('A cut found here is a candidate: look at the picture before and after it (`lopesfilm measure frames <video> --range a,b`).');
  return { ok: true, lines, files: [] };
}

function cmdEvents(file, o) {
  const info = probe(file);
  const { d } = scan(file, info);
  const found = findCuts(d, info.fps, { threshold: num(o.threshold, 'threshold') });
  const cutAt = new Set(found.cuts.map((c) => c.index));
  /* one character per 0.1 s: the strongest change in it */
  const per = Math.max(1, Math.round(info.fps / 10));
  let map = '';
  for (let i = 0; i < d.length; i += per) {
    let top = 0;
    let isCut = false;
    for (let k = i; k < Math.min(d.length, i + per); k++) { top = Math.max(top, d[k]); if (cutAt.has(k)) isCut = true; }
    map += isCut ? '|' : top < 0.9 ? ' ' : top < 2.5 ? '.' : top < 7 ? 'o' : 'O';
  }
  const holds = [];
  let h0 = -1;
  for (let i = 1; i <= d.length; i++) {
    const still = i < d.length && d[i] < 0.9;
    if (still && h0 < 0) h0 = i - 1;
    if (!still && h0 >= 0) { if ((i - h0) / info.fps >= 0.4) holds.push([h0 / info.fps, i / info.fps]); h0 = -1; }
  }
  const lines = [
    `${basename(file)}: activity, one character per 0.1 s ('|' cut, ' ' still, '.' small change, 'o' movement, 'O' strong movement)`,
    ...map.match(/.{1,100}/g).map((row, k) => `  ${String(k * 10).padStart(3)}s ${row}`),
    `holds of 0.4 s or more (nothing moves): ${holds.length ? holds.map(([a, b]) => `${sec(a)}–${sec(b)}`).join(', ') : 'none'}`,
    `how much of the time something moves: ${Math.round((100 * Array.from(d).filter((v) => v >= 0.9).length) / Math.max(1, d.length))}%`,
  ];
  if (info.audio) {
    const { onsets } = soundOnsets(file);
    lines.push(`sound onsets (a hit, a word, a beat starting): ${onsets.length}${onsets.length ? `; ${onsets.slice(0, 40).map(sec).join(' ')}${onsets.length > 40 ? ' …' : ''}` : ''}`);
    const gaps = onsets.slice(1).map((t, k) => t - onsets[k]).filter((g) => g > 0.25 && g < 2);
    if (gaps.length >= 5) lines.push(`typical gap between onsets ${sec(median(gaps))} (about ${Math.round(60 / median(gaps))} per minute): a cut or a move on these is "on the beat"`);
    const cutsOnBeat = found.cuts.filter((c) => onsets.some((t) => Math.abs(t - c.t) <= 0.08)).length;
    if (found.cuts.length) lines.push(`cuts that land on a sound onset (±0.08 s): ${cutsOnBeat} of ${found.cuts.length}`);
  } else lines.push('sound: none');
  return { ok: true, lines, files: [] };
}

function cmdShots(file, o) {
  const info = probe(file);
  const { frames, d } = scan(file, info);
  const found = findCuts(d, info.fps, { threshold: num(o.threshold, 'threshold') });
  const shots = shotsOf(d, info, found);
  const rows = shots.map((s, n) => {
    const mid = Math.min(info.duration - 0.05, s.from + s.length / 2);
    const palette = paletteOf(rgbAt(file, mid, { w: 64, h: 36 }), 3).map((p) => p.hex).join(' ');
    return { n: n + 1, ...s, palette };
  });
  const sheet = [
    `# Motion sheet — ${basename(file)}`,
    '',
    `${info.width}×${info.height}, ${round(info.fps, 3)} fps, ${sec(info.duration)}, ${shots.length} shots, sound ${info.audio ? 'yes' : 'no'}. Measured by \`lopesfilm measure shots\`; fill in the last column by looking at each shot.`,
    '',
    '| # | from | to | length | movement | colours (mid-shot) | what it is, what moves, what the text does |',
    '|---|------|----|--------|----------|--------------------|----------------------------------------------|',
    ...rows.map((r) => `| ${r.n} | ${round(r.from)} | ${round(r.to)} | ${round(r.length)} | ${describeMotion(r.motion)} (${round(r.motion, 1)}) | ${r.palette} |  |`),
    '',
    'Rules the whole video follows (fill in): …',
  ].join('\n');
  const dir = outFolder('shots');
  const path = join(dir, `${basename(file, extname(file))}.motion.md`);
  writeFileSync(path, `${sheet}\n`);
  const lines = [
    `${basename(file)}: ${shots.length} shots, ${found.cuts.length} hard cuts, ${found.transitions.length} soft changes`,
    ...rows.map((r) => `  shot ${r.n}: ${sec(r.from)}–${sec(r.to)} (${sec(r.length)}), ${describeMotion(r.motion)}, ${r.palette}`),
    `motion sheet to complete: ${path}`,
    'Next: `lopesfilm look <video> <t>` at the middle of each shot, then write what is in it into the last column.',
  ];
  void frames;
  return { ok: true, lines, files: [path] };
}

/** Times to take pictures at: every picture of the range when there are few, else evenly spread. */
function pictureTimes(a, b, fps, max) {
  const all = Math.max(1, Math.floor((b - a) * fps) + 1);
  const stride = Math.max(1, Math.ceil(all / max));
  const times = [];
  for (let k = 0; k < all; k += stride) times.push(a + k / fps);
  if (stride > 1 && times[times.length - 1] < b - 0.5 / fps) times.push(b);
  return times;
}

function cmdFrames(file, o) {
  const info = probe(file);
  const range = String(o.range ?? '').split(',').map(Number);
  if (range.length !== 2 || !range.every(Number.isFinite) || !(range[1] > range[0])) throw new UsageError('--range is two times a,b in seconds, e.g. --range 3.2,4.0');
  const max = Math.min(48, Math.max(1, Number(o.max ?? 16)));
  const crop = box(o.roi, 'roi', info.width, info.height);
  const times = pictureTimes(range[0], Math.min(range[1], info.duration), info.fps, max);
  const dir = outFolder('frames');
  const stem = basename(file, extname(file));
  const files = [];
  const scaleUp = crop && crop[2] < 480 ? ',scale=480:-2:flags=lanczos' : '';
  for (const t of times) {
    const path = join(dir, `${stem}-${t.toFixed(3)}${crop ? `-roi${crop.join('_')}` : ''}.png`);
    run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-an', '-vf', `${crop ? `${cropFilter(crop)}${scaleUp}` : 'null'}`, path]);
    files.push(path);
  }
  const lines = [
    `${times.length} picture${times.length === 1 ? '' : 's'} from ${sec(range[0])} to ${sec(range[1])}${times.length > 1 ? ` (every ${round(times[1] - times[0], 3)}s; the video has a picture every ${round(1 / info.fps, 3)}s)` : ''}${crop ? `, cropped to ${crop.join(',')}` : ''}:`,
    ...times.map((t, k) => `  ${sec(t)}  ${files[k]}`),
    'Read them in order: what enters, from where, how fast, what holds, what leaves. One picture a second shows none of that.',
  ];
  return { ok: true, lines, files };
}

/* ---- the curve of a move ---- */

const EASES = {
  linear: { f: (u) => u },
  'sine.out': { f: (u) => Math.sin((u * Math.PI) / 2), css: 'cubic-bezier(0.61, 1, 0.88, 1)' },
  'sine.in': { f: (u) => 1 - Math.cos((u * Math.PI) / 2), css: 'cubic-bezier(0.12, 0, 0.39, 0)' },
  'sine.inOut': { f: (u) => -(Math.cos(Math.PI * u) - 1) / 2, css: 'cubic-bezier(0.37, 0, 0.63, 1)' },
  'power1.out': { f: (u) => 1 - (1 - u) ** 2, css: 'cubic-bezier(0.5, 1, 0.89, 1)' },
  'power1.in': { f: (u) => u ** 2, css: 'cubic-bezier(0.11, 0, 0.5, 0)' },
  'power1.inOut': { f: (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2), css: 'cubic-bezier(0.45, 0, 0.55, 1)' },
  'power2.out': { f: (u) => 1 - (1 - u) ** 3, css: 'cubic-bezier(0.33, 1, 0.68, 1)' },
  'power2.in': { f: (u) => u ** 3, css: 'cubic-bezier(0.32, 0, 0.67, 0)' },
  'power2.inOut': { f: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2), css: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  'power3.out': { f: (u) => 1 - (1 - u) ** 4, css: 'cubic-bezier(0.25, 1, 0.5, 1)' },
  'power3.in': { f: (u) => u ** 4, css: 'cubic-bezier(0.5, 0, 0.75, 0)' },
  'power3.inOut': { f: (u) => (u < 0.5 ? 8 * u ** 4 : 1 - (-2 * u + 2) ** 4 / 2), css: 'cubic-bezier(0.76, 0, 0.24, 1)' },
  'power4.out': { f: (u) => 1 - (1 - u) ** 5, css: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  'power4.in': { f: (u) => u ** 5, css: 'cubic-bezier(0.64, 0, 0.78, 0)' },
  'power4.inOut': { f: (u) => (u < 0.5 ? 16 * u ** 5 : 1 - (-2 * u + 2) ** 5 / 2), css: 'cubic-bezier(0.83, 0, 0.17, 1)' },
  'expo.out': { f: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)), css: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  'expo.in': { f: (u) => (u <= 0 ? 0 : 2 ** (10 * u - 10)), css: 'cubic-bezier(0.7, 0, 0.84, 0)' },
  'expo.inOut': { f: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2), css: 'cubic-bezier(0.87, 0, 0.13, 1)' },
  'circ.out': { f: (u) => Math.sqrt(1 - (u - 1) ** 2), css: 'cubic-bezier(0, 0.55, 0.45, 1)' },
  'circ.in': { f: (u) => 1 - Math.sqrt(1 - u * u), css: 'cubic-bezier(0.55, 0, 1, 0.45)' },
  'back.out(1.7)': { f: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2, css: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  'back.in(1.7)': { f: (u) => 2.70158 * u ** 3 - 1.70158 * u ** 2, css: 'cubic-bezier(0.36, 0, 0.66, -0.56)' },
};

/** Which ease a measured curve (values at normalised times 0…1, from 0 to 1) is closest to. */
export function fitEase(points) {
  const scored = Object.entries(EASES).map(([name, e]) => {
    let s = 0;
    for (const [u, y] of points) s += (e.f(u) - y) ** 2;
    return { name, error: Math.sqrt(s / points.length), css: e.css };
  });
  return scored.sort((a, b) => a.error - b.error);
}

/**
 * The ease and the duration that best explain a move. points: [time, value] with the value 0 before the move and 1 after
 * it. The start is searched a little before the first picture that moved (a slow start shows late), the duration from a
 * few pictures to `longest`. Returns the best fit of each ease, best first: {name, css, start, duration, error}.
 */
export function fitMove(points, firstSeen, dt, longest) {
  const best = new Map();
  for (const [name, e] of Object.entries(EASES)) {
    for (let back = 0; back <= 8; back++) {
      const start = firstSeen - back * dt;
      for (let duration = 3 * dt; duration <= longest; duration += dt / 2) {
        let s = 0;
        for (const [t, v] of points) {
          const u = Math.min(1, Math.max(0, (t - start) / duration));
          s += (e.f(u) - v) ** 2;
        }
        const error = Math.sqrt(s / points.length);
        const was = best.get(name);
        if (!was || error < was.error) best.set(name, { name, css: e.css, start, duration, error });
      }
    }
  }
  return [...best.values()].sort((p, q) => p.error - q.error);
}

/** The bounding box of what differs from the background in a gray picture: {x,y,w,h} or null. */
function inkBox(px, w, h, threshold, region = [0, 0, w, h]) {
  const [x0, y0, rw, rh] = region;
  const edge = [];
  for (let x = x0; x < x0 + rw; x++) edge.push(px[y0 * w + x], px[(y0 + rh - 1) * w + x]);
  for (let y = y0; y < y0 + rh; y++) edge.push(px[y * w + x0], px[y * w + x0 + rw - 1]);
  const bg = median(edge);
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      if (Math.abs(px[y * w + x] - bg) >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxY < 0) return { bg, box: null };
  return { bg, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

function cmdCurve(file, o) {
  const info = probe(file);
  const a = num(o.start, 'start');
  const b = num(o.end, 'end');
  if (a == null || b == null || !(b > a)) throw new UsageError('say the stretch of the move: --start <s> --end <s> (and --roi x,y,w,h around the thing that moves)');
  const roi = box(o.roi, 'roi', info.width, info.height);
  const rw = roi ? roi[2] : info.width;
  const rh = roi ? roi[3] : info.height;
  const w = Math.min(240, rw);
  const h = Math.max(2, Math.round((rh * w) / rw));
  const frames = grayFrames(file, info, { from: a, to: b + 1 / info.fps, w, h, crop: roi });
  if (frames.length < 4) throw new UsageError('that stretch holds fewer than 4 pictures: widen --start/--end');
  const k = rw / w; /* a pixel of the small picture, in pixels of the video */
  const last = frames[frames.length - 1].px;
  const dist = frames.map((f) => { let s = 0; for (let i = 0; i < f.px.length; i++) s += Math.abs(f.px[i] - last[i]); return s / f.px.length; });
  const progress = dist.map((v) => (dist[0] > 0.8 ? 1 - v / dist[0] : 0));
  const boxes = frames.map((f) => inkBox(f.px, w, h, 40).box);
  const seen = boxes.filter(Boolean);
  const series = {
    progress,
    x: boxes.map((bx) => (bx ? (bx.x + bx.w / 2) * k : NaN)),
    y: boxes.map((bx) => (bx ? (bx.y + bx.h / 2) * k : NaN)),
    width: boxes.map((bx) => (bx ? bx.w * k : NaN)),
    height: boxes.map((bx) => (bx ? bx.h * k : NaN)),
  };
  const span = (xs) => { const ok = xs.filter(Number.isFinite); return ok.length > 3 ? Math.max(...ok) - Math.min(...ok) : 0; };
  /* the signal that moves most (in pixels), else the picture's own change */
  const named = ['x', 'y', 'width', 'height'].map((n) => [n, span(series[n])]).sort((p, q) => q[1] - p[1])[0];
  const lines = [
    `${basename(file)} ${sec(a)}–${sec(b)}${roi ? `, in ${roi.join(',')}` : ''}: ${frames.length} pictures, one every ${round(1000 / info.fps, 1)} ms`,
    `time   progress   x      y      width  height   (centre and size of what differs from the background, in pixels from the region's top-left corner)`,
  ];
  const every = Math.max(1, Math.ceil(frames.length / 40));
  frames.forEach((f, i) => {
    if (i % every && i !== frames.length - 1) return;
    const cell = (n) => (Number.isFinite(series[n][i]) ? String(Math.round(series[n][i])).padEnd(6) : '–'.padEnd(6));
    lines.push(`${f.t.toFixed(3)}  ${progress[i].toFixed(2).padEnd(9)} ${cell('x')} ${cell('y')} ${cell('width')} ${cell('height')}`);
  });
  const useBox = named[1] >= 3 && seen.length > frames.length / 2;
  const signal = useBox ? series[named[0]] : series.progress;
  const sName = useBox ? `${named[0]} of the box` : 'progress (how much of the picture has reached its last state)';
  const ok = signal.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
  if (ok.length < 4 || Math.abs(ok[ok.length - 1][1] - ok[0][1]) < 1e-6) {
    lines.push('nothing moves in this region between those times: choose a --roi around the thing that moves, or a wider --start/--end');
    return { ok: true, lines, files: [] };
  }
  const v0 = ok[0][1];
  const v1 = ok[ok.length - 1][1];
  const y = ok.map(([i, v]) => [i, (v - v0) / (v1 - v0)]);
  const firstMove = y.find(([, v]) => v > 0.02);
  const arrive = y.find(([i, v]) => v >= 0.98 && i >= (firstMove?.[0] ?? 0));
  if (!firstMove || !arrive) { lines.push('the move does not settle between those times: end later'); return { ok: true, lines, files: [] }; }
  const i0 = Math.max(0, firstMove[0] - 1);
  const dt = 1 / info.fps;
  const seenStart = frames[i0].t;
  const seenArrive = frames[arrive[0]].t;
  const overshoot = Math.max(0, ...y.map(([, v]) => v)) - 1;
  const best = fitMove(y.map(([i, v]) => [frames[i].t, v]), seenStart, dt, Math.min(4, Math.max(3 * (seenArrive - seenStart), 6 * dt)));
  const top = best[0];
  lines.push(
    `measured on the ${sName}: it starts moving at about ${sec(top.start)}, reaches 98% at ${sec(seenArrive)}${useBox ? `, from ${Math.round(v0)} to ${Math.round(v1)}` : ''}${overshoot > 0.03 ? `, overshoots by ${Math.round(overshoot * 100)}%` : ', no overshoot'}`,
    `closest eases: ${best.slice(0, 3).map((e) => `${e.name} over ${round(e.duration, 2)}s (error ${round(e.error, 3)})`).join(', ')}`,
    top.css ? `as CSS: transition: … ${round(top.duration, 2)}s ${top.css}; delay ${round(Math.max(0, top.start - a), 2)}s after the start of this stretch` : `as CSS: ${round(top.duration, 2)}s linear`,
    'The duration is the whole run of the ease, longer than the time to 98% for an ease that slows at the end. It is a starting point: build it, `lopesfilm measure curve` the remake the same way, compare the two tables.',
  );
  return { ok: true, lines, files: [] };
}

/* ---- one picture ---- */

function cmdInk(file, o) {
  const info = probe(file);
  const t = num(o.at, 'at');
  if (t == null) throw new UsageError('say when: --at <seconds>');
  const roi = box(o.roi, 'roi', info.width, info.height);
  if (!roi) throw new UsageError('say where: --roi x,y,w,h around one piece of text or one logo');
  const threshold = Number(o.threshold ?? 60);
  const rgb = rgbAt(file, t);
  const px = toGray(rgb);
  const r = inkBox(px, info.width, info.height, threshold, roi);
  if (!r.box) return { ok: false, lines: [`nothing differs from the background in ${roi.join(',')} at ${sec(t)}: the region is wrong, or the element is not there`], files: [] };
  const { x, y, w, h } = r.box;
  /* ink colour: the mean of the pixels that differ */
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let n = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = yy * info.width + xx;
    if (Math.abs(px[i] - r.bg) >= threshold) { cr += rgb[i * 3]; cg += rgb[i * 3 + 1]; cb += rgb[i * 3 + 2]; n++; }
  }
  const touches = x === 0 || y === 0 || x + w === info.width || y + h === info.height;
  const edgeOfRegion = x === roi[0] || y === roi[1] || x + w === roi[0] + roi[2] || y + h === roi[1] + roi[3];
  const lines = [
    `at ${sec(t)} in ${roi.join(',')}: content box x ${x}, y ${y}, ${w}×${h} px`,
    `height ${h} px = ${round((100 * h) / info.height, 2)}% of the picture height; width ${w} px = ${round((100 * w) / info.width, 2)}% of the width`,
    `centre ${round(((x + w / 2) / info.width) * 100, 1)}% across, ${round(((y + h / 2) / info.height) * 100, 1)}% down`,
    `ink ${n ? hex(cr / n, cg / n, cb / n) : '?'} on ${hex(...bgRgb(rgb, info.width, roi))}`,
    touches ? 'it touches the edge of the picture (cut off)' : edgeOfRegion ? 'it reaches the edge of the region: the region may be too small' : 'it fits inside the region and the picture',
    'For one line of text the height is about its capital/ascender height; the font size is about 1.35–1.5 times that.',
  ];
  return { ok: true, lines, files: [] };
}

function toGray(rgb) {
  const n = rgb.length / 3;
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = (77 * rgb[i * 3] + 150 * rgb[i * 3 + 1] + 29 * rgb[i * 3 + 2]) >> 8;
  return g;
}

function bgRgb(rgb, w, [x0, y0, rw, rh]) {
  const at = (x, y) => [rgb[(y * w + x) * 3], rgb[(y * w + x) * 3 + 1], rgb[(y * w + x) * 3 + 2]];
  const cs = [at(x0, y0), at(x0 + rw - 1, y0), at(x0, y0 + rh - 1), at(x0 + rw - 1, y0 + rh - 1)];
  return [0, 1, 2].map((c) => median(cs.map((p) => p[c])));
}

/** The commonest colours of an RGB picture (4 bits a channel), most to least: [{hex, share}]. */
export function paletteOf(rgb, count = 6) {
  const buckets = new Map();
  const n = rgb.length / 3;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const all = [...buckets.values()].sort((p, q) => q.n - p.n);
  const out = [];
  for (const e of all) {
    const c = [e.r / e.n, e.g / e.n, e.b / e.n];
    /* a colour next to one already listed is the same colour */
    if (out.some((o) => Math.abs(o.rgb[0] - c[0]) + Math.abs(o.rgb[1] - c[1]) + Math.abs(o.rgb[2] - c[2]) < 60)) continue;
    out.push({ rgb: c, hex: hex(...c), share: e.n / n });
    if (out.length >= count) break;
  }
  return out;
}

function cmdColors(file, o) {
  const info = probe(file);
  const t = num(o.at, 'at');
  if (t == null) throw new UsageError('say when: --at <seconds>');
  const [gx, gy] = String(o.grid ?? '4x3').toLowerCase().split('x').map(Number);
  if (!(gx >= 1 && gy >= 1 && gx <= 16 && gy <= 12)) throw new UsageError('--grid is columns×rows, e.g. 8x6');
  const w = 96;
  const h = 54;
  const rgb = rgbAt(file, t, { w, h });
  const lines = [`colours at ${sec(t)}:`];
  for (const p of paletteOf(rgb, 6)) lines.push(`  ${p.hex}  ${Math.round(p.share * 100)}%`);
  lines.push(`brightness by region (${gx}×${gy}, 0 dark … 255 light; mean colour):`);
  const lumas = [];
  for (let j = 0; j < gy; j++) {
    const row = [];
    const rowLuma = [];
    for (let i = 0; i < gx; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = Math.floor((j * h) / gy); y < Math.floor(((j + 1) * h) / gy); y++) for (let x = Math.floor((i * w) / gx); x < Math.floor(((i + 1) * w) / gx); x++) {
        const k = (y * w + x) * 3; r += rgb[k]; g += rgb[k + 1]; b += rgb[k + 2]; n++;
      }
      rowLuma.push((77 * r + 150 * g + 29 * b) / 256 / n);
      row.push(`${hex(r / n, g / n, b / n)}`);
    }
    lumas.push(rowLuma);
    lines.push(`  ${row.join(' ')}   ${rowLuma.map((v) => String(Math.round(v)).padStart(3)).join('')}`);
  }
  const colMean = (c) => mean(lumas.map((row) => row[c]));
  const rowMean = (r) => mean(lumas[r]);
  const dx = colMean(gx - 1) - colMean(0);
  const dy = rowMean(gy - 1) - rowMean(0);
  const words = [];
  if (Math.abs(dx) > 12) words.push(dx > 0 ? 'lighter to the right' : 'darker to the right');
  if (Math.abs(dy) > 12) words.push(dy > 0 ? 'lighter at the bottom' : 'darker at the bottom');
  lines.push(`background: ${words.length ? words.join(', ') : 'even (no clear gradient)'}`);
  void info;
  return { ok: true, lines, files: [] };
}

function cmdExtract(file, o) {
  const info = probe(file);
  const t = num(o.at, 'at');
  if (t == null) throw new UsageError('say when: --at <seconds>');
  const roi = box(o.roi, 'roi', info.width, info.height);
  const asked = o.out ? resolve(String(o.out)) : null;
  const path = asked && extname(asked) ? asked : join(asked ?? outFolder('extract'), `${basename(file, extname(file))}-${t.toFixed(2)}${roi ? `-${roi.join('_')}` : ''}.png`);
  mkdirSync(dirname(path), { recursive: true });
  run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-an', '-vf', roi ? cropFilter(roi) : 'null', path]);
  return { ok: true, lines: [`${roi ? `${roi[2]}×${roi[3]} crop` : `${info.width}×${info.height} picture`} at ${sec(t)}: ${path}`, 'Take a crop from the sharpest picture, and only of your own material or of what you may use; a logo or photo from someone else\'s video is theirs.'], files: [path] };
}

/* ---- the remake against the reference ---- */

function wholeFrame(rgb, w, h) {
  const px = toGray(rgb);
  let edges = 0;
  let sum = 0;
  let chroma = 0;
  for (let i = 0; i < px.length; i++) {
    sum += px[i];
    if (Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) - Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) > 60) chroma++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x;
    if (Math.abs(px[i] - px[i + 1]) > 24 || Math.abs(px[i] - px[i + w]) > 24) edges++;
  }
  const n = w * h;
  return { px, luma: sum / n, detail: edges / n, accent: chroma / n };
}

function cmdCompare(refFile, remixFile, o) {
  const refInfo = probe(refFile);
  const mixInfo = probe(remixFile);
  const t = num(o.t, 't');
  if (t == null) throw new UsageError('say when in the remake: --t <seconds> (and --ref-t when the same moment is elsewhere in the reference)');
  const refT = num(o['ref-t'], 'ref-t') ?? t;
  const [w, h] = o.size ? String(o.size).toLowerCase().split('x').map(Number) : [mixInfo.width, mixInfo.height];
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) throw new UsageError('--size is WxH, e.g. 1920x1080');
  const threshold = Number(o.threshold ?? 60);
  const rgbRef = rgbAt(refFile, refT, { w, h });
  const rgbMix = rgbAt(remixFile, t, { w, h });
  const ref = wholeFrame(rgbRef, w, h);
  const mix = wholeFrame(rgbMix, w, h);
  const checks = [
    ['brightness', mix.luma >= ref.luma * 0.9, `${round(mix.luma, 1)} against ${round(ref.luma, 1)} (the remake must not be darker than 90% of the reference)`],
    ['detail', mix.detail >= ref.detail * 0.7, `${round(mix.detail, 4)} against ${round(ref.detail, 4)} (lines, labels and edges: at least 70%)`],
    ['colour', ref.accent < 0.002 || mix.accent >= ref.accent * 0.6, `${round(mix.accent, 4)} against ${round(ref.accent, 4)} (strongly coloured pixels: at least 60%)`],
  ];
  if (o.region || o['ref-region']) {
    const mixBox = box(o.region ?? o['ref-region'], 'region', w, h);
    const refBox = box(o['ref-region'] ?? o.region, 'ref-region', w, h);
    const a = inkBox(ref.px, w, h, threshold, refBox).box;
    const b = inkBox(mix.px, w, h, threshold, mixBox).box;
    if (!a) checks.push(['element', false, 'blocked: nothing in the reference region; put --ref-region around the reference element']);
    else if (!b) checks.push(['element', false, 'missing: nothing in the remake region; the element is not there, or --region is wrong']);
    else {
      const ratio = b.h / a.h;
      checks.push(['element height', ratio >= 0.8, `${b.h} px against ${a.h} px = ${round(ratio, 2)} (at least 0.8)`]);
      const cut = b.x === 0 || b.y === 0 || b.x + b.w === w || b.y + b.h === h;
      checks.push(['cut off', !cut, cut ? 'it touches the edge of the picture' : 'it is inside the picture']);
    }
  }
  const failed = checks.filter((c) => !c[1]);
  const lines = [
    `reference ${sec(refT)} (${basename(refFile)}) against remake ${sec(t)} (${basename(remixFile)}), both at ${w}×${h}${refInfo.fps === mixInfo.fps ? '' : `; frame rates differ (${round(refInfo.fps, 2)} and ${round(mixInfo.fps, 2)})`}`,
    ...checks.map(([name, pass, text]) => `  ${pass ? '✓' : '✗'} ${name}: ${text}`),
    failed.length ? `${failed.length} to fix: change the geometry, size, wrapping, timing or the missing layers; do not delete what the reference shows. Then measure again.` : 'all numbers hold at this moment; look at both pictures too, the numbers do not see a wrong shape.',
  ];
  return { ok: failed.length === 0, lines, files: [] };
}

/* ----------------------------------------------------------------------------------------------------- entry */

export const MEASURE_HELP = `lopesfilm measure <what> <video> [options]

  Numbers from a reference video, so a remake is built from what is measured, not from how it looked.

  probe    <video>                         size, frame rate, length, sound
  cuts     <video>                         hard cuts and soft changes, shot lengths
  events   <video>                         activity map, holds, sound onsets, cuts that land on the beat
  shots    <video>                         the shots with colours and movement, as a motion sheet to complete
  frames   <video> --range a,b [--roi x,y,w,h] [--max 16]   the pictures of a stretch, in order
  curve    <video> --start a --end b --roi x,y,w,h           how a move starts, runs and settles; the closest ease
  ink      <video> --at t --roi x,y,w,h    height, width, position and colour of one text or logo
  colors   <video> --at t [--grid 8x6]     the palette and the light across the picture
  extract  <video> --at t [--roi x,y,w,h] [--out file.png]   a picture or a crop, full resolution
  compare  <reference> <remake> --t s [--ref-t s] [--region x,y,w,h --ref-region x,y,w,h]
           brightness, detail, colour and element size of the remake against the reference at one moment

  Regions are in pixels of the video (\`probe\` says its size). --threshold n: how different from the background counts
  as content (60) or, for cuts, the smallest jump between two pictures that is a cut (4; text on a plain background changes little). Pictures go under .film/cache/measure/ of the project
  (a temp folder outside one). Exit status 1 when a \`compare\` check fails.`;

export async function measure(args, opts = {}) {
  const [sub, first, second] = args;
  if (!sub || opts.help) return { ok: true, lines: [MEASURE_HELP], files: [] };
  if (!SUBCOMMANDS.includes(sub)) throw new UsageError(`measure: no ${sub}; there is ${SUBCOMMANDS.join(', ')}`);
  if (sub === 'compare') return cmdCompare(mustExist(first, 'reference'), mustExist(second, 'remake'), opts);
  const file = mustExist(first);
  const table = { probe: cmdProbe, cuts: cmdCuts, events: cmdEvents, shots: cmdShots, frames: cmdFrames, curve: cmdCurve, ink: cmdInk, colors: cmdColors, extract: cmdExtract };
  return table[sub](file, opts);
}
