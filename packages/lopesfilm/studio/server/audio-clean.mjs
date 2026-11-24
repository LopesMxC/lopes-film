// Audio cleanup, run on this computer with ffmpeg: noise taken out, voice made clearer, tone shaped, loudness set.
// One filter chain per request, so a recording is read and written once.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { pyInstalled, pySupported, runPyTool } from './pytools.mjs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside } from './files.mjs';

/** How much noise is taken out (afftdn noise reduction, dB; floor, dB). */
export const DENOISE = /** @type {Record<string, [number, number] | null>} */ ({ off: null, light: [8, -45], medium: [14, -50], strong: [22, -55] });
/** Tone presets: peaking bands `[Hz, width (octaves), gain dB]`, plus an optional low cut. */
export const EQ = /** @type {Record<string, { low?: number, high?: number, bands: [number, number, number][] }>} */ ({
  flat: { bands: [] },
  voice: { low: 80, bands: [[200, 1, -2], [3000, 1, 2.5], [6500, 1.5, 1]] },
  warm: { low: 60, bands: [[120, 1, 2], [3500, 1.5, -1.5]], high: 14000 },
  bright: { low: 60, bands: [[250, 1, -1.5], [5000, 1.5, 3], [10000, 2, 2]] },
  podcast: { low: 90, bands: [[150, 1, 2.5], [350, 1, -2], [4000, 1.2, 2.5]], high: 15000 },
  'bass-cut': { low: 140, bands: [] },
  telephone: { low: 300, high: 3400, bands: [] },
});

/** The pitch moved by `r` (above 1 higher, below 1 lower) at the same speed, for a 48 kHz sound. */
const pitch = (/** @type {number} */ r) => `aresample=48000,asetrate=${Math.round(48000 * r)},aresample=48000,atempo=${(1 / r).toFixed(4)}`;
const num = (/** @type {number} */ n) => Number(n.toFixed(3));
/**
 * Voice effects (echo, muffled, radio…): each a filter chain made from `a`, how much of it, 0 to 1. Run on this computer
 * with ffmpeg's own filters, so nothing is fetched.
 */
export const VOICE_FX = /** @type {Record<string, (a: number) => string[]>} */ ({
  echo: (a) => [`aecho=0.8:0.9:${Math.round(180 + 420 * a)}|${Math.round(360 + 840 * a)}:${num(0.25 + 0.4 * a)}|${num(0.15 + 0.25 * a)}`],
  cave: (a) => [`aecho=0.8:0.88:${Math.round(40 + 40 * a)}|${Math.round(90 + 90 * a)}|${Math.round(200 + 200 * a)}|${Math.round(420 + 380 * a)}:${num(0.35 + 0.15 * a)}|${num(0.3 + 0.1 * a)}|${num(0.25 + 0.1 * a)}|${num(0.2 + 0.1 * a)}`, 'lowpass=f=7000'],
  muffled: (a) => [`lowpass=f=${Math.round(1900 - 1400 * a)}`, 'equalizer=f=250:t=o:w=1:g=2', 'volume=1.4'],
  radio: (a) => ['highpass=f=400', `lowpass=f=${Math.round(3800 - 900 * a)}`, 'acompressor=threshold=-24dB:ratio=6:attack=5:release=60:makeup=4', `acrusher=bits=${Math.round(14 - 6 * a)}:mode=lin:aa=1:mix=${num(0.2 + 0.4 * a)}`],
  megaphone: (a) => ['highpass=f=600', `lowpass=f=${Math.round(4800 - 1200 * a)}`, 'acompressor=threshold=-26dB:ratio=8:attack=3:release=40:makeup=5', `volume=${num(1 + 0.6 * a)}`, 'alimiter=limit=0.9'],
  telephone: (a) => ['highpass=f=350', `lowpass=f=${Math.round(3400 - 600 * a)}`, 'acompressor=threshold=-22dB:ratio=4:attack=5:release=80:makeup=3'],
  robot: (a) => [`afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=${a > 0.66 ? 256 : 512}:overlap=0.75`],
  underwater: (a) => [`lowpass=f=${Math.round(900 - 450 * a)}`, `vibrato=f=${num(3 + 3 * a)}:d=${num(0.2 + 0.3 * a)}`, 'volume=1.3'],
  deep: (a) => [pitch(num(1 - 0.35 * a)), 'equalizer=f=120:t=o:w=1:g=2'],
  high: (a) => [pitch(num(1 + 0.6 * a))],
  alien: (a) => [pitch(num(1 + 0.2 * a)), `vibrato=f=${num(6 + 6 * a)}:d=${num(0.4 + 0.5 * a)}`, 'aecho=0.8:0.85:30:0.4'],
  monster: (a) => [pitch(num(1 - 0.3 * a)), 'lowpass=f=3500', 'aecho=0.8:0.8:45:0.45'],
});

