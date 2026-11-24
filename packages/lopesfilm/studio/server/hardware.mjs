// @ts-check
/**
 * O hardware deste computador, lido uma vez: memória, processador e placa de vídeo (nome e memória de vídeo).
 * Serve para o Lopes.Film saber o que roda com folga: os modelos pesados de IA só são oferecidos (e baixados) se o
 * computador der conta. A leitura é rápida (no máximo uns segundos, em segundo plano) e nunca falha: o que não se
 * consegue ler fica de fora, e sem dado nenhum o Lopes.Film não bloqueia nada.
 *
 *   GET /api/hardware → { ramGb, cpu, cores, gpus: [{ name, vramGb }], vramGb, tier }
 */
import { execFile } from 'node:child_process';
import { cpus, totalmem } from 'node:os';

const GB = 2 ** 30;

/** O que cada modelo pesado pede, para rodar com folga: memória de vídeo (GB) e memória do computador (GB). */
export const NEEDS = {
  image: { vramGb: 6, ramGb: 12 },
  video: { vramGb: 8, ramGb: 16 },
  upscale: { vramGb: 2, ramGb: 8 },
  tts: { vramGb: 0, ramGb: 8 },
  voiceclone: { vramGb: 4, ramGb: 12 },
  music: { vramGb: 8, ramGb: 16 },
  faceswap: { vramGb: 3, ramGb: 8 },
  faceenhance: { vramGb: 4, ramGb: 12 },
  interpolate: { vramGb: 2, ramGb: 8 },
  /* transcription runs on the processor: the big one is slow and heavy on a computer with 8 GB; the small one is enough */
  'whisper-large-v3-turbo': { vramGb: 0, ramGb: 12 },
};

/** @typedef {{ name: string, vramGb: number | null }} Gpu */
/** @typedef {{ ramGb: number, cpu: string, cores: number, gpus: Gpu[], vramGb: number | null, tier: 'light' | 'balanced' | 'strong', read: boolean }} Hardware */

/** @param {string} file @param {string[]} args @param {number} [ms] @returns {Promise<string>} */
const run = (file, args, ms = 6000) => new Promise((resolve) => {
  try { execFile(file, args, { timeout: ms, windowsHide: true, maxBuffer: 1 << 20 }, (err, out) => resolve(err ? '' : String(out))); } catch { resolve(''); }
});

/** NVIDIA: nome e memória total pelo nvidia-smi (existe onde o driver está). */
async function nvidia() {
  const out = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  return /** @type {Gpu[]} */ (out.split(/\r?\n/).flatMap((line) => {
    const [name, mb] = line.split(',').map((s) => s.trim());
    return name && Number(mb) > 0 ? [{ name, vramGb: Math.round((Number(mb) / 1024) * 10) / 10 }] : [];
  }));
}

/** Windows: todas as placas (o AdapterRAM do Windows para em 4 GB, então a memória certa vem do registro, quando há). */
async function windows() {
  const script = [
    "$k = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' -ErrorAction SilentlyContinue",
    "$k | Where-Object { $_.DriverDesc } | ForEach-Object { $_.DriverDesc + '|' + $_.'HardwareInformation.qwMemorySize' + '|' + $_.'HardwareInformation.MemorySize' }",
  ].join('; ');
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 8000);
  return /** @type {Gpu[]} */ (out.split(/\r?\n/).flatMap((line) => {
    const [name, q, m] = line.trim().split('|');
    if (!name) return [];
    const bytes = Number(q) || Number(m) || 0;
    return [{ name, vramGb: bytes > 0 ? Math.round((bytes / GB) * 10) / 10 : null }];
  }));
}

