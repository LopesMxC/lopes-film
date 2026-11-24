// A page's code in the languages a browser does not read: TSX, JSX and TypeScript are translated as they are asked for
// (sucrase, vendored beside this file), and what a project imports is made to resolve: React, Remotion and `@remotion/*`
// to the compat layer, `./Title` to Title.tsx, a `.css`, `.json` or picture to a module that gives it. So a project
// written for Remotion (or plain React) runs here as it is, with nothing compiled outside.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, posix } from 'node:path';
import { transform } from './compat/vendor/sucrase.mjs';

const CODE = new Set(['.tsx', '.ts', '.jsx', '.mts', '.cts']);
const PLAIN = new Set(['.js', '.mjs']);
const TRY = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts'];
const ASSET = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.webm', '.mov', '.woff', '.woff2', '.ttf', '.otf', '.glb', '.gltf', '.wasm', '.lottie', '.txt', '.srt', '.vtt', '.glsl']);
/** What names the compat layer's modules: react, remotion, and `@remotion/x/y` as `remotion-x-y`. */
const REACT = { react: 'react', 'react-dom': 'react-dom', 'react-dom/client': 'react-dom-client', 'react/jsx-runtime': 'jsx-runtime', 'react/jsx-dev-runtime': 'jsx-dev-runtime', remotion: 'remotion', 'film-compat': 'film-compat' };
/** The @remotion packages the layer has (and the subpaths of transitions): the names an import map gives a page. */
const REMOTION = { transitions: ['', 'fade', 'slide', 'wipe', 'flip', 'clock-wipe', 'iris', 'none'], shapes: [''], paths: [''], noise: [''], 'media-utils': [''],
  'layout-utils': [''], 'animation-utils': [''], captions: [''], preload: [''], 'motion-blur': [''], lottie: [''], gif: [''] };

const SPEC = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"'\n]+)\2/g;