/** Where the RNNoise models are (ffmpeg runs there, so a filter names them without a drive letter). */
const MODELS_HERE = fileURLToPath(new URL('./audio-models/', import.meta.url));
/* a program cannot start in a folder inside app.asar (the installed app's archive): the files are the unpacked copy's */
const UNPACKED = MODELS_HERE.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
export const MODELS = MODELS_HERE !== UNPACKED && existsSync(UNPACKED) ? UNPACKED : MODELS_HERE;
const MODEL_FILES = ['bd.rnnn', 'sh.rnnn'];

/**
 * The folder ffmpeg runs in to read the RNNoise models: the app's own when both are there, else a copy made in the
 * temporary folder (an installed app's archive, a folder that cannot be run in), else null (no neural pass).
 * @returns {Promise<string | null>}
 */
export async function modelsFolder() {
  const has = (/** @type {string} */ dir) => MODEL_FILES.every((f) => existsSync(join(dir, f)));
  if (has(MODELS)) return MODELS;
  const from = [UNPACKED, MODELS_HERE].find(has);
  if (!from) return null;
  const to = join(tmpdir(), 'lopesfilm-rnnn');
  try {
    await mkdir(to, { recursive: true });
    for (const f of MODEL_FILES) await copyFile(join(from, f), join(to, f));
    return to;
  } catch { return null; }
}
export const HUM = ['off', '50', '60'];
/**
 * Room echo (reverb) taken down, by ffmpeg's own filters: a gate that closes fast on the tail after each word, a spectral
 * pass on what is left, and the muddy low-mids pulled back. An approximation: the tail is shortened, not removed as an
 * AI model would. `[gate threshold, ratio, release ms, noise reduction dB, mud dB]`.
 */
export const DEREVERB = /** @type {Record<string, [number, number, number, number, number] | null>} */ ({ off: null, light: [0.02, 2, 160, 8, -1.5], medium: [0.035, 3, 90, 14, -3], strong: [0.05, 5, 50, 20, -4.5] });
export const LOUDNESS_DEFAULT = -16;

/**
 * The ffmpeg `-af` chain for a request.
 * @param {{ denoise?: string, dereverb?: string, voice?: boolean, eq?: string, hum?: string, fx?: string, amount?: number | string, normalize?: number | false, neural?: boolean }} o
 * `neural: false`: without RNNoise (a build of ffmpeg that lacks it, or models that cannot be read): spectral gates instead.
 * `cleaned`: the noise, the echo and the hum already taken out by the AI clean-up (py/voiceclean.py): only the polish is left.
 */
