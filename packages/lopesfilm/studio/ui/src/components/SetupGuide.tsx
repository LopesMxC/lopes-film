/**
 * The first-run guide: a full-screen window with a step rail on the left and a stage on the right. It walks through the
 * agent, the models on this computer, the browser for research, the skills that fit the agent, the look and a short
 * tour, then closes on a "done" screen. It shows once (lib/setup-guide.ts), can be skipped at any step, and every choice
 * in it is a setting that stays in Settings. The layout follows the Figma file "Lopes.Film — Guia inicial"; colours come
 * only from the theme's CSS variables, so every brand and both themes look right.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Bot, Box as Cube, Check, ChevronLeft, ChevronRight, Cpu, Film, Globe, LayoutDashboard, Layers, Loader2, Type, MessageSquare, Monitor, Moon, Music, Palette, Scissors, Sparkles, Sun, X, Zap } from 'lucide-react';
import { api } from '@/api';
import { BrandLogo } from '@/components/BrandLogo';
import { useThemeMode, type ThemeMode } from '@/components/settings/theme';
import { useT } from '@/i18n';
import { BRAND } from '@/lib/brand';
import { formatBytes } from '@/lib/export-jobs';
import { studioHost, type HostAgent, type HostAgentId } from '@/lib/host';
import { useLocalEngines } from '@/lib/local-engines';
import { useLocalModels } from '@/lib/local-models';
import { GUIDE_SKILLS, markSetupDone, recommendedSkills, SETUP_EVENT, setupDone, STEPS, type SetupStep } from '@/lib/setup-guide';

const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
const tint = (pct: number, color = 'var(--accent)') => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const GLOW = '0 8px 24px color-mix(in srgb, var(--accent) 38%, transparent)';

const CSS = `
@keyframes sg-rise{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
@keyframes sg-in-right{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:none}}
@keyframes sg-in-left{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}
@keyframes sg-float{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(30px,-24px,0) scale(1.12)}}
@keyframes sg-pulse{0%{transform:scale(.7);opacity:.55}100%{transform:scale(2.1);opacity:0}}
@keyframes sg-pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes sg-fall{0%{transform:translate3d(0,-20px,0) rotate(0);opacity:1}75%{opacity:1}100%{transform:translate3d(var(--dx),110vh,0) rotate(var(--rot));opacity:0}}
@keyframes sg-leave{to{opacity:0;transform:scale(1.025)}}
.sg-leave{animation:sg-leave .36s ease both;pointer-events:none}
@keyframes sg-bar{from{background-position:0 0}to{background-position:28px 0}}
@keyframes sg-draw{from{stroke-dashoffset:26}to{stroke-dashoffset:0}}
.sg-shell{animation:sg-rise .5s cubic-bezier(.22,.8,.3,1) both}
.sg-step-fwd{animation:sg-in-right .45s cubic-bezier(.22,.8,.3,1) both}
.sg-step-back{animation:sg-in-left .45s cubic-bezier(.22,.8,.3,1) both}
.sg-item{animation:sg-rise .5s cubic-bezier(.22,.8,.3,1) both}
.sg-blob{animation:sg-float 16s ease-in-out infinite}
.sg-ring{animation:sg-pulse 2.8s ease-out infinite}
.sg-pop{animation:sg-pop .55s cubic-bezier(.34,1.56,.64,1) both}
@keyframes sg-fadein{from{opacity:0}to{opacity:1}}
.sg-fadein{animation:sg-fadein .25s ease both}
.sg-stripes{background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.28) 0 8px,transparent 8px 16px);background-size:28px 100%;animation:sg-bar .9s linear infinite}
.sg-draw{stroke-dasharray:26;animation:sg-draw .6s .15s ease-out both}
.sg-btn{transition:transform .15s ease,background-color .15s ease,box-shadow .15s ease}
.sg-btn:hover{filter:brightness(1.08)}
.sg-btn:active{transform:translateY(0) scale(.98)}
.sg-lift{transition:transform .2s ease,border-color .2s ease,background-color .2s ease}
.sg-lift:hover{transform:translateY(-2px)}
@media (prefers-reduced-motion:reduce){.sg-shell,.sg-step-fwd,.sg-step-back,.sg-item,.sg-blob,.sg-ring,.sg-pop,.sg-fadein,.sg-stripes,.sg-draw,.sg-btn,.sg-lift{animation:none!important;transition:none!important}}
`;

function useHostAgents(): HostAgent[] | null {
  const [agents, setAgents] = React.useState<HostAgent[] | null>(null);
  React.useEffect(() => {
    const host = studioHost?.agents;
    if (!host) return undefined;
    let live = true;
    const stop = host.onChange((list) => { if (live) setAgents(list); });
    void host.list().then((list) => { if (live) setAgents(list); }).catch(() => {});
    return () => { live = false; stop(); };
  }, []);
  return agents;
}

export function SetupGuide() {
  const [open, setOpen] = React.useState(false);
  const [version, setVersion] = React.useState<string | undefined>(undefined);
  /* it opens on the first run and after every update: done is kept per version */
  React.useEffect(() => {
    let gone = false;
    void api.version().then((v) => {
      if (gone) return;
      setVersion(v.version);
      if (!setupDone(localStorage, v.version)) setOpen(true);
    }).catch(() => { if (!gone && !setupDone()) setOpen(true); });
    return () => { gone = true; };
  }, []);
  React.useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SETUP_EVENT, show);
    return () => window.removeEventListener(SETUP_EVENT, show);
  }, []);
  if (!open) return null;
  return <Guide onClose={() => { markSetupDone(localStorage, version); setOpen(false); }} />;
}

/* ───────────────────────────── small parts ───────────────────────────── */

