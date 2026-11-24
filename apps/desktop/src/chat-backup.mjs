/**
 * A second copy of each project's conversations, in the app's own data folder (Electron's userData: AppData on Windows),
 * which an update of the app never touches. The project's own `.film/chat/` stays the record the chat reads; this copy
 * is where it comes back from if that folder is gone (a project folder moved, restored from a copy, emptied by a
 * clean-up) or the project is opened again under the same path. Only the conversations and finished turns are kept,
 * not the logs, which are large. Reads no Electron module, so `node --test` can use it.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chatDir } from './chat-store.mjs';

const keyOf = (project) => createHash('sha1').update(resolve(project).toLowerCase()).digest('hex').slice(0, 16);
export const backupDir = (dataDir, project) => join(dataDir, 'chat-backup', keyOf(project));

/** the project's id (`.film/id`, Studio's): a copy belongs to the project that wrote it, not to its folder's path */
const idOf = (project) => { try { return readFileSync(join(project, '.film', 'id'), 'utf8').trim() || null; } catch { return null; } };

/** note whose copy this is (a folder reused by a new project, say a new "Untitled", gets a new id) */
function own(dir, project) {
  const id = idOf(project);
  if (!id) return;
  try { if (readFileSync(join(dir, 'owner'), 'utf8').trim() === id) return; } catch { /* none yet */ }
  if (existsSync(join(dir, 'owner'))) {
    /* another project's copy at this path: set aside, never shown in the new one */
    try { renameSync(dir, `${dir}-old-${Date.now()}`); mkdirSync(dir, { recursive: true }); } catch { /* as below */ }
  }
  try { put(join(dir, 'owner'), `${id}\n`); } catch { /* the copy is a spare */ }
}

function put(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/** keep a copy of the conversations' list (what the chat saved, as text) */
export function mirrorSessions(dataDir, project, text) {
  try {
    const dir = backupDir(dataDir, project);
    mkdirSync(dir, { recursive: true });
    own(dir, project);
    put(join(dir, 'sessions.json'), text);
  } catch { /* the project's own record is the one that counts */ }
}

/** keep a copy of a finished turn (its file's name and text) */
export function mirrorTurn(dataDir, project, name, text) {
  try {
    const base = backupDir(dataDir, project);
    mkdirSync(base, { recursive: true });
    own(base, project);
    const dir = join(base, 'turns');
    mkdirSync(dir, { recursive: true });
    put(join(dir, name), text);
  } catch { /* as above */ }
}

/** the project has no conversations kept but a copy has: bring the copy back; → whether it did */
export function restoreChat(dataDir, project) {
  try {
    const from = backupDir(dataDir, project);
    if (!existsSync(join(from, 'sessions.json'))) return false;
    /* only the same project's copy: a new project made where a deleted one was starts with a new chat */
    const id = idOf(project);
    let owner = null;
    try { owner = readFileSync(join(from, 'owner'), 'utf8').trim(); } catch { /* a copy from before owners were kept */ }
    if (!id || owner !== id) return false;
    const to = chatDir(project);
    const hasOwn = existsSync(join(to, 'sessions.json')) || (existsSync(join(to, 'turns')) && readdirSync(join(to, 'turns')).length > 0);
    if (hasOwn) return false;
    mkdirSync(to, { recursive: true });
    cpSync(from, to, { recursive: true, force: false, filter: (f) => f !== join(from, 'owner') });
    return true;
  } catch { return false; }
}
