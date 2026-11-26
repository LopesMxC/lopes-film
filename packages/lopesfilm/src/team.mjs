// @ts-check
/**
 * `lopesfilm team`: the work of one request shared between several Claude Code accounts, at the same time. The plan, who
 * took each task, the notes and the results are kept in one file of the project, `.lopesfilm/team.md`: that file is
 * the team's memory, not any agent's. An agent that splits a request into parts that do not depend on each other gives
 * each part to `team run` (all together, as parallel commands); `team run` takes the account with the most room left, holds
 * the files the part says it will edit (another part that needs one waits), runs a Claude Code on that account in the
 * project's folder, writes what it did in the board, and prints it.
 *
 *   lopesfilm team run --task "<what to do>" [--title <short>] [--files a,b]   one part, on the account with most room
 *   lopesfilm team status                                                      the board
 *
 * The accounts come from LOPESFILM_TEAM (a JSON list of `{ name, configDir, path }`, set by the app when the use is
 * shared). Without it there is no team: the command says so and the agent does the work itself.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeUsage, fullness } from './claude-usage.mjs';

export const TEAM_HELP = `lopesfilm team run --task "<what to do>" [--title <short>] [--files <a,b>]
  One part of a request, done by another Claude Code account while this one does the others: give each part that does not
  depend on another its own \`team run\`, all at once (parallel commands), then read what they print.
  --files  the project's files this part will edit (film.html, an asset…): a part that needs one of them waits for the one holding it
lopesfilm team status
  The board, .lopesfilm/team.md: the request, each part, who took it, how it went`;

const STALE_MS = 45 * 60_000;
const board = (/** @type {string} */ cwd) => join(cwd, '.lopesfilm', 'team.md');
const dirOf = (/** @type {string} */ cwd) => join(cwd, '.lopesfilm');
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {{ id: string, title: string, status: 'running' | 'done' | 'failed' | 'waiting', owner: string, files: string[], note: string }} Task
 */

/** The board file's tasks: one line each, `- [x] T1 | title | owner | files | note`. @param {string} md @returns {Task[]} */
export function parseBoard(md) {
  /** @type {Task[]} */
  const tasks = [];
  for (const line of md.split(/\r?\n/)) {
    const m = /^- \[( |x|!|~)\] (T\d+) \| (.*?) \| (.*?) \| (.*?) \| (.*)$/.exec(line);
    if (!m) continue;
    tasks.push({ id: m[2], title: m[3], owner: m[4], files: m[5] ? m[5].split(',').map((f) => f.trim()).filter(Boolean) : [], note: m[6], status: m[1] === 'x' ? 'done' : m[1] === '!' ? 'failed' : m[1] === '~' ? 'waiting' : 'running' });
  }
  return tasks;
}

/** @param {string} request @param {Task[]} tasks */
export function renderBoard(request, tasks) {
  const mark = { done: 'x', failed: '!', waiting: '~', running: ' ' };
  const one = (/** @type {string} */ s) => s.replace(/\s*\r?\n\s*/g, ' ').replace(/\|/g, '/').trim();
  return `# Team board\n\n## Request\n\n${request.trim() || '(the request of the first part)'}\n\n## Parts\n\n_[ ] running, [~] waiting for a file, [x] done, [!] failed_\n\n${tasks
    .map((t) => `- [${mark[t.status]}] ${t.id} | ${one(t.title)} | ${one(t.owner)} | ${t.files.map(one).join(',')} | ${one(t.note)}`).join('\n')}\n`;
}

/** Whether two lists of files touch the same thing: the same path, or one inside the other. @param {string[]} a @param {string[]} b */
export function overlaps(a, b) {
  const norm = (/** @type {string} */ f) => f.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
  return a.some((x) => b.some((y) => { const p = norm(x); const q = norm(y); return p === q || p.startsWith(`${q}/`) || q.startsWith(`${p}/`); }));
}

/** The accounts of the team, from the app. @param {string | undefined} raw @returns {{ name: string, configDir: string | null, path: string | null }[]} */
export function teamAccounts(raw) {
  try {
    const list = JSON.parse(raw ?? '[]');
    return (Array.isArray(list) ? list : []).flatMap((a) => (a && typeof a === 'object'
      ? [{ name: String(a.name ?? 'Claude'), configDir: typeof a.configDir === 'string' && a.configDir ? a.configDir : null, path: typeof a.path === 'string' && a.path ? a.path : null }] : []));
  } catch { return []; }
}

/**
 * The account for the next part: the one with the most room left (its plan's fuller window), counting a part already running
 * on it as 15 points more used, so parts spread. An account that cannot say is half full.
 * @param {{ name: string }[]} accounts @param {(a: any) => Promise<number | null>} fullOf @param {Task[]} running
 */
export async function pickAccount(accounts, fullOf, running) {
  const scored = await Promise.all(accounts.map(async (a) => ({ a, score: (await fullOf(a) ?? 50) + 15 * running.filter((t) => t.owner === a.name).length })));
  return scored.reduce((best, s) => (s.score < best.score ? s : best)).a;
}

