// @ts-check
/**
 * Tools that are Python programs, run on this computer with no Python of the person's needed: uv (Astral, MIT/Apache-2.0,
 * one program of about 20 MB from its GitHub release, checked by the sha256 the release publishes) makes each tool a
 * Python of its own (`~/.lopesfilm/models/py/<tool>/venv`, Python 3.11 fetched by uv itself) and installs the tool there.
 * Nothing is installed in the person's own Python, and taking a tool away is deleting its folder.
 *
 *   earshot    (Leon Lin, MIT)        ears for agents: what a sound is, how it fits a description, a film's sound critique
 *   rea-video  (JuneYaooo, Apache-2.0) a video broken down shot by shot: filmed, AI or code, and how to remake it
 *
 * Each is pinned to a commit of its repository, fetched as GitHub's own archive of it (no git needed).
 */
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { exec, fetchTo, sha256Of } from './providers/localimage.mjs';

export const pyDir = () => process.env.LOPESFILM_PY_DIR || join(homedir(), '.lopesfilm', 'models', 'py');
const UV_BASE = 'https://github.com/astral-sh/uv/releases/latest/download';

/** @param {string} [platform] @param {string} [arch] */
export function uvFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return { file: 'uv-x86_64-pc-windows-msvc.zip', exe: 'uv.exe' };
  if (platform === 'win32' && arch === 'arm64') return { file: 'uv-aarch64-pc-windows-msvc.zip', exe: 'uv.exe' };
  if (platform === 'linux' && arch === 'x64') return { file: 'uv-x86_64-unknown-linux-gnu.tar.gz', exe: 'uv' };
  if (platform === 'linux' && arch === 'arm64') return { file: 'uv-aarch64-unknown-linux-gnu.tar.gz', exe: 'uv' };
  if (platform === 'darwin' && arch === 'arm64') return { file: 'uv-aarch64-apple-darwin.tar.gz', exe: 'uv' };
  if (platform === 'darwin' && arch === 'x64') return { file: 'uv-x86_64-apple-darwin.tar.gz', exe: 'uv' };
  return null;
}

/** Where uv is once fetched (its archive keeps it in a folder of its own on Linux and Mac). */
function uvPath() {
  const rt = uvFor();
  if (!rt) return '';
  const dir = join(pyDir(), 'uv');
  for (const p of [join(dir, rt.exe), ...(existsSync(dir) ? readdirSync(dir).map((d) => join(dir, d, rt.exe)) : [])]) if (existsSync(p)) return p;
  return '';
}

/* one uv fetch at a time: the guide installs earshot and rea-video together, and two fetches of the same archive
   extracted at once broke each other (the first install failed, the second worked) */
/** @type {Promise<string> | null} */
let uvJob = null;
/** uv here, fetched the first time. @param {AbortSignal} signal @param {(l: string) => void} say */
export function ensureUv(signal, say) {
  if (uvPath()) return Promise.resolve(uvPath());
  uvJob ??= fetchUv(signal, say).finally(() => { uvJob = null; });
  return uvJob;
}
/** @param {AbortSignal} signal @param {(l: string) => void} say */
async function fetchUv(signal, say) {
  const have = uvPath();
  if (have) return have;
  const rt = uvFor();
  if (!rt) throw new Error('Python tools run on Windows, Linux and Mac (x64 or arm64).');
  const dir = join(pyDir(), 'uv');
  mkdirSync(dir, { recursive: true });
  say('fetching uv (the Python tool installer, about 20 MB)');
  const sums = join(dir, `${rt.file}.sha256`);
  await fetchTo(`${UV_BASE}/${rt.file}.sha256`, sums, 0, undefined, signal);
  const want = readFileSync(sums, 'utf8').trim().split(/\s+/)[0];
  const archive = join(dir, rt.file);
  await fetchTo(`${UV_BASE}/${rt.file}`, archive, 0, want, signal);
  if (want && (await sha256Of(archive)) !== want) { rmSync(archive, { force: true }); throw new Error('uv did not match the checksum its release publishes'); }
  await exec('tar', ['-xf', archive, '-C', dir], signal);
  rmSync(archive, { force: true });
  const got = uvPath();
  if (!got) throw new Error('uv was fetched but its program is not where it should be');
  if (process.platform !== 'win32') await exec('chmod', ['+x', got]);
  return got;
}

/**
 * @typedef {{ id: string, name: string, license: string, by: string, bytes: number, spec: string[], extraIndex?: string, cli: string, module: string, script?: string, python?: string }} PyTool
 * @type {Record<string, PyTool>}
 */
