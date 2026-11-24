import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { evolvePath } from '@remotion/paths';
import { C, FONT } from './theme';
import { Caption, Chip, Cursor, Heading, useSpring, Win } from './ui';
import { TEXT } from './text';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const T = TEXT;

/* 0 · the title: each letter springs in, the line under it follows */
export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const sub = useSpring(34, { damping: 18, stiffness: 90 });
  const mark = useSpring(0, { damping: 9, stiffness: 120 });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.text }}>
      <div style={{ width: 120, height: 120, borderRadius: 32, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 62, transform: `scale(${mark}) rotate(${(1 - mark) * -40}deg)`, boxShadow: `0 20px 60px -10px ${C.red}`, marginBottom: 34 }}>▶</div>
      <div style={{ display: 'flex', fontSize: 116, fontWeight: 800, letterSpacing: '-.03em' }}>
        {[...T.s0[0]].map((ch, i) => {
          const p = Math.min(1, Math.max(0, (frame - 8 - i * 2.2) / 14));
          const e = 1 - (1 - p) ** 3;
          return <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: e, transform: `translateY(${(1 - e) * 60}px) rotate(${(1 - e) * 6}deg)` }}>{ch}</span>;
        })}
      </div>
      <div style={{ fontSize: 36, color: '#c9c9d2', marginTop: 14, opacity: sub, transform: `translateY(${(1 - sub) * 22}px)` }}>{T.s0[1]}</div>
    </AbsoluteFill>
  );
};

