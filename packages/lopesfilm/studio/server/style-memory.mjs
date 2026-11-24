// @ts-check
/**
 * "Meu estilo": what the person's own edits in Studio say about how they like a film, learnt as they edit and given to
 * every agent as an always-on skill (meu-estilo, in the person's skills folder), by Lopes.
 *
 * Only the person's edits count: Studio's /edit with `by: 'person'` (an edit an agent's cursor makes is `agent`). What is
 * counted: the transitions, effects, filters, texts, motions and stickers they put in or take out, the fades and speeds
 * they set, how long they trim their shots, the stage shape they pick and how often they cut. A line is written only once
 * something was seen enough times; the person sees each line in Settings and can take any out (it is not learnt
 * again), turn the learning off, or start over. Nothing leaves the computer.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sharedHome } from '../../src/locations.mjs';
import { mySkillsDir } from '../../src/skills.mjs';

export const STYLE_SKILL = 'meu-estilo';
const CATS = /** @type {const} */ (['transitions', 'effects', 'filters', 'text', 'motions', 'stickers']);
const CAT_PT = { transitions: 'transição', effects: 'efeito', filters: 'filtro', text: 'texto', motions: 'animação', stickers: 'figurinha' };
const SAMPLES = 60;

/** @typedef {{ enabled: boolean, ignored: string[], added: Record<string, Record<string, number>>, removed: Record<string, Record<string, number>>, fades: number[][], speeds: number[], shots: number[], stages: Record<string, number>, cuts: number, edits: number }} Style */

const file = () => join(sharedHome(), 'style', 'style.json');
const fresh = () => /** @type {Style} */ ({ enabled: true, ignored: [], added: {}, removed: {}, fades: [], speeds: [], shots: [], stages: {}, cuts: 0, edits: 0 });

export function readStyle() {
  try { return { ...fresh(), ...JSON.parse(readFileSync(file(), 'utf8')) }; } catch { return fresh(); }
}
function keep(/** @type {Style} */ style) {
  mkdirSync(join(sharedHome(), 'style'), { recursive: true });
  writeFileSync(file(), `${JSON.stringify(style)}\n`);
  writeSkill(style);
}

/** A library thing a clip's file is: its kind and name (`transitions/glitch`), or null. @param {unknown} src */
export function libraryThing(src) {
  const m = /(?:^|\/)(transitions|effects|filters|text|motions|stickers)\/([a-z0-9][\w-]*)/i.exec(String(src ?? ''));
  return m ? { cat: /** @type {typeof CATS[number]} */ (m[1].toLowerCase()), id: m[2].toLowerCase() } : null;
}

const bump = (/** @type {Record<string, Record<string, number>>} */ map, /** @type {string} */ cat, /** @type {string} */ id) => {
  map[cat] ??= {};
  map[cat][id] = (map[cat][id] ?? 0) + 1;
};
const push = (/** @type {any[]} */ list, /** @type {any} */ v) => { list.push(v); if (list.length > SAMPLES) list.splice(0, list.length - SAMPLES); };
const isVideo = (/** @type {unknown} */ src) => /\.(mp4|mov|webm|mkv|m4v)(?:[#?].*)?$/i.test(String(src ?? ''));

/**
 * The person's edit, learnt from. `before`: the film before it (to know what a removed or trimmed clip was).
 * @param {{ tracks?: { clips?: Record<string, unknown>[] }[] } | null} before @param {any[]} ops
 */
export function learnFromEdit(before, ops) {
  const style = readStyle();
  if (!style.enabled || !Array.isArray(ops) || !ops.length) return;
  const clips = new Map((before?.tracks ?? []).flatMap((t) => t.clips ?? []).map((c) => [String(c.id), c]));
  let learnt = false;
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'insert' && !op.from) {
      const thing = libraryThing(op.clip?.src);
      if (thing) { bump(style.added, thing.cat, thing.id); learnt = true; }
    } else if (op.op === 'remove') {
      const thing = libraryThing(clips.get(String(op.clip))?.src);
      if (thing) { bump(style.removed, thing.cat, thing.id); learnt = true; }
    } else if (op.op === 'split') {
      style.cuts += 1; learnt = true;
    } else if (op.op === 'stage' && op.w > 0 && op.h > 0) {
      const g = (a, b) => (b ? g(b, a % b) : a);
      const d = g(op.w, op.h);
      const key = `${op.w / d}:${op.h / d}`;
      style.stages[key] = (style.stages[key] ?? 0) + 1; learnt = true;
    } else if (op.op === 'set' && op.field === 'speed' && typeof op.value === 'number') {
      push(style.speeds, op.value); learnt = true;
    } else if (op.op === 'props' && Array.isArray(op.edits)) {
      for (const e of op.edits) {
        if (!e || typeof e !== 'object') continue;
        if (e.prop === 'fade' && Array.isArray(e.value) && e.value.length === 2) { push(style.fades, e.value.map(Number)); learnt = true; }
        if (e.prop === 'speed' && typeof e.value === 'number') { push(style.speeds, e.value); learnt = true; }
        if ((e.prop === 'start' || e.prop === 'end') && typeof e.value === 'number') {
          const clip = clips.get(String(e.clip));
          const time = Array.isArray(clip?.time) ? /** @type {number[]} */ (clip.time) : null;
          if (clip && isVideo(clip.src) && time) {
            const [s, en] = e.prop === 'start' ? [e.value, time[1]] : [time[0], e.value];
            if (en - s > 0.2 && en - s < 120) { push(style.shots, Math.round((en - s) * 10) / 10); learnt = true; }
          }
        }
      }
    }
  }
  if (learnt) { style.edits += 1; keep(style); }
}