/** A rounded square with an accent-tinted background and an accent icon. */
function Tile({ size = 44, children }: { size?: number; children: React.ReactNode }) {
  return <div className="flex shrink-0 items-center justify-center" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: tint(16), color: 'var(--accent)' }}>{children}</div>;
}

type BtnKind = 'primary' | 'soft' | 'text';
const BTN: Record<BtnKind, string> = {
  primary: 'bg-[var(--accent)] text-[var(--on-accent)]',
  soft: 'border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text)] hover:bg-[var(--bg-hover)]',
  text: 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
};
function Btn({ kind = 'primary', small, className = '', style, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; small?: boolean }) {
  return (
    <button type="button" {...rest} style={{ ...(kind === 'primary' ? { boxShadow: GLOW } : null), ...style }}
      className={`sg-btn inline-flex items-center justify-center gap-1.5 font-semibold disabled:pointer-events-none disabled:opacity-45 ${small ? 'rounded-[10px] px-4 py-2 text-[12.5px]' : 'rounded-xl px-[18px] py-2.5 text-[13px]'} ${BTN[kind]} ${className}`} />
  );
}

function Chip({ icon, children, ok }: { icon?: React.ReactNode; children: React.ReactNode; ok?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
      style={ok ? { background: tint(16, 'var(--ok)'), color: 'var(--ok)' } : { background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      {icon ? <span style={{ color: ok ? 'var(--ok)' : 'var(--accent)', display: 'flex' }}>{icon}</span> : null}{children}
    </span>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors" style={{ background: on ? 'var(--accent)' : 'var(--border-strong, var(--border))' }}>
      <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: on ? 19 : 3 }} />
    </button>
  );
}

/** The visual checkbox for a real, hidden input. */
function Box({ on, locked }: { on: boolean; locked?: boolean }) {
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors"
      style={on ? { background: locked ? 'var(--ok)' : 'var(--accent)', color: 'var(--on-accent)' } : { border: '1.5px solid var(--border-strong, var(--border))' }}>
      {on ? <Check size={13} strokeWidth={3} /> : null}
    </span>
  );
}

function Heading({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="mb-4 flex items-start gap-[18px]">
      <div className="sg-pop"><Tile size={54}>{icon}</Tile></div>
      <div className="min-w-0 max-w-[660px] pt-0.5">
        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.04em] text-[var(--text)]">{title}</h2>
        <p className="mt-1.5 text-[14px] leading-[21px] text-[var(--text-muted)]">{body}</p>
      </div>
    </div>
  );
}

const CARD = 'rounded-2xl border border-[var(--border)] bg-[var(--bg-field)]';

/* ─────────────────────────────── the shell ─────────────────────────────── */

