/**
 * The spectrogram of the film's sound: frequency up, time across, loudness as brightness (grey) or as color (heat map).
 * Pure functions: a Hann-windowed FFT of the mix's latest samples, folded into log-spaced bands (20 Hz – 20 kHz, as the
 * ear hears), in dB, and the two palettes. Drawn by components/Spectrogram.tsx.
 */

/** The loudness range shown, dB (below the floor is black). */
export const SPEC_FLOOR_DB = -90;
export const SPEC_CEIL_DB = -12;
export const SPEC_MIN_HZ = 20;
export const SPEC_MAX_HZ = 20000;

/** In-place radix-2 FFT of `re`/`im` (power-of-two length). */
export function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** The magnitude spectrum of `samples` (Hann window), in dBFS per bin, `samples.length / 2` bins. */
export function spectrumDb(samples: Float32Array): Float32Array {
  const n = samples.length;
  const re = new Float32Array(n), im = new Float32Array(n);
  let gain = 0;
  for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); re[i] = samples[i] * w; gain += w; }
  fft(re, im);
  const out = new Float32Array(n / 2);
  for (let k = 0; k < out.length; k++) {
    /* a full-scale sine reads 0 dBFS: the one-sided amplitude, 2/Σwindow */
    const mag = (2 * Math.hypot(re[k], im[k])) / gain;
    out[k] = 20 * Math.log10(Math.max(mag, 1e-9));
  }
  return out;
}

/**
 * `bands` log-spaced values (low to high) of a spectrum. A band wider than a bin takes the loudest bin in it; a band
 * narrower than one (the low end, where a bin is wider than a band) is read between the two bins around its centre, so
 * the picture shows a smooth slope there instead of steps.
 */
export function logBands(db: Float32Array, sampleRate: number, bands: number): Float32Array {
  const out = new Float32Array(bands).fill(SPEC_FLOOR_DB);
  const binHz = sampleRate / 2 / db.length;
  const ratio = SPEC_MAX_HZ / SPEC_MIN_HZ;
  for (let b = 0; b < bands; b++) {
    const lo = SPEC_MIN_HZ * ratio ** (b / bands), hi = SPEC_MIN_HZ * ratio ** ((b + 1) / bands);
    if ((hi - lo) / binHz < 1) {
      const pos = Math.sqrt(lo * hi) / binHz;
      const i = Math.min(db.length - 2, Math.floor(pos)), f = Math.min(1, pos - i);
      out[b] = db[i] * (1 - f) + db[i + 1] * f;
      continue;
    }
    const a = Math.min(db.length - 1, Math.floor(lo / binHz));
    const z = Math.min(db.length - 1, Math.max(a, Math.floor(hi / binHz)));
    let m = SPEC_FLOOR_DB;
    for (let k = a; k <= z; k++) if (db[k] > m) m = db[k];
    out[b] = m;
  }
  return out;
}

/** Where a frequency sits on the log axis, 0 (20 Hz) … 1 (20 kHz). */
export const freqPos = (hz: number) => Math.log(hz / SPEC_MIN_HZ) / Math.log(SPEC_MAX_HZ / SPEC_MIN_HZ);

/** 0..1 for a loudness. */
export const level01 = (db: number) => Math.min(1, Math.max(0, (db - SPEC_FLOOR_DB) / (SPEC_CEIL_DB - SPEC_FLOOR_DB)));

/** The colour stops of the heat palette: black, indigo, magenta, orange, lime-yellow, white. */
const HEAT: [number, number, number][] = [[0, 0, 0], [24, 10, 70], [78, 18, 118], [150, 34, 110], [214, 68, 70], [247, 128, 24], [252, 196, 40], [255, 252, 200]];

/** The heat colour of a loudness (RGB 0..255). */
export function heatColor(db: number): [number, number, number] {
  const t = level01(db) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(t));
  const f = t - i;
  const a = HEAT[i], b = HEAT[i + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

/** The grey of a loudness (RGB 0..255). */
export function greyColor(db: number): [number, number, number] {
  const v = Math.round(255 * level01(db) ** 0.8);
  return [v, v, v];
}