/** Is this file one the host translates? A `.js` only when it imports React or Remotion (it may hold JSX). */
export function isCodeFile(file) {
  const ext = extname(file).toLowerCase();
  return CODE.has(ext) || PLAIN.has(ext);
}
export function wantsTranslation(file, source) {
  const ext = extname(file).toLowerCase();
  if (CODE.has(ext)) return true;
  return PLAIN.has(ext) && source.length < 600_000 && /(?:from|import)\s*\(?\s*["'](?:react|react-dom|remotion|@remotion\/|film-compat)/.test(source);
}

const exists = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const dirExists = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Which file `spec` (relative, from `dir`) is: as written, with an extension tried, a folder's index, or `.js` for `.ts`. */
export function resolveRelative(dir, spec) {
  const base = join(dir, spec);
  if (exists(base)) return base;
  const stem = base.replace(/\.(?:m?js|jsx)$/, '');
  for (const s of stem === base ? [base] : [stem, base]) for (const e of TRY) if (exists(s + e)) return s + e;
  if (dirExists(base)) for (const e of TRY) if (exists(join(base, `index${e}`))) return join(base, `index${e}`);
  return null;
}

/** The compat module's file name for a bare import, or null when it is not one of the layer's. */
export function compatModule(spec) {
  if (REACT[spec]) return `${REACT[spec]}.mjs`;
  const m = /^@remotion\/([\w-]+)(?:\/([\w./-]+))?$/.exec(spec);
  if (m) return `remotion-${[m[1], ...(m[2] ? m[2].split('/') : [])].join('-')}.mjs`;
  return null;
}

/**
 * The code of `file` as a browser reads it. `up` is the way from the file to the folder's root (`../..`), where
 * `__film/compat/` is, so every page and module names the same copy of React.
 * @param {{ source: string, file: string, root: string, up: string }} o
 * @returns {{ code: string } | { error: string }}
 */
export function translate({ source, file, root, up }) {
  const ext = extname(file).toLowerCase();
  const transforms = ext === '.tsx' ? ['typescript', 'jsx'] : ext === '.jsx' || PLAIN.has(ext) ? ['jsx'] : ['typescript'];
  let code;
  try {
    code = transform(source, { transforms, jsxRuntime: 'automatic', production: true, disableESTransforms: true, filePath: file }).code;
  } catch (e) {
    return { error: `${file}: ${/** @type {Error} */ (e).message}` };
  }
  const dir = dirname(file);
  return {
    code: code.replace(SPEC, (all, lead, q, spec) => {
      const to = rewrite(spec, { dir, root, up });
      return to === null ? all : `${lead}${q}${to}${q}`;
    }),
  };
}

/**
 * GSAP and all its plugins, served from Studio's own copy (src/compat/vendor/gsap): `gsap`, `gsap/all`, `gsap/SplitText`,
 * `gsap/dist/…` name the same ES modules, so a page animates with no network. Null for another name.
 * @param {string} spec
 */
export function gsapModule(spec) {
  if (spec === 'gsap' || spec === 'gsap/index' || spec === 'gsap/index.js') return 'index.js';
  const m = /^gsap\/(?:dist\/|esm\/)?([A-Za-z][\w-]*)(?:\.min)?(?:\.js)?$/.exec(spec);
  if (!m) return null;
  const name = m[1] === 'gsap-core' || m[1] === 'all' || /^[A-Z]/.test(m[1]) ? m[1] : null;
  return name && GSAP_FILES.has(`${name}.js`) ? `${name}.js` : null;
}
const GSAP_FILES = new Set((() => { try { return readdirSync(fileURLToPath(new URL('./compat/vendor/gsap/esm/', import.meta.url))); } catch { return []; } })());

/** What an import says, once it resolves here (null: leave it). */
function rewrite(spec, { dir, root, up }) {
  const gsapFile = gsapModule(spec);
  if (gsapFile) return `${up}/__film/gsap/esm/${gsapFile}`;
  const mapped = compatModule(spec);
  if (mapped) return `${up}/__film/compat/${mapped}`;
  if (/^(?:https?:|data:|blob:|\/)/.test(spec)) return null;
  if (spec.startsWith('.')) {
    const [path, tail = ''] = spec.split(/(?=[?#])/);
    const ext = extname(path).toLowerCase();
    let found = null;
    if (ext === '.css' || ext === '.json' || ASSET.has(ext)) found = exists(join(dir, path)) ? join(dir, path) : null;
    else found = resolveRelative(dir, path);
    if (!found) return null;
    const rel = posix.relative(dir.split('\\').join('/'), found.split('\\').join('/'));
    const out = rel.startsWith('.') ? rel : `./${rel}`;
    const fe = extname(found).toLowerCase();
    const as = fe === '.css' ? 'css' : fe === '.json' ? 'json' : ASSET.has(fe) ? 'url' : '';
    return as ? `${out}${tail ? `${tail}&` : '?'}film=${as}` : `${out}${tail}`;
  }
  /* a package the project carries: assets/vendor/<name>.module.js and the like */
  const bare = /^[\w@][\w@/.-]*$/.test(spec) ? spec.replace(/^@/, '').replace(/\//g, '-') : null;
  if (bare) for (const f of [`${bare}.module.js`, `${bare}.module.min.js`, `${bare}.mjs`, `${bare}.esm.js`, `${bare}.js`]) {
    const p = join(root, 'assets', 'vendor', f);
    if (exists(p)) return `${up}/assets/vendor/${f}`;
  }
  return null;
}

/** A `.css`, `.json` or picture imported as a module: the stylesheet is put in the page, the data and the address returned. */
export function assetModule(file, kind, name) {
  if (kind === 'css') {
    const css = readFileSync(file, 'utf8');
    return `const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.append(s);export default s.textContent;`;
  }
  if (kind === 'json') {
    let data;
    try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return `throw new Error(${JSON.stringify(`${name}: not JSON (${/** @type {Error} */ (e).message})`)});`; }
    const keys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k)) : [];
    return `const d=${JSON.stringify(data)};export default d;${keys.map((k) => `export const ${k}=d[${JSON.stringify(k)}];`).join('')}`;
  }
  return `export default new URL(${JSON.stringify(`./${name}`)}, import.meta.url).href;`;
}

/**
 * A Google font as `@remotion/google-fonts/<Name>`: `loadFont()` links the film's copy of its stylesheet (the host fetches it
 * once and keeps it) and holds the frame until the font is ready; with no network the first time, the page goes on with
 * a fallback font. `slug` is the file's name (`remotion-google-fonts-Open_Sans`); `up` the way to the folder's root.
 */
export function googleFontModule(slug) {
  const family = slug.replace(/^remotion-google-fonts-/i, '').replace(/_/g, ' ').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z\d])([A-Z])/g, '$1 $2');
  return `import{delayRender,continueRender}from'./remotion.mjs';
export const fontFamily=${JSON.stringify(family)};
const css=new URL(${JSON.stringify(`../gfont/${encodeURIComponent(family)}.css`)},import.meta.url).href;
export const loadFont=(_style,options={})=>{
  if(!document.querySelector('link[data-gfont="'+fontFamily+'"]')){
    const l=document.createElement('link');l.rel='stylesheet';l.href=css;l.dataset.gfont=fontFamily;
    const hold=delayRender('font '+fontFamily);
    const done=()=>{(document.fonts?document.fonts.load('16px "'+fontFamily+'"'):Promise.resolve()).catch(()=>{}).finally(()=>continueRender(hold))};
    l.onload=done;l.onerror=()=>continueRender(hold);
    document.head.append(l);
  }
  return{fontFamily,fonts:{},unicodeRanges:{},waitUntilDone:()=>document.fonts?.ready??Promise.resolve()};
};
export default{fontFamily,loadFont};
`;
}

