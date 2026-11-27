import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createKeeper, readSignIn } from './claude-keeper.mjs';

const signIn = (token) => JSON.stringify({ claudeAiOauth: { accessToken: 'a'.repeat(20), refreshToken: token, expiresAt: 1 } });
const setup = () => {
  const base = mkdtempSync(join(tmpdir(), 'of-keeper-'));
  const home = join(base, 'home'); mkdirSync(home);
  const account = join(base, 'accounts', 'c1'); mkdirSync(account, { recursive: true });
  return { base, home, account, keeper: createKeeper({ keepDir: join(base, 'keep'), env: {}, home }) };
};

test('a sign-in is read only when whole', () => {
  const { base } = setup();
  const f = join(base, 'c.json');
  writeFileSync(f, signIn('r'.repeat(30)));
  assert.ok(readSignIn(f));
  writeFileSync(f, '{"claudeAiOauth":{"accessToken":"x"}}');
  assert.equal(readSignIn(f), null);
  writeFileSync(f, '{ broken');
  assert.equal(readSignIn(f), null);
  assert.equal(readSignIn(join(base, 'none')), null);
});

test('a copy is made of a whole sign-in, and put back when the live one is gone or broken', () => {
  const { account, keeper } = setup();
  const live = join(account, '.credentials.json');
  assert.equal(keeper.snapshot(account, 'c1'), 'none');
  writeFileSync(live, signIn('one'.repeat(10)));
  writeFileSync(join(account, '.claude.json'), '{"oauthAccount":{"emailAddress":"a@b.c"}}');
  assert.equal(keeper.snapshot(account, 'c1'), 'saved');
  assert.equal(keeper.snapshot(account, 'c1'), 'same');
  /* whole one: never overwritten */
  assert.equal(keeper.restore(account, 'c1'), false);
  rmSync(live); rmSync(join(account, '.claude.json'));
  assert.equal(keeper.signedIn(account), false);
  assert.equal(keeper.restore(account, 'c1'), true);
  assert.equal(keeper.signedIn(account), true);
  assert.match(readFileSync(join(account, '.claude.json'), 'utf8'), /a@b\.c/);
  writeFileSync(live, '');
  assert.equal(keeper.restore(account, 'c1'), true);
  assert.equal(JSON.parse(readFileSync(live, 'utf8')).claudeAiOauth.refreshToken, 'one'.repeat(10));
});

test('the last two are kept, a renewed token replaces the copy, and a broken live file never does', () => {
  const { account, keeper } = setup();
  const live = join(account, '.credentials.json');
  writeFileSync(live, signIn('first'.repeat(5)));
  keeper.snapshot(account, 'c1');
  writeFileSync(live, signIn('second'.repeat(5)));
  assert.equal(keeper.snapshot(account, 'c1'), 'saved');
  writeFileSync(live, '{ half');
  assert.equal(keeper.snapshot(account, 'c1'), 'none');
  assert.equal(keeper.restore(account, 'c1'), true);
  assert.equal(JSON.parse(readFileSync(live, 'utf8')).claudeAiOauth.refreshToken, 'second'.repeat(5));
});

test("the computer's own sign-in is in ~/.claude, its state in ~/.claude.json", () => {
  const { home, keeper } = setup();
  mkdirSync(join(home, '.claude'));
  writeFileSync(join(home, '.claude', '.credentials.json'), signIn('own'.repeat(10)));
  writeFileSync(join(home, '.claude.json'), '{"oauthAccount":{}}');
  assert.equal(keeper.snapshot(null, 'own'), 'saved');
  rmSync(join(home, '.claude', '.credentials.json')); rmSync(join(home, '.claude.json'));
  assert.equal(keeper.restore(null, 'own'), true);
  assert.ok(existsSync(join(home, '.claude.json')));
});

test('a copy goes only when forgotten', () => {
  const { account, keeper } = setup();
  writeFileSync(join(account, '.credentials.json'), signIn('x'.repeat(12)));
  keeper.snapshot(account, 'c1');
  rmSync(join(account, '.credentials.json'));
  keeper.forget('c1');
  assert.equal(keeper.restore(account, 'c1'), false);
});
