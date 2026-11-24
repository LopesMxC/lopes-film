/**
 * As novidades de uma versão, guardadas quando a atualização fica pronta e mostradas na primeira abertura da versão nova
 * (changelog-pending.json, na pasta de dados do app). Escrever e ler não dependem do Electron.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = 'changelog-pending.json';

/** Guarda as notas da versão que vai ser instalada. @param {string} dir @param {string} version @param {string | null} notes */
export function writeChangelog(dir, version, notes) {
  if (!version || !notes) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, FILE), `${JSON.stringify({ version, notes })}\n`);
}

/**
 * As notas guardadas, se são da versão que está rodando agora; as de outra versão (uma atualização que não chegou a
 * ser instalada, ou antiga) não servem e são apagadas se já ficaram para trás.
 * @param {string} dir @param {string} current
 * @returns {{ version: string, notes: string } | null}
 */
export function readChangelog(dir, current) {
  try {
    const saved = JSON.parse(readFileSync(join(dir, FILE), 'utf8'));
    if (saved?.version === current && typeof saved.notes === 'string') return { version: saved.version, notes: saved.notes };
    const older = String(saved?.version ?? '').split('.').map(Number);
    const now = String(current).split('.').map(Number);
    if (older.some((n, i) => n < (now[i] ?? 0)) && older.every((n, i) => n <= (now[i] ?? 0))) clearChangelog(dir);
  } catch { /* nada guardado */ }
  return null;
}

/** @param {string} dir */
export function clearChangelog(dir) { try { rmSync(join(dir, FILE), { force: true }); } catch { /* já não existe */ } }