function Rail({ phase, onGo, onSkip }: { phase: number; onGo: (i: number) => void; onSkip: () => void }) {
  const t = useT();
  const done = phase >= STEPS.length;
  return (
    <aside className="relative z-10 hidden w-[320px] shrink-0 flex-col gap-[26px] border-r border-[var(--border)] bg-[var(--bg-panel)] px-7 pb-7 pt-[34px] md:flex">
      <div className="flex items-center gap-3">
        <BrandLogo size={42} />
        <div>
          <p className="text-[17px] font-semibold leading-tight text-[var(--text)]">{BRAND.name}</p>
          <p className="text-[12px] text-[var(--text-muted)]">{t('setup.brand')}</p>
        </div>
      </div>
      <nav aria-label={t('setup.brand')} className="flex flex-col gap-1">
        {STEPS.map((s, i) => {
          const cur = i === phase;
          const dn = done || i < phase;
          return (
            <button key={s} type="button" data-locked={!dn || undefined} tabIndex={dn || cur ? 0 : -1} onClick={() => { if (dn) onGo(i); }} aria-current={cur ? 'step' : undefined}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${cur ? 'bg-[var(--bg-raised)]' : 'bg-transparent'} ${dn && !cur ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : 'cursor-default'}`}
              style={{ borderColor: cur ? 'var(--border)' : 'transparent' }}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-colors"
                style={cur ? { background: 'var(--accent)', color: 'var(--on-accent)' } : dn ? { background: tint(18, 'var(--ok)'), color: 'var(--ok)' } : { border: '1px solid var(--border-strong, var(--border))', color: 'var(--text-muted)' }}>
                {dn && !cur ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13.5px] font-medium ${cur || dn ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{t(`setup.rail.${s}`)}</span>
                <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{t(`setup.railSub.${s}`)}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-2.5">
        <Btn kind="text" onClick={onSkip} className="!justify-start !px-3 !text-[12.5px]"><X size={16} />{t('setup.skip')}</Btn>
        <p className="px-1 text-[11.5px] leading-4 text-[var(--text-muted)]">{t('setup.note')}</p>
      </div>
    </aside>
  );
}

function Segments({ phase }: { phase: number }) {
  const t = useT();
  const done = phase >= STEPS.length;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">{done ? t('setup.complete') : fill(t('setup.step'), { n: phase + 1, total: STEPS.length })}</p>
      <div className="mt-2.5 flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <div key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-raised)]">
            <div className={`h-full rounded-full ${i === phase ? 'sg-stripes' : ''}`} style={{ width: i <= phase ? '100%' : '0%', background: 'var(--accent)', transition: 'width .6s cubic-bezier(.22,.8,.3,1)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The guide's backdrop: soft colour blobs of the theme's accent drifting like a slow liquid. A small canvas, scaled up and
 * blurred, repainted ~30 times a second; still when the person asks for reduced motion, and paused while the window is hidden. */
function Fluid() {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--accent)';
    canvas.parentElement?.appendChild(probe);
    const [r, g, b] = (getComputedStyle(probe).color.match(/[\d.]+/g) ?? ['120', '90', '255']).slice(0, 3).map(Number);
    probe.remove();
    const mix = (to: number[], k: number) => [r + (to[0] - r) * k, g + (to[1] - g) * k, b + (to[2] - b) * k].map(Math.round);
    const palette = [[r, g, b], mix([255, 255, 255], 0.3), mix([110, 70, 255], 0.4), mix([40, 200, 255], 0.35), [r, g, b], mix([255, 90, 170], 0.3)];
    const blobs = palette.map((c, i) => ({
      c, size: 0.42 + (i % 3) * 0.1, ax: 0.22 + (i % 4) * 0.07, ay: 0.18 + (i % 3) * 0.09,
      fx: 0.11 + i * 0.037, fy: 0.09 + i * 0.043, px: i * 1.7, py: i * 2.3, ox: 0.2 + (i * 0.16) % 0.62, oy: 0.25 + (i * 0.23) % 0.55,
    }));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = 0;
    const size = () => { canvas.width = Math.max(64, Math.round(canvas.clientWidth / 8)); canvas.height = Math.max(40, Math.round(canvas.clientHeight / 8)); };
    const paint = (now: number) => {
      const w = canvas.width, h = canvas.height, m = Math.min(w, h) * 1.15, t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const o of blobs) {
        const x = (o.ox + o.ax * Math.sin(t * o.fx * 2 + o.px) + 0.08 * Math.sin(t * o.fy * 5 + o.py)) * w;
        const y = (o.oy + o.ay * Math.cos(t * o.fy * 2 + o.py) + 0.06 * Math.cos(t * o.fx * 4 + o.px)) * h;
        const rad = m * o.size * (1 + 0.12 * Math.sin(t * o.fx * 3 + o.px));
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},.24)`);
        grad.addColorStop(1, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < 33) return;
      last = now; paint(now);
    };
    size(); paint(4200);
    window.addEventListener('resize', size);
    if (!still) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" style={{ filter: 'blur(26px) saturate(1.25)', transform: 'scale(1.15)', opacity: 0.95 }} />;
}

function Guide({ onClose: close }: { onClose: () => void }) {
  const t = useT();
  /* leaving fades the guide out first: it used to vanish in a frame, in the middle of the confetti */
  const [leaving, setLeaving] = React.useState(false);
  const leaves = React.useRef(false);
  const onClose = React.useCallback(() => {
    if (leaves.current) return;
    leaves.current = true;
    setLeaving(true);
    setTimeout(close, 360);
  }, [close]);
  const [phase, setPhase] = React.useState(0);
  const [forward, setForward] = React.useState(true);
  const agents = useHostAgents();
  const [agent, setAgent] = React.useState<HostAgentId | null>(null);
  const last = STEPS.length; // the "done" screen comes after the last step
  const go = (next: number) => { setForward(next > phase); setPhase(Math.max(0, Math.min(last, next))); };
  const done = phase === last;
  const step: SetupStep | null = done ? null : STEPS[phase];

  const ready = agents?.find((a) => a.status === 'ready' && a.id !== 'byok');
  React.useEffect(() => { if (!agent && ready) setAgent(ready.id); }, [agent, ready]);

  React.useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const cta = done ? t('setup.finish') : step === 'welcome' ? t('setup.welcome.start') : t('setup.next');
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={fill(t('setup.welcome.title'), { name: BRAND.name })} className={`${leaving ? 'sg-leave ' : ''}fixed inset-0 z-[10080] flex overflow-hidden bg-[var(--bg-app)] text-[var(--text)]`}>
      <style>{CSS}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><Fluid /></div>
      {done ? <Confetti /> : null}
      <Rail phase={phase} onGo={go} onSkip={onClose} />
      <main className="sg-shell relative z-10 flex min-w-0 flex-1 flex-col px-6 pb-6 pt-7 md:px-14 md:pb-7 md:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1"><Segments phase={phase} /></div>
          <Btn kind="text" small onClick={onClose} className="md:hidden"><X size={14} />{t('setup.skip')}</Btn>
        </div>
        <div key={phase} className={`mt-5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-5 ${forward ? 'sg-step-fwd' : 'sg-step-back'}`}>
          {step === 'welcome' ? <Welcome /> : null}
          {step === 'agent' ? <AgentStep agents={agents} chosen={agent} onChoose={setAgent} /> : null}
          {step === 'models' ? <ModelsStep /> : null}
          {step === 'browser' ? <BrowserStep onSkip={() => go(phase + 1)} /> : null}
          {step === 'skills' ? <SkillsStep agent={agent} agentName={agents?.find((a) => a.id === agent)?.name ?? ''} /> : null}
          {step === 'packs' ? <PacksStep /> : null}
          {step === 'look' ? <LookStep /> : null}
          {step === 'tour' ? <TourStep /> : null}
          {done ? <Done agentName={agents?.find((a) => a.id === agent)?.name ?? ''} /> : null}
        </div>
        <div className={`mt-5 flex items-center ${phase === 0 ? 'justify-end' : 'justify-between'}`}>
          {phase > 0 ? <Btn kind="text" onClick={() => go(phase - 1)}><ChevronLeft size={16} />{t('setup.back')}</Btn> : null}
          <Btn onClick={() => (done ? onClose() : go(phase + 1))}>
            {cta}{done ? <Sparkles size={15} /> : <ChevronRight size={16} />}
          </Btn>
        </div>
      </main>
    </div>,
    document.body,
  );
}

/* ───────────────────────────────── steps ───────────────────────────────── */

function Welcome() {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 py-6 text-center">
      <div className="relative flex h-[180px] w-[180px] items-center justify-center">
        <span aria-hidden className="sg-ring absolute inset-0 rounded-full" style={{ border: '2px solid var(--accent)' }} />
        <span aria-hidden className="sg-ring absolute inset-0 rounded-full" style={{ border: '2px solid var(--accent)', animationDelay: '-1.4s' }} />
        <span aria-hidden className="absolute inset-0 rounded-full" style={{ border: `2px solid ${tint(25)}` }} />
        <span aria-hidden className="absolute inset-[21px] rounded-full" style={{ border: `2px solid ${tint(50)}` }} />
        <div className="sg-pop" style={{ filter: `drop-shadow(0 10px 26px ${tint(40)})` }}><BrandLogo size={92} /></div>
      </div>
      <h1 className="text-[42px] font-semibold leading-tight tracking-[-0.06em]">{fill(t('setup.welcome.title'), { name: BRAND.name })}</h1>
      <p className="max-w-[560px] text-[15px] leading-6 text-[var(--text-muted)]">{t('setup.welcome.body')}</p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Chip icon={<Bot size={14} />}>{t('setup.chips.agent')}</Chip>
        <Chip icon={<Cpu size={14} />}>{t('setup.chips.models')}</Chip>
        <Chip icon={<Sparkles size={14} />}>{t('setup.chips.skills')}</Chip>
      </div>
    </div>
  );
}

function AgentStep({ agents, chosen, onChoose }: { agents: HostAgent[] | null; chosen: HostAgentId | null; onChoose: (id: HostAgentId) => void }) {
  const t = useT();
  const host = studioHost?.agents;
  const [busy, setBusy] = React.useState<HostAgentId | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const order: HostAgentId[] = ['claude', 'codex', 'lopesfilm'];
  const list = (agents ?? []).filter((a) => a.id !== 'byok' && a.status !== 'unavailable')
    .sort((a, b) => (a.status === 'ready' ? -1 : 0) - (b.status === 'ready' ? -1 : 0) || (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99)).slice(0, 6);
  const act = (a: HostAgent) => {
    if (!host) return;
    setBusy(a.id); setError(null);
    /* Claude Code not on the computer: connecting installs it (and Git) first */
    const job = a.status === 'missing' && a.id !== 'claude' && a.installer && host.install ? host.install(a.id) : host.connect(a.id);
    void job.then((r) => { if (r && !r.ok) setError(fill(t('setup.agent.failed'), { error: r.error ?? '' })); else onChoose(a.id); })
      .catch((e: unknown) => setError(fill(t('setup.agent.failed'), { error: e instanceof Error ? e.message : String(e) })))
      .finally(() => setBusy(null));
  };
  return (
    <>
      <Heading icon={<Bot size={25} />} title={t('setup.agent.title')} body={t('setup.agent.body')} />
      {!list.length ? <p className="text-[13px] text-[var(--text-muted)]">{agents ? t('setup.agent.none') : <Loader2 className="animate-spin" size={18} />}</p> : null}
      <div className="grid gap-3">
        {list.map((a, i) => {
          const ok = a.status === 'ready';
          const working = busy === a.id || a.status === 'waiting';
          return (
            <div key={a.id} className={`sg-item sg-lift flex items-center gap-3.5 px-4 py-4 ${CARD}`}
              style={{ animationDelay: `${i * 70}ms`, borderColor: ok && chosen === a.id ? 'var(--accent)' : undefined, borderWidth: ok && chosen === a.id ? 1.5 : undefined }}>
              <Tile size={44}><Bot size={20} /></Tile>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[var(--text)]">{a.name}</p>
                <p className="truncate text-[12px] text-[var(--text-muted)]">{a.account?.email ?? (ok ? t('setup.agent.connected') : a.status === 'missing' ? t('setup.agent.codex') : a.error ?? a.status)}</p>
              </div>
              {ok ? (
                <button type="button" onClick={() => onChoose(a.id)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium" style={{ color: chosen === a.id ? 'var(--ok)' : 'var(--accent)' }}>
                  <Check size={15} strokeWidth={3} />{chosen === a.id ? t('setup.agent.connected') : t('setup.agent.connect')}
                </button>
              ) : (
                <Btn small kind={a.status === 'missing' && a.id !== 'claude' && a.installer ? 'primary' : 'soft'} disabled={working} onClick={() => act(a)}>
                  {working ? <Loader2 size={13} className="animate-spin" /> : null}
                  {a.status === 'missing' && a.id !== 'claude' && a.installer ? t('setup.agent.install') : t('setup.agent.connect')}
                </Btn>
              )}
            </div>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: tint(14, '#e5484d'), color: '#e5484d' }}>{error}</p> : null}
      {host ? (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          {t('setup.agent.notFound')}
          <button type="button" onClick={() => void (host.refresh ?? host.list)()} className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">{t('setup.agent.refresh')}</button>
        </p>
      ) : null}
    </>
  );
}

function ModelsStep() {
  const t = useT();
  const { models, install } = useLocalModels();
  const { engines, updates, install: installEngine } = useLocalEngines();
  /* Whisper Large v3 Turbo is the transcriber offered first: the best of the two */
  const [picked, setPicked] = React.useState<Set<string>>(new Set(['whisper-large-v3-turbo', 'isnet-general', 'upscale', 'eyes', 'effectcraft', 'figcraft', 'vectorcraft', 'autoedit', 'soundcraft', 'anicraft', 'ytdlp', 'whisperfast', 'voiceclean']));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todoModels = (models ?? []).filter((m) => picked.has(m.id) && !m.installed && !m.installing);
  const todoEngines = (engines ?? []).filter((e) => e.supported && !e.blocked && e.kind !== 'pack' && picked.has(e.id) && !e.installed && !e.installing);
  const row = (key: string, i: number, name: string, sub: string, checked: boolean, locked: boolean, pct: number, busy: string | null, failed: boolean) => (
    <label key={key} className={`sg-item relative flex cursor-pointer items-center gap-3.5 overflow-hidden px-4 py-[9px] ${CARD}`}
      style={{ animationDelay: `${i * 55}ms`, borderColor: busy !== null ? 'var(--accent)' : undefined, borderWidth: busy !== null ? 1.5 : undefined }}>
      {busy !== null ? <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: tint(16), transition: 'width .8s ease' }} /> : null}
      <input type="checkbox" disabled={locked} checked={locked || checked} onChange={() => toggle(key)} className="peer sr-only" />
      <span className="relative flex peer-focus-visible:[&>span]:ring-2 peer-focus-visible:[&>span]:ring-[var(--accent)]"><Box on={locked || checked} locked={locked} /></span>
      <div className="relative min-w-0 flex-1">
        <p className="text-[14px] font-medium text-[var(--text)]">{name}</p>
        <p className="truncate text-[12px] text-[var(--text-muted)]">{busy ?? sub}</p>
      </div>
      <span className="relative text-[13px] font-semibold" style={{ color: failed ? '#e5484d' : locked ? 'var(--ok)' : 'var(--accent)' }}>
        {locked ? <Check size={17} strokeWidth={3} /> : busy !== null ? <>{pct}%</> : failed ? t('setup.models.failed') : null}
      </span>
    </label>
  );
  let i = 0;
  const failedEngine = (engines ?? []).find((e) => e.failed && e.kind !== 'pack');
  return (
    <>
      <Heading icon={<Cpu size={25} />} title={t('setup.models.title')} body={t('setup.models.body')} />
      <div className="grid gap-1.5">
        {(models ?? []).map((m) => {
          const pct = m.installing ? Math.min(100, Math.round((m.installing.bytes / Math.max(1, m.bytes)) * 100)) : m.installed ? 100 : 0;
          return row(m.id, i++, m.name, `${t(`setup.models.${m.kind}`)} · ${m.installed ? t('setup.models.installed') : fill(t('setup.models.size'), { size: formatBytes(m.bytes) })}`, picked.has(m.id), m.installed, pct, m.installing ? t('setup.models.installing') : null, Boolean(m.failed));
        })}
        {!models ? <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" /> : null}
        {(engines ?? []).filter((e) => e.supported && e.blocked && !e.installed && e.kind !== 'pack').map((e) => (
          <div key={e.id} data-unavailable={e.id} className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-[12px] opacity-70">
            <b className="font-semibold">{t(`setup.models.${e.id}`)} · {e.name}</b> — {t('setup.models.unavailable')}. {e.blocked}
          </div>
        ))}
        {(engines ?? []).filter((e) => e.supported && !(e.blocked && !e.installed) && e.kind !== 'pack').map((e) => {
          const pct = e.installing ? Math.min(100, Math.round((e.installing.bytes / Math.max(1, e.bytes)) * 100)) : e.installed ? 100 : 0;
          return row(e.id, i++, `${t(`setup.models.${e.id}`)} · ${e.name}`, `${t(`setup.models.${e.id}Hint`)} · ${e.installed ? t('setup.models.installed') : fill(t('setup.models.size'), { size: formatBytes(e.bytes) })}${e.installed && updates[e.id] ? ` · ↑ v${updates[e.id]!.latest}` : ''}`, picked.has(e.id), e.installed, pct, e.installing ? `${t('setup.models.installing')} ${pct}%` : null, Boolean(e.failed));
        })}
      </div>
      {(models ?? []).filter((m) => m.failed && m.why).map((m) => <p key={m.id} role="alert" className="mt-3 select-text rounded-lg px-3 py-2 text-[12px]" style={{ background: tint(14, '#e5484d'), color: '#e5484d' }}>{m.name}: {m.why}</p>)}
      {failedEngine ? <p role="alert" className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: tint(14, '#e5484d'), color: '#e5484d' }}>{failedEngine.name}: {failedEngine.failed}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3.5">
        <Btn disabled={!todoModels.length && !todoEngines.length}
          onClick={() => { todoModels.forEach((m) => void install(m.id)); todoEngines.forEach((e) => void installEngine(e.id)); }}>
          {t('setup.models.install')}<Zap size={16} />
        </Btn>
        <p className="text-[12px] text-[var(--text-muted)]">{t('setup.models.background')}</p>
      </div>
    </>
  );
}

/** Optional free packs for editing: sound effects, effect sprites and fonts, each CC0 or SIL OFL, fetched on request. */
function PacksStep() {
  const t = useT();
  const { engines, install } = useLocalEngines();
  const packs = (engines ?? []).filter((e) => e.kind === 'pack');
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todo = packs.filter((e) => picked.has(e.id) && !e.installed && !e.installing);
  const icon = (id: string) => id === 'pack-sfx' || id === 'pack-ui' ? <Music size={20} /> : id === 'pack-fonts' ? <Type size={20} /> : id.startsWith('pack-models3d') ? <Cube size={20} /> : <Sparkles size={20} />;
  const failed = packs.find((e) => e.failed);
  return (
    <>
      <Heading icon={<Layers size={25} />} title={t('setup.packs.title')} body={t('setup.packs.body')} />
      <div className="grid gap-2">
        {packs.map((e, i) => {
          const pct = e.installing ? Math.min(100, Math.round((e.installing.bytes / Math.max(1, e.bytes)) * 100)) : e.installed ? 100 : 0;
          const busy = e.installing ? `${t('setup.models.installing')} ${pct}%` : null;
          return (
            <label key={e.id} className={`sg-item relative flex cursor-pointer items-center gap-3.5 overflow-hidden px-4 py-3 ${CARD}`}
              style={{ animationDelay: `${i * 55}ms`, borderColor: busy ? 'var(--accent)' : undefined, borderWidth: busy ? 1.5 : undefined }}>
              {busy ? <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: tint(16), transition: 'width .8s ease' }} /> : null}
              <input type="checkbox" disabled={e.installed} checked={e.installed || picked.has(e.id)} onChange={() => toggle(e.id)} className="peer sr-only" />
              <span className="relative flex peer-focus-visible:[&>span]:ring-2 peer-focus-visible:[&>span]:ring-[var(--accent)]"><Box on={e.installed || picked.has(e.id)} locked={e.installed} /></span>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]" style={{ background: tint(14), color: 'var(--accent)' }}>{icon(e.id)}</span>
              <div className="relative min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[var(--text)]">{t(`setup.packs.${e.id}`)}</p>
                <p className="truncate text-[12px] text-[var(--text-muted)]">{busy ?? t(`setup.packs.${e.id}Hint`)}</p>
                <p className="truncate text-[11px] text-[var(--text-faint,var(--text-muted))]">{e.name} · {e.by} · {e.license}</p>
              </div>
              <span className="relative shrink-0 text-[12.5px] font-semibold" style={{ color: e.failed ? '#e5484d' : e.installed ? 'var(--ok)' : 'var(--text-muted)' }}>
                {e.installed ? <Check size={17} strokeWidth={3} /> : e.failed ? t('setup.models.failed') : formatBytes(e.bytes)}
              </span>
            </label>
          );
        })}
        {!engines ? <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" /> : null}
      </div>
      {failed ? <p role="alert" className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: tint(14, '#e5484d'), color: '#e5484d' }}>{failed.name}: {failed.failed}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3.5">
        <Btn disabled={!todo.length} onClick={() => todo.forEach((e) => void install(e.id))}>{t('setup.packs.install')}<Zap size={16} /></Btn>
        <p className="text-[12px] text-[var(--text-muted)]">{t('setup.packs.where')}</p>
      </div>
    </>
  );
}