/** The script that gives a page the layer's names (an import map) when it has none and speaks of React or Remotion. */
export function importMapFor(html, up) {
  if (/type\s*=\s*["']importmap["']/i.test(html)) return '';
  if (!/\b(?:remotion|react|film-compat|gsap)\b|\.(?:tsx|jsx|ts)\b|text\/(?:tsx|jsx)/.test(html)) return '';
  const imports = {};
  /* `import { gsap } from 'gsap'` and every plugin, from Studio's own copy */
  imports.gsap = `${up}/__film/gsap/esm/index.js`;
  for (const f of GSAP_FILES) if (f.endsWith('.js')) { imports[`gsap/${f.slice(0, -3)}`] = `${up}/__film/gsap/esm/${f}`; imports[`gsap/dist/${f.slice(0, -3)}`] = `${up}/__film/gsap/esm/${f}`; }
  for (const [spec, name] of Object.entries(REACT)) imports[spec] = `${up}/__film/compat/${name}.mjs`;
  for (const [pkg, subs] of Object.entries(REMOTION)) for (const sub of subs) imports[`@remotion/${pkg}${sub ? `/${sub}` : ''}`] = `${up}/__film/compat/remotion-${pkg}${sub ? `-${sub}` : ''}.mjs`;
  return `<script type="importmap">${JSON.stringify({ imports })}</script>`;
}

/** `<script type="text/tsx">…</script>` (or `text/jsx`, `text/ts`, with or without `src`): translated into a module script. */
export function inlineScripts(html, { file, root, up }) {
  return html.replace(/<script\b([^>]*?)\btype\s*=\s*["']text\/(tsx|jsx|ts|typescript)["']([^>]*)>([\s\S]*?)<\/script>/gi, (all, a, kind, b, body) => {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/.exec(`${a} ${b}`);
    if (src) return `<script type="module" ${`${a} ${b}`.replace(/\s*type\s*=\s*["'][^"']*["']/, '')}></script>`;
    const out = translate({ source: body, file: file.replace(/\.html?$/i, kind === 'jsx' ? '.jsx' : kind === 'tsx' ? '.tsx' : '.ts'), root, up });
    if ('error' in out) return `<script type="module">throw new Error(${JSON.stringify(out.error)})</script>`;
    return `<script type="module">${out.code}</script>`;
  });
}

/** The compat file for an `@remotion/*` name that is not built: it says so, where the project's code can read it. */
export function missingModule(name) {
  return `throw new Error(${JSON.stringify(`The Remotion package behind "${name}" is not in Lopes.Film's layer yet. React and the Remotion core (Sequence, interpolate, spring …) are; build what that package gives with them, or tell Lopes.`)});`;
}

