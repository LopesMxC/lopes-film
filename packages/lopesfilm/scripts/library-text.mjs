#!/usr/bin/env node
/**
 * The library's text, made from one page (library/text/text: a line of words whose look and motion are its CSS
 * variables): the basic lines, the word-art looks and the motions in, while shown and out, each only values of those
 * variables. This writes them into library/index.json (groups first among the text's) and draws each one's poster
 * and two-second preview with the renderer itself, the variables set as a clip's `:root` override, as Studio sets
 * them.
 *
 *   node scripts/library-text.mjs [--no-pictures] [id …]   (ids: draw only those)
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../src/render.mjs';
import { closeBrowsers } from '../src/host.mjs';
import { GROUND } from './library-ground.mjs';
import { describeText } from './library-text-words.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, '..', 'library');
const SAMPLES = join(HERE, 'library-samples');
const W = 640, H = 360;
const ffmpeg = (...args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}`); };
/* each thing's name in five languages (library-text-names.json), by its group and its own name */
const NAMES = JSON.parse(readFileSync(join(HERE, 'library-text-names.json'), 'utf8'));
const N = (key) => { if (!NAMES[key]) throw new Error(`no name for ${key}`); return NAMES[key]; };

/* fonts the page comes with, and the system's */
const SANS = "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'Hiragino Sans GB', sans-serif";
const SERIF = "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', Georgia, serif";
const DISPLAY = `'Smiley Sans', ${SANS}`;
const PLAY = `'ZCOOL KuaiLe', ${SANS}`;
const ring = (w, c) => [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([x, y]) => `${(x * w).toFixed(3)}em ${(y * w).toFixed(3)}em 0 ${c}`).join(', ');
/* an edge around a gradient fill: a ring of drop shadows (a stroke would cover the fill, which is the background) */
const edge = (w, c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => `drop-shadow(${x * w}em ${y * w}em 0 ${c})`).join(' ');
const stack = (n, step, c) => Array.from({ length: n }, (_, i) => `${((i + 1) * step).toFixed(3)}em ${((i + 1) * step).toFixed(3)}em 0 ${c}`).join(', ');

const GROUPS = [
  { id: 'basic', name: N('groups/basic') },
  { id: 'wordart', name: N('groups/wordart') },
  { id: 'in', name: N('groups/in') },
  { id: 'loop', name: N('groups/loop') },
  { id: 'out', name: N('groups/out') },
];

/** The basic lines: words of each size, as a page is laid out (the size is their box's, `fit` of the picture's height). */
const BASIC = [
  ['title', N('basic/title'), { '--weight': '900', '--font': DISPLAY }, { fit: 0.2 }],
  ['subtitle', N('basic/subtitle'), { '--weight': '700' }, { fit: 0.11 }],
  ['body', N('basic/body'), { '--weight': '500', '--in': 'fade' }, { fit: 0.08 }],
  ['note', N('basic/note'), { '--size': '52vh', '--weight': '500', '--box': 'rgba(0,0,0,0.55)', '--box-pad': '0.35em 0.7em', '--box-radius': '0.3em', '--in': 'fade' }, { fit: 0.08 }],
  ['lower', N('basic/lower'), { '--weight': '600', '--stroke': '0.08em', '--in': 'fade' }, { fit: 0.08, low: true }],
];

