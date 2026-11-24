// @remotion/animation-utils: CSS transforms written as a list, and styles mixed between values.
import { interpolate, interpolateColors } from './remotion.mjs';

const unit = (v, u) => (typeof v === 'number' ? `${v}${u}` : v);
export const translate = (x, y) => `translate(${unit(x, 'px')}${y === undefined ? '' : `, ${unit(y, 'px')}`})`;
export const translateX = (x) => `translateX(${unit(x, 'px')})`;
export const translateY = (y) => `translateY(${unit(y, 'px')})`;
export const scale = (x, y) => `scale(${x}${y === undefined ? '' : `, ${y}`})`;
export const scaleX = (x) => `scaleX(${x})`;
export const scaleY = (y) => `scaleY(${y})`;
export const rotate = (a) => `rotate(${unit(a, 'deg')})`;
export const rotateX = (a) => `rotateX(${unit(a, 'deg')})`;
export const rotateY = (a) => `rotateY(${unit(a, 'deg')})`;
export const rotateZ = (a) => `rotateZ(${unit(a, 'deg')})`;
export const skew = (x, y) => `skew(${unit(x, 'deg')}${y === undefined ? '' : `, ${unit(y, 'deg')}`})`;
export const skewX = (a) => `skewX(${unit(a, 'deg')})`;
export const skewY = (a) => `skewY(${unit(a, 'deg')})`;
export const perspective = (p) => `perspective(${unit(p, 'px')})`;
export const makeTransform = (list) => list.join(' ');

const NUM = /^(-?\d*\.?\d+)([a-z%]*)$/i;
const isColor = (v) => typeof v === 'string' && /^(#|rgb)/i.test(v);
/** Style objects with the same keys, mixed by `input` over `inputRange` (numbers with units, colours, transforms' numbers). */
export function interpolateStyles(input, inputRange, outputStyles, options) {
  const out = {};
  for (const key of Object.keys(outputStyles[0])) {
    const values = outputStyles.map((s) => s[key]);
    if (values.every(isColor)) out[key] = interpolateColors(input, inputRange, values);
    else if (values.every((v) => typeof v === 'number')) out[key] = interpolate(input, inputRange, values, options);
    else if (values.every((v) => typeof v === 'string' && NUM.test(v))) {
      const parts = values.map((v) => NUM.exec(v));
      out[key] = `${interpolate(input, inputRange, parts.map((m) => Number(m[1])), options)}${parts[0][2]}`;
    } else {
      /* a string with numbers (a transform): the numbers are mixed where the text around them is the same */
      const split = values.map((v) => String(v).split(/(-?\d*\.?\d+)/));
      const same = split.every((s) => s.length === split[0].length && s.every((t, i) => i % 2 === 1 || t === split[0][i]));
      out[key] = same ? split[0].map((t, i) => (i % 2 === 0 ? t : +interpolate(input, inputRange, split.map((s) => Number(s[i])), options).toFixed(4))).join('') : values[0];
    }
  }
  return out;
}