/* 1 · say what you want: the request is typed, sent, answered, and the film appears */
export const Chat: React.FC = () => {
  const frame = useCurrentFrame();
  const [title, cap, ask, answer] = T.s1;
  const typed = Math.floor(interpolate(frame, [26, 26 + ask.length * 1.6], [0, ask.length], clamp));
  const sent = interpolate(frame, [26 + ask.length * 1.6 + 6, 26 + ask.length * 1.6 + 18], [0, 1], clamp);
  const reply = useSpring(Math.round(26 + ask.length * 1.6 + 46));
  const done = 26 + ask.length * 1.6 + 70;
  const blocks = [[0, 120, C.blue, 0], [128, 92, C.blue, 8], [226, 112, C.blue, 16], [0, 338, C.green, 24]] as const;
  return (
    <AbsoluteFill>
      <Heading n="1" text={title} />
      <Win delay={4} style={{ left: 70, top: 150, width: 640, height: 420 }}>
        <div style={{ padding: '22px 28px', fontFamily: FONT }}>
          <div style={{ fontSize: 22, color: C.mute, marginBottom: 16, letterSpacing: '.12em' }}>CHAT</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: sent }}>
            <div style={{ maxWidth: 520, background: C.red, color: '#fff', borderRadius: 20, padding: '14px 22px', fontSize: 27, lineHeight: 1.3 }}>{ask}</div>
          </div>
          <div style={{ marginTop: 22, maxWidth: 540, background: '#2a2a31', color: C.text, borderRadius: 20, padding: '14px 22px', fontSize: 27, lineHeight: 1.3, opacity: reply, transform: `translateY(${(1 - reply) * 24}px)` }}>{answer}</div>
        </div>
        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 20, height: 56, borderRadius: 16, background: '#101015', border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 20px', fontFamily: FONT, fontSize: 25, color: C.text }}>
          <span>{frame < 26 + ask.length * 1.6 + 6 ? ask.slice(0, typed) : ''}</span>
          {frame < 26 + ask.length * 1.6 + 6 && Math.floor(frame / 8) % 2 === 0 ? <span style={{ width: 2, height: 28, background: C.text, marginLeft: 2 }} /> : null}
        </div>
      </Win>
      <Win delay={Math.round(done)} style={{ left: 750, top: 150, width: 460, height: 420 }}>
        <div style={{ margin: 26, height: 210, borderRadius: 14, background: `linear-gradient(135deg, ${C.red}, #8c1325)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 74, fontWeight: 800, color: '#fff' }}>▶</div>
        <div style={{ position: 'absolute', left: 26, right: 26, top: 262 }}>
          {blocks.map(([l, w, c, d], i) => {
            const p = interpolate(frame, [done + 12 + d, done + 30 + d], [0, 1], clamp);
            return <div key={i} style={{ position: 'absolute', left: l, top: i === 3 ? 54 : 0, height: 40, width: w * p, borderRadius: 9, background: c }} />;
          })}
        </div>
      </Win>
      <Caption text={cap} />
    </AbsoluteFill>
  );
};

/* 2 · see it and adjust it: a cursor works the timeline */
export const Studio: React.FC = () => {
  const frame = useCurrentFrame();
  const [title, cap, laneA, laneB] = T.s2;
  const play = interpolate(frame, [70, 230], [120, 1060], clamp);
  const clips = [[120, 210, 28], [340, 170, 36], [520, 250, 44], [780, 240, 52]] as const;
  return (
    <AbsoluteFill>
      <Heading n="2" text={title} />
      <Win delay={2} style={{ left: 70, top: 150, width: 1140, height: 430 }}>
        <div style={{ position: 'absolute', left: 40, top: 26, width: 420, height: 236, borderRadius: 14, background: `linear-gradient(135deg, ${C.blue}, ${C.red})` }} />
        <div style={{ position: 'absolute', left: 500, top: 34, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Chip text="✂" delay={60} /><Chip text="↔" delay={74} /><Chip text="⟲" delay={88} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 290, height: 1, background: C.line }} />
        {[[laneA, 308, C.blue], [laneB, 366, C.green]].map(([label, top, color], r) => (
          <div key={String(label)} style={{ position: 'absolute', left: 20, right: 20, top: Number(top), height: 46 }}>
            <span style={{ position: 'absolute', left: 0, top: 10, fontFamily: FONT, fontSize: 19, color: C.mute }}>{String(label)}</span>
            {(r === 0 ? clips : [[120, 920, 60]] as const).map(([l, w, d], i) => {
              const p = interpolate(frame, [d, d + 14], [0, 1], clamp);
              return <div key={i} style={{ position: 'absolute', left: Number(l), top: 0, height: 46, width: Number(w) * p, borderRadius: 10, background: String(color), opacity: 0.92 }} />;
            })}
          </div>
        ))}
        <div style={{ position: 'absolute', top: 280, bottom: 0, width: 3, left: play, background: '#fff', boxShadow: '0 0 14px #fff' }} />
      </Win>
      <Cursor path={[[0, 640, 470], [50, 330, 460], [84, 560, 340], [120, 760, 462], [170, 520, 470], [230, 980, 380]]} press={[50, 84, 120]} />
      <Caption text={cap} />
    </AbsoluteFill>
  );
};

/* 3 · the library: categories, then a grid of things that pop in; one is picked */
export const Library: React.FC = () => {
  const frame = useCurrentFrame();
  const [title, cap, cats] = T.s3;
  const icons = ['♪', 'Aa', '⇄', '✦', '▣', '★'];
  return (
    <AbsoluteFill>
      <Heading n="3" text={title} />
      <div style={{ position: 'absolute', left: 70, top: 160, width: 1140, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {cats.map((c, i) => <Chip key={c} text={c} delay={10 + i * 6} hot={frame > 60 + i * 0 && i === 1} />)}
      </div>
      {Array.from({ length: 12 }, (_, i) => {
        const s = useSpring(34 + i * 5, { damping: 12, stiffness: 150 });
        const picked = i === 8, lift = picked ? interpolate(frame, [130, 150], [0, 1], clamp) : 0;
        return (
          <div key={i} style={{ position: 'absolute', left: 70 + (i % 6) * 192, top: 290 + Math.floor(i / 6) * 140, width: 180, height: 120, borderRadius: 16, background: picked && lift ? `color-mix(in srgb, ${C.red} ${lift * 70}%, #26262d)` : '#26262d', border: `1px solid ${picked && lift ? C.red : '#3a3a44'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 38, fontWeight: 700, color: C.text, opacity: s, transform: `scale(${s * (1 + lift * 0.08)}) translateY(${(1 - s) * 30 - lift * 6}px)`, boxShadow: lift ? `0 18px 40px -12px ${C.red}` : 'none' }}>{icons[i % 6]}</div>
        );
      })}
      <Cursor path={[[0, 1100, 640], [100, 1100, 640], [130, 70 + 2 * 192 + 90, 290 + 140 + 60], [200, 70 + 2 * 192 + 90, 290 + 140 + 60]]} press={[132]} />
      <Caption text={cap} />
    </AbsoluteFill>
  );
};