/** Runs `fn` with the board's file held by this process alone (parts write it at the same time). @template T @param {string} cwd @param {() => T | Promise<T>} fn */
async function exclusive(cwd, fn) {
  mkdirSync(dirOf(cwd), { recursive: true });
  const lock = join(dirOf(cwd), 'team.lock');
  for (let i = 0; ; i++) {
    try { mkdirSync(lock); break; } catch {
      if (i > 200) { rmSync(lock, { recursive: true, force: true }); } else await sleep(50);
    }
  }
  try { return await fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

const requestOf = (/** @type {string} */ md) => /## Request\s+([\s\S]*?)\n\n## Parts/.exec(md)?.[1]?.trim() ?? '';
const read = (/** @type {string} */ cwd) => { try { return readFileSync(board(cwd), 'utf8'); } catch { return ''; } };
const save = (/** @type {string} */ cwd, /** @type {string} */ request, /** @type {Task[]} */ tasks) => writeFileSync(board(cwd), renderBoard(request, tasks));

/**
 * Takes the next number and registers the part, waiting while a part that holds one of its files is running.
 * @returns {Promise<Task>}
 */
async function register(/** @type {string} */ cwd, /** @type {{ title: string, owner: string, files: string[], task: string }} */ p, /** @type {(l: string) => void} */ log) {
  let waited = false;
  for (;;) {
    const got = await exclusive(cwd, () => {
      const md = read(cwd);
      const tasks = parseBoard(md);
      const now = Date.now();
      /* a part still "running" for longer than STALE_MS was left by a command that died: it holds nothing */
      const holding = tasks.filter((t) => t.status === 'running' && overlaps(t.files, p.files) && now - (Number(/(\d{13})$/.exec(t.note)?.[1]) || now) < STALE_MS);
      if (holding.length) return { wait: holding };
      const id = `T${Math.max(0, ...tasks.map((t) => Number(t.id.slice(1)))) + 1}`;
      /** @type {Task} */
      const task = { id, title: p.title, status: 'running', owner: p.owner, files: p.files, note: `started ${now}` };
      save(cwd, requestOf(md) || p.task, [...tasks, task]);
      return { task };
    });
    if (got.task) return got.task;
    if (!waited) { log(`team: waiting for ${got.wait.map((t) => t.id).join(', ')} (${got.wait[0].files.join(', ')})`); waited = true; }
    await sleep(2_000);
  }
}

/** @param {string} cwd @param {string} id @param {Partial<Task>} patch */
const update = (cwd, id, patch) => exclusive(cwd, () => {
  const md = read(cwd);
  save(cwd, requestOf(md), parseBoard(md).map((t) => (t.id === id ? { ...t, ...patch } : t)));
});

/**
 * @param {string[]} argv @param {{ cwd?: string, env?: Record<string, string | undefined>, log?: (line: string) => void,
 *   usage?: (a: any) => Promise<number | null>, claude?: (a: { account: any, prompt: string, cwd: string }) => Promise<{ code: number, out: string }> }} [o]
 * @returns {Promise<{ code: number, lines: string[] }>}
 */
export async function teamCommand(argv, { cwd = process.cwd(), env = process.env, log = () => {}, usage, claude = runClaude } = {}) {
  const [verb, ...rest] = argv;
  if (verb === 'status') {
    const md = read(cwd);
    return md ? { code: 0, lines: md.trimEnd().split('\n') } : { code: 0, lines: ['team: no board yet: no part has been given out in this project.'] };
  }
  if (verb !== 'run') return { code: 2, lines: TEAM_HELP.split('\n') };
  /** @type {Record<string, string>} */
  const o = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) o[rest[i].slice(2)] = rest[++i] ?? '';
  const task = (o.task ?? '').trim();
  if (!task) return { code: 2, lines: ['team run: --task is needed: what this part is to do.'] };
  const accounts = teamAccounts(env.LOPESFILM_TEAM);
  if (accounts.length < 2) return { code: 3, lines: ['team: no team here (the use is not shared between accounts): do this part yourself.'] };
  const files = (o.files ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  const title = (o.title ?? task).slice(0, 60);
  const fullOf = usage ?? (async (/** @type {any} */ a) => fullness(await claudeUsage(a.configDir)));
  const running = parseBoard(read(cwd)).filter((t) => t.status === 'running');
  const account = await pickAccount(accounts, fullOf, running);
  const part = await register(cwd, { title, owner: account.name, files, task }, log);
  log(`team: ${part.id} "${title}" on ${account.name}`);
  const run = env.LOPESFILM_TEAM_RUN || 'lopesfilm';
  const prompt = `You are one of several agents making the same film at the same time, each with its own part. Your part:\n\n${task}\n\n`
    + `Run \`${run}\` with no arguments first and follow the manual it prints. Do only this part${files.length ? `, and edit only ${files.join(', ')} (the others are held by the other parts)` : ''}. `
    + `Do not open Studio and do not render. When it is done, answer in at most five lines: what you changed and anything the next step must know.`;
  const done = await claude({ account, prompt, cwd }).catch((e) => ({ code: 1, out: String(e?.message ?? e) }));
  const ok = done.code === 0;
  const summary = done.out.trim().split('\n').slice(-12).join(' ').slice(0, 300);
  await update(cwd, part.id, { status: ok ? 'done' : 'failed', note: summary || (ok ? 'done' : 'failed') });
  return { code: ok ? 0 : 1, lines: [`${part.id} ${ok ? 'done' : 'failed'} on ${account.name}:`, ...done.out.trim().split('\n').slice(-20)] };
}

/** One Claude Code, on one account, in the project's folder, asked once (print mode). @param {{ account: any, prompt: string, cwd: string }} a */
function runClaude({ account, prompt, cwd }) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...(account.configDir ? { CLAUDE_CONFIG_DIR: account.configDir } : {}) };
    const program = account.path || process.env.LOPESFILM_TEAM_CLAUDE || 'claude';
    const child = spawn(program, ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash Read Edit Write Glob Grep'], { cwd, env, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.once('error', (e) => resolve({ code: 1, out: String(e.message) }));
    child.once('close', (code) => resolve({ code: code ?? 1, out: out || err }));
  });
}

export const hasTeamFiles = (/** @type {string} */ cwd) => existsSync(board(cwd)) && readdirSync(dirOf(cwd)).length > 0;
