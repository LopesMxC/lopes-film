import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.LOPESFILM_HOME = mkdtempSync(join(tmpdir(), 'research-browser-'));
const { browse, browserCommand } = await import('./research-browser.mjs');
const { writePrefs } = await import('./prefs.mjs');

test('the address goes to the default browser without a shell', () => {
  assert.deepEqual(browserCommand('https://a.dev/?x=1&y=2', 'win32'), ['rundll32', 'url.dll,FileProtocolHandler', 'https://a.dev/?x=1&y=2']);
  assert.deepEqual(browserCommand('https://a.dev', 'darwin'), ['open', 'https://a.dev']);
  assert.deepEqual(browserCommand('https://a.dev', 'linux'), ['xdg-open', 'https://a.dev']);
});

test('it opens pages only once the person linked their browser, and only web addresses', () => {
  const seen = [];
  assert.throws(() => browse('https://example.com', (c, a) => seen.push([c, a])), /not linked/);
  writePrefs({ researchBrowser: true });
  assert.deepEqual(browse('https://example.com/a b', (c, a) => seen.push([c, a])), { opened: 'https://example.com/a%20b' });
  assert.equal(seen.length, 1);
  assert.throws(() => browse('file:///etc/passwd', () => {}), /web address/);
  assert.throws(() => browse('nope', () => {}), /not a web address/);
});