export function chain({ denoise = 'medium', dereverb = 'off', voice = false, eq = 'flat', hum = 'off', fx = 'none', amount = 60, normalize = LOUDNESS_DEFAULT, neural = true, cleaned = false } = {}) {
  if (denoise !== 'off' && !DENOISE[denoise]) throw new Error(`denoise is one of ${Object.keys(DENOISE).join(', ')}`);
  if (!(dereverb in DEREVERB)) throw new Error(`dereverb is one of ${Object.keys(DEREVERB).join(', ')}`);
  if (!EQ[eq]) throw new Error(`eq is one of ${Object.keys(EQ).join(', ')}`);
  if (!HUM.includes(hum)) throw new Error(`hum is one of ${HUM.join(', ')}`);
  if (fx !== 'none' && !VOICE_FX[fx]) throw new Error(`fx is one of none, ${Object.keys(VOICE_FX).join(', ')}`);
  const f = /** @type {string[]} */ ([]);
  const tone = EQ[eq];
  f.push(`highpass=f=${Math.max(voice ? 80 : 20, tone.low ?? 0)}`);
  if (cleaned) { denoise = 'off'; dereverb = 'off'; hum = 'off'; }
  if (hum !== 'off') for (const k of [1, 2, 3]) f.push(`equalizer=f=${Number(hum) * k}:t=q:w=30:g=-24`);
  const dn = DENOISE[denoise];
  /* light: a spectral gate; medium and strong: a neural one (RNNoise, as CapCut's "reduce noise"), then the gate for what is left */
  if (dn) {
    if (denoise !== 'light' && neural) f.push(`arnndn=m=bd.rnnn:mix=${denoise === 'strong' ? 1 : 0.85}`);
    f.push(`afftdn=nr=${denoise === 'light' ? dn[0] : neural ? Math.round(dn[0] / 2) : dn[0]}:nf=${dn[1]}:tn=1`);
  }
  const dr = DEREVERB[dereverb];
  if (dr) f.push(`agate=threshold=${dr[0]}:ratio=${dr[1]}:attack=4:release=${dr[2]}`, `afftdn=nr=${dr[3]}:nf=-46:tn=1`, `equalizer=f=320:t=o:w=1.2:g=${dr[4]}`);
  if (voice && cleaned) {
    /* the voice already isolated by the AI clean-up: only made present and even, no gate (it pumps) and no band cut */
    f.push('highpass=f=90', 'adeclick', 'deesser=i=0.3');
    f.push('acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150:makeup=2');
    f.push('equalizer=f=180:t=o:w=1:g=1', 'equalizer=f=3200:t=o:w=1:g=2', 'equalizer=f=8000:t=o:w=1.5:g=1');
  } else if (voice) {
    /* voice isolation: a neural pass trained on speech in noise, the band a voice lives in, silence between phrases */
    f.push(...(neural ? ['arnndn=m=sh.rnnn:mix=1'] : ['afftdn=nr=24:nf=-50:tn=1', 'afwtdn']), 'highpass=f=100', 'lowpass=f=9000');
    f.push('agate=threshold=0.02:ratio=3:attack=5:release=250');
    f.push('adeclick', 'deesser=i=0.35');
    f.push('acompressor=threshold=-21dB:ratio=3:attack=8:release=120:makeup=3');
    f.push('equalizer=f=120:t=o:w=1:g=1.5', 'equalizer=f=3000:t=o:w=1:g=2.5');
  }
  for (const [hz, w, g] of tone.bands) f.push(`equalizer=f=${hz}:t=o:w=${w}:g=${g}`);
  if (tone.high) f.push(`lowpass=f=${tone.high}`);
  if (fx !== 'none') f.push(...VOICE_FX[fx](Math.min(1, Math.max(0, Number(amount) / 100))));
  if (normalize !== false) f.push(`loudnorm=I=${normalize}:TP=-1.5:LRA=11`);
  return f.join(',');
}


/** @type {Promise<Set<string> | null> | undefined} */
let filtersAsked;
/** The audio filters this computer's ffmpeg has (asked once), or null when it cannot be asked. */
export function ffmpegFilters() {
  filtersAsked ??= new Promise((done) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-filters'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => done(null));
    p.on('close', () => done(new Set([...out.matchAll(/^\s*[T.][S.][C.]\s+(\w+)\s/gm)].map((m) => m[1])).size ? new Set([...out.matchAll(/^\s*[T.][S.][C.]\s+(\w+)\s/gm)].map((m) => m[1])) : null));
  });
  return filtersAsked;
}

