// @remotion/noise: simplex noise in 2, 3 and 4 dimensions, the same for the same seed. Values are in -1…1; the numbers are
// this layer's own (not Remotion's), so a look that depends on exact values may differ in detail.
import { random } from './remotion.mjs';

const G3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const tables = new Map();
const table = (seed) => {
  const key = String(seed);
  if (tables.has(key)) return tables.get(key);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(random(`${key}:${i}`) * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  tables.set(key, perm);
  return perm;
};
const dot = (g, x, y, z = 0) => g[0] * x + g[1] * y + g[2] * z;

export function noise2D(seed, x, y) {
  const perm = table(seed), F = 0.5 * (Math.sqrt(3) - 1), G = (3 - Math.sqrt(3)) / 6;
  const s = (x + y) * F, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G;
  const x0 = x - (i - t), y0 = y - (j - t);
  const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
  const corner = (xx, yy, gi) => { const a = 0.5 - xx * xx - yy * yy; return a < 0 ? 0 : a * a * a * a * dot(G3[gi % 12], xx, yy); };
  const ii = i & 255, jj = j & 255;
  return 70 * (corner(x0, y0, perm[ii + perm[jj]]) + corner(x0 - i1 + G, y0 - j1 + G, perm[ii + i1 + perm[jj + j1]]) + corner(x0 - 1 + 2 * G, y0 - 1 + 2 * G, perm[ii + 1 + perm[jj + 1]]));
}

export function noise3D(seed, x, y, z) {
  const perm = table(seed), F = 1 / 3, G = 1 / 6;
  const s = (x + y + z) * F, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), t = (i + j + k) * G;
  const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0]; } else if (x0 >= z0) { [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1]; } else { [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1]; }
  } else if (y0 < z0) { [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1]; } else if (x0 < z0) { [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1]; } else { [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0]; }
  const ii = i & 255, jj = j & 255, kk = k & 255;
  const corner = (xx, yy, zz, gi) => { const a = 0.6 - xx * xx - yy * yy - zz * zz; return a < 0 ? 0 : a * a * a * a * dot(G3[gi % 12], xx, yy, zz); };
  return 32 * (corner(x0, y0, z0, perm[ii + perm[jj + perm[kk]]])
    + corner(x0 - i1 + G, y0 - j1 + G, z0 - k1 + G, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]])
    + corner(x0 - i2 + 2 * G, y0 - j2 + 2 * G, z0 - k2 + 2 * G, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]])
    + corner(x0 - 1 + 3 * G, y0 - 1 + 3 * G, z0 - 1 + 3 * G, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]));
}

export const noise4D = (seed, x, y, z, w) => noise3D(seed, x + w * 0.37, y - w * 0.21, z + w * 0.53);
