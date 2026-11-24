/**
 * As marcas do programa: Lopes.Film, GlobalFilm e Lopes.Film. O código-fonte é o da Lopes.Film (a principal); GlobalFilm e VerkzFilm são variações dele. Cada marca é uma pasta aqui
 * (brand.json: nome, logo, cores, appId, pasta de dados; icon.*: ícones do instalador e do .exe).
 * Escolhida por LOPESFILM_BRAND (lopes, global ou verkz; padrão lopes) ou por `release --brand=<id>`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRANDS_DIR = dirname(fileURLToPath(import.meta.url));
export const BRAND_IDS = ['lopes', 'global', 'verkz'];

export function loadBrand(id = process.env.LOPESFILM_BRAND || 'lopes') {
  const key = String(id).trim().toLowerCase();
  if (!BRAND_IDS.includes(key)) throw new Error(`Marca desconhecida "${id}". Use: ${BRAND_IDS.join(', ')}`);
  return JSON.parse(readFileSync(join(BRANDS_DIR, key, 'brand.json'), 'utf8'));
}

export const brandAsset = (id, file) => {
  const path = join(BRANDS_DIR, id, file);
  if (!existsSync(path)) throw new Error(`Falta ${path}`);
  return path;
};

/** O CSS que troca as cores do tema pelas da marca (vazio para a Lopes.Film, que é o padrão do código). */
export function brandCss(brand) {
  if (!brand.theme) return '';
  const block = (t) => `
  --bg-app: ${t.bgApp}; --bg-titlebar: ${t.bgTitlebar}; --bg-panel: ${t.bgPanel}; --bg-raised: ${t.bgRaised}; --bg-viewer: ${t.bgViewer};
  --dock-line: ${t.dockLine}; --border: ${t.border};
  --accent: ${t.accent}; --logo-fill: ${t.logoFill}; --on-accent: ${t.onAccent}; --switch-on: ${t.switchOn};
  --accent-soft: rgba(${t.rgb}, 0.14); --bg-selected: rgba(${t.rgb}, 0.16); --bg-picked: rgba(${t.rgb}, 0.16); --text-selection: rgba(${t.rgb}, 0.30);`;
  return `:root[data-theme='dark'] {${block(brand.theme.dark)}\n}\n:root[data-theme='light'], :root:not([data-theme]) {${block(brand.theme.light)}\n}\n`;
}

const favicon = (brand) => {
  const fill = (brand.theme?.dark.logoFill ?? '#c8f501').replace('#', '%23');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${brand.mark.viewBox}" color="${fill}">${brand.mark.svg}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/%23/g, '%23')}`;
};

/** Plugin do Vite: o nome da marca (`__APP_BRAND__`), o CSS do tema, o título e o ícone da aba. */
/** @returns {import('vite').Plugin} */
export function brandPlugin(brand = loadBrand()) {
  const { id, name, mark, tagline, website } = brand;
  return {
    name: 'lopesfilm-brand',
    config: () => ({ define: { __APP_BRAND__: JSON.stringify({ id, name, mark, tagline: tagline ?? null, website: website ?? null }) } }),
    transformIndexHtml: {
      order: /** @type {'post'} */ ('post'),
      /** @param {string} html */
      handler(html) {
        let out = html.replace(/<title>[^<]*<\/title>/, (m) => m.replace(/Lopes.Film/g, name));
        out = out.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="${favicon(brand)}">`);
        const css = brandCss(brand);
        return css ? out.replace('</head>', `<style id="brand-theme">${css}</style>\n</head>`) : out;
      },
    },
  };
}
