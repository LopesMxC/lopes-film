// @ts-check
/**
 * The local engines that are not library models: the picture maker, the video maker, the upscaler and the eye-contact
 * model. Each is fetched on its own (a download of its own: 5 MB to 7 GB) and then kept; the setup guide and Settings
 * install them from here.
 *
 *   GET    /api/local-engines              every engine, with where it stands
 *   POST   /api/local-engines/<id>/install fetched now, in the background; GET says how it goes
 */
import { engineUpdates } from './engine-updates.mjs';
import { statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpError, json } from './http.mjs';
import * as image from './providers/localimage.mjs';
import * as video from './providers/localvideo.mjs';
import * as up from './upscale.mjs';
import * as eyes from './eyes.mjs';
import * as fx from './effectcraft.mjs';
import * as dc from './designcraft.mjs';
import * as rife from './interpolate.mjs';
import * as ae from './autoedit.mjs';
import * as sc from './soundcraft.mjs';
import * as ani from './anicraft.mjs';
import { hardwareNow, whyNot } from './hardware.mjs';
import * as yt from './webdl.mjs';
import { PY_TOOLS, installPyTool, pyInstalled, pyInstalledBytes, pySupported } from './pytools.mjs';
import { PACKS, installPack, packDir, packHave, packInstalled } from './packs.mjs';

const GB = 2 ** 30;
const sum = (/** @type {{ bytes: number }[]} */ files) => files.reduce((n, f) => n + f.bytes, 0);

/**
 * @type {Record<string, { pack?: import('./packs.mjs').Pack, kind: string, name: string, bytes: number, installed: () => boolean, install: (signal: AbortSignal, say: (l: string) => void) => Promise<void>, supported: () => boolean }>}
 */
export const ENGINES = {
  ...Object.fromEntries(PACKS.map((p) => [`pack-${p.id}`, { kind: 'pack', name: p.name, bytes: p.bytes, installed: () => packInstalled(p.id), install: (/** @type {AbortSignal} */ s, /** @type {(l: string) => void} */ say) => installPack(p.id, s, say), supported: () => true, pack: p }])),
  image: { kind: 'image', name: 'Z-Image-Turbo', bytes: sum(image.MODEL_FILES), installed: () => image.installed(), install: (s, say) => image.install(image.imageDir(), s, say), supported: () => Boolean(image.runtimeFor()) },
  video: { kind: 'video', name: 'Wan 2.1 1.3B', bytes: sum(video.MODEL_FILES), installed: () => video.installed(), install: (s, say) => video.install(video.videoDir(), s, say), supported: () => Boolean(image.runtimeFor()) },
  upscale: { kind: 'upscale', name: 'Real-ESRGAN', bytes: up.UPSCALE_BYTES, installed: () => up.installed(), install: (s, say) => up.install(up.upscaleDir(), s, say), supported: () => Boolean(up.runtimeFor()) },
  eyes: { kind: 'eyes', name: 'Eye contact', bytes: eyes.EYES_BYTES, installed: () => eyes.installed(), install: (s, say) => eyes.install(eyes.eyesDir(), s, say), supported: () => true },
  effectcraft: { kind: 'effectcraft', name: 'Skill de Motion', bytes: fx.EFFECTCRAFT_BYTES, installed: () => fx.installed(), install: (s, say) => fx.install(fx.effectcraftDir(), s, say), supported: () => Boolean(fx.runtimeFor()) },
  figcraft: { kind: 'figcraft', name: 'FigCraft', bytes: dc.designBytes(dc.DESIGNS.figcraft), installed: () => dc.designInstalled(dc.DESIGNS.figcraft), install: (s, say) => dc.installDesign(dc.DESIGNS.figcraft, undefined, s, say), supported: () => Boolean(dc.packageFor(dc.DESIGNS.figcraft)) },
  vectorcraft: { kind: 'vectorcraft', name: 'Skill de Vetor', bytes: dc.designBytes(dc.DESIGNS.vectorcraft), installed: () => dc.designInstalled(dc.DESIGNS.vectorcraft), install: (s, say) => dc.installDesign(dc.DESIGNS.vectorcraft, undefined, s, say), supported: () => Boolean(dc.packageFor(dc.DESIGNS.vectorcraft)) },
  interpolate: { kind: 'interpolate', name: 'RIFE', bytes: rife.RIFE_BYTES, installed: () => rife.installed(), install: (s, say) => rife.install(rife.rifeDir(), s, say), supported: () => Boolean(rife.runtimeFor()) },
  autoedit: { kind: 'autoedit', name: 'auto-editor', bytes: ae.AUTOEDITOR_BYTES, installed: () => ae.installed(), install: (s, say) => ae.install(ae.autoEditorDir(), s, say), supported: () => Boolean(ae.runtimeFor()) },
  soundcraft: { kind: 'soundcraft', name: 'Skill SoundMaker', bytes: sc.SOUNDCRAFT_BYTES, installed: () => sc.installed(), install: (s, say) => sc.install(sc.soundcraftDir(), s, say), supported: () => Boolean(sc.runtimeFor()) },
  anicraft: { kind: 'anicraft', name: 'Skill 2D', bytes: ani.ANICRAFT_BYTES, installed: () => ani.installed(), install: (s, say) => ani.install(ani.anicraftDir(), s, say), supported: () => Boolean(ani.runtimeFor()) },
  ytdlp: { kind: 'ytdlp', name: 'yt-dlp', bytes: yt.YTDLP_BYTES, installed: () => yt.installed(), install: (s, say) => yt.install(yt.ytdlpDir(), s, say), supported: () => Boolean(yt.runtimeFor()) },
  whisperfast: { kind: 'whisperfast', name: 'Transcrição rápida', bytes: PY_TOOLS.whisperfast.bytes, installed: () => pyInstalled('whisperfast'), install: (s, say) => installPyTool('whisperfast', s, say), supported: pySupported },
  voiceclean: { kind: 'voiceclean', name: 'Limpeza de voz IA', bytes: PY_TOOLS.voiceclean.bytes, installed: () => pyInstalled('voiceclean'), install: (s, say) => installPyTool('voiceclean', s, say), supported: pySupported },
  earshot: { kind: 'earshot', name: 'earshot', bytes: PY_TOOLS.earshot.bytes, installed: () => pyInstalled('earshot'), install: (s, say) => installPyTool('earshot', s, say), supported: pySupported },
  reavideo: { kind: 'reavideo', name: 'rea-video', bytes: PY_TOOLS.reavideo.bytes, installed: () => pyInstalled('reavideo'), install: (s, say) => installPyTool('reavideo', s, say), supported: pySupported },
};

