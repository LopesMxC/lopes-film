/**
 * Image, music and video made by an AI service, from words: the engine chosen first (on this computer, or an outside API,
 * remembered), what it would cost shown before a paid call, the result put on the film at the playhead (ProjectView's
 * `generate`). Face swap is its own pane (FaceSwapPane).
 */
import React from 'react';
import { Loader2 } from '@/lib/icons';
import { useT } from '@/i18n';
import { route, useAi, useEngine, useEstimate, type Engine, type Service } from '@/lib/ai-engine';

export interface GenerateRequest { verb: 'image' | 'music' | 'video'; via: string; model?: string; args: Record<string, unknown>; signal?: AbortSignal }
export type Generate = (req: GenerateRequest) => Promise<string | null>;

const RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:2'];

export function Segment({ value, onChange, labels, disabled }: { value: Engine; onChange: (e: Engine) => void; labels: [string, string]; disabled?: Partial<Record<Engine, boolean>> }) {
  return (
    <div role="radiogroup" className="flex h-9 gap-1 rounded-[10px] bg-[var(--bg-raised)] p-1">
      {(['local', 'api'] as const).map((e, i) => (
        <button key={e} type="button" role="radio" aria-checked={value === e} onClick={() => onChange(e)} disabled={disabled?.[e]}
          className={`flex-1 rounded-[7px] text-[11.5px] font-semibold ${value === e ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'} disabled:opacity-40`}>{labels[i]}</button>
      ))}
    </div>
  );
}

export function EngineNote({ service, engine, ready, name, usd }: { service: Service; engine: Engine; ready: boolean; name?: string; usd: { min: number; max: number; unit: string } | null }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1 text-[11.5px] text-[var(--text-muted)]" data-engine-note={service}>
      {!ready ? <span>{t(engine === 'local' ? 'ai.localMissing' : 'ai.apiMissing')}</span>
        : engine === 'local' ? <span className="font-semibold text-[var(--accent)]">{t('ai.localFree').replace('{name}', name ?? '')}</span>
          : <span><b className="text-[var(--text)]">{name}</b>{usd ? ` · ${t('ai.estimate').replace('{min}', usd.min.toFixed(2)).replace('{max}', usd.max.toFixed(2)).replace('{unit}', usd.unit)}` : ''}</span>}
    </div>
  );
}

export function AiGenPane({ service, generate, onServices }: { service: 'image' | 'music' | 'video'; generate?: Generate; onServices: () => void }) {
  const t = useT();
  const ai = useAi();
  const [engine, setEngine] = useEngine(service, ai?.advice);
  const reach = route(ai, service, engine);
  const [prompt, setPrompt] = React.useState('');
  const [ratio, setRatio] = React.useState('16:9');
  const [seconds, setSeconds] = React.useState(service === 'music' ? 30 : 5);
  const [confirmed, setConfirmed] = React.useState(false);
  const [making, setMaking] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const units = service === 'image' ? 1 : service === 'music' ? Math.max(0.1, seconds / 60) : seconds;
  const est = useEstimate(service, units, engine === 'api');
  const advised = ai?.advice.find((a) => a.id === service);
  React.useEffect(() => { setConfirmed(false); }, [engine, seconds, prompt]);

  const go = async () => {
    if (!reach || !generate || !prompt.trim() || making) return;
    if (engine === 'api' && !confirmed) { setConfirmed(true); return; }
    setMaking(true); setProblem(null);
    abort.current = new AbortController();
    const args: Record<string, unknown> = { prompt: prompt.trim(), out: `${service}-${Date.now().toString(36)}` };
    if (service === 'image') args.ratio = ratio;
    if (service === 'video') { args.duration = seconds; args['aspect-ratio'] = ratio; }
    if (service === 'music') args.duration = seconds;
    const why = await generate({ verb: service, via: reach.via, ...(reach.model ? { model: reach.model } : {}), args, signal: abort.current.signal });
    setMaking(false);
    if (why) setProblem(why);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3" data-ai-pane={service}>
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('ai.engine')}</h3>
        <Segment value={engine} onChange={setEngine} labels={[t('ai.local'), t('ai.api')]} />
        {advised ? <p className="text-[11px] text-[var(--text-muted)]">{advised.mode === engine ? advised.why : t('ai.advice').replace('{mode}', t(advised.mode === 'local' ? 'ai.local' : 'ai.api')).replace('{why}', advised.why)}</p> : null}
        <EngineNote service={service} engine={engine} ready={Boolean(reach)} name={reach?.name} usd={est ? { min: est.minUsd, max: est.maxUsd, unit: est.unit } : null} />
        {!reach ? <button type="button" onClick={onServices} className="self-start text-[11.5px] text-[var(--accent)] hover:underline">{t('ai.connect')}</button> : null}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t(`ai.prompt_${service}`)}</h3>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} aria-label={t(`ai.prompt_${service}`)} placeholder={t(`ai.placeholder_${service}`)}
          className="min-h-[88px] resize-y rounded-[10px] bg-[var(--bg-raised)] p-3 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]" />
      </section>
      {service !== 'music' ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('ai.ratio')}</h3>
          <div className="flex flex-wrap gap-1">{RATIOS.map((r) => <button key={r} type="button" aria-pressed={ratio === r} onClick={() => setRatio(r)} className={`h-8 rounded-lg px-3 text-[11.5px] font-medium ${ratio === r ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>{r}</button>)}</div>
        </section>
      ) : null}
      {service !== 'image' ? (
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[12px]"><span className="font-medium text-[var(--text)]">{t('ai.duration')}</span><span className="tabular-nums text-[var(--text-muted)]">{seconds} s</span></div>
          <input type="range" min={service === 'music' ? 10 : 2} max={service === 'music' ? 120 : 15} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} aria-label={t('ai.duration')} className="accent-[var(--accent)]" />
        </section>
      ) : null}
      {problem ? <p role="alert" className="text-[11.5px] text-[var(--danger,#e0384e)]">{problem}</p> : null}
      <div className="flex gap-2">
        {making ? <button type="button" onClick={() => abort.current?.abort()} className="h-10 flex-1 rounded-[10px] bg-[var(--bg-raised)] text-[12.5px] font-semibold text-[var(--text)]">{t('ai.cancel')}</button> : null}
        <button type="button" onClick={() => void go()} disabled={!reach || !prompt.trim() || making || !generate} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[var(--accent)] text-[12.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-40">
          {making ? <Loader2 size={14} className="animate-spin" /> : null}{engine === 'api' && !confirmed && !making ? t('ai.review') : t(`ai.make_${service}`)}
        </button>
      </div>
    </div>
  );
}
