// Builds src/compat/built: the React / Remotion / adapter modules a film page loads from `__film/compat/` (an import map
// names them 'react', 'remotion' …), and compat.js, the same in one script with globals. Run after a change in src/compat.
//   node scripts/build-compat.mjs
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const pkg = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(pkg, 'package.json'));
const esbuild = await import(pathToFileURL(require.resolve('esbuild', { paths: [require.resolve('vite')] })).href);
const src = join(pkg, 'src/compat');
const out = join(src, 'built');
const tmp = join(pkg, 'node_modules/.compat-entries');
rmSync(out, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

/* a CommonJS package (react) re-exported by name, so `import { useState } from 'react'` works in a browser */
const named = (spec, from) => {
  const keys = Object.keys(require(spec)).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
  return `import * as M from ${JSON.stringify(spec)};\nexport default M;\n${keys.map((k) => `export const ${k} = M.${k};`).join('\n')}\n`;
};
const entries = {
  react: named('react'),
  'react-dom': named('react-dom'),
  'react-dom-client': named('react-dom/client'),
  'jsx-runtime': named('react/jsx-runtime'),
  'jsx-dev-runtime': named('react/jsx-dev-runtime'),
};
for (const [name, code] of Object.entries(entries)) writeFileSync(join(tmp, `${name}.mjs`), code);
/* @remotion/* packages: each a file named remotion-<package>[-<subpath>] (src/code-modules.mjs names them so) */
const packages = {
  'remotion-transitions': 'transitions.mjs', 'remotion-shapes': 'shapes.mjs', 'remotion-paths': 'paths.mjs', 'remotion-noise': 'noise.mjs',
  'remotion-media-utils': 'media-utils.mjs', 'remotion-layout-utils': 'layout-utils.mjs', 'remotion-animation-utils': 'animation-utils.mjs',
  'remotion-captions': 'captions.mjs', 'remotion-preload': 'preload.mjs', 'remotion-motion-blur': 'motion-blur.mjs', 'remotion-lottie': 'lottie.mjs', 'remotion-gif': 'gif.mjs',
};
const presentations = { fade: 'fade', slide: 'slide', wipe: 'wipe', flip: 'flip', 'clock-wipe': 'clockWipe', iris: 'iris', none: 'none' };
for (const [sub, fn] of Object.entries(presentations)) {
  writeFileSync(join(tmp, `remotion-transitions-${sub}.mjs`), `export { ${fn} } from ${JSON.stringify(join(src, 'transitions-presentations.mjs'))};\n`);
  packages[`remotion-transitions-${sub}`] = null;
}
const common = { bundle: true, minify: true, legalComments: 'none', target: 'chrome110', define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: [join(pkg, 'node_modules')] };
await esbuild.build({
  ...common, format: 'esm', splitting: true, outdir: out, outExtension: { '.js': '.mjs' }, chunkNames: 'chunk-[hash]',
  entryPoints: { ...Object.fromEntries(Object.keys(entries).map((n) => [n, join(tmp, `${n}.mjs`)])), remotion: join(src, 'remotion.mjs'), 'film-compat': join(src, 'film.mjs'),
    ...Object.fromEntries(Object.entries(packages).map(([n, f]) => [n, f ? join(src, f) : join(tmp, `${n}.mjs`)])) },
});
await esbuild.build({ ...common, format: 'iife', outfile: join(out, 'compat.js'), entryPoints: [join(src, 'global.mjs')] });
rmSync(tmp, { recursive: true, force: true });
console.log('compat built');