/** A chain without the filters this ffmpeg lacks (a lean build, an old one): the rest still runs. Quotes keep their commas. */
export function pruneChain(/** @type {string} */ af, /** @type {Set<string> | null} */ have) {
  if (!have) return af;
  const parts = []; let cur = '', q = false;
  for (const ch of af) { if (ch === "'") q = !q; if (ch === ',' && !q) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  return parts.filter((x) => have.has(x.split('=')[0])).join(',');
}

/** @param {string[]} args @param {AbortSignal} [signal] @param {string} [cwd] */
function ffmpeg(args, signal, cwd) {
  return new Promise((done, fail) => {
    if (signal?.aborted) { fail(new Error('cancelled')); return; }
    const p = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-y', ...args], { windowsHide: true, ...(cwd ? { cwd } : {}) });
    let log = '';
    p.stderr.on('data', (d) => { log += d; });
    const stop = () => p.kill();
    signal?.addEventListener('abort', stop, { once: true });
    p.on('error', (e) => fail(/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT' ? e
      /* ENOENT is also what a missing working folder says: tell the two apart */
      : cwd && !existsSync(cwd) ? new Error(`the noise-removal models folder is missing: ${cwd}`) : new Error('ffmpeg is not installed here')));
    p.on('close', (code) => {
      signal?.removeEventListener('abort', stop);
      if (code === 0) done(log);
      else {
        /* the last line is always "Conversion failed!": the reason is the lines before it */
        const why = log.trim().split('\n').map((l) => l.trim()).filter((l) => l && !/^Conversion failed!?$/i.test(l)).slice(-2).join(' · ');
        fail(Object.assign(new Error(`ffmpeg: ${why || `exit ${code}`}`), { log }));
      }
    });
  });
}

/**
 * Clean `src` (a sound or video of the project) into assets/audio/clean/<out>.m4a.
 * @param {string} root @param {{ src: string, out: string, video?: boolean, denoise?: string, voice?: boolean, eq?: string, hum?: string, fx?: string, amount?: number | string, normalize?: number | string | false }} a
 * @param {AbortSignal} [signal]
 */
export async function cleanAudio(root, a, signal) {
  const normalize = a.normalize === undefined || a.normalize === 'on' ? LOUDNESS_DEFAULT : a.normalize === 'off' || a.normalize === false ? false : Number(a.normalize);
  const af = chain({ ...a, normalize });
  const input = inside(root, a.src);
  /* `video`: a video's own sound cleaned, its picture kept as it is (an .mp4 to put on the timeline in place of the clip's file) */
  const ext = a.video ? 'mp4' : 'm4a';
  let name = a.out;
  let rel = `assets/audio/clean/${name}.${ext}`;
  if (join(root, rel) === input) { name = `${a.out}-2`; rel = `assets/audio/clean/${name}.${ext}`; }
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  const tail = a.video
    ? ['-map', '0:v:0?', '-map', '0:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart']
    : ['-vn', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k'];
  /* three tries, each simpler than the last: the neural pass; the spectral gates; the bare minimum (a high-pass and the
     loudness). The filters this ffmpeg lacks are left out of each, and the answer says which one ran. If all fail, the
     first failure's reason is what the person is shown */
  const have = await ffmpegFilters();
  /* the AI clean-up first, when it is installed (py/voiceclean.py: echo, then DeepFilterNet for the noise): far cleaner
     than the filters, which stay for when it is not there or fails */
  const wantsAi = (a.denoise ?? 'medium') !== 'off' || (a.dereverb ?? 'off') !== 'off' || a.voice === true;
  let aiNote = '';
  if (wantsAi && pyInstalled('voiceclean')) {
    try {
      const done = await aiClean(input, abs, a, tail, normalize, have, signal);
      const { size } = await stat(abs);
      return { src: rel, bytes: size, filters: done, engine: 'voiceclean' };
    } catch (e) {
      if (signal?.aborted || /cancelled/i.test(String(/** @type {Error} */ (e).message))) throw e;
      aiNote = `the AI clean-up failed (${String(/** @type {Error} */ (e).message).slice(0, 160)}), so the filters were used; `;
    }
  } else if (wantsAi && pySupported()) {
    aiNote = 'install "Limpeza de voz IA" (Settings › Local models) for a far cleaner result; ';
  }
  const folder = await modelsFolder();
  const tries = [
    ...(folder && (!have || have.has('arnndn')) ? [{ af: pruneChain(af, have), cwd: folder, neural: true }] : []),
    { af: pruneChain(chain({ ...a, normalize, neural: false }), have), cwd: undefined, neural: false },
    { af: pruneChain(chain({ denoise: 'off', normalize }), have) || 'anull', cwd: undefined, neural: false, bare: true },
  ];
  let used = '', neural = false, bare = false, first = null;
  for (const t of tries) {
    try { await ffmpeg(['-i', input, '-af', t.af, ...tail, abs], signal, t.cwd); used = t.af; neural = t.neural; bare = !!t.bare; first = null; break; }
    catch (e) {
      if (signal?.aborted || /cancelled|not installed/i.test(String(/** @type {Error} */ (e).message))) throw e;
      first ??= /** @type {Error} */ (e);
    }
  }
  if (!used) throw first ?? new Error('ffmpeg: could not clean this sound');
  first = null;
  const { size } = await stat(abs);
  const note = aiNote + (neural ? '' : bare ? 'this ffmpeg could not run the noise filters, so only the basic clean-up and loudness were applied' : 'the neural noise models could not run here, so spectral gates were used instead');
  return { src: rel, bytes: size, filters: used, ...(note ? { note: note.replace(/; $/, '') } : {}) };
}

const LEVELS = ['off', 'light', 'medium', 'strong'];
/**
 * The AI clean-up: the sound made a 48 kHz mono wav with the rumble and the mains hum cut (ffmpeg), the echo and the
 * noise taken out (py/voiceclean.py), then polished (tone, voice, effect, loudness) into `out`, the video's picture kept.
 * @param {string} input @param {string} out @param {any} a @param {string[]} tail @param {number | false} normalize
 * @param {Set<string> | null} have @param {AbortSignal} [signal]
 */
async function aiClean(input, out, a, tail, normalize, have, signal) {
  const dir = await mkdtemp(join(tmpdir(), 'lopesfilm-voice-'));
  try {
    const pre = join(dir, 'in.wav'), post = join(dir, 'out.wav');
    /* the hum of the mains, 50 or 60 Hz and its harmonics, cut narrow (a voice is untouched there) */
    const hums = a.hum && a.hum !== 'off' ? [Number(a.hum)] : [50, 60];
    const notches = hums.flatMap((h) => [1, 2, 3].map((k) => `bandreject=f=${h * k}:width_type=q:w=12`));
    await ffmpeg(['-i', input, '-vn', '-ac', '1', '-ar', '48000', '-af', pruneChain(['highpass=f=70', ...notches].join(','), have) || 'anull', '-c:a', 'pcm_s16le', pre], signal);
    const level = (/** @type {unknown} */ v, /** @type {string} */ d) => (LEVELS.includes(String(v)) ? String(v) : d);
    /* "voice" (isolation) asks the model to go all the way */
    const denoise = a.voice === true ? 'strong' : level(a.denoise, 'medium');
    const dereverb = level(a.dereverb, 'off');
    const said = await runPyTool('voiceclean', [pre, post, '--denoise', denoise, '--dereverb', dereverb], { signal, timeoutMs: 30 * 60_000 });
    const last = said.trim().split('\n').pop() ?? '';
    try { const r = JSON.parse(last); if (r && r.ok === false) throw new Error(r.error || 'voiceclean failed'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    const af = pruneChain(chain({ ...a, normalize, cleaned: true }), have) || 'anull';
    /* a video: its picture from the original, its sound the cleaned one */
    const ins = a.video ? ['-i', input, '-i', post] : ['-i', post];
    const map = a.video ? ['-map', '0:v:0?', '-map', '1:a:0'] : [];
    const t = a.video ? tail.filter((x, i, l) => !(x === '-map' || l[i - 1] === '-map')) : tail;
    await ffmpeg([...ins, ...map, '-af', af, ...t, out], signal);
    return `voiceclean(denoise=${denoise},dereverb=${dereverb}) → ${af}`;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
