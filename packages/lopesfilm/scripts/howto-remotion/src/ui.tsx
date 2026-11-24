import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { noise2D } from '@remotion/noise';
import { C, FONT } from './theme';

/** a spring from `delay` frames on */
export const useSpring = (delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = { damping: 14, stiffness: 120 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

/** drifting, blurred colour orbs behind everything: one background for the whole film, so the cuts feel like one place */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const orbs = [
    { c: C.red, x: 0.15, y: 0.1, r: 520 }, { c: C.blue, x: 0.85, y: 0.9, r: 560 }, { c: '#8c1325', x: 0.7, y: 0.15, r: 380 },
  ];
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      {orbs.map((o, i) => {
        const dx = noise2D(`x${i}`, frame / 160, 0) * 90, dy = noise2D(`y${i}`, 0, frame / 160) * 70;
        return <div key={i} style={{ position: 'absolute', left: o.x * 1280 - o.r / 2 + dx, top: o.y * 720 - o.r / 2 + dy, width: o.r, height: o.r, borderRadius: '50%', background: o.c, opacity: 0.2, filter: 'blur(110px)' }} />;
      })}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 120%, transparent 40%, rgba(0,0,0,.55))' }} />
    </AbsoluteFill>
  );
};

/** the step's heading: its number pops, the words rise */
export const Heading: React.FC<{ n?: string; text: string }> = ({ n, text }) => {
  const a = useSpring(0), b = useSpring(5);
  return (
    <div style={{ position: 'absolute', left: 70, top: 46, display: 'flex', alignItems: 'center', gap: 18, fontFamily: FONT }}>
      {n ? <div style={{ width: 62, height: 62, borderRadius: 18, background: C.red, color: '#fff', fontSize: 38, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${a})`, boxShadow: `0 10px 30px -8px ${C.red}` }}>{n}</div> : null}
      <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.02em', color: C.text, opacity: b, transform: `translateY(${(1 - b) * 26}px)` }}>{text.replace(/^\d\s*·\s*/, '')}</div>
    </div>
  );
};

/** the caption: a bar that fades in under the picture */
export const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [14, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 70, right: 70, bottom: 40, fontFamily: FONT, fontSize: 29, lineHeight: 1.3, color: C.text, background: 'rgba(8,8,12,.62)', border: `1px solid ${C.line}`, backdropFilter: 'blur(6px)', padding: '14px 24px', borderRadius: 16, opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>{text}</div>
  );
};

export const Win: React.FC<{ style: React.CSSProperties; delay?: number; children?: React.ReactNode }> = ({ style, delay = 0, children }) => {
  const s = useSpring(delay, { damping: 16, stiffness: 100 });
  return (
    <div style={{ position: 'absolute', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,.5)', overflow: 'hidden', opacity: s, transform: `translateY(${(1 - s) * 40}px) scale(${0.96 + s * 0.04})`, ...style }}>{children}</div>
  );
};

/** the mouse pointer, gliding through `path` ([frame, x, y]) and pressing at `press` frames */
export const Cursor: React.FC<{ path: Array<[number, number, number]>; press?: number[] }> = ({ path, press = [] }) => {
  const frame = useCurrentFrame();
  const f = path.map((p) => p[0]);
  const ease = (v: number) => 1 - (1 - v) ** 3;
  const x = interpolate(frame, f, path.map((p) => p[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const y = interpolate(frame, f, path.map((p) => p[2]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const down = press.some((p) => frame >= p && frame < p + 6);
  const ring = press.map((p) => frame - p).find((d) => d >= 0 && d < 16);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${x}px, ${y}px)`, zIndex: 50 }}>
      {ring !== undefined ? <div style={{ position: 'absolute', left: -14, top: -14, width: 28, height: 28, borderRadius: '50%', border: `3px solid ${C.red}`, transform: `scale(${0.4 + ring / 8})`, opacity: 1 - ring / 16 }} /> : null}
      <svg width="30" height="34" viewBox="0 0 20 22" style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.6))', transform: `scale(${down ? 0.88 : 1})` }}>
        <path d="M2 1.5 17 11.2l-6.6 1.3L7.6 19.5 2 1.5Z" fill="#fff" stroke="#0b0b0b" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const Chip: React.FC<{ text: string; delay: number; hot?: boolean; style?: React.CSSProperties }> = ({ text, delay, hot, style }) => {
  const s = useSpring(delay, { damping: 11, stiffness: 160 });
  return <span style={{ display: 'inline-block', fontFamily: FONT, padding: '10px 22px', borderRadius: 999, fontSize: 25, fontWeight: 600, color: '#fff', background: hot ? C.red : '#26262d', border: `1px solid ${hot ? C.red : '#3a3a44'}`, opacity: Math.min(1, s * 1.5), transform: `scale(${s})`, ...style }}>{text}</span>;
};
