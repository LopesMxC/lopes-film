// @ts-check
/**
 * Eye contact on this computer, as CapCut's "eye contact" does it: where the person on screen looks away from the lens (down
 * at a script, to the side), the iris is moved back to the middle of the eye, frame by frame, the rest of the picture
 * and the sound kept. Nothing is sent anywhere.
 *
 *   YuNet (OpenCV, Apache-2.0) finds the face once, and again whenever it is lost;
 *   MediaPipe Face Mesh V2 (Google, Apache-2.0, as ONNX) gives 478 landmarks, ten of them the irises, on every frame;
 *   a local warp (a soft mask of the opening of each eye) slides the iris to the middle of its eye.
 *
 * Left alone: a closed eye (a blink), a head turned away (the middle of the eye is then not where the lens is), and
 * anything that is not a face. The correction is smoothed over time so the eyes do not jitter.
 *
 *   node src/local-eyes.mjs <in> <out> [strength 0..1]      prints JSON lines: { progress }, then { done, ... } or { error }
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* ── geometry (pure) ───────────────────────────────────────────────────────── */

/** The eye contours of the mesh, a ring each, and their corners and lids. A is the eye with iris 468..472, B 473..477. */
export const EYES = /** @type {const} */ ({
  A: { ring: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], corners: [33, 133], lids: [159, 145], iris: 468 },
  B: { ring: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249], corners: [263, 362], lids: [386, 374], iris: 473 },
});
const NOSE = 1;

/** @typedef {{ x: number, y: number }} Pt  @typedef {{ cx: number, cy: number, size: number, angle: number }} Roi */

/** The region from a detected face: its box, turned by the line of the eyes, 1.5 times its longer side. @param {{ x: number, y: number, w: number, h: number }} box @param {Pt} left @param {Pt} right @returns {Roi} */
export function roiFromFace(box, left, right) {
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, size: Math.max(box.w, box.h) * 1.5, angle: Math.atan2(right.y - left.y, right.x - left.x) };
}

/** The region from the landmarks of the last frame (the tracking): their box, turned by the line of the eyes. @param {Pt[]} pts @returns {Roi} */
export function roiFromLandmarks(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  const a = pts[33], b = pts[263];
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: Math.max(x1 - x0, y1 - y0) * 1.5, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Where a point of the 256 x 256 crop is in the frame. @param {Roi} r @param {number} u @param {number} v */
export function cropToFrame(r, u, v) {
  const a = (u / 256 - 0.5) * r.size, b = (v / 256 - 0.5) * r.size;
  const c = Math.cos(r.angle), s = Math.sin(r.angle);
  return { x: r.cx + a * c - b * s, y: r.cy + a * s + b * c };
}

/**
 * The crop the landmark model takes: the region sampled into 256 x 256 RGB floats (0..1), NHWC.
 * @param {Uint8Array} rgb @param {number} w @param {number} h @param {Roi} r
 */
export function crop(rgb, w, h, r) {
  const out = new Float32Array(256 * 256 * 3);
  for (let v = 0; v < 256; v++) for (let u = 0; u < 256; u++) {
    const p = cropToFrame(r, u + 0.5, v + 0.5);
    const o = (v * 256 + u) * 3;
    sample(rgb, w, h, p.x - 0.5, p.y - 0.5, out, o, 1 / 255);
  }
  return out;
}

/** Bilinear read of pixel (x, y), edges held, into `out[o..o+2] * k`. @param {Uint8Array} rgb @param {number} w @param {number} h @param {number} x @param {number} y @param {ArrayLike<number> & { [i: number]: number }} out @param {number} o @param {number} k */
export function sample(rgb, w, h, x, y, out, o, k = 1) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = Math.min(w - 1, Math.max(0, x0)), xb = Math.min(w - 1, Math.max(0, x0 + 1));
  const ya = Math.min(h - 1, Math.max(0, y0)), yb = Math.min(h - 1, Math.max(0, y0 + 1));
  for (let c = 0; c < 3; c++) {
    const top = rgb[(ya * w + xa) * 3 + c] * (1 - fx) + rgb[(ya * w + xb) * 3 + c] * fx;
    const bot = rgb[(yb * w + xa) * 3 + c] * (1 - fx) + rgb[(yb * w + xb) * 3 + c] * fx;
    out[o + c] = (top * (1 - fy) + bot * fy) * k;
  }
}

/** The 478 landmarks in the frame, from the model's 1434 numbers. @param {ArrayLike<number>} raw @param {Roi} r @returns {Pt[]} */
export function landmarksOf(raw, r) {
  const pts = [];
  for (let i = 0; i < 478; i++) pts.push(cropToFrame(r, raw[i * 3], raw[i * 3 + 1]));
  return pts;
}

