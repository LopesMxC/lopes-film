/**
 * A brand's data folder (.lopesfilm, .globalfilm, .verkzfilm) starts empty, so the services the person had connected in
 * another one (their keys in providers.json, sealed with that folder's `key`) look "not connected" until they are set
 * up again. On the first start of a folder with no providers.json, the services and settings of the most recently used
 * sibling folder are copied in: key and providers.json always together (the key opens the file), the settings and the
 * library only where this folder has none. Nothing in the other folder is changed.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const LEGACY_HOMES = Object.freeze(['.lopesfilm', '.verkzfilm', '.globalfilm', '.openfilm']);

/** @returns {string[]} what was copied (empty when there was nothing to do) */
export function migrateLegacyHome(own, { siblings, home }) {
  if (existsSync(join(own, 'providers.json'))) return [];
  const sources = (siblings ?? LEGACY_HOMES.map((name) => join(home, name)))
    .filter((dir) => dir !== own && existsSync(join(dir, 'providers.json')) && existsSync(join(dir, 'key')))
    .sort((a, b) => statSync(join(b, 'providers.json')).mtimeMs - statSync(join(a, 'providers.json')).mtimeMs);
  const from = sources[0];
  if (!from) return [];
  const done = [];
  try {
    mkdirSync(own, { recursive: true });
    for (const name of ['key', 'providers.json']) { copyFileSync(join(from, name), join(own, name)); done.push(name); }
    for (const name of ['studio.json', 'prefs.json']) {
      if (existsSync(join(from, name))) { copyFileSync(join(from, name), join(own, name)); done.push(name); }
    }
    if (existsSync(join(from, 'library')) && !existsSync(join(own, 'library'))) { cpSync(join(from, 'library'), join(own, 'library'), { recursive: true }); done.push('library'); }
  } catch { /* what was copied stays; the rest is set up again by hand */ }
  return done;
}

/**
 * The providers every copy of the app starts with (the file shipped as build/providers.seed.json): written when the
 * folder has no providers.json, else only what it lacks is added (a key or a choice it has stays as it is). The keys in
 * it travel with the app, so anyone who has the installer has them.
 * @returns {boolean} whether the file changed
 */
export function seedProviders(own, seedFile) {
  if (!existsSync(seedFile)) return false;
  const target = join(own, 'providers.json');
  try {
    mkdirSync(own, { recursive: true });
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    if (!existsSync(target)) { writeFileSync(target, `${JSON.stringify(seed, null, 2)}\n`, { mode: 0o600 }); return true; }
    const have = JSON.parse(readFileSync(target, 'utf8'));
    let changed = false;
    for (const part of ['keys', 'use']) {
      have[part] = have[part] && typeof have[part] === 'object' ? have[part] : {};
      for (const [k, v] of Object.entries(seed[part] ?? {})) if (!(k in have[part]) || (part === 'keys' && have[part][k] === '' && v !== '')) { have[part][k] = v; changed = true; }
    }
    if (changed) writeFileSync(target, `${JSON.stringify(have, null, 2)}\n`, { mode: 0o600 });
    return changed;
  } catch { return false; }
}