export const PY_TOOLS = {
  earshot: {
    id: 'earshot', name: 'earshot', license: 'MIT', by: 'Leon Lin', bytes: 1.4 * 2 ** 30,
    /* torch from its CPU wheels: the GPU build is gigabytes more, and earshot runs on the CPU */
    spec: ['earshot @ https://github.com/Leonxlnx/earshot/archive/refs/heads/main.zip', 'mcp>=2'],
    extraIndex: 'https://download.pytorch.org/whl/cpu', cli: 'earshot', module: 'earshot',
  },
  /* Lopes.Film's own voice clean-up (py/voiceclean.py): room echo taken down, then DeepFilterNet 3 (Hendrik Schröter)
     for the noise. torch from its CPU wheels, pinned: the model runs well on any processor */
  voiceclean: {
    id: 'voiceclean', name: 'Limpeza de voz IA (DeepFilterNet)', license: 'MIT / Apache-2.0', by: 'Hendrik Schröter, Lopes', bytes: 900 * 2 ** 20,
    spec: [process.platform === 'darwin' ? 'torch==2.3.1' : 'torch==2.3.1+cpu', process.platform === 'darwin' ? 'torchaudio==2.3.1' : 'torchaudio==2.3.1+cpu',
      'deepfilternet==0.5.6', 'numpy<2', 'scipy<1.14', 'soundfile>=0.12'],
    extraIndex: 'https://download.pytorch.org/whl/cpu', cli: 'voiceclean', module: '',
    script: fileURLToPath(new URL('./py/voiceclean.py', import.meta.url)).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
  },
  /* Lopes.Film's fast transcription (py/whisperfast.py): faster-whisper (SYSTRAN) on CTranslate2, on the graphics card
     (CUDA 12, its cuBLAS and cuDNN from pip) when there is one, else on every core; the Whisper of transformers.js
     runs on one core on Windows */
  whisperfast: {
    id: 'whisperfast', name: 'Transcrição rápida (faster-whisper)', license: 'MIT', by: 'SYSTRAN, Lopes',
    bytes: (process.platform === 'darwin' ? 120 : 1150) * 2 ** 20,
    spec: ['faster-whisper==1.1.1', 'ctranslate2==4.5.0', 'huggingface_hub<1', 'requests>=2.31',
      ...(process.platform === 'darwin' ? [] : ['nvidia-cublas-cu12==12.4.5.8', 'nvidia-cudnn-cu12==9.1.0.70'])],
    cli: 'whisperfast', module: '',
    script: fileURLToPath(new URL('./py/whisperfast.py', import.meta.url)).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
  },
  /* Lopes.Film's face follower (py/facetrack.py): MediaPipe's face detector, whose model comes in the wheel (nothing else
     to download); 0.10.14 is the last with the solutions API, for Python 3.12 */
  facetrack: {
    id: 'facetrack', name: 'Rastreador de rosto (MediaPipe)', license: 'Apache-2.0', by: 'Google, Lopes', bytes: 180 * 2 ** 20,
    spec: ['mediapipe==0.10.14', 'opencv-python-headless<5', 'numpy<2'],
    cli: 'facetrack', module: '', python: '3.12',
    script: fileURLToPath(new URL('./py/facetrack.py', import.meta.url)).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
  },
  reavideo: {
    id: 'reavideo', name: 'rea-video', license: 'Apache-2.0', by: 'JuneYaooo', bytes: 600 * 2 ** 20,
    spec: ['rea-video[ocr] @ https://github.com/JuneYaooo/rea-video/archive/refs/heads/main.zip'],
    /* its f-strings are Python 3.12's */
    cli: 'rea-video', module: 'rea_video', python: '3.12',
  },
};