/**
 * What to do to one eye: how far its iris is from the middle of its opening, and how much of that to undo.
 * `d` is the move in pixels (0 when the eye is shut), `open` the opening over the eye's width.
 * @param {Pt[]} pts @param {'A' | 'B'} which @param {number} strength 0..1
 */
export function gazeOffset(pts, which, strength) {
  const e = EYES[which];
  const [c0, c1] = e.corners.map((i) => pts[i]);
  const [top, bottom] = e.lids.map((i) => pts[i]);
  const width = Math.hypot(c1.x - c0.x, c1.y - c0.y);
  const open = Math.hypot(top.x - bottom.x, top.y - bottom.y) / Math.max(1, width);
  const iris = pts[e.iris];
  const radius = [1, 2, 3, 4].reduce((s, k) => s + Math.hypot(pts[e.iris + k].x - iris.x, pts[e.iris + k].y - iris.y), 0) / 4;
  /* the middle of the opening: halfway between the corners across, halfway between the lids up and down */
  const mid = { x: (c0.x + c1.x) / 4 + (top.x + bottom.x) / 4, y: (c0.y + c1.y) / 4 + (top.y + bottom.y) / 4 };
  let dx = (mid.x - iris.x) * strength, dy = (mid.y - iris.y) * strength;
  /* mostly sideways: the lids hide the iris above and below, and a move there would show what the picture never had */
  const limitX = width * 0.3, limitY = width * 0.14;
  const lx = Math.hypot(dx / limitX, dy / limitY);
  if (lx > 1) { dx /= lx; dy /= lx; }
  /* a blink: the opening under 0.12 of the width is shut or about to be, and the move fades out before then */
  const shut = Math.min(1, Math.max(0, (open - 0.12) / 0.1));
  return { d: { x: dx * shut, y: dy * shut }, open, iris, radius, width };
}

/**
 * How much a turned head lets the correction stay: 1 facing the lens, 0 past about 30 degrees. The nose, seen from the
 * middle of the eyes, tells: straight on it is between them.
 * @param {Pt[]} pts
 */
export function facing(pts) {
  const a = pts[33], b = pts[263], n = pts[NOSE];
  const across = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / across, uy = (b.y - a.y) / across;
  const turn = Math.abs(((n.x - (a.x + b.x) / 2) * ux + (n.y - (a.y + b.y) / 2) * uy) / across);
  return Math.min(1, Math.max(0, (0.34 - turn) / 0.12));
}

/** A ring of points filled into a `w` x `h` mask (0..1), softened by `blur` pixels. @param {Pt[]} ring @param {number} w @param {number} h @param {number} blur */
export function fillRing(ring, w, h, blur) {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const xs = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a.y <= y + 0.5) !== (b.y <= y + 0.5)) xs.push(a.x + ((y + 0.5 - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); x++) m[y * w + x] = 1;
  }
  const r = Math.max(0, Math.round(blur));
  return r ? boxBlur(boxBlur(m, w, h, r), w, h, r) : m;
}

/** @param {Float32Array} src @param {number} w @param {number} h @param {number} r */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Move the iris of one eye by `d` in the frame, in place: around the iris the picture slides with it, the weight falling
 * to nothing past twice its size and at the edge of the eye's opening, so the lids and the skin stay where they are.
 * @param {Uint8Array} rgb @param {number} w @param {number} h @param {Pt[]} pts @param {'A' | 'B'} which @param {{ x: number, y: number }} d @param {number} radius
 */
export function moveIris(rgb, w, h, pts, which, d, radius) {
  if (Math.abs(d.x) < 0.05 && Math.abs(d.y) < 0.05) return;
  const e = EYES[which], iris = pts[e.iris];
  const ring = e.ring.map((i) => pts[i]);
  const pad = Math.ceil(radius * 2.6 + Math.hypot(d.x, d.y));
  const x0 = Math.max(0, Math.floor(iris.x - pad)), y0 = Math.max(0, Math.floor(iris.y - pad));
  const x1 = Math.min(w, Math.ceil(iris.x + pad)), y1 = Math.min(h, Math.ceil(iris.y + pad));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw < 4 || bh < 4) return;
  const mask = fillRing(ring.map((p) => ({ x: p.x - x0, y: p.y - y0 })), bw, bh, radius * 0.18);
  /* the box as it was, to read from while the frame is written */
  const was = new Uint8Array(bw * bh * 3);
  for (let y = 0; y < bh; y++) was.set(rgb.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x1) * 3), y * bw * 3);
  const px = [0, 0, 0];
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const m = mask[y * bw + x];
    if (m <= 0.001) continue;
    const dist = Math.hypot(x0 + x + 0.5 - iris.x, y0 + y + 0.5 - iris.y) / radius;
    const t = Math.min(1, Math.max(0, (2.4 - dist) / 1.15));
    const wgt = t * t * (3 - 2 * t) * m;
    if (wgt <= 0.001) continue;
    sample(was, bw, bh, x - d.x * wgt, y - d.y * wgt, px, 0);
    const o = ((y0 + y) * w + (x0 + x)) * 3;
    rgb[o] = px[0]; rgb[o + 1] = px[1]; rgb[o + 2] = px[2];
  }
}

