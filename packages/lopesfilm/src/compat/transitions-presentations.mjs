// The presentations of @remotion/transitions: how the entering and the exiting scene look while they overlap.
import React from 'react';
import { AbsoluteFill } from './remotion.mjs';

const h = React.createElement;
const box = (style, children) => h(AbsoluteFill, { style }, children);

export const fade = (props = {}) => ({ props, component: ({ children, presentationProgress: p, presentationDirection: d }) =>
  box({ opacity: d === 'exiting' ? 1 : p }, children) });

const FROM = { 'from-left': ['X', -1], 'from-right': ['X', 1], 'from-top': ['Y', -1], 'from-bottom': ['Y', 1] };
export const slide = (props = {}) => ({ props, component: ({ children, presentationProgress: p, presentationDirection: d, passedProps }) => {
  const [axis, sign] = FROM[passedProps.direction ?? 'from-left'];
  const shift = d === 'entering' ? sign * (1 - p) * 100 : -sign * p * 100;
  return box({ transform: `translate${axis}(${shift}%)` }, children);
} });

export const wipe = (props = {}) => ({ props, component: ({ children, presentationProgress: p, presentationDirection: d, passedProps }) => {
  if (d === 'exiting') return box({}, children);
  const r = (1 - p) * 100;
  const clip = { 'from-left': `inset(0 ${r}% 0 0)`, 'from-right': `inset(0 0 0 ${r}%)`, 'from-top': `inset(0 0 ${r}% 0)`, 'from-bottom': `inset(${r}% 0 0 0)`,
    'from-top-left': `polygon(0 0, ${100 - r}% 0, 0 ${100 - r}%)`, 'from-top-right': `polygon(100% 0, ${r}% 0, 100% ${100 - r}%)`,
    'from-bottom-left': `polygon(0 100%, ${100 - r}% 100%, 0 ${r}%)`, 'from-bottom-right': `polygon(100% 100%, ${r}% 100%, 100% ${r}%)` }[passedProps.direction ?? 'from-left'];
  return box({ clipPath: clip }, children);
} });

export const flip = (props = {}) => ({ props, component: ({ children, presentationProgress: p, presentationDirection: d, passedProps }) => {
  const vertical = passedProps.direction === 'from-top' || passedProps.direction === 'from-bottom';
  const sign = passedProps.direction === 'from-right' || passedProps.direction === 'from-bottom' ? -1 : 1;
  const angle = d === 'entering' ? sign * 180 * (p - 1) : sign * 180 * p;
  return box({ perspective: 2000, backfaceVisibility: 'hidden' }, box({ transform: `rotate${vertical ? 'X' : 'Y'}(${angle}deg)`, backfaceVisibility: 'hidden' }, children));
} });

/** The point on the frame's edge at `a` (turns from the top, clockwise), for a sweep around the centre. */
const edge = (a, w, hh) => {
  const ang = a * 2 * Math.PI, dx = Math.sin(ang), dy = -Math.cos(ang);
  const k = Math.min(dx ? (w / 2) / Math.abs(dx) : Infinity, dy ? (hh / 2) / Math.abs(dy) : Infinity);
  return [w / 2 + dx * k, hh / 2 + dy * k];
};
export const clockWipe = (props = {}) => ({ props, component: ({ children, presentationProgress: p, presentationDirection: d, passedProps: { width, height } }) => {
  if (d === 'exiting') return box({}, children);
  const pts = [[width / 2, height / 2], [width / 2, 0]];
  for (const corner of [0.125, 0.375, 0.625, 0.875]) if (p > corner) pts.push(edge(corner, width, height));
  pts.push(edge(p, width, height));
  return box({ clipPath: `polygon(${pts.map(([x, y]) => `${x}px ${y}px`).join(',')})` }, children);
} });

export const iris = (props = {}) => ({ props, component: ({ children, presentationProgress: p, presentationDirection: d, passedProps: { width, height } }) => {
  if (d === 'exiting') return box({}, children);
  return box({ clipPath: `circle(${p * Math.hypot(width, height) / 2}px at 50% 50%)` }, children);
} });

export const none = (props = {}) => ({ props, component: ({ children, presentationProgress: p, presentationDirection: d }) => box({ opacity: d === 'entering' && p < 0.5 ? 0 : 1 }, children) });
