#!/usr/bin/env node
/** Add the OpenGameArt 3D packs (CC0, checked on each page) to studio/server/packs-manifest.json from scripts/packs-oga-list.json
 * (slug, url, bytes, sha256 of each downloaded zip): node scripts/packs-oga.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
const mf = new URL('../studio/server/packs-manifest.json', import.meta.url);
const m = JSON.parse(readFileSync(mf, 'utf8'));
const list = JSON.parse(readFileSync(new URL('./packs-oga-list.json', import.meta.url), 'utf8'));
const KITS = new Set(['castle-kit', 'fantasy-town-kit', 'food-kit', 'furniture-kit', 'graveyard-kit', 'nature-kit', 'pirate-kit', 'racing-kit', 'space-kit']);
const entry = (x, i, of) => {
  const name = decodeURIComponent(x.url.split('/').pop()).replace(/\.zip$/i, '').replace(/[^\w.-]+/g, '_');
  const n = of.filter((y) => y.slug === x.slug).length > 1 ? `-${name}` : '';
  return { url: x.url, to: `${x.slug}${n}.zip`, bytes: x.bytes, sha256: x.sha256, unzip: true, page: `https://opengameart.org/content/${x.slug}` };
};
const pack = (id, name, by, files) => ({ id, kind: 'models3d', name, license: 'CC0 1.0', by, source: 'https://opengameart.org', files, bytes: files.reduce((n, f) => n + f.bytes, 0) });
const kits = list.filter((x) => KITS.has(x.slug)), more = list.filter((x) => !KITS.has(x.slug));
m.packs = m.packs.filter((p) => p.kind !== 'models3d');
m.packs.push(pack('models3d-kits', '3D Kits (Kenney)', 'Kenney', kits.map(entry)), pack('models3d-more', '3D Models (OpenGameArt)', 'Various CC0 authors', more.map(entry)));
writeFileSync(mf, `${JSON.stringify(m, null, 1)}\n`);
console.log(kits.length, more.length);