const median = (/** @type {number[]} */ list) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const nice = (/** @type {string} */ id) => id.replace(/-/g, ' ');

/** What has been learnt, as lines: `{ key, text }`, the ones the person took out left out. @param {Style} style */
export function styleLines(style = readStyle()) {
  /** @type {{ key: string, text: string }[]} */
  const lines = [];
  for (const cat of CATS) {
    const added = Object.entries(style.added[cat] ?? {}).filter(([id, n]) => n >= 2 && n > (style.removed[cat]?.[id] ?? 0)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (added.length) lines.push({ key: `fav:${cat}`, text: `Prefere ${CAT_PT[cat]}${added.length > 1 ? 's' : ''}: ${added.map(([id, n]) => `${nice(id)} (${n}×)`).join(', ')}. Use essas primeiro quando couberem.` });
    for (const [id, n] of Object.entries(style.removed[cat] ?? {})) {
      if (n >= 2 && n > (style.added[cat]?.[id] ?? 0)) lines.push({ key: `avoid:${cat}:${id}`, text: `Evite ${CAT_PT[cat]} "${nice(id)}": a pessoa tirou ${n}× do filme.` });
    }
  }
  if (style.fades.length >= 3) {
    const fin = median(style.fades.map((f) => f[0])), fout = median(style.fades.map((f) => f[1]));
    lines.push({ key: 'fades', text: `Fades de entrada de cerca de ${fin.toFixed(1)} s e de saída de cerca de ${fout.toFixed(1)} s.` });
  }
  if (style.shots.length >= 5) lines.push({ key: 'shots', text: `Cortes curtos assim: cada tomada de vídeo com cerca de ${median(style.shots).toFixed(1)} s.` });
  if (style.speeds.length >= 3) {
    const s = median(style.speeds);
    if (Math.abs(s - 1) > 0.05) lines.push({ key: 'speed', text: `Costuma mudar a velocidade dos clipes para ${s}×.` });
  }
  const stage = Object.entries(style.stages).sort((a, b) => b[1] - a[1])[0];
  if (stage && stage[1] >= 2) lines.push({ key: 'stage', text: `Formato do palco mais usado: ${stage[0]}.` });
  if (style.cuts >= 10 && style.edits >= 10 && style.cuts / style.edits > 0.4) lines.push({ key: 'cuts', text: 'Edita com muitos cortes: ritmo ágil.' });
  const ignored = new Set(style.ignored);
  return lines.filter((l) => !ignored.has(l.key));
}

/** The skill every agent is given (always on): the lines, or none at all when nothing is learnt or learning is off. */
function writeSkill(/** @type {Style} */ style) {
  const dir = join(mySkillsDir(), STYLE_SKILL);
  const lines = style.enabled ? styleLines(style) : [];
  if (!lines.length) { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); return; }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---
name: ${STYLE_SKILL}
description: O estilo de edição desta pessoa, aprendido das edições que ela mesma faz no Lopes.Film. Siga sempre ao montar ou editar um filme.
---

# Meu estilo

Aprendido das edições que a pessoa fez à mão no Lopes.Film (atualizado sozinho). Siga sempre que fizer sentido para o filme; um pedido dela na conversa vale mais do que isto.

${lines.map((l) => `- ${l.text}`).join('\n')}
`);
  writeFileSync(join(dir, 'lopesfilm.json'), `${JSON.stringify({ title: { en: 'My style', 'pt-BR': 'Meu estilo' }, summary: { en: 'Learnt from your own edits', 'pt-BR': 'Aprendido das suas edições' }, author: 'Lopes' }, null, 2)}\n`);
}

/** For Settings: on or off, what was learnt, and from how many edits. */
export function styleState() {
  const style = readStyle();
  return { enabled: style.enabled, edits: style.edits, lines: styleLines(style) };
}
export function setStyleEnabled(/** @type {boolean} */ on) { const s = readStyle(); s.enabled = Boolean(on); keep(s); return styleState(); }
/** A line taken out: not learnt again. */
export function forgetStyleLine(/** @type {string} */ key) { const s = readStyle(); if (!s.ignored.includes(key)) s.ignored.push(String(key).slice(0, 200)); keep(s); return styleState(); }
/** Everything learnt let go (the switch kept as it is). */
export function clearStyle() { const s = readStyle(); keep({ ...fresh(), enabled: s.enabled }); return styleState(); }