/* ── YuNet's answer (pure) ─────────────────────────────────────────────────── */

/**
 * The most prominent face in YuNet's outputs, in the 640-square the picture was put in: its box and its two eye points.
 * @param {Record<string, { data: ArrayLike<number> }>} out @param {number} side @param {number} minScore
 * @returns {{ box: { x: number, y: number, w: number, h: number }, left: Pt, right: Pt, score: number } | null}
 */
export function bestFace(out, side, minScore = 0.6) {
  let best = null;
  for (const stride of [8, 16, 32]) {
    const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data, bb = out[`bbox_${stride}`].data, kp = out[`kps_${stride}`].data;
    const cols = side / stride;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < minScore) continue;
      const c = i % cols, r = Math.floor(i / cols);
      const w = Math.exp(bb[i * 4 + 2]) * stride, h = Math.exp(bb[i * 4 + 3]) * stride;
      const cx = (c + bb[i * 4]) * stride, cy = (r + bb[i * 4 + 1]) * stride;
      /* the bigger face wins over the surer one: the person speaking is nearest the lens */
      const rank = score * w * h;
      if (!best || rank > best.rank) {
        const e0 = { x: (kp[i * 10] + c) * stride, y: (kp[i * 10 + 1] + r) * stride };
        const e1 = { x: (kp[i * 10 + 2] + c) * stride, y: (kp[i * 10 + 3] + r) * stride };
        best = { rank, score, box: { x: cx - w / 2, y: cy - h / 2, w, h }, left: e0.x <= e1.x ? e0 : e1, right: e0.x <= e1.x ? e1 : e0 };
      }
    }
  }
  return best;
}

/* ── the run ───────────────────────────────────────────────────────────────── */

const here = dirname(fileURLToPath(import.meta.url));

/** The onnxruntime-web the app carries (a dependency), else the one the library publishes. */
async function runtime() {
  const dist = [join(here, '..', 'node_modules', 'onnxruntime-web', 'dist'), join(here, '..', '..', '..', 'node_modules', 'onnxruntime-web', 'dist')].find((d) => existsSync(join(d, 'ort.wasm.min.mjs')));
  let file = dist ? join(dist, 'ort.wasm.min.mjs') : null;
  if (!file) {
    const { modelFile } = await import('./local-models.mjs');
    const { RUNTIME } = await import('./local-asr.mjs');
    file = modelFile(RUNTIME);
  }
  const ort = await import(pathToFileURL(file).href);
  const { folderAddress } = await import('./local-asr.mjs');
  ort.env.wasm.wasmPaths = folderAddress(file);
  ort.env.wasm.numThreads = process.platform === 'win32' ? 1 : Math.max(1, Math.min(4, availableParallelism() - 1));
  ort.env.logLevel = 'error';
  return ort;
}

/** @param {string} cmd @param {string[]} args @returns {Promise<string>} */
function capture(cmd, args) {
  return new Promise((done, fail) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? done(out) : fail(new Error(err.trim().split('\n').at(-1) || `${cmd} exit ${code}`))));
  });
}