/** Word art: a look made of a fill, a stroke, shadows, a glow and a box. */
const WORDART = [
  ['white-black', N('wordart/white-black'), { '--stroke': '0.12em', '--stroke-color': '#111' }],
  ['yellow-variety', N('wordart/yellow-variety'), { '--font': DISPLAY, '--color': '#ffd400', '--stroke': '0.14em', '--stroke-color': '#151515', '--shadow': '0.07em 0.09em 0 #151515' }],
  ['variety-pink', N('wordart/variety-pink'), { '--font': PLAY, '--weight': '400', '--color': '#ffffff', '--stroke': '0.16em', '--stroke-color': '#ff3d7f', '--shadow': '0 0.1em 0 #9e0040' }],
  ['candy', N('wordart/candy'), { '--font': PLAY, '--weight': '400', '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffffff 35%, #ffe08a 80%)', '--glow': `${edge(0.05, '#ff8a00')} ${edge(0.04, '#ff8a00')} drop-shadow(0 0.09em 0 #c24e00)` }],
  ['comic', N('wordart/comic'), { '--font': PLAY, '--weight': '400', '--color': '#ffeb3b', '--stroke': '0.12em', '--stroke-color': '#111', '--shadow': '0.09em 0.09em 0 #e53935' }],
  ['cute-pink', N('wordart/cute-pink'), { '--font': PLAY, '--weight': '400', '--color': '#ffffff', '--stroke': '0.13em', '--stroke-color': '#ff7eb6', '--shadow': '0 0.08em 0 #e05597' }],
  ['mint', N('wordart/mint'), { '--font': PLAY, '--weight': '400', '--color': '#ffffff', '--stroke': '0.13em', '--stroke-color': '#2ec4a0', '--shadow': '0 0.08em 0 #13866b' }],
  ['neon-pink', N('wordart/neon-pink'), { '--weight': '700', '--color': '#fff0fb', '--glow': 'drop-shadow(0 0 0.06em #ff2fd0) drop-shadow(0 0 0.25em #ff2fd0)' }],
  ['neon-cyan', N('wordart/neon-cyan'), { '--weight': '700', '--color': '#effffe', '--glow': 'drop-shadow(0 0 0.06em #19e3ff) drop-shadow(0 0 0.25em #19e3ff)' }],
  ['neon-yellow', N('wordart/neon-yellow'), { '--weight': '700', '--color': '#fffbe0', '--glow': 'drop-shadow(0 0 0.06em #ffd21f) drop-shadow(0 0 0.25em #ff9d00)' }],
  ['gold', N('wordart/gold'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #fff7cc 0%, #f2c14e 45%, #9a6a12 52%, #f6d784 100%)', '--stroke': '0.03em', '--stroke-color': '#5a3a00', '--glow': 'drop-shadow(0 0.04em 0.06em rgba(0,0,0,0.55))' }],
  ['silver', N('wordart/silver'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffffff 0%, #c9d1d9 45%, #6b7480 52%, #e8edf2 100%)', '--stroke': '0.03em', '--stroke-color': '#2d333b', '--glow': 'drop-shadow(0 0.04em 0.06em rgba(0,0,0,0.55))' }],
  ['sunset', N('wordart/sunset'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(90deg, #ffb35c, #ff4d8d 55%, #8a5cff)' }],
  ['ocean', N('wordart/ocean'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(90deg, #7cf6ff, #2f8cff 60%, #5b3cff)' }],
  ['aurora', N('wordart/aurora'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(90deg, #8affc1, #5ad1ff 50%, #c08bff)', '--glow': 'drop-shadow(0 0 0.15em rgba(120,220,255,0.6))' }],
  ['fire', N('wordart/fire'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(0deg, #ff3d00, #ffb300 55%, #fff59d)', '--glow': 'drop-shadow(0 0 0.18em #ff6d00)' }],
  ['ice', N('wordart/ice'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffffff, #a8ecff)', '--stroke': '0.02em', '--stroke-color': '#e6faff', '--glow': 'drop-shadow(0 0 0.15em #7fdcff)' }],
  ['solid-red', N('wordart/solid-red'), { '--font': DISPLAY, '--color': '#ff4a3d', '--shadow': stack(8, 0.012, '#7a0f08') }],
  ['solid-blue', N('wordart/solid-blue'), { '--font': DISPLAY, '--color': '#4aa8ff', '--shadow': stack(8, 0.012, '#0b2f66') }],
  ['long-shadow', N('wordart/long-shadow'), { '--font': DISPLAY, '--color': '#ffffff', '--shadow': stack(16, 0.012, 'rgba(0,0,0,0.35)') }],
  ['outline', N('wordart/outline'), { '--font': DISPLAY, '--color': 'transparent', '--stroke': '0.035em', '--stroke-color': '#ffffff' }],
  ['double-edge', N('wordart/double-edge'), { '--font': DISPLAY, '--color': '#ffffff', '--glow': `${edge(0.035, '#2b5bff')} ${edge(0.03, '#2b5bff')} ${edge(0.035, '#ffffff')}` }],
  ['retro', N('wordart/retro'), { '--font': DISPLAY, '--color': '#f6e7c8', '--shadow': '0.06em 0.06em 0 #d2452f, 0.12em 0.12em 0 #24384d' }],
  ['vapor', N('wordart/vapor'), { '--font': DISPLAY, '--color': '#ffe9ff', '--italic': 'italic', '--shadow': '0.05em 0.05em 0 #ff4fd8, 0.1em 0.1em 0 #3bd5ff' }],
  ['glitch', N('wordart/glitch'), { '--font': DISPLAY, '--color': '#ffffff', '--shadow': '-0.05em 0 0 #ff0050, 0.05em 0 0 #00e5ff' }],
  ['label-black', N('wordart/label-black'), { '--weight': '700', '--box': '#111111', '--box-pad': '0.25em 0.55em', '--box-radius': '0.18em' }],
  ['label-yellow', N('wordart/label-yellow'), { '--weight': '800', '--color': '#111111', '--box': '#ffd400', '--box-pad': '0.25em 0.55em', '--box-radius': '0.18em' }],
  ['label-red', N('wordart/label-red'), { '--weight': '800', '--box': '#d6202f', '--box-pad': '0.22em 0.6em', '--box-radius': '0' }],
  ['highlighter', N('wordart/highlighter'), { '--weight': '800', '--color': '#ffffff', '--box': 'linear-gradient(transparent 55%, rgba(255,61,127,0.85) 55%, rgba(255,61,127,0.85) 90%, transparent 90%)', '--box-pad': '0 0.15em' }],
  ['bubble', N('wordart/bubble'), { '--font': PLAY, '--weight': '400', '--color': '#222222', '--box': '#ffffff', '--box-pad': '0.3em 0.8em', '--box-radius': '1.2em', '--glow': 'drop-shadow(0 0.05em 0.1em rgba(0,0,0,0.4))' }],
  ['handwriting', N('wordart/handwriting'), { '--font': PLAY, '--weight': '400', '--shadow': '0 0.04em 0.2em rgba(0,0,0,0.5)' }],
  ['cinema', N('wordart/cinema'), { '--font': SERIF, '--weight': '600', '--color': '#f5e6c4', '--spacing': '0.25em', '--size': '6vw', '--shadow': '0 0.02em 0.12em rgba(0,0,0,0.85)' }],
  ['elegant', N('wordart/elegant'), { '--font': SERIF, '--weight': '500', '--italic': 'italic', '--spacing': '0.06em' }],
  ['thin', N('wordart/thin'), { '--weight': '200', '--spacing': '0.18em' }],
  ['soft-shadow', N('wordart/soft-shadow'), { '--weight': '800', '--shadow': '0 0.06em 0.3em rgba(0,0,0,0.65)' }],
  ['chrome', N('wordart/chrome'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffffff 0%, #9fb4c7 40%, #2b3b4d 50%, #cfe3f5 75%, #ffffff 100%)', '--stroke': '0.02em', '--stroke-color': '#10202f', '--glow': 'drop-shadow(0 0.04em 0.05em rgba(0,0,0,0.6))' }],
  ['rose-gold', N('wordart/rose-gold'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffe6e0 0%, #f0a898 45%, #a65a4a 52%, #f7cfc4 100%)', '--stroke': '0.03em', '--stroke-color': '#5c2a20', '--glow': 'drop-shadow(0 0.04em 0.06em rgba(0,0,0,0.5))' }],
  ['emerald', N('wordart/emerald'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #d7ffe9 0%, #2ecf8a 50%, #0a5c3a 100%)', '--stroke': '0.02em', '--stroke-color': '#03281a', '--glow': 'drop-shadow(0 0 0.1em rgba(46,207,138,0.6))' }],
  ['lava', N('wordart/lava'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(0deg, #7a0b00, #ff3b00 45%, #ffd24a)', '--stroke': '0.03em', '--stroke-color': '#2a0500', '--glow': 'drop-shadow(0 0 0.14em #ff4d00)' }],
  ['toxic', N('wordart/toxic'), { '--font': DISPLAY, '--color': '#b6ff2e', '--stroke': '0.08em', '--stroke-color': '#0d1f00', '--glow': 'drop-shadow(0 0 0.12em #7dff00) drop-shadow(0 0 0.3em #5ad100)' }],
  ['blood', N('wordart/blood'), { '--font': DISPLAY, '--color': '#c40d0d', '--stroke': '0.05em', '--stroke-color': '#1a0000', '--shadow': '0 0.06em 0.12em rgba(0,0,0,0.8)' }],
  ['cyberpunk', N('wordart/cyberpunk'), { '--font': DISPLAY, '--color': '#fdf6ff', '--italic': 'italic', '--shadow': '-0.04em 0 0 #00f0ff, 0.04em 0 0 #ff00a8, 0 0 0.3em rgba(255,0,168,0.6)' }],
  ['hologram', N('wordart/hologram'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(100deg, #7df9ff, #b69cff 35%, #ff9de6 60%, #fff6a8 85%)', '--glow': 'drop-shadow(0 0 0.1em rgba(125,249,255,0.7))' }],
  ['pastel-dream', N('wordart/pastel-dream'), { '--font': PLAY, '--weight': '400', '--color': 'transparent', '--fill': 'linear-gradient(90deg, #ffb6d9, #c8b6ff 50%, #a8e6ff)', '--stroke': '0.1em', '--stroke-color': '#ffffff', '--shadow': '0 0.06em 0.2em rgba(150,120,200,0.5)' }],
  ['newspaper', N('wordart/newspaper'), { '--font': SERIF, '--weight': '800', '--color': '#111111', '--box': '#f1ecdf', '--box-pad': '0.2em 0.5em', '--box-radius': '0.04em' }],
  ['sticker', N('wordart/sticker'), { '--font': DISPLAY, '--color': '#ff3d7f', '--stroke': '0.22em', '--stroke-color': '#ffffff', '--shadow': '0 0.06em 0.12em rgba(0,0,0,0.45)' }],
  ['neon-green', N('wordart/neon-green'), { '--weight': '700', '--color': '#f0fff0', '--glow': 'drop-shadow(0 0 0.06em #2dff6e) drop-shadow(0 0 0.25em #2dff6e)' }],
  ['neon-orange', N('wordart/neon-orange'), { '--weight': '700', '--color': '#fff4e8', '--glow': 'drop-shadow(0 0 0.06em #ff7a00) drop-shadow(0 0 0.25em #ff5e00)' }],
  ['neon-purple', N('wordart/neon-purple'), { '--weight': '700', '--color': '#f6efff', '--glow': 'drop-shadow(0 0 0.06em #a855ff) drop-shadow(0 0 0.25em #8a2bff)' }],
  ['graffiti', N('wordart/graffiti'), { '--font': PLAY, '--weight': '400', '--color': '#ffe500', '--stroke': '0.14em', '--stroke-color': '#111111', '--shadow': '0.1em 0.1em 0 #ff2d6f, 0.2em 0.2em 0 #111111' }],
  ['paper-label', N('wordart/paper-label'), { '--font': SERIF, '--weight': '700', '--color': '#2a2118', '--box': '#f4e9cf', '--box-pad': '0.25em 0.6em', '--box-radius': '0.08em', '--glow': 'drop-shadow(0 0.04em 0.08em rgba(0,0,0,0.5))' }],
  ['mono-code', N('wordart/mono-code'), { '--font': "'SF Mono','Consolas','Menlo','Courier New',monospace", '--weight': '600', '--color': '#7dffb2', '--box': 'rgba(8,16,12,0.85)', '--box-pad': '0.25em 0.6em', '--box-radius': '0.15em' }],
  ['subtitle-clean', N('wordart/subtitle-clean'), { '--weight': '600', '--color': '#ffffff', '--box': 'rgba(0,0,0,0.6)', '--box-pad': '0.2em 0.6em', '--box-radius': '0.25em' }],
  ['caption-heavy', N('wordart/caption-heavy'), { '--font': DISPLAY, '--weight': '900', '--color': '#ffffff', '--stroke': '0.2em', '--stroke-color': '#000000', '--shadow': '0 0.06em 0 #000000' }],
  ['karaoke-green', N('wordart/karaoke-green'), { '--font': DISPLAY, '--color': '#3dff7a', '--stroke': '0.14em', '--stroke-color': '#06210f', '--shadow': '0 0.08em 0 #06210f' }],
  ['highlight-yellow', N('wordart/highlight-yellow'), { '--weight': '800', '--color': '#111111', '--box': 'linear-gradient(transparent 12%, #ffe84a 12%, #ffe84a 90%, transparent 90%)', '--box-pad': '0 0.2em' }],
  ['stamp', N('wordart/stamp'), { '--font': DISPLAY, '--color': '#e23b2e', '--box': 'transparent', '--box-pad': '0.15em 0.4em', '--stroke': '0', '--shadow': `${ring(0.02, 'rgba(226,59,46,0.5)')}` }],
  ['neon-red', N('wordart/neon-red'), { '--weight': '700', '--color': '#fff0f0', '--glow': 'drop-shadow(0 0 0.06em #ff1f3d) drop-shadow(0 0 0.25em #ff1f3d)' }],
  ['neon-blue', N('wordart/neon-blue'), { '--weight': '700', '--color': '#eef4ff', '--glow': 'drop-shadow(0 0 0.06em #2f6bff) drop-shadow(0 0 0.25em #2f6bff)' }],
  ['neon-white', N('wordart/neon-white'), { '--weight': '700', '--color': '#ffffff', '--glow': 'drop-shadow(0 0 0.05em #ffffff) drop-shadow(0 0 0.3em #9fd0ff)' }],
  ['neon-lime', N('wordart/neon-lime'), { '--weight': '700', '--color': '#fbffe6', '--glow': 'drop-shadow(0 0 0.06em #c8f501) drop-shadow(0 0 0.25em #c8f501)' }],
  ['neon-double', N('wordart/neon-double'), { '--weight': '800', '--color': '#ffffff', '--glow': 'drop-shadow(-0.04em 0 0.1em #00e5ff) drop-shadow(0.04em 0 0.1em #ff2fd0)' }],
  ['sunrise', N('wordart/sunrise'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #fff3b0, #ffb347 50%, #ff5e62)' }],
  ['forest', N('wordart/forest'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #d9f99d, #4ade80 50%, #166534)' }],
  ['galaxy', N('wordart/galaxy'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(120deg, #6d28d9, #2563eb 45%, #22d3ee 75%, #f0abfc)', '--glow': 'drop-shadow(0 0 0.12em rgba(139,92,246,0.7))' }],
  ['candy-pop', N('wordart/candy-pop'), { '--font': PLAY, '--weight': '400', '--color': 'transparent', '--fill': 'linear-gradient(90deg, #ff9ad5, #ffd36e 50%, #7be0ff)', '--stroke': '0.1em', '--stroke-color': '#ffffff', '--shadow': '0 0.07em 0 rgba(0,0,0,0.25)' }],
  ['rainbow', N('wordart/rainbow'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(90deg, #ff3b3b, #ff9f1c 20%, #ffe600 40%, #2ee66b 60%, #2f8cff 80%, #a855ff)', '--stroke': '0.02em', '--stroke-color': 'rgba(0,0,0,0.35)' }],
  ['bronze', N('wordart/bronze'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffe2c2 0%, #cd7f32 45%, #6b3a12 52%, #e3a46a 100%)', '--stroke': '0.03em', '--stroke-color': '#3b1f08', '--glow': 'drop-shadow(0 0.04em 0 #3b1f08)' }],
  ['platinum', N('wordart/platinum'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffffff 0%, #e5e4e2 45%, #8d9096 52%, #f4f4f6 100%)', '--stroke': '0.025em', '--stroke-color': '#3a3d44', '--glow': 'drop-shadow(0 0 0.1em rgba(255,255,255,0.6))' }],
  ['copper', N('wordart/copper'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(180deg, #ffd9c0 0%, #d77a4a 45%, #7a3417 52%, #f0a07a 100%)', '--stroke': '0.03em', '--stroke-color': '#3a1608' }],
  ['diamond', N('wordart/diamond'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(120deg, #ffffff, #bfeaff 30%, #ffffff 50%, #c9b8ff 75%, #ffffff)', '--glow': 'drop-shadow(0 0 0.12em rgba(180,220,255,0.9))' }],
  ['midnight', N('wordart/midnight'), { '--font': DISPLAY, '--color': '#cfd8ff', '--glow': 'drop-shadow(0 0 0.12em #4f46e5) drop-shadow(0 0.05em 0 #0b1030)' }],
  ['sakura', N('wordart/sakura'), { '--font': PLAY, '--weight': '400', '--color': '#fff5f8', '--stroke': '0.12em', '--stroke-color': '#f08bb0', '--shadow': '0 0.07em 0 #c25b82' }],
  ['lemon', N('wordart/lemon'), { '--font': PLAY, '--weight': '400', '--color': '#fff9c4', '--stroke': '0.13em', '--stroke-color': '#d4b800', '--shadow': '0 0.08em 0 #8a7500' }],
  ['grape', N('wordart/grape'), { '--font': PLAY, '--weight': '400', '--color': '#f5ecff', '--stroke': '0.13em', '--stroke-color': '#8b5cf6', '--shadow': '0 0.08em 0 #4c1d95' }],
  ['ocean-pop', N('wordart/ocean-pop'), { '--font': PLAY, '--weight': '400', '--color': '#ffffff', '--stroke': '0.13em', '--stroke-color': '#2f9bff', '--shadow': '0 0.08em 0 #0b4a99' }],
  ['orange-pop', N('wordart/orange-pop'), { '--font': PLAY, '--weight': '400', '--color': '#ffffff', '--stroke': '0.13em', '--stroke-color': '#ff8a1f', '--shadow': '0 0.08em 0 #b34700' }],
  ['red-pop', N('wordart/red-pop'), { '--font': PLAY, '--weight': '400', '--color': '#ffffff', '--stroke': '0.13em', '--stroke-color': '#ee2b47', '--shadow': '0 0.08em 0 #8a0f22' }],
  ['black-gold', N('wordart/black-gold'), { '--font': DISPLAY, '--color': '#f2c14e', '--box': '#0b0b0b', '--box-pad': '0.25em 0.6em', '--box-radius': '0.1em', '--stroke': '0.015em', '--stroke-color': '#8a5a00' }],
  ['white-box', N('wordart/white-box'), { '--weight': '800', '--color': '#111111', '--box': '#ffffff', '--box-pad': '0.25em 0.6em', '--box-radius': '0.18em' }],
  ['label-blue', N('wordart/label-blue'), { '--weight': '800', '--box': '#1f5bff', '--box-pad': '0.25em 0.6em', '--box-radius': '0.18em' }],
  ['label-green', N('wordart/label-green'), { '--weight': '800', '--color': '#04210f', '--box': '#35e07a', '--box-pad': '0.25em 0.6em', '--box-radius': '0.18em' }],
  ['label-purple', N('wordart/label-purple'), { '--weight': '800', '--box': '#7c3aed', '--box-pad': '0.25em 0.6em', '--box-radius': '0.18em' }],
  ['label-pink', N('wordart/label-pink'), { '--weight': '800', '--box': '#ff3d9a', '--box-pad': '0.25em 0.6em', '--box-radius': '0.18em' }],
  ['label-orange', N('wordart/label-orange'), { '--weight': '800', '--color': '#1a0c00', '--box': '#ff9f1c', '--box-pad': '0.25em 0.6em', '--box-radius': '0.18em' }],
  ['pill-white', N('wordart/pill-white'), { '--weight': '700', '--color': '#111111', '--box': '#ffffff', '--box-pad': '0.25em 0.9em', '--box-radius': '1em' }],
  ['pill-black', N('wordart/pill-black'), { '--weight': '700', '--box': '#111111', '--box-pad': '0.25em 0.9em', '--box-radius': '1em' }],
  ['pill-accent', N('wordart/pill-accent'), { '--weight': '700', '--color': 'var(--on-accent, #fff)', '--box': 'var(--accent, #e5384f)', '--box-pad': '0.25em 0.9em', '--box-radius': '1em' }],
  ['glass', N('wordart/glass'), { '--weight': '600', '--color': '#ffffff', '--box': 'rgba(255,255,255,0.18)', '--box-pad': '0.3em 0.8em', '--box-radius': '0.5em', '--glow': 'drop-shadow(0 0.05em 0.2em rgba(0,0,0,0.35))' }],
  ['tape', N('wordart/tape'), { '--font': SERIF, '--weight': '700', '--color': '#2a2118', '--box': 'rgba(255,235,150,0.92)', '--box-pad': '0.2em 0.7em', '--box-radius': '0.05em', '--glow': 'drop-shadow(0 0.03em 0.06em rgba(0,0,0,0.4))' }],
  ['warning', N('wordart/warning'), { '--weight': '900', '--color': '#111111', '--box': 'repeating-linear-gradient(45deg, #ffd400 0 0.35em, #111 0.35em 0.7em)', '--box-pad': '0.2em 0.6em', '--stroke': '0.1em', '--stroke-color': '#ffd400' }],
  ['breaking', N('wordart/breaking'), { '--weight': '900', '--spacing': '0.08em', '--box': '#c8102e', '--box-pad': '0.22em 0.7em', '--box-radius': '0' }],
  ['live', N('wordart/live'), { '--weight': '800', '--spacing': '0.1em', '--box': '#ff1f3d', '--box-pad': '0.18em 0.6em', '--box-radius': '0.2em' }],
  ['new-badge', N('wordart/new-badge'), { '--weight': '900', '--color': '#111111', '--box': '#c8f501', '--box-pad': '0.18em 0.6em', '--box-radius': '0.2em' }],
  ['sale', N('wordart/sale'), { '--weight': '900', '--italic': 'italic', '--box': '#ff2d2d', '--box-pad': '0.2em 0.7em', '--box-radius': '0.1em', '--shadow': '0.06em 0.06em 0 #7a0000' }],
  ['movie-title', N('wordart/movie-title'), { '--font': SERIF, '--weight': '700', '--color': '#e8e8e8', '--spacing': '0.3em', '--size': '6vw', '--shadow': '0 0.03em 0.2em rgba(0,0,0,0.9)' }],
  ['trailer', N('wordart/trailer'), { '--font': DISPLAY, '--weight': '900', '--color': '#f5f5f5', '--spacing': '0.2em', '--glow': 'drop-shadow(0 0.04em 0.1em rgba(0,0,0,0.9))' }],
  ['typewriter', N('wordart/typewriter'), { '--font': "'Courier New','Courier',monospace", '--weight': '700', '--color': '#1d1d1d', '--box': '#f3efe4', '--box-pad': '0.2em 0.6em', '--box-radius': '0.04em' }],
  ['terminal', N('wordart/terminal'), { '--font': "'SF Mono','Consolas','Menlo','Courier New',monospace", '--weight': '600', '--color': '#00ff9c', '--box': 'rgba(0,0,0,0.88)', '--box-pad': '0.25em 0.6em', '--box-radius': '0.1em', '--glow': 'drop-shadow(0 0 0.1em rgba(0,255,156,0.6))' }],
  ['blueprint', N('wordart/blueprint'), { '--font': "'Courier New',monospace", '--weight': '700', '--color': '#e6f1ff', '--box': '#12408a', '--box-pad': '0.25em 0.6em', '--box-radius': '0.05em', '--stroke': '0.01em', '--stroke-color': '#9cc4ff' }],
  ['chalk', N('wordart/chalk'), { '--font': PLAY, '--weight': '400', '--color': '#f5f5ef', '--box': '#2b3a33', '--box-pad': '0.3em 0.7em', '--box-radius': '0.1em', '--shadow': '0 0 0.08em rgba(255,255,255,0.6)' }],
  ['marker', N('wordart/marker'), { '--font': PLAY, '--weight': '400', '--color': '#1a1a1a', '--shadow': '0.03em 0.03em 0 rgba(0,0,0,0.25)' }],
  ['brush-red', N('wordart/brush-red'), { '--font': SERIF, '--weight': '900', '--color': '#d1101f', '--shadow': '0.02em 0.03em 0.05em rgba(80,0,0,0.6)' }],
  ['ink', N('wordart/ink'), { '--font': SERIF, '--weight': '900', '--color': '#101010', '--box': '#f6f3ea', '--box-pad': '0.2em 0.6em', '--box-radius': '0.05em' }],
  ['shadow-pop', N('wordart/shadow-pop'), { '--font': DISPLAY, '--color': '#ffffff', '--stroke': '0.06em', '--stroke-color': '#111111', '--shadow': stack(10, 0.014, '#111111') }],
  ['extrude-gold', N('wordart/extrude-gold'), { '--font': DISPLAY, '--color': '#ffd95a', '--shadow': stack(10, 0.012, '#9a6a12') }],
  ['extrude-pink', N('wordart/extrude-pink'), { '--font': DISPLAY, '--color': '#ffb3d9', '--shadow': stack(10, 0.012, '#c2185b') }],
  ['extrude-green', N('wordart/extrude-green'), { '--font': DISPLAY, '--color': '#9dffb0', '--shadow': stack(10, 0.012, '#0f7a35') }],
  ['extrude-purple', N('wordart/extrude-purple'), { '--font': DISPLAY, '--color': '#e0c8ff', '--shadow': stack(10, 0.012, '#5b21b6') }],
  ['outline-neon', N('wordart/outline-neon'), { '--font': DISPLAY, '--color': 'transparent', '--stroke': '0.035em', '--stroke-color': '#19e3ff', '--glow': 'drop-shadow(0 0 0.12em #19e3ff)' }],
  ['outline-gold', N('wordart/outline-gold'), { '--font': DISPLAY, '--color': 'transparent', '--stroke': '0.035em', '--stroke-color': '#f2c14e' }],
  ['outline-pink', N('wordart/outline-pink'), { '--font': DISPLAY, '--color': 'transparent', '--stroke': '0.035em', '--stroke-color': '#ff4fa3', '--glow': 'drop-shadow(0 0 0.1em rgba(255,79,163,0.7))' }],
  ['double-outline', N('wordart/double-outline'), { '--font': DISPLAY, '--color': '#ffffff', '--glow': `${edge(0.03, '#111111')} ${edge(0.03, '#ffd400')} ${edge(0.03, '#111111')}` }],
  ['red-white-edge', N('wordart/red-white-edge'), { '--font': DISPLAY, '--color': '#e6192e', '--glow': `${edge(0.035, '#ffffff')} ${edge(0.03, '#111111')}` }],
  ['ember', N('wordart/ember'), { '--font': DISPLAY, '--color': '#ffb066', '--glow': 'drop-shadow(0 0 0.08em #ff6a00) drop-shadow(0 0 0.28em #c2410c)' }],
  ['frost', N('wordart/frost'), { '--font': DISPLAY, '--color': '#eaf9ff', '--glow': 'drop-shadow(0 0 0.08em #8fe3ff) drop-shadow(0 0 0.25em #3bb8f5)' }],
  ['plasma', N('wordart/plasma'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(90deg, #ff00cc, #7a00ff 40%, #00d0ff 80%)', '--glow': 'drop-shadow(0 0 0.14em rgba(160,60,255,0.7))' }],
  ['thermal', N('wordart/thermal'), { '--font': DISPLAY, '--color': 'transparent', '--fill': 'linear-gradient(90deg, #1a1aff, #00d5ff 25%, #3bff4d 45%, #fff200 65%, #ff6a00 85%, #ff0000)' }],
  ['mono-white', N('wordart/mono-white'), { '--weight': '700', '--color': '#ffffff' }],
  ['mono-black', N('wordart/mono-black'), { '--weight': '700', '--color': '#0b0b0b', '--glow': 'drop-shadow(0 0 0.08em rgba(255,255,255,0.6))' }],
  ['light-weight', N('wordart/light-weight'), { '--weight': '300', '--spacing': '0.05em' }],
  ['black-weight', N('wordart/black-weight'), { '--weight': '900', '--spacing': '-0.01em' }],
  ['spaced', N('wordart/spaced'), { '--weight': '600', '--spacing': '0.4em' }],
  ['italic-bold', N('wordart/italic-bold'), { '--weight': '800', '--italic': 'italic' }],
  ['italic-light', N('wordart/italic-light'), { '--weight': '300', '--italic': 'italic', '--spacing': '0.04em' }],
  ['serif-bold', N('wordart/serif-bold'), { '--font': SERIF, '--weight': '900' }],
  ['serif-gold', N('wordart/serif-gold'), { '--font': SERIF, '--weight': '800', '--color': '#f2c14e', '--shadow': '0 0.04em 0.12em rgba(0,0,0,0.7)' }],
];

/** Motions, in: how it comes; loop: how it moves while shown; out: how it goes (timed by the clip's length). */
const IN = [
  ['none', N('in/none')], ['fade', N('in/fade')], ['rise', N('in/rise')],
  ['drop', N('in/drop')], ['pop', N('in/pop')], ['zoom', N('in/zoom')],
  ['blur', N('in/blur')], ['slide-left', N('in/slide-left')],
  ['slide-right', N('in/slide-right')], ['wipe', N('in/wipe')],
  ['type', N('in/type')], ['stamp', N('in/stamp')],
  ['spin-in', N('in/spin-in')], ['flip-in', N('in/flip-in')], ['bounce-in', N('in/bounce-in')],
  ['elastic', N('in/elastic')], ['skew-in', N('in/skew-in')], ['swing-in', N('in/swing-in')], ['rubber', N('in/rubber')], ['light-speed', N('in/light-speed')], ['unfold', N('in/unfold')], ['expand', N('in/expand')], ['glitch-in', N('in/glitch-in')],
];
const LOOP = [
  ['none', N('loop/none')], ['float', N('loop/float')], ['pulse', N('loop/pulse')],
  ['wiggle', N('loop/wiggle')], ['shake', N('loop/shake')],
  ['breathe', N('loop/breathe')], ['swing', N('loop/swing')], ['flicker', N('loop/flicker')],
  ['glow', N('loop/glow')], ['jelly', N('loop/jelly')], ['heartbeat', N('loop/heartbeat')], ['tilt', N('loop/tilt')], ['jitter', N('loop/jitter')], ['hue', N('loop/hue')],
];
const OUT = [
  ['none', N('out/none')], ['fade-out', N('out/fade-out')], ['sink', N('out/sink')],
  ['lift', N('out/lift')], ['shrink', N('out/shrink')], ['blur-out', N('out/blur-out')],
  ['wipe-out', N('out/wipe-out')], ['zoom-out', N('out/zoom-out')],
  ['drop-out', N('out/drop-out')], ['slide-out-left', N('out/slide-out-left')], ['slide-out-right', N('out/slide-out-right')], ['spin-out', N('out/spin-out')], ['flip-out', N('out/flip-out')], ['expand-out', N('out/expand-out')], ['glitch-out', N('out/glitch-out')],
];

const items = [];
/* the text itself: the default line */
/* a line of words is a wide box of its own when put in (UI lib/library libraryBox), not the whole picture */
const LINE = { w: 1600, h: 260, fit: 0.14 };
items.push({ id: 'text/text', cat: 'text', group: 'basic', name: N('text'), kind: 'page', durationMs: 3000, src: 'text.html', ...LINE });
for (const [slug, name, vars, shape] of BASIC) items.push({ id: `text/looks/${slug}`, cat: 'text', group: 'basic', name, kind: 'textstyle', vars, ...LINE, ...shape });
for (const [slug, name, vars] of WORDART) items.push({ id: `text/looks/${slug}`, cat: 'text', group: 'wordart', name, kind: 'textstyle', vars });
for (const [slug, name] of IN) items.push({ id: `text/motions/in-${slug}`, cat: 'text', group: 'in', name, kind: 'textmotion', vars: { '--in': slug, '--in-time': slug === 'type' ? '1.2s' : '0.6s' } });
for (const [slug, name] of LOOP) items.push({ id: `text/motions/loop-${slug}`, cat: 'text', group: 'loop', name, kind: 'textmotion', vars: { '--loop': slug } });
for (const [slug, name] of OUT) items.push({ id: `text/motions/out-${slug}`, cat: 'text', group: 'out', name, kind: 'textmotion', vars: { '--out': slug, '--out-time': '0.5s' } });

/* what each says about itself, so a search finds it by meaning */
for (const item of items) Object.assign(item, describeText(item));

/* the text page's own bundle, as Saved keeps one: its clip, three seconds, its properties offered */
const props = [
  { name: 'Text', type: 'text', at: '.t' }, { name: 'Color', type: 'var', var: '--color' }, { name: 'Size', type: 'var', var: '--size' },
  { name: 'Font', type: 'var', var: '--font' }, { name: 'Length', type: 'var', var: '--clip-length' },
];
writeFileSync(join(LIB, 'text', 'text', 'saved.json'), `${JSON.stringify({ version: 2, kind: 'clip', clip: { src: 'text.html', time: [0, 3], attrs: { 'data-props': JSON.stringify(props) } }, durationMs: 3000 }, null, 2)}\n`);

/* into the index: these groups first among the text's, these things first, the rest as they were */
const index = JSON.parse(readFileSync(join(LIB, 'index.json'), 'utf8'));
const mine = new Set(items.map((i) => i.id));
const ourGroups = new Set(GROUPS.map((g) => g.id));
index.groups.text = [...GROUPS, ...(index.groups.text ?? []).filter((g) => !ourGroups.has(g.id))];
const firstText = index.items.findIndex((i) => i.cat === 'text');
const rest = index.items.filter((i) => !mine.has(i.id));
const at = firstText < 0 ? rest.length : rest.findIndex((i) => i.cat === 'text');
index.items = [...rest.slice(0, at < 0 ? rest.length : at), ...items, ...rest.slice(at < 0 ? rest.length : at)];
writeFileSync(join(LIB, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
console.log(`${items.length} text things in library/index.json`);

if (!process.argv.includes('--no-pictures')) {
  /* what each one shows: the words "Aa 字" (both scripts), its look or motion on them, on a plain ground */
  const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const item of items) {
    if (asked.length && !asked.includes(item.id)) continue;
    const dir = join(LIB, item.id);
    const work = mkdtempSync(join(tmpdir(), 'lopesfilm-text-'));
    mkdirSync(dir, { recursive: true });
    try {
      cpSync(join(LIB, 'text', 'text', 'files'), join(work, 'item'), { recursive: true });
      writeFileSync(join(work, 'ground.html'), GROUND);
      const motion = item.kind === 'textmotion';
      const vars = { ...(item.vars ?? {}), '--clip-length': '2s', ...(motion ? {} : { '--in': 'none' }) };
      /* in the box it is put in with (a basic line's own, else a line's), larger so it reads in a small card: the
         basic lines as they are to each other, looks and motions alike */
      const shape = { ...LINE, ...(item.group === 'basic' ? { fit: (item.fit ?? LINE.fit) * 1.5, low: item.low } : { fit: 0.3 }) };
      let bh = Math.round(H * shape.fit);
      let bw = Math.round(bh * (shape.w / shape.h));
      if (bw > W * 0.9) { bw = Math.round(W * 0.9); bh = Math.round(bw * (shape.h / shape.w)); }
      const by = shape.low ? Math.round(H * 0.84 - bh / 2) : Math.round((H - bh) / 2);
      const place = `left: ${Math.round((W - bw) / 2)}px; top: ${by}px; width: ${bw}px; height: ${bh}px`;
      const overrides = JSON.stringify([{ at: ':root', style: vars }, { at: '.t', text: 'Aa 字' }]).replaceAll("'", '&#39;');
      writeFileSync(join(work, 'film.html'), `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=${W}, height=${H}">\n</head>\n<body>\n<section>\n  <iframe src="item/text.html#t=0,2" size="${bw}x${bh}" style="${place}" overrides='${overrides}'></iframe>\n</section>\n<section>\n  <iframe src="ground.html#t=0,2"></iframe>\n</section>\n</body>\n</html>\n`);
      const out = join(work, 'out.mp4');
      await render([work, '0-2'], { out, fps: 30, quiet: true });
      ffmpeg('-i', out, '-vf', 'scale=320:180', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', join(dir, 'preview.mp4'));
      /* a motion in at its middle, out near its end; a look when it is still */
      const posterAt = item.group === 'in' ? 0.3 : item.group === 'out' ? 1.75 : 1;
      ffmpeg('-ss', String(posterAt), '-i', out, '-frames:v', '1', '-vf', 'scale=320:180', '-q:v', '5', join(dir, 'poster.jpg'));
      console.log(`→ library/${item.id}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  await closeBrowsers();
}