/* 4 · skills: three cards, then the switch turns on */
export const Skills: React.FC = () => {
  const frame = useCurrentFrame();
  const [title, cap, skills] = T.s4;
  const sw = interpolate(frame, [150, 164], [0, 1], clamp);
  const glow = frame > 164 ? 0.5 + 0.5 * Math.sin((frame - 164) / 4) : 0;
  return (
    <AbsoluteFill>
      <Heading n="4" text={title} />
      {skills.map((s, i) => (
        <Win key={s} delay={16 + i * 22} style={{ left: 70 + i * 385, top: 180, width: 360, height: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <div style={{ fontSize: 66 }}>{['⌥', '▶', '⚡'][i]}</div>
          <div style={{ fontFamily: FONT, fontSize: 29, fontWeight: 700, color: C.text, textAlign: 'center', padding: '0 18px' }}>{s}</div>
        </Win>
      ))}
      <div style={{ position: 'absolute', left: 70, top: 470, display: 'flex', alignItems: 'center', gap: 16, opacity: interpolate(frame, [120, 136], [0, 1], clamp) }}>
        <div style={{ width: 82, height: 44, borderRadius: 999, background: `color-mix(in srgb, ${C.red} ${sw * 100}%, #3a3a44)`, position: 'relative', boxShadow: `0 0 0 ${glow * 12}px rgba(224,56,78,${0.3 * glow})` }}>
          <div style={{ position: 'absolute', top: 5, left: 5 + sw * 38, width: 34, height: 34, borderRadius: '50%', background: '#fff' }} />
        </div>
        <span style={{ fontFamily: FONT, fontSize: 28, color: '#c9c9d2' }}>{skills[2]}</span>
      </div>
      <Cursor path={[[0, 900, 600], [120, 900, 600], [148, 96, 492]]} press={[150]} />
      <Caption text={cap} />
    </AbsoluteFill>
  );
};

/* 5 · export: pick a format, the bar fills, the check draws itself */
export const Export: React.FC = () => {
  const frame = useCurrentFrame();
  const [title, cap, formats, done] = T.s5;
  const fill = interpolate(frame, [60, 150], [0, 100], { ...clamp, easing: (t) => t * t * (3 - 2 * t) });
  const check = evolvePath(interpolate(frame, [158, 176], [0, 1], clamp), 'M18 33l10 10 19-21');
  const pop = useSpring(156, { damping: 10, stiffness: 140 });
  return (
    <AbsoluteFill>
      <Heading n="5" text={title} />
      <div style={{ position: 'absolute', left: 70, top: 170, display: 'flex', gap: 16 }}>
        {formats.map((f, i) => <Chip key={f} text={f} delay={12 + i * 8} hot={i === 0} />)}
      </div>
      <Win delay={30} style={{ left: 70, top: 290, width: 1140, height: 150 }}>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 40, fontFamily: FONT, fontSize: 24, color: C.mute }}>{Math.round(fill)}%</div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 84, height: 26, borderRadius: 13, background: '#2a2a31', overflow: 'hidden' }}>
          <div style={{ width: `${fill}%`, height: '100%', background: `linear-gradient(90deg, ${C.red}, ${C.amber})`, borderRadius: 13 }} />
        </div>
      </Win>
      <div style={{ position: 'absolute', left: 70, top: 472, display: 'flex', alignItems: 'center', gap: 18, opacity: pop, transform: `scale(${pop})`, transformOrigin: 'left center' }}>
        <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill={C.green} /><path d="M18 33l10 10 19-21" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={check.strokeDasharray} strokeDashoffset={check.strokeDashoffset} /></svg>
        <span style={{ fontFamily: FONT, fontSize: 42, fontWeight: 800, color: C.text }}>{done}</span>
      </div>
      <Cursor path={[[0, 700, 600], [14, 130, 190], [40, 130, 190]]} press={[18]} />
      <Caption text={cap} />
    </AbsoluteFill>
  );
};

/* 6 · call to action */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const a = useSpring(0, { damping: 12, stiffness: 100 }), b = useSpring(16, { damping: 18, stiffness: 90 });
  const pulse = 1 + 0.03 * Math.sin(frame / 6);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.text }}>
      <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: '-.03em', transform: `scale(${a})`, opacity: a }}>{T.s6[0]}</div>
      <div style={{ fontSize: 38, color: '#c9c9d2', marginTop: 16, opacity: b, transform: `translateY(${(1 - b) * 24}px)` }}>{T.s6[1]}</div>
      <div style={{ marginTop: 40, width: 96, height: 96, borderRadius: 28, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 50, transform: `scale(${b * pulse})`, boxShadow: `0 18px 50px -10px ${C.red}` }}>▶</div>
    </AbsoluteFill>
  );
};
