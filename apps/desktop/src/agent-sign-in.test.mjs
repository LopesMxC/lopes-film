import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signInScript, terminalTabOpenScript, consoleWindowLaunch } from './agents.mjs';

test('a tracked Mac login returns its exact terminal tab, and checks do not reopen Terminal', () => {
  const script = signInScript('/bin/qwen', [], { cwd: '/tmp/login', track: true });
  assert.match(script, /set loginTab to do script/);
  assert.match(script, /return tty of loginTab/);
  const check = terminalTabOpenScript('/dev/ttys012');
  assert.match(check, /^if application "Terminal" is not running then return "closed"/);
  assert.match(check, /if tty of terminalTab is "\/dev\/ttys012" then return "open"/);
  assert.doesNotMatch(check, /activate|do script/);
  assert.throws(() => terminalTabOpenScript('"\nactivate'), /Invalid terminal tty/);
});

test('tracking a Windows login waits for its console instead of the short lived launcher', () => {
  const plain = consoleWindowLaunch('Qwen sign-in', '"C:\\Users\\someone\\qwen.cmd"', { comSpec: 'cmd.exe' });
  const tracked = consoleWindowLaunch('Qwen sign-in', '"C:\\Users\\someone\\qwen.cmd"', { comSpec: 'cmd.exe', wait: true });
  assert.doesNotMatch(plain.args[3], /\/wait/);
  assert.match(tracked.args[3], /^"start "Qwen sign-in" \/wait /);
  assert.ok(tracked.args[3].endsWith('cmd.exe /d /k ""C:\\Users\\someone\\qwen.cmd"""'));
});

test('on Windows the tracked launcher exits when its sign-in window closes', { skip: process.platform !== 'win32' }, async () => {
  const { spawn } = await import('node:child_process');
  const { mkdtempSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'of-login-window '));
  const mark = join(dir, 'opened');
  const how = consoleWindowLaunch('probe', `echo opened> "${mark}" & ping -n 2 127.0.0.1 >nul & exit`, { wait: true });
  const child = spawn(how.cmd, how.args, { cwd: dir, detached: true, stdio: 'ignore', ...how.options });
  const exited = new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  for (let i = 0; i < 100 && !existsSync(mark); i++) await new Promise((done) => setTimeout(done, 50));
  assert.ok(existsSync(mark));
  assert.equal(child.exitCode, null, 'the launcher remains alive while its terminal is open');
  assert.equal(await exited, 0);
});

test('Claude Code signs in in PowerShell, its command never read by cmd.exe, with no script file and no policy bypassed', async () => {
  const { signInLine } = await import('./agents.mjs');
  const line = signInLine('C:\\Program Files\\nodejs\\node.exe', ['C:\\app\\acp.js', '--cli', "it's & 100%"], { systemRoot: 'C:\\WINDOWS' });
  assert.equal(line, `C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoLogo -NoProfile -NoExit -Command "& 'C:\\Program Files\\nodejs\\node.exe' 'C:\\app\\acp.js' '--cli' 'it''s & 100%'"`);
  assert.doesNotMatch(line, /Bypass|-File/);
  const how = consoleWindowLaunch('Claude Code sign-in', line, { comSpec: 'cmd.exe', wait: true, keep: false });
  assert.match(how.args[3], /^"start "Claude Code sign-in" \/wait C:\\WINDOWS\\System32\\WindowsPowerShell/);
  assert.doesNotMatch(how.args[3], /\/k/);
});
