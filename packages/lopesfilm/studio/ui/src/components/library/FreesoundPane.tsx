/**
 * Freesound's sounds and music, only those: effects and music found there (studio/server/freesound-route.mjs), heard
 * before they are taken, put on the film at the playhead (ProjectView's `generate`, `get web-music --via freesound`),
 * each with its author and licence. The search box above it is its search. Needs the person's Freesound key.
 */
import React from 'react';
import { Loader2, Pause, Play, Plus } from '@/lib/icons';
import { useT } from '@/i18n';
import type { Generate } from './AiGenPane';

interface Found { id: number; name: string; by: string; licence: string; dur: number; page: string; preview: string; tags: string[] }
type Kind = 'sfx' | 'music';

const clock = (s: number) => (s < 60 ? `${Math.round(s * 10) / 10} s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

export function FreesoundPane({ query, generate, onServices }: { query: string; generate?: Generate; onServices: () => void }) {
  const t = useT();
  const [kind, setKind] = React.useState<Kind>('sfx');
  const [found, setFound] = React.useState<Found[]>([]);
  const [connected, setConnected] = React.useState(true);
  const [more, setMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState<number | null>(null);
  const [adding, setAdding] = React.useState<number | null>(null);
  const audio = React.useRef<HTMLAudioElement | null>(null);

  const stop = React.useCallback(() => { audio.current?.pause(); audio.current = null; setPlaying(null); }, []);
  React.useEffect(() => stop, [stop]);

  React.useEffect(() => { setPage(1); }, [query, kind]);
  React.useEffect(() => {
    const ctl = new AbortController();
    const wait = setTimeout(async () => {
      setBusy(true); setProblem(null);
      try {
        const res = await fetch(`/api/freesound/search?${new URLSearchParams({ q: query.trim(), kind, page: String(page) })}`, { signal: ctl.signal });
        const body = await res.json() as { connected?: boolean; found?: Found[]; next?: boolean; error?: string; message?: string };
        if (!res.ok) { setProblem(body.error ?? body.message ?? String(res.status)); return; }
        setConnected(body.connected !== false);
        setMore(Boolean(body.next));
        setFound((old) => (page > 1 ? [...old, ...(body.found ?? [])] : body.found ?? []));
      } catch (e) { if (!ctl.signal.aborted) setProblem(String((e as Error).message)); }
      finally { if (!ctl.signal.aborted) setBusy(false); }
    }, page > 1 ? 0 : 350);
    return () => { clearTimeout(wait); ctl.abort(); };
  }, [query, kind, page]);

  const play = (f: Found) => {
    if (playing === f.id) { stop(); return; }
    stop();
    const a = new Audio(f.preview);
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    audio.current = a; setPlaying(f.id);
    void a.play().catch(() => setPlaying(null));
  };
  const add = async (f: Found) => {
    if (!generate || adding != null) return;
    setAdding(f.id); setProblem(null);
    const why = await generate({ verb: 'web-music', via: 'freesound', args: { id: f.id, kind, out: `freesound-${f.id}` } });
    if (why) setProblem(why);
    setAdding(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-freesound>
      <div role="radiogroup" className="mx-3 mb-2 flex h-8 shrink-0 gap-1 rounded-[10px] bg-[var(--bg-raised)] p-1">
        {(['sfx', 'music'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { stop(); setKind(k); }}
            className={`flex-1 rounded-[7px] text-[11.5px] font-semibold ${kind === k ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
            {t(k === 'sfx' ? 'assetDrawer.fsSfx' : 'assetDrawer.fsMusic')}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!connected ? (
          <div className="flex flex-col items-start gap-2 py-6 text-[12.5px] text-[var(--text-muted)]">
            <span>{t('assetDrawer.fsConnectText')}</span>
            <button type="button" onClick={onServices} className="h-8 rounded-[8px] bg-[var(--accent)] px-3 text-[12px] font-semibold text-[var(--on-accent,#fff)]">{t('assetDrawer.fsConnect')}</button>
          </div>
        ) : (
          <>
            {problem ? <p className="py-2 text-[12px] text-[var(--danger,#e5484d)]" role="alert">{problem}</p> : null}
            {!busy && !problem && !found.length ? <p className="py-6 text-[12.5px] text-[var(--text-muted)]">{t('assetDrawer.fsNothing')}</p> : null}
            <ul className="flex flex-col gap-0.5">
              {found.map((f) => (
                <li key={f.id} className="group flex items-center gap-2 rounded-[8px] px-1.5 py-1.5 hover:bg-[var(--bg-hover)]">
                  <button type="button" onClick={() => play(f)} aria-label={f.name}
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-raised)] text-[var(--text)] hover:bg-[var(--bg-pressed)]">
                    {playing === f.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-[var(--text)]">{f.name}</div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">{f.by} · {f.licence} · {clock(f.dur)}</div>
                  </div>
                  <button type="button" onClick={() => void add(f)} disabled={!generate || adding != null} title={t('assetDrawer.fsAdd')} aria-label={t('assetDrawer.fsAdd')}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-pressed)] hover:text-[var(--text)] disabled:opacity-40">
                    {adding === f.id ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-4" />}
                  </button>
                </li>
              ))}
            </ul>
            {busy ? <div className="flex items-center gap-2 py-3 text-[12px] text-[var(--text-muted)]"><Loader2 className="size-3.5 animate-spin" />{t('assetDrawer.fsSearching')}</div> : null}
            {more && !busy ? <button type="button" onClick={() => setPage((p) => p + 1)} className="mt-2 h-8 w-full rounded-[8px] text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">{t('assetDrawer.fsMore')}</button> : null}
            <p className="pt-3 text-[11px] text-[var(--text-faint)]">{t('assetDrawer.fsCredit')}</p>
          </>
        )}
      </div>
    </div>
  );
}
