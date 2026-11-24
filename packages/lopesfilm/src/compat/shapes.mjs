// @remotion/shapes: the path of a circle, rectangle, triangle, star, polygon, ellipse or pie, and the SVG that draws it.
import React from 'react';

const h = React.createElement;
const n = (x) => +x.toFixed(4);
const done = (path, width, height) => ({ path, width, height, transformOrigin: `${width / 2} ${height / 2}`, instructions: [] });
const poly = (pts) => `M ${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ')} Z`;

export const makeCircle = ({ radius }) => done(`M ${radius} 0 a ${radius} ${radius} 0 1 0 0 ${radius * 2} a ${radius} ${radius} 0 1 0 0 ${-radius * 2} Z`, radius * 2, radius * 2);
export const makeEllipse = ({ rx, ry }) => done(`M ${rx} 0 a ${rx} ${ry} 0 1 0 0 ${ry * 2} a ${rx} ${ry} 0 1 0 0 ${-ry * 2} Z`, rx * 2, ry * 2);
export const makeRect = ({ width, height, cornerRadius = 0 }) => {
  const r = Math.min(cornerRadius, width / 2, height / 2);
  return done(r ? `M ${r} 0 H ${width - r} a ${r} ${r} 0 0 1 ${r} ${r} V ${height - r} a ${r} ${r} 0 0 1 ${-r} ${r} H ${r} a ${r} ${r} 0 0 1 ${-r} ${-r} V ${r} a ${r} ${r} 0 0 1 ${r} ${-r} Z` : poly([[0, 0], [width, 0], [width, height], [0, height]]), width, height);
};
export const makeTriangle = ({ length, direction = 'right' }) => {
  const hh = (Math.sqrt(3) / 2) * length;
  const pts = { right: [[0, 0], [hh, length / 2], [0, length]], left: [[hh, 0], [0, length / 2], [hh, length]], up: [[0, hh], [length / 2, 0], [length, hh]], down: [[0, 0], [length, 0], [length / 2, hh]] }[direction];
  return done(poly(pts), direction === 'up' || direction === 'down' ? length : hh, direction === 'up' || direction === 'down' ? hh : length);
};
export const makePolygon = ({ radius, points }) => {
  const pts = Array.from({ length: points }, (_, i) => { const a = (i / points) * 2 * Math.PI - Math.PI / 2; return [radius + radius * Math.cos(a), radius + radius * Math.sin(a)]; });
  return done(poly(pts), radius * 2, radius * 2);
};
export const makeStar = ({ innerRadius, outerRadius, points }) => {
  const pts = Array.from({ length: points * 2 }, (_, i) => { const r = i % 2 ? innerRadius : outerRadius, a = (i / (points * 2)) * 2 * Math.PI - Math.PI / 2; return [outerRadius + r * Math.cos(a), outerRadius + r * Math.sin(a)]; });
  return done(poly(pts), outerRadius * 2, outerRadius * 2);
};
export const makePie = ({ radius, progress, closePath = true, counterClockwise = false, rotation = 0 }) => {
  const p = Math.min(1, Math.max(0, progress)), d = radius * 2;
  if (p >= 1) return done(makeCircle({ radius }).path, d, d);
  const a0 = rotation - Math.PI / 2, a1 = a0 + (counterClockwise ? -1 : 1) * p * 2 * Math.PI;
  const pt = (a) => `${n(radius + radius * Math.cos(a))} ${n(radius + radius * Math.sin(a))}`;
  const large = p > 0.5 ? 1 : 0, sweep = counterClockwise ? 0 : 1;
  return done(`M ${pt(a0)} A ${radius} ${radius} 0 ${large} ${sweep} ${pt(a1)}${closePath ? ` L ${radius} ${radius} Z` : ''}`, d, d);
};

const shape = (make) => function Shape({ fill, stroke, strokeWidth, strokeLinecap, strokeLinejoin, style, pathStyle, debug: _d, ...rest }) {
  const { path, width, height, transformOrigin } = make(rest);
  const pad = strokeWidth ? strokeWidth / 2 : 0;
  const keep = Object.fromEntries(Object.entries(rest).filter(([k]) => /^(id|className|data-|aria-)/.test(k)));
  return h('svg', { width: width + pad * 2, height: height + pad * 2, viewBox: `${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`, style, ...keep },
    h('path', { d: path, fill, stroke, strokeWidth, strokeLinecap, strokeLinejoin, style: { transformBox: 'fill-box', transformOrigin, ...pathStyle } }));
};
export const Circle = shape(makeCircle);
export const Ellipse = shape(makeEllipse);
export const Rect = shape(makeRect);
export const Triangle = shape(makeTriangle);
export const Polygon = shape(makePolygon);
export const Star = shape(makeStar);
export const Pie = shape(makePie);