function BrowserMock() {
  return (
    <div aria-hidden className="w-full max-w-[360px] shrink-0 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-app)] shadow-[0_14px_34px_rgba(0,0,0,.45)]">
      <div className="flex items-center gap-1.5 bg-[var(--bg-raised)] px-3 py-[9px]">
        {[0, 1, 2].map((k) => <span key={k} className="h-[9px] w-[9px] rounded-full" style={{ background: 'var(--border-strong, var(--border))' }} />)}
        <span className="ml-1 flex-1 rounded-lg bg-[var(--bg-app)] px-3 py-1 text-[11px] text-[var(--text-muted)]">wikipedia.org</span>
      </div>
      <div className="flex flex-col gap-2.5 p-[18px]">
        <span className="h-3.5 w-[150px] rounded" style={{ background: tint(55) }} />
        {[100, 92, 97, 60].map((w) => <span key={w} className="h-2 rounded bg-[var(--bg-raised)]" style={{ width: `${w}%` }} />)}
        <span className="mt-1 h-[74px] rounded bg-[var(--bg-raised)]" />
      </div>
    </div>
  );
}

function BrowserStep({ onSkip }: { onSkip: () => void }) {
  const t = useT();
  const KEY = 'lopesfilm.researchBrowser';
  const [linked, setLinked] = React.useState(() => { try { return localStorage.getItem(KEY) === 'default'; } catch { return false; } });
  const link = () => { try { localStorage.setItem(KEY, 'default'); } catch { /* not kept */ } void api.setPrefs({ researchBrowser: true }).catch(() => {}); setLinked(true); };
  return (
    <>
      <Heading icon={<Globe size={25} />} title={t('setup.browser.title')} body={t('setup.browser.body')} />
      <div className={`sg-item flex flex-wrap items-center gap-8 p-[26px] ${CARD} !rounded-[22px]`}>
        <BrowserMock />
        <div className="flex min-w-[260px] flex-1 flex-col gap-[18px]">
          <ul className="flex flex-col gap-2.5">
            {(['p1', 'p2', 'p3'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2.5 text-[13.5px] text-[var(--text)]"><Check size={16} strokeWidth={3} style={{ color: 'var(--ok)' }} />{t(`setup.browser.${k}`)}</li>
            ))}
          </ul>
          <div className="flex flex-col items-start gap-2.5">
            <Btn onClick={link}><Globe size={16} />{t('setup.browser.use')}</Btn>
            <a href="https://www.wikipedia.org" target="_blank" rel="noreferrer" onClick={link} className="sg-btn inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] px-[18px] py-2.5 text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--bg-hover)]">{t('setup.browser.test')}</a>
          </div>
          <div className="flex min-h-[34px] items-center">{linked ? <div className="sg-fadein"><Chip ok icon={<Check size={14} strokeWidth={3} />}>{t('setup.browser.done')}</Chip></div> : null}</div>
          <button type="button" onClick={onSkip} className="self-start text-[12.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]">{t('setup.browser.skip')}</button>
        </div>
      </div>
    </>
  );
}

