/**
 * Os nomes internos de uma marca. O código-fonte é o da Lopes.Film (lopesfilm); GlobalFilm e VerkzFilm são montadas
 * a partir dele: no app montado (a pasta `stage` do release), tudo que se chama lopesfilm passa a se chamar
 * globalfilm ou verkzfilm: o comando, as variáveis LOPESFILM_*, o pacote, as pastas, os arquivos e as chaves
 * guardadas. A Lopes.Film, o código como está, não precisa disso.
 *
 *   lopesfilm → <internal>   LOPESFILM → <INTERNAL>   Lopesfilm → <Internal>   LopesFilm → <InternalPascal>
 *   Lopes.Film (o nome, em textos) → o nome da marca
 *
 * Ficam como estão: endereços (https://…), `openfilm/verkzfilm` e `verkzfilm.dev`, que são lugares que existem.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEXT = /\.(mjs|js|cjs|json|html|css|md|txt|ts|tsx|mts|yml|yaml|svg|sh|cmd|bat|plist|nsh)$/i;
const KEEP = /https?:\/\/[^\s"'`<>)\]\\${}]+|openfilm\/verkzfilm|verkzfilm\.dev/g;
const pascalOf = (internal) => internal.charAt(0).toUpperCase() + internal.slice(1, -4) + 'Film';

/** @param {string} text @param {{ internal: string, name: string }} brand */
export function rebrandText(text, brand) {
  const lower = brand.internal;
  const edit = (part) => part
    .replaceAll('Lopes.Film', brand.name)
    .replaceAll('LOPESFILM', lower.toUpperCase())
    .replaceAll('Lopesfilm', lower.charAt(0).toUpperCase() + lower.slice(1))
    .replaceAll('LopesFilm', pascalOf(lower))
    .replaceAll('lopesfilm', lower);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(KEEP)) {
    out += edit(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + edit(text.slice(last));
}

const rename = (name, brand) => name.replaceAll('lopesfilm', brand.internal).replaceAll('LopesFilm', brand.internal).replaceAll('Lopesfilm', brand.internal);

/** Rewrites the text files of `root` and renames its files and folders. Returns how many files changed. */
function walk(root, brand) {
  let changed = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) changed += walk(path, brand);
    else if (TEXT.test(entry.name)) {
      const before = readFileSync(path, 'utf8');
      const after = rebrandText(before, brand);
      if (after !== before) { writeFileSync(path, after); changed++; }
    }
    if (/lopesfilm/i.test(entry.name)) renameSync(path, join(root, rename(entry.name, brand)));
  }
  return changed;
}

/** The app's stage: its own files, its package, and the package's folder in node_modules. */
export function rebrandStage(stage, brand) {
  if (brand.internal === 'lopesfilm') return 0;
  let changed = 0;
  for (const rel of ['src', 'shell', 'build']) if (existsSync(join(stage, rel))) changed += walk(join(stage, rel), brand);
  const own = join(stage, 'package.json');
  writeFileSync(own, rebrandText(readFileSync(own, 'utf8'), brand));
  for (const rel of ['lopesfilm', '@lopesfilm']) {
    const dir = join(stage, 'node_modules', rel);
    if (existsSync(dir) && statSync(dir).isDirectory()) { changed += walk(dir, brand); renameSync(dir, join(stage, 'node_modules', rename(rel, brand))); }
  }
  const lock = join(stage, 'node_modules', '.package-lock.json');
  if (existsSync(lock)) writeFileSync(lock, rebrandText(readFileSync(lock, 'utf8'), brand));
  return changed;
}
