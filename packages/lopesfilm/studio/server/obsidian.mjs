/**
 * Each video that is finished goes into the person's Obsidian, beside the rest of what they keep there: a note for the video
 * (`Claude/Videos Lopes.Film/AAAA/MM/` in the vault's folder) and a line for it in the index note that the mind map
 * links from (`00 Videos Lopes.Film.md`). The folder is the one chosen in Settings, else the vault "Aprendizados Claude"
 * (in Mapas de Estudo) where it is found. Nothing here may stop an export: any failure is only said (a problem record).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readPrefs } from './prefs.mjs';

const NOTES = join('Claude', 'Videos Lopes.Film');
const INDEX = '00 Videos Lopes.Film';

/** The vault's folder: the one chosen, else where Mapas de Estudo/Aprendizados Claude is found; null: none. */
export function vaultFolder(chosen = readPrefs().obsidianFolder, home = homedir()) {
  if (chosen) return existsSync(chosen) ? chosen : null;
  const from = [join(home, 'OneDrive', 'Documentos'), join(home, 'OneDrive', 'Documents'), join(home, 'Documentos'), join(home, 'Documents')];
  for (const base of from) {
    for (const name of ['Aprendizados Claude', 'Claude Cerebro']) {
      const dir = join(base, 'Mapas de Estudo', name);
      if (existsSync(dir)) return dir;
    }
  }
  return null;
}

const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
const clean = (/** @type {string} */ s) => s.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Video';
const quoted = (/** @type {string} */ s) => JSON.stringify(s);
const sizeOf = (/** @type {number} */ bytes) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`);
const clock = (/** @type {number} */ ms) => { const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)} h ${two(Math.floor((s % 3600) / 60))} min` : s >= 60 ? `${Math.floor(s / 60)} min ${two(s % 60)} s` : `${s} s`; };

/**
 * The note for a finished video export; returns its path, or null (not a video, no vault, or not turned off by choice).
 * @param {{ name: string, label?: string, outputs: string[], out?: string, bytes: number | null, encoder: string | null,
 *   startedAt: number | null, finishedAt: number | null, ask: { kind: string, codec?: string, shortEdge?: number, fps?: number } }} job
 * @param {{ root: string, prefs?: { obsidianOn?: boolean, obsidianFolder?: string | null }, now?: Date, home?: string }} where
 */
export async function saveVideoNote(job, { root, prefs = readPrefs(), now = new Date(), home = homedir() }) {
  if (job.ask.kind !== 'video' || prefs.obsidianOn === false) return null;
  const vault = vaultFolder(prefs.obsidianFolder ?? null, home);
  if (!vault) return null;
  const file = job.out ?? job.outputs[0] ?? '';
  const title = clean(job.name || basename(root));
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const at = `${two(now.getHours())}h${two(now.getMinutes())}`;
  const folder = join(vault, NOTES, String(now.getFullYear()), two(now.getMonth() + 1));
  await mkdir(folder, { recursive: true });
  let stem = `${day} ${at} ${title}`;
  for (let n = 2; existsSync(join(folder, `${stem}.md`)); n += 1) stem = `${day} ${at} ${title} ${n}`;
  const facts = [
    `- Data: ${day} ${two(now.getHours())}:${two(now.getMinutes())}`,
    `- Projeto: ${basename(root)}`,
    file ? `- Arquivo: ${file}` : null,
    job.bytes ? `- Tamanho: ${sizeOf(job.bytes)}` : null,
    job.ask.codec ? `- Formato: ${job.ask.codec}${job.ask.shortEdge ? ` ${job.ask.shortEdge}p` : ''}${job.ask.fps ? ` ${job.ask.fps} fps` : ''}` : null,
    job.encoder ? `- Codificador: ${job.encoder}` : null,
    job.startedAt && job.finishedAt ? `- Tempo para exportar: ${clock(job.finishedAt - job.startedAt)}` : null,
  ].filter(Boolean).join('\n');
  const text = `---\ntipo: video-lopesfilm\ntitulo: ${quoted(title)}\ndata: ${day}\nprojeto: ${quoted(basename(root))}\ntags: [lopesfilm, video]\n---\n\n# ${title}\n\n${facts}\n\nVoltar: [[${INDEX}]]\n`;
  await writeFile(join(folder, `${stem}.md`), text, 'utf8');
  /* the index the mind map links from: one line for each video, the newest last */
  const index = join(vault, NOTES, `${INDEX}.md`);
  if (!existsSync(index)) await writeFile(index, `---\ntipo: indice-videos-lopesfilm\ntags: [lopesfilm, video]\n---\n\n# Videos Lopes.Film\n\nCada video finalizado no Lopes.Film.\n\n`, 'utf8');
  await appendFile(index, `- ${day} [[${stem}]]\n`, 'utf8');
  return join(folder, `${stem}.md`);
}

/** Whether the vault was found (for Settings to say). */
export const vaultFound = () => { try { const v = vaultFolder(); return Boolean(v && statSync(v).isDirectory()); } catch { return false; } };