const SKILL_ICON: Record<string, React.ReactNode> = {
  economy: <Zap size={22} />, cutting: <Scissors size={22} />, design: <Palette size={22} />, edit: <Film size={22} />, media: <Music size={22} />, canvas: <LayoutDashboard size={22} />,
};

function SkillsStep({ agent, agentName }: { agent: HostAgentId | null; agentName: string }) {
  const t = useT();
  const [on, setOn] = React.useState<Set<string>>(() => new Set(recommendedSkills(agent)));
  const applied = React.useRef(false);
  /* the agent chosen after this step opened: its set is the starting point */
  React.useEffect(() => { if (!applied.current) setOn(new Set(recommendedSkills(agent))); }, [agent]);
  const set = (uid: string, value: boolean) => {
    applied.current = true;
    setOn((p) => { const n = new Set(p); if (value) n.add(uid); else n.delete(uid); return n; });
    void fetch(`/api/skills/${encodeURIComponent(uid)}/on`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: value }) }).catch(() => {});
  };
  /* the recommended set is applied as soon as the step shows, so leaving it as it is is a choice too */
  React.useEffect(() => {
    for (const uid of GUIDE_SKILLS) {
      void fetch(`/api/skills/${encodeURIComponent(uid)}/on`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: on.has(uid) }) }).catch(() => {});
    }
    // only when the agent's set is first chosen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);
  const count = GUIDE_SKILLS.filter((uid) => on.has(uid)).length;
  return (
    <>
      <Heading icon={<Sparkles size={25} />} title={t('setup.skills.title')} body={fill(t('setup.skills.body'), { agent: agentName || '…' })} />
      <div className="grid gap-3.5 md:grid-cols-2">
        {GUIDE_SKILLS.map((uid, i) => {
          const name = uid.split('/')[1];
          const active = on.has(uid);
          return (
            <div key={uid} role="group" className={`sg-item sg-lift flex items-center gap-4 p-[22px] ${CARD} !rounded-[18px]`}
              style={{ animationDelay: `${i * 60}ms`, borderColor: active ? tint(50) : undefined }}>
              <Tile size={48}>{SKILL_ICON[name] ?? <Sparkles size={22} />}</Tile>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[var(--text)]">{t(`setup.skillName.${name}`)}</p>
                <p className="mt-1 text-[12.5px] leading-[18px] text-[var(--text-muted)]">{fill(t(`setup.skills.${name}`), { name: BRAND.name })}</p>
              </div>
              <Switch on={active} onChange={(v) => set(uid, v)} label={t(`setup.skillName.${name}`)} />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Chip ok icon={<Check size={14} strokeWidth={3} />}>{fill(t('setup.skills.summary'), { n: count })}</Chip>
        <p className="text-[12px] text-[var(--text-muted)]">{fill(t('setup.skills.summaryHint'), { agent: agentName || '…' })}</p>
      </div>
    </>
  );
}

/** A tiny editor drawn in a theme's own colours (so the preview doesn't change with the one in use). */
function ThemeMock({ bg, panel, line }: { bg: string; panel: string; line: string }) {
  return (
    <div aria-hidden className="relative h-[170px] w-full overflow-hidden rounded-[10px]" style={{ background: bg }}>
      <div className="absolute inset-x-0 top-0 h-4" style={{ background: panel }} />
      <div className="absolute bottom-0 left-0 top-4 w-[24%]" style={{ background: panel }} />
      <div className="absolute left-[28%] top-[26px] h-[72px] w-[42%] rounded-md" style={{ background: line }} />
      <div className="absolute left-[74%] top-[26px] h-[72px] w-[22%] rounded-md" style={{ background: line }} />
      <div className="absolute bottom-[8px] left-[28%] h-[50px] w-[68%] rounded-md" style={{ background: panel }}>
        <span className="absolute left-[3%] top-2 h-2.5 w-[32%] rounded-sm" style={{ background: '#e0384e' }} />
        <span className="absolute left-[40%] top-2 h-2.5 w-[20%] rounded-sm" style={{ background: '#4cc27a' }} />
        <span className="absolute left-[3%] top-6 h-2.5 w-[48%] rounded-sm" style={{ background: line }} />
        <span className="absolute left-[53%] top-6 h-2.5 w-[28%] rounded-sm" style={{ background: '#e0384e' }} />
      </div>
      <span className="absolute bottom-[8px] left-1/2 h-[58px] w-0.5" style={{ background: '#e0384e' }} />
    </div>
  );
}
const DARK = { bg: '#0b0c0e', panel: '#1b1c1f', line: '#2a2b30' };
const LIGHT = { bg: '#e4e4e8', panel: '#fbfbfc', line: '#cfd0d6' };

function LookStep() {
  const t = useT();
  const [mode, setMode] = useThemeMode();
  const options: Array<{ id: ThemeMode; icon: React.ReactNode; label: string; preview: React.ReactNode }> = [
    { id: 'dark', icon: <Moon size={18} />, label: t('setup.look.dark'), preview: <ThemeMock {...DARK} /> },
    { id: 'light', icon: <Sun size={18} />, label: t('setup.look.light'), preview: <ThemeMock {...LIGHT} /> },
    { id: 'system', icon: <Monitor size={18} />, label: t('setup.look.system'), preview: (
      <div className="relative h-[170px] w-full overflow-hidden rounded-[10px]">
        <ThemeMock {...DARK} />
        <div className="absolute bottom-0 right-0 overflow-hidden rounded-lg border border-[#3a3c42] shadow-lg" style={{ transform: 'scale(.61)', transformOrigin: 'bottom right', width: '100%' }}><ThemeMock {...LIGHT} /></div>
      </div>
    ) },
  ];
  return (
    <>
      <Heading icon={<Palette size={25} />} title={t('setup.look.title')} body={fill(t('setup.look.body'), { name: BRAND.name })} />
      <div className="grid gap-3 md:grid-cols-3">
        {options.map((o, i) => {
          const sel = mode === o.id;
          return (
            <button key={o.id} type="button" onClick={() => setMode(o.id)} aria-pressed={sel}
              className={`sg-item sg-lift flex flex-col gap-3.5 p-3.5 text-left ${CARD} !rounded-[20px]`}
              style={{ animationDelay: `${i * 80}ms`, borderColor: sel ? 'var(--accent)' : undefined, borderWidth: sel ? 2 : undefined, padding: sel ? 13 : undefined }}>
              {o.preview}
              <span className="flex items-center gap-2.5 px-0.5 py-0.5" style={{ color: sel ? 'var(--accent)' : 'var(--text-muted)' }}>
                {o.icon}
                <span className="flex-1 text-[14px] font-medium text-[var(--text)]">{o.label}</span>
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={sel ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { border: '1.5px solid var(--border-strong, var(--border))' }}>
                  {sel ? <Check size={13} strokeWidth={3} /> : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 flex items-center gap-2 text-[12px] text-[var(--text-muted)]"><Sparkles size={14} />{t('setup.look.note')}</p>
    </>
  );
}

function TourStep() {
  const t = useT();
  const bar = (w: number, c: string, h = 7) => <span className="block rounded-[3px]" style={{ width: w, height: h, background: c }} />;
  const cards = [
    { icon: <MessageSquare size={20} />, title: t('setup.tour.chat'), body: t('setup.tour.chatBody'), art: (
      <div className="flex flex-col gap-2">
        <div className="flex w-[150px] flex-col gap-[5px] rounded-xl px-3 py-2.5" style={{ background: tint(18) }}>{bar(110, tint(70))}{bar(80, tint(50))}</div>
        <div className="flex w-[176px] flex-col gap-[5px] rounded-xl bg-[var(--bg-raised)] px-3 py-2.5">{bar(150, 'var(--text-muted)')}{bar(120, 'var(--text-muted)')}{bar(70, 'var(--text-muted)')}</div>
      </div>
    ) },
    { icon: <Layers size={20} />, title: t('setup.tour.timeline'), body: t('setup.tour.timelineBody'), art: (
      <div className="flex flex-col gap-2">
        {[[['a', 70], ['o', 50]], [['b', 40], ['a', 90]], [['o', 60], ['b', 46]]].map((tr, r) => (
          <div key={r} className="flex gap-1">
            {tr.map(([c, w], k) => <span key={k} className="block h-4 rounded" style={{ width: w as number, background: c === 'a' ? tint(80) : c === 'o' ? tint(80, 'var(--ok)') : 'var(--bg-hover)' }} />)}
          </div>
        ))}
      </div>
    ) },
    { icon: <Music size={20} />, title: t('setup.tour.library'), body: t('setup.tour.libraryBody'), art: (
      <div className="grid grid-cols-3 gap-1.5">
        {[Music, Sparkles, Film, Zap, Scissors, Layers].map((Ic, k) => <span key={k} className="flex h-10 w-[58px] items-center justify-center rounded-[9px] bg-[var(--bg-raised)] text-[var(--text-muted)]"><Ic size={17} /></span>)}
      </div>
    ) },
  ];
  return (
    <>
      <Heading icon={<Sparkles size={25} />} title={t('setup.tour.title')} body={t('setup.tour.body')} />
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((c, i) => (
          <div key={c.title} className={`sg-item sg-lift flex flex-col gap-3 p-5 ${CARD} !rounded-[20px]`} style={{ animationDelay: `${i * 140}ms` }}>
            <div className="flex items-center justify-between">
              <Tile size={44}>{c.icon}</Tile>
              <span className="text-[13px] font-semibold tracking-[0.06em] text-[var(--text-muted)]">0{i + 1}</span>
            </div>
            <p className="mt-1 text-[17px] font-semibold tracking-[-0.03em] text-[var(--text)]">{c.title}</p>
            <p className="text-[13px] leading-5 text-[var(--text-muted)]">{c.body}</p>
            <div aria-hidden className="mt-auto flex min-h-[110px] items-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-app)] p-3">{c.art}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Done({ agentName }: { agentName: string }) {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-[18px] py-6 text-center">
      <div className="relative flex h-[180px] w-[180px] items-center justify-center">
        <span aria-hidden className="sg-ring absolute inset-0 rounded-full" style={{ border: '2px solid var(--ok)' }} />
        <span aria-hidden className="absolute inset-0 rounded-full" style={{ border: `2px solid ${tint(25, 'var(--ok)')}` }} />
        <span aria-hidden className="absolute inset-[17px] rounded-full" style={{ border: `2px solid ${tint(50, 'var(--ok)')}` }} />
        <div className="sg-pop flex h-[108px] w-[108px] items-center justify-center rounded-full" style={{ background: tint(20, 'var(--ok)'), border: '2px solid var(--ok)', color: 'var(--ok)' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="sg-draw" d="M20 6 9 17l-5-5" /></svg>
        </div>
      </div>
      <h1 className="text-[42px] font-semibold leading-tight tracking-[-0.06em]">{t('setup.done.title')}</h1>
      <p className="max-w-[520px] text-[15px] leading-6 text-[var(--text-muted)]">{t('setup.done.body')}</p>
      <div className="flex flex-wrap justify-center gap-2.5">
        {agentName ? <Chip ok icon={<Bot size={14} />}>{agentName}</Chip> : null}
        <Chip icon={<Cpu size={14} />}>{t('setup.chips.models')}</Chip>
        <Chip icon={<Sparkles size={14} />}>{t('setup.chips.skills')}</Chip>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = React.useMemo(() => Array.from({ length: 56 }, (_, i) => ({
    left: `${(i * 37) % 100}%`, delay: `${(i % 12) * 55}ms`, dur: `${1.3 + ((i * 13) % 9) / 10}s`, dx: `${((i * 53) % 160) - 80}px`, rot: `${360 + ((i * 71) % 540)}deg`, size: 6 + (i % 4) * 2,
  })), []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className="absolute top-0 rounded-[2px]" style={{
          left: p.left, width: p.size, height: p.size * 1.6, background: i % 5 === 0 ? 'var(--ok)' : i % 3 ? 'var(--accent)' : tint(45, '#fff'),
          animation: `sg-fall ${p.dur} ${p.delay} cubic-bezier(.3,.6,.4,1) both`, ['--dx' as string]: p.dx, ['--rot' as string]: p.rot,
        }} />
      ))}
    </div>
  );
}
