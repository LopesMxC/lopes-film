// @ts-check
/**
 * Optional free packs for editing — sound effects, particle sprites for effects, fonts — fetched on request from the
 * places that publish them (packs-manifest.json: each file at a pinned commit, with its size and sha256, so a changed
 * or damaged file is refused). Only CC0 and SIL OFL material is listed. They land in `<home>/packs/<id>/` with their
 * licence files; the fonts are also put in the person's own font folder, where the font menu already looks.
 * Rebuilt by scripts/packs-manifest.mjs.
 */
import { resetInstalledFonts } from './fonts.mjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { sharedHome } from '../../src/locations.mjs';
import { fetchTo, exec } from './providers/localimage.mjs';

/** @typedef {{ url: string, to: string, bytes: number, sha256: string, unzip?: boolean, page?: string }} PackFile  `unzip`: a .zip that is unpacked into the folder named like it (`kit.zip` -> `kit/`) and then removed; `page`: where it is published. */
/** @typedef {{ id: string, kind: string, name: string, license: string, by: string, source: string, bytes: number, files: PackFile[] }} Pack */

/** @type {{ packs: Pack[] }} */
const MANIFEST = JSON.parse(readFileSync(new URL('./packs-manifest.json', import.meta.url), 'utf8'));
export const PACKS = MANIFEST.packs;
export const packById = (/** @type {string} */ id) => PACKS.find((p) => p.id === id);

export const packDir = (/** @type {string} */ id) => process.env.LOPESFILM_PACKS_DIR ? join(process.env.LOPESFILM_PACKS_DIR, id) : join(sharedHome(), 'packs', id);

/** The folder a person's own fonts live in, which fonts.mjs reads too. */
export const userFontDir = () => process.env.LOPESFILM_FONT_DIR
  || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Fonts') : join(homedir(), '.local', 'share', 'fonts'));

/** A file's place inside the pack's folder, never outside it. */
function safeTarget(/** @type {string} */ dir, /** @type {string} */ rel) {
  const to = resolve(dir, ...rel.split('/'));
  if (to !== dir && !to.startsWith(dir + sep)) throw new Error(`Unsafe pack path: ${rel}`);
  return to;
}

const size = (/** @type {string} */ f) => { for (const p of [f, `${f}.part`]) { try { return statSync(p).size; } catch { /* not there */ } } return 0; };

/** An archive's unpacked folder (`kit.zip` -> `kit`), and the mark that says it was unpacked whole. */
const unpackedAt = (/** @type {string} */ dir, /** @type {PackFile} */ f) => safeTarget(dir, f.to.replace(/\.zip$/i, ''));
const fileDone = (/** @type {string} */ dir, /** @type {PackFile} */ f) => {
  try { return f.unzip ? statSync(join(unpackedAt(dir, f), '.unpacked')).isFile() : statSync(safeTarget(dir, f.to)).size === f.bytes; } catch { return false; }
};

/** Is every file of the pack here, whole? */
export function packInstalled(/** @type {string} */ id) {
  const pack = packById(id);
  if (!pack) return false;
  const dir = packDir(id);
  return pack.files.every((f) => fileDone(dir, f)) && (id !== 'fonts' || fontsPut(pack));
}

/** How much of the pack is here (finished files, and the part of the one in hand). */
export const packHave = (/** @type {string} */ id) => {
  const pack = packById(id);
  return pack ? pack.files.reduce((n, f) => n + (fileDone(packDir(id), f) ? f.bytes : Math.min(f.bytes, size(safeTarget(packDir(id), f.to)))), 0) : 0;
};

/** Windows keeps a per-user font in its registry: the file alone is not "installed" for other programs. */
async function registerWindowsFont(/** @type {string} */ file) {
  const name = `${basename(file).replace(/\.ttf$/i, '').replace(/-/g, ' ')} (TrueType)`;
  await exec('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', name, '/t', 'REG_SZ', '/d', file, '/f']).catch(() => {});
}

/** Unpack a fetched .zip into its folder: tar (Windows 10+, macOS) reads zips; unzip is the fallback where tar does not. */
async function unpack(/** @type {string} */ zip, /** @type {string} */ into) {
  mkdirSync(into, { recursive: true });
  try { await exec('tar', ['-xf', zip, '-C', into]); } catch { await exec('unzip', ['-o', '-q', zip, '-d', into]); }
}

/** Tell the running programs a font arrived (Windows: WM_FONTCHANGE to every window), so they list it without a restart. */
async function announceFonts() {
  if (process.platform !== 'win32') return;
  const code = "Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,IntPtr l,uint f,uint t,out IntPtr r);'; $r=[IntPtr]::Zero; [W.U]::SendMessageTimeout([IntPtr]0xffff,0x1D,[IntPtr]::Zero,[IntPtr]::Zero,2,1000,[ref]$r) | Out-Null";
  await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', code]).catch(() => {});
}

/** The pack's fonts into the person's own font folder (Windows: registered too), and the font list read again. */
async function putFonts(/** @type {{ files: PackFile[] }} */ pack, /** @type {string} */ dir) {
  const fontDir = userFontDir();
  mkdirSync(fontDir, { recursive: true });
  for (const f of pack.files.filter((x) => /\.(ttf|otf)$/i.test(x.to))) {
    const target = join(fontDir, basename(f.to));
    if (!existsSync(target)) copyFileSync(safeTarget(dir, f.to), target);
    if (process.platform === 'win32') await registerWindowsFont(target);
  }
  resetInstalledFonts();
  await announceFonts();
}

/** Is every font of the pack in the person's font folder? */
const fontsPut = (/** @type {{ files: PackFile[] }} */ pack) => pack.files.filter((x) => /\.(ttf|otf)$/i.test(x.to)).every((f) => existsSync(join(userFontDir(), basename(f.to))));

/** Fetch a pack (a few files at a time), then put its fonts where the font menu finds them.
 * @param {string} id @param {AbortSignal} signal @param {(line: string) => void} say */
export async function installPack(id, signal, say) {
  const pack = packById(id);
  if (!pack) throw new Error('No such pack.');
  const dir = packDir(id);
  const todo = pack.files.filter((f) => !fileDone(dir, f));
  let done = pack.files.length - todo.length;
  const next = [...todo];
  const worker = async () => {
    for (let f = next.shift(); f; f = next.shift()) {
      if (signal.aborted) throw new Error('cancelled');
      if (!/^https:\/\/(raw\.githubusercontent\.com\/|opengameart\.org\/sites\/default\/files\/)/.test(f.url)) throw new Error('Unexpected pack address.');
      await fetchTo(f.url, safeTarget(dir, f.to), f.bytes, f.sha256, signal);
      if (f.unzip) {
        const into = unpackedAt(dir, f);
        rmSync(into, { recursive: true, force: true });
        await unpack(safeTarget(dir, f.to), into);
        writeFileSync(join(into, '.unpacked'), 'ok\n');
        rmSync(safeTarget(dir, f.to), { force: true });
      }
      say(`${++done}/${pack.files.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (id === 'fonts') await putFonts(pack, dir);
  const pages = pack.files.filter((f) => f.page).map((f) => `  ${f.to.replace(/\.zip$/i, '')}: ${f.page}`);
  writeFileSync(join(dir, 'CREDITS.txt'), `${pack.name}\nBy ${pack.by}\nLicense: ${pack.license}\nSource: ${pack.source}\n${pages.length ? `\nEach folder, and the page it comes from:\n${pages.join('\n')}\n` : ''}`);
}
