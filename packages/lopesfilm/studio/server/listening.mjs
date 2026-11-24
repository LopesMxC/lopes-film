// @ts-check
/**
 * Ears and eyes for the agents, from two open-source tools run on this computer in a Python of their own (pytools.mjs):
 *
 *   listen        earshot describe / match: what a sound is, in words, or how well it fits a description
 *   sound-find    earshot find: the best moments for a description inside a long recording
 *   sound-review  earshot timeline / critique: a film's sound, second by second, or scored against professional films
 *   breakdown     rea-video decompose: a reference video shot by shot (filmed, AI or code), with VIDEO.md and a report
 *
 * The text each prints is what the verb returns, so the agent reads it as it is.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inside } from './files.mjs';
import { runPyTool } from './pytools.mjs';

/**
 * @param {string} root @param {string} verb
 * @param {{ src: string, query?: string, top?: number, mode?: string, out?: string, lang?: string, stems?: boolean }} a
 * @param {AbortSignal} [signal]
 */
export async function runListening(root, verb, a, signal) {
  const src = a.src ? inside(root, a.src) : '';
  const o = { ...(signal ? { signal } : {}), cwd: root, timeoutMs: 3600_000 };
  if (verb === 'listen') {
    const text = await runPyTool('earshot', a.query ? ['match', src, a.query] : ['describe', src], o);
    return { src: a.src, heard: text };
  }
  if (verb === 'sound-find') {
    const text = await runPyTool('earshot', ['find', src, String(a.query), '--top', String(a.top ?? 5)], o);
    return { src: a.src, query: a.query, moments: text };
  }
  if (verb === 'sound-review') {
    const text = await runPyTool('earshot', a.mode === 'critique' ? ['critique', src] : ['timeline', src], o);
    return { src: a.src, mode: a.mode ?? 'timeline', review: text };
  }
  if (verb === 'breakdown') {
    const rel = `assets/breakdown/${a.out}`;
    const dir = join(root, rel);
    await mkdir(dir, { recursive: true });
    const text = await runPyTool('reavideo', ['decompose', src, '-o', dir, '--lang', a.lang ?? 'en', ...(a.stems ? [] : ['--no-stems', '--no-asr', '--no-speakers'])], o);
    /* its summary is the last JSON it prints */
    let summary = null;
    try { summary = JSON.parse(text.slice(text.lastIndexOf('\n{') + 1)); } catch { /* text only */ }
    const md = join(dir, 'VIDEO.md');
    const head = existsSync(md) ? (await readFile(md, 'utf8')).slice(0, 4000) : '';
    return {
      folder: rel,
      videoMd: existsSync(md) ? `${rel}/VIDEO.md` : null,
      report: existsSync(join(dir, 'report.html')) ? `${rel}/report.html` : null,
      ...(summary && typeof summary === 'object' ? { verdict: summary.verdict, shots: summary.shots, confidence: summary.confidence } : {}),
      start: head,
      note: 'VIDEO.md is layered: read its top for the whole, then only the shots a question needs. report.html is for the person.',
    };
  }
  if (verb === 'earshot' || verb === 'rea-video') {
    const args = words(String(/** @type {any} */ (a).args ?? ''));
    if (!args.length) throw new Error('--args is the command and what it takes, e.g. "sfx list"');
    if (/^(mcp|llm|doctor)$/.test(args[0]) && verb === 'earshot' && args[0] !== 'doctor') throw new Error(`earshot ${args[0]} is not run from here`);
    /* every path it is given stays in the project: an argument that names a place outside it is refused */
    for (const w of args) if (/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(w) || w.split(/[\\/]/).includes('..')) throw new Error(`${w}: paths are inside the project (relative to it)`);
    const text = await runPyTool(verb === 'earshot' ? 'earshot' : 'reavideo', args, o);
    return { command: `${verb} ${args.join(' ')}`, printed: text.length > 60000 ? `${text.slice(0, 60000)}\n… (cut)` : text };
  }
  throw new Error(`no such verb ${verb}`);
}

/** A command line in words, as a shell splits it: spaces apart, "quoted" or 'quoted' kept together. @param {string} line */
export function words(line) {
  /** @type {string[]} */ const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2] !== undefined ? m[2] : m[3]);
  return out;
}