/** Linux/Mac sem NVIDIA: só os nomes (lspci), sem memória de vídeo. */
async function others() {
  if (process.platform === 'darwin') {
    const out = await run('system_profiler', ['SPDisplaysDataType']);
    const name = /Chipset Model:\s*(.+)/.exec(out)?.[1]?.trim();
    return name ? [{ name, vramGb: null }] : [];
  }
  const out = await run('lspci', []);
  return /** @type {Gpu[]} */ (out.split('\n').filter((l) => /VGA|3D controller/i.test(l)).map((l) => ({ name: l.replace(/^.*?:\s*/, '').replace(/^.*controller:\s*/i, '').trim(), vramGb: null })));
}

/** @param {number} ramGb @param {number | null} vramGb @returns {'light' | 'balanced' | 'strong'} */
export function tierOf(ramGb, vramGb) {
  if (ramGb >= 24 && (vramGb ?? 0) >= 12) return 'strong';
  if (ramGb >= 12 && (vramGb ?? 0) >= 6) return 'balanced';
  return 'light';
}

/** @type {Hardware | null} */
let known = null;
/** @type {Promise<Hardware> | null} */
let reading = null;

/** A leitura (feita uma vez; depois, a guardada). */
export function readHardware() {
  if (known) return Promise.resolve(known);
  reading ??= (async () => {
    const ramGb = Math.round((totalmem() / GB) * 10) / 10;
    const c = cpus();
    let gpus = await nvidia();
    if (!gpus.length) gpus = process.platform === 'win32' ? await windows() : await others();
    /* o integrado divide a memória do computador: só conta de placa de vídeo quem trouxe a memória dela */
    const vramGb = gpus.reduce((best, g) => Math.max(best, g.vramGb ?? 0), 0) || null;
    known = { ramGb, cpu: c[0]?.model?.replace(/\s+/g, ' ').trim() ?? '', cores: c.length, gpus, vramGb, tier: tierOf(ramGb, vramGb), read: true };
    return known;
  })();
  return reading;
}

/** A leitura já feita, ou null enquanto não terminou (o servidor a pede ao abrir). */
export const hardwareNow = () => known;

/**
 * Se o computador dá conta do que um modelo pede: null quando sim (ou quando não se sabe), senão o motivo, em português.
 * Memória de vídeo desconhecida (não deu para ler) não bloqueia: só o que se sabe que falta.
 * @param {string} id @param {Hardware | null} [hw]
 */
export function whyNot(id, hw = known) {
  const need = /** @type {Record<string, { vramGb: number, ramGb: number }>} */ (NEEDS)[id];
  if (!need || !hw) return null;
  if (hw.ramGb < need.ramGb) return `Seu computador tem ${hw.ramGb} GB de memória e este modelo pede ${need.ramGb} GB.`;
  if (hw.vramGb != null && hw.vramGb < need.vramGb) return `Sua placa de vídeo tem ${hw.vramGb} GB e este modelo pede ${need.vramGb} GB.`;
  if (hw.vramGb == null && hw.gpus.length === 0 && need.vramGb >= 6) return `Não achei uma placa de vídeo dedicada; este modelo pede ${need.vramGb} GB de memória de vídeo.`;
  return null;
}

/** Só para os testes. */
export function _setHardware(/** @type {Hardware | null} */ hw) { known = hw; reading = hw ? Promise.resolve(hw) : null; }

/**
 * How stable-diffusion.cpp spreads a model between the video card's memory and the computer's. `--offload-to-cpu` keeps the
 * weights in the computer's memory and brings them to the card layer by layer: it fills RAM and leaves VRAM idle, which
 * is only right for a card that cannot hold the model. A card that can holds it; one in between keeps the model on the
 * card and only the text encoder (the part that is not run for long) in RAM.
 * @param {{ vramGb: number } | undefined} need what the model asks of a card @param {Hardware | null} [hw]
 * @returns {string[]}
 */
export function offloadArgs(need, hw = known) {
  const vram = hw?.vramGb ?? null;
  if (!need || vram === null) return ['--offload-to-cpu'];
  if (vram >= need.vramGb + 2) return [];
  if (vram >= need.vramGb - 2) return ['--clip-on-cpu', '--vae-tiling'];
  return ['--offload-to-cpu'];
}
