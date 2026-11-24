// @ts-check
/**
 * The app pinned to the Windows taskbar stays pinned through an update. An update runs the installer, which removes the old
 * version (and with it, on some computers, the pinned shortcut Windows keeps in "User Pinned\TaskBar"); the pin is gone
 * afterwards. So each launch keeps a copy of that shortcut, and the first launch of a new version puts it back if the
 * update took it. A pin the person removes themselves is left alone: a copy is only put back when the version changed.
 * (build/installer.nsh does the same from the installer's side.) Reads no Electron module, so `node --test` can use it.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where Windows keeps the shortcuts of the apps pinned to the taskbar. @param {string} appData */
export const pinnedDir = (appData) => join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');

/** @param {string} dir @param {string} product */
const shortcutsOf = (dir, product) => {
  try { return readdirSync(dir).filter((f) => /\.lnk$/i.test(f) && f.toLowerCase().startsWith(product.toLowerCase())); } catch { return []; }
};

/**
 * @param {{ appData: string, data: string, version: string, product: string }} where
 * @returns {'kept' | 'restored' | 'none'} 'kept': pinned, a copy taken; 'restored': the update had taken the pin, put back
 */
export function keepTaskbarPin({ appData, data, version, product }) {
  const pins = pinnedDir(appData);
  const store = join(data, 'taskbar-pin');
  const stateFile = join(store, 'state.json');
  /** @type {{ version?: string }} */
  let state = {};
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* the first launch */ }
  const here = shortcutsOf(pins, product);
  mkdirSync(store, { recursive: true });
  let result = /** @type {'kept' | 'restored' | 'none'} */ ('none');
  if (here.length) {
    for (const f of here) copyFileSync(join(pins, f), join(store, f));
    result = 'kept';
  } else if (state.version === version) {
    /* gone with no update in between: the person removed it, so the copy goes too */
    for (const f of shortcutsOf(store, product)) { try { unlinkSync(join(store, f)); } catch { /* already gone */ } }
  } else if (state.version) {
    const copies = shortcutsOf(store, product);
    if (copies.length) {
      mkdirSync(pins, { recursive: true });
      for (const f of copies) if (!existsSync(join(pins, f))) copyFileSync(join(store, f), join(pins, f));
      result = 'restored';
    }
  }
  writeFileSync(stateFile, JSON.stringify({ version }));
  return result;
}
