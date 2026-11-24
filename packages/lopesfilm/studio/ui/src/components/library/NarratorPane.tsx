/**
 * Narrador: the voices that speak Brazilian Portuguese, the words, and how they are said (speed, pitch, pauses written
 * as [pausa]), made by the voice's service (or the one on this computer) and put on the film at the playhead. Preview
 * plays the voice's own sample. The engine is shown with what it would cost before anything paid runs.
 */
import React from 'react';
import { Loader2, Play, Square } from '@/lib/icons';
import { useT } from '@/i18n';
import { languageOf, sampleUrl, useLibraryVoices, useServices, voiceAccess, voiceKey, type LibraryVoice, type VoiceAccess } from '@/lib/library-voices';

export interface NarratorShape { speed: number; pitch: number }

const brazilian = (v: LibraryVoice) => languageOf(v) === 'pt';

export function NarratorPane({ speak, onServices }: {
  /** The words made into sound and put at the playhead: null, or why not. */
  speak?: (voice: LibraryVoice, access: VoiceAccess, text: string, shape: NarratorShape) => Promise<string | null>;
  onServices: () => void;
}) {
  const t = useT();
  const library = useLibraryVoices();
  const services = useServices();
  const access = React.useMemo(() => voiceAccess(library?.providers ?? [], services), [library, services]);
  const all = React.useMemo(() => (library?.voices ?? []).filter(brazilian), [library]);
  /* the Brazilian ones first (pt-BR), then Portugal's */
  const voices = React.useMemo(() => [...all].sort((a, b) => Number(/br/i.test(b.language ?? '')) - Number(/br/i.test(a.language ?? ''))), [all]);
  const [pickedKey, setPickedKey] = React.useState<string | null>(null);
  const voice = voices.find((v) => voiceKey(v) === pickedKey) ?? voices[0] ?? null;
  const [speed, setSpeed] = React.useState(1);
  const [pitch, setPitch] = React.useState(0);
  const [text, setText] = React.useState('');
  const [making, setMaking] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const audio = React.useRef<HTMLAudioElement | null>(null);
  React.useEffect(() => () => { audio.current?.pause(); }, []);

  const ready = voice ? Boolean(access[voice.provider]) : false;
  const service = voice ? library?.providers.find((s) => s.id === voice.provider) : null;

  const preview = () => {
    if (!voice) return;
    if (previewing) { audio.current?.pause(); setPreviewing(false); return; }
    const src = sampleUrl(voice);
    if (!src) return;
    audio.current?.pause();
    const a = new Audio(src);
    a.playbackRate = speed;
    a.onended = () => setPreviewing(false);
    a.onerror = () => setPreviewing(false);
    audio.current = a;
    setPreviewing(true);
    void a.play().catch(() => setPreviewing(false));
  };
  const generate = async () => {
    if (!voice || !speak || !text.trim() || making) return;
    if (!ready) { onServices(); return; }
    setMaking(true); setProblem(null);
    const why = await speak(voice, access[voice.provider]!, text.trim(), { speed, pitch });
    setMaking(false);
    if (why) setProblem(why);
  };

  const row = 'flex flex-col gap-1';
  const slider = (label: string, value: string, el: React.ReactNode) => (
    <div className={row}><div className="flex items-center justify-between text-[12px]"><span className="font-medium text-[var(--text)]">{label}</span><span className="tabular-nums text-[var(--text-muted)]">{value}</span></div>{el}</div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3" data-narrator="">
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('narrator.voice')}</h3>
        {voices.length === 0 ? <p className="text-[12px] text-[var(--text-muted)]">{t('narrator.none')}</p> : (
          <div role="listbox" aria-label={t('narrator.voice')} className="flex max-h-[168px] flex-col gap-1 overflow-y-auto">
            {voices.slice(0, 60).map((v) => {
              const on = voice ? voiceKey(v) === voiceKey(voice) : false;
              return (
                <button key={voiceKey(v)} type="button" role="option" aria-selected={on} onClick={() => setPickedKey(voiceKey(v))}
                  className={`flex min-h-[48px] items-center gap-3 rounded-[10px] border px-3 text-left ${on ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--bg-raised)]' : 'border-transparent hover:bg-[var(--bg-hover)]'}`}>
                  <span className={`size-6 shrink-0 rounded-full bg-[var(--accent)] ${on ? '' : 'opacity-35'}`} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-[var(--text)]">{v.name}</span>
                    <span className="block truncate text-[11px] text-[var(--text-muted)]">{[v.description, services && library?.providers.find((s) => s.id === v.provider)?.name].filter(Boolean).join(' · ')}</span></span>
                </button>
              );
            })}
          </div>
        )}
        {voice && !ready ? <button type="button" onClick={onServices} className="self-start text-[11.5px] text-[var(--accent)] hover:underline">{t('narrator.connect').replace('{service}', service?.name ?? voice.provider)}</button> : null}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('narrator.settings')}</h3>
        {slider(t('narrator.speed'), `${speed.toFixed(2).replace('.', ',')}×`, <input type="range" min={0.5} max={2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={t('narrator.speed')} className="accent-[var(--accent)]" />)}
        {slider(t('narrator.pitch'), `${pitch > 0 ? '+' : ''}${pitch}`, <input type="range" min={-6} max={6} step={1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} aria-label={t('narrator.pitch')} className="accent-[var(--accent)]" />)}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{t('narrator.text')}</h3>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={t('narrator.placeholder')} aria-label={t('narrator.text')}
          className="min-h-[96px] resize-y rounded-[10px] bg-[var(--bg-raised)] p-3 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]" />
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]"><span>{t('narrator.chars').replace('{n}', String(text.length))}</span>
          <span className="font-semibold text-[var(--accent)]">{voice && service ? (service.id.startsWith('local') || service.id === 'supertonic' ? t('narrator.local') : t('narrator.api')) : ''}</span></div>
        {problem ? <p role="alert" className="text-[11.5px] text-[var(--danger,#e0384e)]">{problem}</p> : null}
      </section>
      <div className="flex gap-2">
        <button type="button" onClick={preview} disabled={!voice || !sampleUrl(voice)} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[var(--bg-raised)] text-[12.5px] font-semibold text-[var(--text)] hover:bg-[var(--bg-hover)] disabled:opacity-40">
          {previewing ? <Square size={13} /> : <Play size={13} />}{t('narrator.preview')}
        </button>
        <button type="button" onClick={() => void generate()} disabled={!voice || !text.trim() || making || !speak} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[var(--accent)] text-[12.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-40">
          {making ? <Loader2 size={14} className="animate-spin" /> : null}{t('narrator.generate')}
        </button>
      </div>
    </div>
  );
}