/** The bytes of a file, whole or part-fetched. @param {string} f */
const size = (f) => { for (const p of [f, `${f}.part`]) { try { return statSync(p).size; } catch { /* not there */ } } return 0; };
/** How much of an engine is here (finished files and the part fetched of the one in hand). @param {string} id */
function have(id) {
  if (id.startsWith('pack-')) return packHave(id.slice(5));
  if (id === 'image') return image.MODEL_FILES.reduce((n, f) => n + size(join(image.imageDir(), 'models', f.name)), 0);
  if (id === 'video') return video.MODEL_FILES.reduce((n, f) => n + size(join(video.videoDir(), 'models', f.name)), 0);
  if (id === 'eyes') return eyes.MODEL_FILES.reduce((n, f) => n + size(join(eyes.eyesDir(), f.name)), 0);
  if (id === 'figcraft' || id === 'vectorcraft') { const pkg = dc.packageFor(dc.DESIGNS[id]); return pkg ? size(join(tmpdir(), `lopesfilm-${pkg.file}`)) : 0; }
  if (id === 'interpolate') { const r = rife.runtimeFor(); return r ? size(join(tmpdir(), `lopesfilm-${r.zip}`)) : 0; }
  if (id === 'anicraft') { const r = ani.runtimeFor(); return r ? size(join(tmpdir(), `lopesfilm-${r.file}`)) : 0; }
  if (id === 'soundcraft') { const r = sc.runtimeFor(); return r ? size(join(tmpdir(), `lopesfilm-${r.file}`)) : 0; }
  if (id === 'autoedit') return size(ae.exePath());
  if (id === 'ytdlp') return size(`${yt.exePath()}.next`) || size(yt.exePath());
  if (id === 'earshot' || id === 'reavideo' || id === 'voiceclean' || id === 'whisperfast') return pyInstalledBytes(id);
  if (id === 'effectcraft') { const r = fx.runtimeFor(); return r ? size(join(tmpdir(), `lopesfilm-${r.file}`)) : 0; }
  const rt = up.runtimeFor();
  return rt ? size(join(tmpdir(), `lopesfilm-${rt.zip}`)) : 0;
}

/** @type {Map<string, { say: string, error?: string, controller: AbortController }>} */
const jobs = new Map();

/** Every engine as the guide and Settings show it. */
export function engines() {
  return Object.entries(ENGINES).map(([id, e]) => {
    const job = jobs.get(id);
    const ready = e.installed();
    return {
      id, kind: e.kind, name: e.name, bytes: e.bytes, gb: Math.round((e.bytes / GB) * 10) / 10,
      installed: ready, supported: e.supported(), ...(whyNot(id) ? { blocked: whyNot(id) } : {}),
      ...(e.pack ? { license: e.pack.license, by: e.pack.by, source: e.pack.source, folder: packDir(e.pack.id), files: e.pack.files.length } : {}),
      ...(job && !job.error && !ready ? { installing: { say: job.say, bytes: Math.min(e.bytes, have(id)) } } : {}),
      ...(job?.error && !ready ? { failed: job.error } : {}),
    };
  });
}

/** Start fetching one, once. @param {string} id */
export function startInstall(id) {
  const e = ENGINES[id];
  if (!e) throw new HttpError(404, 'no such engine');
  if (!e.supported()) throw new HttpError(409, 'this computer cannot run it');
  /* o computador não dá conta de um modelo pesado: o download fica indisponível */
  const why = whyNot(id);
  if (why && !e.installed()) throw new HttpError(409, why);
  if (e.installed()) return;
  const running = jobs.get(id);
  if (running && !running.error) return;
  const job = { say: 'starting', controller: new AbortController(), error: /** @type {string | undefined} */ (undefined) };
  jobs.set(id, job);
  e.install(job.controller.signal, (line) => { job.say = line; })
    .then(() => { jobs.delete(id); })
    .catch((err) => { job.error = err instanceof Error ? err.message : String(err); });
}

/**
 * The API above.
 * @param {import('./http.mjs').Req} req @param {import('./http.mjs').Res} res @param {string[]} parts
 */
export async function localEnginesRoute(req, res, parts) {
  if (!parts.length && req.method === 'GET') return json(res, 200, { engines: engines() });
  /* newer releases of what it fetches: told, never taken in by itself (engine-updates.mjs) */
  if (parts.length === 1 && parts[0] === 'updates' && req.method === 'GET') return json(res, 200, { updates: await engineUpdates() });
  if (parts.length === 2 && parts[1] === 'install' && req.method === 'POST') {
    startInstall(parts[0]);
    return json(res, 200, { engines: engines() });
  }
  throw new HttpError(404, 'no such thing');
}