const toolDir = (/** @type {string} */ id) => join(pyDir(), id);
const venvPython = (/** @type {string} */ id) => join(toolDir(id), 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
/** @param {string} id */
export const pyInstalled = (id) => existsSync(join(toolDir(id), 'ready'));
export const pySupported = () => Boolean(uvFor());

/** The tool's own Python made and the tool installed into it. @param {string} id @param {AbortSignal} signal @param {(l: string) => void} say */
/* the tools install one after the other (they share uv's cache and its Python downloads) */
let installQueue = Promise.resolve();
export function installPyTool(id, signal = new AbortController().signal, say = () => {}) {
  say('waiting for its turn');
  const job = installQueue.then(() => installNow(id, signal, say));
  installQueue = job.catch(() => {});
  return job;
}
/** The bytes this tool's install has put on disk so far (its Python and uv's cache), for the progress shown. @param {string} id */
export function pyInstalledBytes(id) {
  return dirBytes(join(pyDir(), 'cache')) + dirBytes(toolDir(id));
}
/** @param {string} dir */
function dirBytes(dir) {
  let n = 0;
  const walk = (/** @type {string} */ d, depth = 0) => {
    if (depth > 12) return;
    let list; try { list = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) { const p = join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (e.isFile()) { try { n += statSync(p).size; } catch { /* gone */ } } }
  };
  walk(dir);
  return n;
}
/** @param {string} id @param {AbortSignal} signal @param {(l: string) => void} say */
async function installNow(id, signal, say) {
  const tool = PY_TOOLS[id];
  if (!tool) throw new Error(`no Python tool ${id}`);
  if (pyInstalled(id)) return;
  const uv = await ensureUv(signal, say);
  const dir = toolDir(id);
  mkdirSync(dir, { recursive: true });
  const env = { ...process.env, UV_CACHE_DIR: join(pyDir(), 'cache'), UV_PYTHON_INSTALL_DIR: join(pyDir(), 'python') };
  const version = tool.python ?? '3.11';
  say(`making a Python ${version} for ${tool.name}`);
  await run(uv, ['venv', '--python', version, '--clear', join(dir, 'venv')], env, signal);
  say(`installing ${tool.name} (about ${Math.round(tool.bytes / 2 ** 20)} MB, the first time only)`);
  /* LOPESFILM_PY_SOURCE_<ID>: a folder with the tool's source in place of its GitHub archive (offline, tests) */
  const local = process.env[`LOPESFILM_PY_SOURCE_${id.toUpperCase()}`];
  const spec = local && tool.spec[0].includes('@') ? [tool.spec[0].replace(/@ .*$/, `@ file://${local.split('\\').join('/')}`), ...tool.spec.slice(1)] : tool.spec;
  await run(uv, ['pip', 'install', '--python', venvPython(id), ...(tool.extraIndex ? ['--extra-index-url', tool.extraIndex, '--index-strategy', 'unsafe-best-match'] : []), ...spec], env, signal);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, 'ready'), new Date().toISOString());
}

/** @param {string} cmd @param {string[]} args @param {NodeJS.ProcessEnv} env @param {AbortSignal} signal */
function run(cmd, args, env, signal) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { env, windowsHide: true });
    let log = '';
    p.stdout.on('data', (d) => { log = (log + d).slice(-4000); });
    p.stderr.on('data', (d) => { log = (log + d).slice(-4000); });
    const stop = () => p.kill();
    signal.addEventListener('abort', stop, { once: true });
    p.on('error', fail);
    p.on('close', (c) => { signal.removeEventListener('abort', stop); if (signal.aborted) fail(new Error('cancelled')); else if (c === 0) ok(log); else fail(new Error(log.trim().split('\n').slice(-4).join(' | ') || `exit ${c}`)); });
  });
}

/**
 * The tool's command line, run in its own Python: what it printed. Installs it first when it is not there.
 * @param {string} id @param {string[]} args @param {{ signal?: AbortSignal, say?: (l: string) => void, cwd?: string, timeoutMs?: number }} [o]
 */
export async function runPyTool(id, args, o = {}) {
  const tool = PY_TOOLS[id];
  if (!tool) throw new Error(`no Python tool ${id}`);
  const signal = o.signal ?? new AbortController().signal;
  if (!pyInstalled(id)) await installPyTool(id, signal, o.say ?? (() => {}));
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HOME: join(pyDir(), 'hf'), ...(id === 'earshot' ? { EARSHOT_THREADS: '4' } : {}) };
  return new Promise((ok, fail) => {
    /* a tool of Lopes.Film's own is a script it brings; the others, their module */
    const p = spawn(venvPython(id), [...(tool.script ? [tool.script] : ['-m', tool.module]), ...args], { env, windowsHide: true, ...(o.cwd ? { cwd: o.cwd } : {}) });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-6000); });
    const stop = () => p.kill();
    signal.addEventListener('abort', stop, { once: true });
    const timer = o.timeoutMs ? setTimeout(stop, o.timeoutMs) : null;
    p.on('error', fail);
    p.on('close', (c) => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      if (c === 0) ok(out.trim());
      else fail(new Error(`${tool.name}: ${(err.trim().split('\n').slice(-5).join(' | ') || out.trim().split('\n').slice(-3).join(' | ')) || `exit ${c}`}`));
    });
  });
}
