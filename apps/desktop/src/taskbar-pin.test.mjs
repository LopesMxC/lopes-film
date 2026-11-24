import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keepTaskbarPin, pinnedDir } from './taskbar-pin.mjs';

test('a pin the update took is put back, one the person removed is not', () => {
  const root = mkdtempSync(join(tmpdir(), 'pin-'));
  const appData = join(root, 'a'), data = join(root, 'd');
  const dir = pinnedDir(appData);
  mkdirSync(dir, { recursive: true });
  const lnk = join(dir, 'Lopes.Film.lnk');
  try {
    assert.equal(keepTaskbarPin({ appData, data, version: '1', product: 'Lopes.Film' }), 'none', 'not pinned: nothing');
    writeFileSync(lnk, 'pin');
    assert.equal(keepTaskbarPin({ appData, data, version: '1', product: 'Lopes.Film' }), 'kept');
    unlinkSync(lnk); /* the update removed it */
    assert.equal(keepTaskbarPin({ appData, data, version: '1', product: 'Lopes.Film' }), 'none', 'same version: the person unpinned it');
    assert.equal(existsSync(lnk), false);
    assert.equal(keepTaskbarPin({ appData, data, version: '2', product: 'Lopes.Film' }), 'none', 'the copy went with the unpinning: nothing to put back');
    writeFileSync(lnk, 'pin'); keepTaskbarPin({ appData, data, version: '2', product: 'Lopes.Film' }); unlinkSync(lnk);
    assert.equal(keepTaskbarPin({ appData, data, version: '3', product: 'Lopes.Film' }), 'restored', 'a new version without its pin');
    assert.equal(existsSync(lnk), true);
    assert.equal(keepTaskbarPin({ appData, data, version: '3', product: 'Lopes.Film' }), 'kept');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
