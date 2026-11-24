/**
 * A marca deste build (Lopes.Film, GlobalFilm ou VerkzFilm): o Vite a escreve em `__APP_BRAND__` (brands/load.mjs).
 * Sem o Vite (os testes), vale a Lopes.Film.
 */
export type Brand = { id: string; name: string; tagline?: string | null; website?: string | null; mark: { viewBox: string; w: number; h: number; svg: string } };

declare const __APP_BRAND__: Brand | undefined;

const FALLBACK: Brand = { id: 'lopes', name: 'Lopes.Film', website: 'https://lightgoldenrodyellow-wombat-163159.hostingersite.com', mark: { viewBox: '0 0 1 1', w: 1, h: 1, svg: '' } };

export const BRAND: Brand = typeof __APP_BRAND__ === 'undefined' ? FALLBACK : __APP_BRAND__;

/** Uma frase das traduções com o nome da marca no lugar de "Lopes.Film". */
export const branded = (text: string): string => (BRAND.name === 'Lopes.Film' ? text : text.replaceAll('Lopes.Film', BRAND.name));

/** O site da marca (Exemplos e outros links "ver mais"). */
export const BRAND_SITE = BRAND.website || 'https://lightgoldenrodyellow-wombat-163159.hostingersite.com';