/** The size, rate and length of a picture or video. @param {string} file */
export async function probe(file) {
  const j = JSON.parse(await capture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:stream_tags=rotate:stream_side_data=rotation:format=duration', '-of', 'json', file]));
  const s = j.streams?.[0];
  if (!s) throw new Error('that is not a picture or video ffmpeg can read');
  const rot = Math.abs(Number(s.side_data_list?.find((/** @type {any} */ d) => d.rotation !== undefined)?.rotation ?? s.tags?.rotate ?? 0)) % 180;
  const [a, b] = String(s.r_frame_rate || '30/1').split('/').map(Number);
  const fps = b ? a / b : 30;
  const seconds = Number(j.format?.duration) || 0;
  return { width: rot === 90 ? s.height : s.width, height: rot === 90 ? s.width : s.height, fps, frames: Number(s.nb_frames) || Math.max(1, Math.round(seconds * fps)) };
}

/**
 * Correct the eyes of `src` into `out`. `models` holds yunet.onnx and face_landmarks.onnx.
 * @param {{ src: string, out: string, models: string, strength?: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} o
 */
export async function correctEyes({ src, out, models, strength = 0.9, onProgress, signal }) {
  const ort = await runtime();
  const yunet = await ort.InferenceSession.create(readFileSync(join(models, 'yunet.onnx')), { logSeverityLevel: 3 });
  const mesh = await ort.InferenceSession.create(readFileSync(join(models, 'face_landmarks.onnx')), { logSeverityLevel: 3 });
  const { width: w, height: h, fps, frames } = await probe(src);
  const still = /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(src);
  const size = w * h * 3;

  const dec = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const enc = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
    ...(still ? ['-frames:v', '1', out] : ['-i', src, '-map', '0:v', '-map', '1:a?', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out])],
  { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let log = '';
  dec.stderr.on('data', (d) => { log += d; });
  enc.stderr.on('data', (d) => { log += d; });
  const ended = new Promise((done, fail) => enc.on('close', (code) => (code === 0 ? done(undefined) : fail(new Error(`ffmpeg: ${log.trim().split('\n').at(-1) ?? code}`)))));
  signal?.addEventListener('abort', () => { dec.kill(); enc.kill(); }, { once: true });

  /** @type {Roi | null} */
  let roi = null;
  let sinceDetect = 0, n = 0, fixed = 0;
  /** @type {Record<'A' | 'B', { x: number, y: number }>} */
  const smooth = { A: { x: 0, y: 0 }, B: { x: 0, y: 0 } };

  /** @param {Uint8Array} rgb */
  async function process(rgb) {
    if (!roi || ++sinceDetect > 45) {
      sinceDetect = 0;
      const S = 640, k = Math.min(S / w, S / h);
      const input = new Float32Array(3 * S * S);
      const px = [0, 0, 0];
      for (let y = 0; y < Math.min(S, Math.ceil(h * k)); y++) for (let x = 0; x < Math.min(S, Math.ceil(w * k)); x++) {
        sample(rgb, w, h, x / k, y / k, px, 0);
        /* YuNet takes BGR, 0..255 */
        input[y * S + x] = px[2]; input[S * S + y * S + x] = px[1]; input[2 * S * S + y * S + x] = px[0];
      }
      const found = bestFace(await yunet.run({ [yunet.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) }), S);
      if (found) {
        const f = (/** @type {Pt} */ p) => ({ x: p.x / k, y: p.y / k });
        roi = roiFromFace({ x: found.box.x / k, y: found.box.y / k, w: found.box.w / k, h: found.box.h / k }, f(found.left), f(found.right));
      } else roi = null;
    }
    if (!roi) { smooth.A = { x: 0, y: 0 }; smooth.B = { x: 0, y: 0 }; return; }
    const res = await mesh.run({ [mesh.inputNames[0]]: new ort.Tensor('float32', crop(rgb, w, h, roi), [1, 256, 256, 3]) });
    const present = /** @type {Float32Array} */ (res[mesh.outputNames[1]].data)[0];
    if (present < 0) { roi = null; return; }
    const pts = landmarksOf(/** @type {Float32Array} */ (res[mesh.outputNames[0]].data), roi);
    roi = roiFromLandmarks(pts);
    const face = facing(pts);
    for (const which of /** @type {const} */ (['A', 'B'])) {
      const g = gazeOffset(pts, which, strength * face);
      /* a quarter of the last move stays: the eyes drift, they do not jump */
      const s = smooth[which];
      s.x = s.x * 0.35 + g.d.x * 0.65; s.y = s.y * 0.35 + g.d.y * 0.65;
      if (Math.hypot(s.x, s.y) >= 0.3) fixed++;
      moveIris(rgb, w, h, pts, which, s, g.radius);
    }
  }

  let buf = Buffer.alloc(0);
  const chunks = /** @type {Buffer[]} */ ([]);
  let have = 0;
  for await (const chunk of dec.stdout) {
    chunks.push(chunk); have += chunk.length;
    while (have >= size) {
      buf = Buffer.concat(chunks); chunks.length = 0;
      const frame = new Uint8Array(buf.buffer, buf.byteOffset, size).slice();
      const rest = buf.subarray(size);
      if (rest.length) chunks.push(rest);
      have = rest.length;
      await process(frame);
      if (!enc.stdin.write(frame)) await new Promise((r) => enc.stdin.once('drain', r));
      onProgress?.(++n, frames);
    }
  }
  enc.stdin.end();
  await ended;
  if (!n) throw new Error(`no picture could be read from ${src}: ${log.trim().split('\n').at(-1) ?? ''}`);
  return { frames: n, corrected: fixed, width: w, height: h };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [src, out, strength] = process.argv.slice(2);
  try {
    const models = process.env.LOPESFILM_EYES_DIR || join(process.env.HOME || process.env.USERPROFILE || '.', '.lopesfilm', 'models', 'eyes');
    let last = 0;
    const r = await correctEyes({ src, out, models, strength: strength ? Number(strength) : undefined, onProgress: (d, t) => { if (d - last >= 15 || d === t) { last = d; console.log(JSON.stringify({ progress: d, of: t })); } } });
    console.log(JSON.stringify({ done: true, ...r }));
  } catch (e) {
    console.log(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    process.exitCode = 1;
  }
}
