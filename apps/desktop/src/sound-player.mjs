/**
 * Lopes.Film's own sounds (src/sounds/*.wav): a turn done, an agent asking, a failure, an export finished. Played from a
 * hidden page of the app, since a system notification's own sound is the same for every app (and Windows' has none to
 * choose). `SOUNDS` is what can be played; Settings → Notifications switches them off (`sound`, chat-ipc.mjs preferences).
 */
import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';

export const SOUNDS = ['done', 'export', 'ask', 'failed'];
/** @type {BrowserWindow | null} */
let player = null;
/** @type {Promise<void> | null} */
let ready = null;

/** @param {string} name one of SOUNDS */
export async function playSound(name) {
  if (!SOUNDS.includes(name)) return;
  try {
    if (!player || player.isDestroyed()) {
      player = new BrowserWindow({ show: false, width: 1, height: 1, webPreferences: { sandbox: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false } });
      ready = player.loadFile(fileURLToPath(new URL('./sound-player.html', import.meta.url)));
    }
    await ready;
    await player.webContents.executeJavaScript(`new Audio(${JSON.stringify(new URL(`./sounds/${name}.wav`, import.meta.url).href)}).play().catch(() => {})`);
  } catch { /* no sound this time */ }
}
