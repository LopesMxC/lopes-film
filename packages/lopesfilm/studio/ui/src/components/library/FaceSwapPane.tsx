/**
 * Face swap: the face of a picture put in place of the person's in a clip (or several clips at once), made by an outside
 * API (the clip's people replaced, MiniMax H3 Max Recast at fal). Never without the consent of the person whose face it
 * is: the box has to be ticked, each time. Clips are made one after another with progress and a cancel. Local
 * face swap is not on this computer yet (it says so).
 */
import React from 'react';
import { Loader2 } from '@/lib/icons';
import { useT } from '@/i18n';
import { FACE_SWAP_MODEL, route, useAi, useEngine, useEstimate } from '@/lib/ai-engine';
import { EngineNote, Segment, type Generate } from './AiGenPane';

export interface ProjectMedia { path: string; name: string; kind: 'video' | 'image' }

export function FaceSwapPane({ media, generate, onServices }: { media: ProjectMedia[]; generate?: Generate; onServices: () => void }) {
  const t = useT();
  const ai = useAi();
  const [engine, setEngine] = useEngine('faceswap', ai?.advice);
  const reach = route(ai, 'faceswap', engine);
  const clips = React.useMemo(() => media.filter((m) => m.kind === 'video'), [media]);
  const faces = React.useMemo(() => media.filter((m) => m.kind === 'image'), [media]);
  const [face, setFace] = React.useState('');
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [consent, setConsent] = React.useState(false);
  const [run, setRun] = React.useState<{ done: number; total: number; current: string } | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);
  const abort = React.useRef<AbortController | null>(null);
  const seconds = Math.max(5, picked.size * 5);
  const est = useEstimate('faceswap', seconds, engine === 'api');
  const toggle = (p: string) => setPicked((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const can = Boolean(reach && generate && face && picked.size && consent && !run);

  const start = async () => {
    if (!can || !reach || !generate) return;
    const list = clips.filter((c) => picked.has(c.path));
    abort.current = new AbortController();
    setProblems([]);
    const bad: string[] = [];
    for (let i = 0; i < list.length; i++) {
      if (abort.current.signal.aborted) break;
      const clip = list[i]!;
      setRun({ done: i, total: list.length, current: clip.name });
      const why = await generate({
        verb: 'video', via: reach.via, model: FACE_SWAP_MODEL, signal: abort.current.signal,
        args: { out: `faceswap-${Date.now().toString(36)}-${i + 1}`, video: clip.path, 'input-reference': [face] },
      });
      if (why && !abort.current.signal.aborted) bad.push(`${clip.name}: ${why}`);
    }
    setRun(null);
    setProblems(bad);
  };

  const list = 'flex max-h-[132px] flex-col gap-1 overflow-y-auto';
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3" data-ai-pane="faceswap">
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('ai.engine')}</h3>
        <Segment value={engine} onChange={setEngine} labels={[t('ai.local'), t('ai.api')]} />
        {engine === 'local' ? <p className="text-[11.5px] text-[var(--text-muted)]">{t('ai.faceLocalSoon')}</p> : null}
        <EngineNote service="faceswap" engine={engine} ready={Boolean(reach)} name={reach?.name} usd={est ? { min: est.minUsd, max: est.maxUsd, unit: est.unit } : null} />
        {!reach && engine === 'api' ? <button type="button" onClick={onServices} className="self-start text-[11.5px] text-[var(--accent)] hover:underline">{t('ai.connect')}</button> : null}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('ai.faceFace')}</h3>
        {faces.length === 0 ? <p className="text-[11.5px] text-[var(--text-muted)]">{t('ai.faceNoImages')}</p> : (
          <div className={list} role="listbox">{faces.map((f) => <button key={f.path} type="button" role="option" aria-selected={face === f.path} onClick={() => setFace(f.path)}
            className={`h-9 truncate rounded-lg px-3 text-left text-[12px] ${face === f.path ? 'bg-[var(--bg-raised)] text-[var(--accent)]' : 'text-[var(--text)] hover:bg-[var(--bg-hover)]'}`}>{f.name}</button>)}</div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('ai.faceClips').replace('{n}', String(picked.size))}</h3>
        {clips.length === 0 ? <p className="text-[11.5px] text-[var(--text-muted)]">{t('ai.faceNoClips')}</p> : (
          <div className={list}>{clips.map((c) => <label key={c.path} className="flex h-9 items-center gap-2 rounded-lg px-3 text-[12px] text-[var(--text)] hover:bg-[var(--bg-hover)]"><input type="checkbox" checked={picked.has(c.path)} onChange={() => toggle(c.path)} className="accent-[var(--accent)]" /><span className="truncate">{c.name}</span></label>)}</div>
        )}
      </section>
      <label className="flex items-start gap-2 rounded-[10px] border border-[var(--border)] p-3 text-[11.5px] leading-snug text-[var(--text)]" data-consent="">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
        <span>{t('ai.faceConsent')}</span>
      </label>
      {run ? <div className="flex flex-col gap-1" role="status"><div className="h-1 rounded bg-[var(--border)]"><div className="h-1 rounded bg-[var(--accent)]" style={{ width: `${(run.done / run.total) * 100}%` }} /></div><span className="text-[11.5px] text-[var(--text-muted)]">{t('ai.faceProgress').replace('{done}', String(run.done)).replace('{total}', String(run.total)).replace('{name}', run.current)}</span></div> : null}
      {problems.map((p) => <p key={p} role="alert" className="text-[11.5px] text-[var(--danger,#e0384e)]">{p}</p>)}
      <div className="flex gap-2">
        {run ? <button type="button" onClick={() => abort.current?.abort()} className="h-10 flex-1 rounded-[10px] bg-[var(--bg-raised)] text-[12.5px] font-semibold text-[var(--text)]">{t('ai.cancel')}</button> : null}
        <button type="button" onClick={() => void start()} disabled={!can} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[var(--accent)] text-[12.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-40">
          {run ? <Loader2 size={14} className="animate-spin" /> : null}{t('ai.faceMake')}
        </button>
      </div>
    </div>
  );
}
