// @remotion/paths: the length of an SVG path, a point on it, a path drawn on, a path turned into another.
const NS = 'http://www.w3.org/2000/svg';
const probe = (d) => {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  document.body.append(svg);
  return { p, done: () => svg.remove() };
};
const via = (d, f) => { const { p, done } = probe(d); try { return f(p); } finally { done(); } };

export const getLength = (d) => via(d, (p) => p.getTotalLength());
export const getPointAtLength = (d, at) => via(d, (p) => { const { x, y } = p.getPointAtLength(at); return { x, y }; });
export const getTangentAtLength = (d, at) => via(d, (p) => {
  const total = p.getTotalLength(), e = 0.01;
  const a = p.getPointAtLength(Math.max(0, at - e)), b = p.getPointAtLength(Math.min(total, at + e));
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
});
export const getBoundingBox = (d) => via(d, (p) => { const b = p.getBBox(); return { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height, width: b.width, height: b.height, viewBox: `${b.x} ${b.y} ${b.width} ${b.height}` }; });
/** A path drawn on: put the result in the path's style (`strokeDasharray`, `strokeDashoffset`). */
export const evolvePath = (progress, d) => {
  const length = getLength(d);
  return { strokeDasharray: `${length} ${length}`, strokeDashoffset: length - length * Math.min(1, Math.max(0, progress)) };
};

const TOKENS = /([a-zA-Z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
const split = (d) => [...d.matchAll(TOKENS)].map((m) => (m[1] ? m[1] : Number(m[2])));
/** One path turned into another with the same commands (the same shape of path): the numbers mixed. */
export const interpolatePath = (progress, from, to) => {
  const a = split(from), b = split(to);
  if (a.length !== b.length || a.some((t, i) => typeof t === 'string' && t !== b[i])) throw new Error('interpolatePath: the two paths must have the same commands in the same order');
  return a.map((t, i) => (typeof t === 'string' ? t : +(t + (b[i] - t) * progress).toFixed(4))).join(' ');
};
