import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WINDOW_BUTTONS_H, previewTop } from '../chat/src/lib/preview-top.ts';

test('on Windows the lightbox starts below the window\'s buttons; elsewhere where it did', () => {
  assert.equal(previewTop('Win32'), `${WINDOW_BUTTONS_H + 8}px`);
  assert.equal(previewTop('MacIntel'), 'max(1rem, var(--inset-titlebar-h, 0px))');
  assert.equal(previewTop('Linux x86_64'), 'max(1rem, var(--inset-titlebar-h, 0px))');
});

test('the buttons are as tall as the app draws them (studio ui WindowControls, h-8 = 32 px)', () => {
  const file = readFileSync(new URL('../../../packages/lopesfilm/studio/ui/src/components/WindowControls.tsx', import.meta.url), 'utf8');
  assert.ok(/fixed right-0 top-0[^"]*\bh-8\b/.test(file), 'WindowControls is 32 px tall');
  assert.equal(WINDOW_BUTTONS_H, 32);
});
