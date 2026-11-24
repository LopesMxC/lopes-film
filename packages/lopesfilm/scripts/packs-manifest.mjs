#!/usr/bin/env node
/** (O pack "ui" - Kenney Interface Sounds + UI Audio, Calinou/kenney-interface-sounds e kenney-ui-audio - foi acrescentado ao JSON por script avulso; ao reconstruir, repita-o.) Rebuild studio/server/packs-manifest.json from local clones of the pinned upstream repos: node scripts/packs-manifest.mjs <sfx-kit> <particles> <montserrat> <bebas>
 * Each file keeps its raw.githubusercontent address at the pinned commit, its size and its sha256. Reads files only. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [sfx, particles, mont, bebas] = process.argv.slice(2);
if (!bebas) throw new Error('usage: packs-manifest.mjs <sfx-kit> <kenney-particle-pack> <Montserrat> <Bebas-Neue>');
const head = (d) => execFileSync('git', ['-C', d, 'rev-parse', 'HEAD']).toString().trim();
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const posix = (p) => p.split(sep).join('/');
const entry = (repo, root, commit, file, to) => {
  const buf = readFileSync(file);
  return { url: `https://raw.githubusercontent.com/${repo}/${commit}/${posix(relative(root, file)).split('/').map(encodeURIComponent).join('/')}`, to, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
};
const pack = (id, kind, name, license, by, source, files) => ({ id, kind, name, license, by, source, files, bytes: files.reduce((n, f) => n + f.bytes, 0) });
const take = (repo, root, filter, dir = (p) => p) => { const c = head(root); return walk(root).filter((f) => filter(posix(relative(root, f)))).sort().map((f) => entry(repo, root, c, f, dir(posix(relative(root, f))))); };

const out = { version: 1, packs: [
  pack('sfx', 'sfx', 'SFX Kit', 'CC0 1.0', 'Wyzowl', 'https://github.com/wyzowl/sfx-kit',
    take('wyzowl/sfx-kit', sfx, (p) => p.startsWith('sounds/') && p.endsWith('.wav') || p === 'LICENSE' || p === 'catalogue.md')),
  pack('vfx', 'vfx', 'Kenney Particle Pack', 'CC0 1.0', 'Kenney', 'https://kenney.nl/assets/particle-pack',
    take('Calinou/kenney-particle-pack', particles, (p) => /^addons\/.*\.png$/.test(p) || p === 'LICENSE.txt', (p) => p.replace(/^addons\/[^/]+\//, ''))),
  pack('fonts', 'fonts', 'Montserrat · Bebas Neue', 'SIL OFL 1.1', 'Julieta Ulanovsky · Dhamra Type', 'https://fonts.google.com',
    [
      ...take('JulietaUla/Montserrat', mont, (p) => /^fonts\/ttf\/Montserrat-(Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)(Italic)?\.ttf$/.test(p) || p === 'OFL.txt', (p) => `Montserrat/${p.split('/').pop()}`),
      ...take('dharmatype/Bebas-Neue', bebas, (p) => p.endsWith('BebasNeue-Regular.ttf') || p === 'OFL.txt', (p) => `Bebas Neue/${p.split('/').pop()}`),
    ]),
] };
writeFileSync(new URL('../studio/server/packs-manifest.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
for (const p of out.packs) console.log(p.id, p.files.length, 'files', (p.bytes / 1e6).toFixed(1), 'MB');
