/**
 * Which Lopes.Film this process is. Two apps, each with its own name, bundle id, data folder and Studio home, so the
 * one run from this repository never shares a window, a lock or a Studio with the installed one. Projects are the
 * person's, so every app but the bench shares one library: the one ~/.lopesfilm says (`sharedHome`; by default
 * ~/Movies/Lopes.Film/Projects, or LOPESFILM_LIBRARY):
 *
 *   · release — the packaged app. Its Studio is the machine's Studio (~/.lopesfilm), the one `lopesfilm open` finds.
 *   · preview — a packaged app built with `release --preview`, "Lopes.Film Preview", to try a build in: its own data
 *               folder, Studio home and port, so it never meets an installed Lopes.Film (its package says so:
 *               `lopesfilmFlavor`).
 *   · dev     — `pnpm --filter @lopesfilm/desktop start`: this repository's code, with its own Studio home.
 *   · bench   — `node bench/run.mjs`: this repository's code, everything (data, Studio home, projects) in the throwaway
 *               folder the benchmark names in LOPESFILM_BENCH_DIR, so a run never touches a person's dev or installed app.
 *
 * Reads no Electron module, so `node --test` can use it.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packaged = Boolean(process.versions.electron) && !process.defaultApp;

export const FLAVORS = Object.freeze({
  release: { productName: 'Lopes.Film', bundleId: 'dev.lopesfilm.desktop', studioPort: 4747, studioHome: null, library: null, sharedHome: null },
  preview: {
    productName: 'Lopes.Film Preview', bundleId: 'dev.lopesfilm.desktop.preview', studioPort: 4777,
    studioHome: join(homedir(), '.lopesfilm-preview'), library: null, sharedHome: join(homedir(), '.lopesfilm'),
  },
  dev: {
    productName: 'Lopes.Film Dev', bundleId: 'dev.lopesfilm.desktop.dev', studioPort: 4757,
    studioHome: join(homedir(), '.lopesfilm-dev'), library: null, sharedHome: join(homedir(), '.lopesfilm'),
  },
});

const benchDir = process.env.LOPESFILM_BENCH_DIR ?? '';
const BENCH = Object.freeze({
  productName: 'Lopes.Film Bench', bundleId: 'dev.lopesfilm.desktop.bench', studioPort: 4767,
  studioHome: join(benchDir, 'home'), library: join(benchDir, 'projects'), sharedHome: null, userData: join(benchDir, 'data'),
});

function builtPackage() {
  try {
    return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
  } catch { return {}; }
}

/** What the app's package says it was built as (`release --preview` writes `lopesfilmFlavor`). */
function builtFlavor() {
  return builtPackage().lopesfilmFlavor ?? null;
}

/**
 * The brand a packaged app was built as (`release --brand=global|lopes` writes `appBrand`: name, appId, folders,
 * port; brands/). Lopes.Film itself needs none: it is what FLAVORS.release already is. Each brand has its own data
 * folder, Studio home, port and projects folder, so the three can be installed side by side.
 */
function releaseIdentity(isPackaged) {
  const brand = isPackaged ? builtPackage().appBrand : null;
  if (!brand || brand.id === 'lopes') return FLAVORS.release;
  return {
    productName: brand.name, bundleId: brand.appId, studioPort: brand.studioPort, studioHome: null, homeDir: brand.homeDir,
    library: join(homedir(), process.platform === 'darwin' ? 'Movies' : 'Videos', brand.libraryDir, 'Projects'), sharedHome: null,
  };
}

export function flavorName(env = process.env, isPackaged = packaged, built = isPackaged ? builtFlavor() : null) {
  if (isPackaged) return built === 'preview' ? 'preview' : 'release';
  if (env.LOPESFILM_DESKTOP_FLAVOR === 'dev') return 'dev';
  if (env.LOPESFILM_DESKTOP_FLAVOR === 'bench' && env.LOPESFILM_BENCH_DIR) return 'bench';
  return 'release';
}

export const FLAVOR = flavorName();
export const IDENTITY = FLAVOR === 'bench' ? BENCH : FLAVOR === 'release' ? releaseIdentity(packaged) : FLAVORS[FLAVOR];
export const PRODUCT_NAME = IDENTITY.productName;
