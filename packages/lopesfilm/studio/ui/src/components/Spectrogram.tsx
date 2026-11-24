/**
 * The film's sound as it plays, drawn like a colourist's scopes: on top the spectrum analyser (frequency across, log,
 * 20 Hz–20 kHz; loudness up, dB; a smooth filled trace, a peak line that falls slowly, a graticule), under it the
 * spectrogram (frequency up, time across with the newest at the right, loudness as heat) with its own frequency scale.
 * Both are drawn at the screen's real resolution, smoothed in time and in frequency, so nothing shows as blocks. One
 * reading a frame from the player's mix (editor/player.ts levels); paused, nothing runs. Opened and closed with its button.
 */
import * as React from 'react';

import { useT } from '@/i18n';
import { freqPos, heatColor, logBands, spectrumDb, SPEC_CEIL_DB, SPEC_FLOOR_DB } from '@/lib/spectrogram';

/** The width of a side picture, columns (time): kept for the layout's sake */
export const SIDE_W = 120;
/** The width the aside takes beside the picture, px (with its gap). */
export const SIDE_TAKES = 226;
/** Marks on the frequency scale, Hz, and the loudness graticule, dB */
const MARKS: Array<[number, string]> = [[50, '50'], [100, '100'], [500, '500'], [1000, '1k'], [5000, '5k'], [10000, '10k']];
const DB_LINES = [-20, -40, -60, -80];
const BANDS = 160;
/** columns of the spectrogram a second */
const COLS_PER_SEC = 40;

/** A canvas kept at its on-screen size times the device's pixel ratio. */
function useSized(ref: React.RefObject<HTMLCanvasElement | null>, open: boolean) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!open || !el) return undefined;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(el.clientWidth * dpr)), h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      setSize({ w, h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, ref]);
  return size;
}

export function SpectrogramSide({ spectrum, playing, open, onToggle }: {
  /** The mix's latest 4096 samples as mono, and the rate they are at, or null when nothing plays (see Player.spectrumSamples). */
  spectrum: () => { samples: Float32Array; rate: number } | null;
  playing: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const rta = React.useRef<HTMLCanvasElement | null>(null);
  const heat = React.useRef<HTMLCanvasElement | null>(null);
  const rtaSize = useSized(rta, open);
  const heatSize = useSized(heat, open);

  React.useEffect(() => {
    if (!open || !rtaSize.w || !heatSize.w) return undefined;
    const r = rta.current?.getContext('2d'), h = heat.current?.getContext('2d');
    if (!r || !h) return undefined;
    const smooth = new Float32Array(BANDS).fill(SPEC_FLOOR_DB);
    const hold = new Float32Array(BANDS).fill(SPEC_FLOOR_DB);
    let last = 0, acc = 0, raf = 0;
    const level = (db: number) => Math.min(1, Math.max(0, (db - SPEC_FLOOR_DB) / (SPEC_CEIL_DB - SPEC_FLOOR_DB)));

    const drawRta = () => {
      const { width: w, height: ht } = r.canvas;
      r.clearRect(0, 0, w, ht);
      /* graticule */
      r.lineWidth = 1; r.strokeStyle = 'rgba(255,255,255,.07)';
      for (const db of DB_LINES) { const y = Math.round(ht * (1 - level(db))) + .5; r.beginPath(); r.moveTo(0, y); r.lineTo(w, y); r.stroke(); }
      for (const [hz] of MARKS) { const x = Math.round(freqPos(hz) * w) + .5; r.beginPath(); r.moveTo(x, 0); r.lineTo(x, ht); r.stroke(); }
      const xs = (i: number) => (i / (BANDS - 1)) * w, ys = (db: number) => ht * (1 - level(db));
      /* the trace, smoothed through its points */
      const path = new Path2D();
      path.moveTo(0, ht);
      path.lineTo(xs(0), ys(smooth[0]!));
      for (let i = 1; i < BANDS; i++) { const mx = (xs(i - 1) + xs(i)) / 2, my = (ys(smooth[i - 1]!) + ys(smooth[i]!)) / 2; path.quadraticCurveTo(xs(i - 1), ys(smooth[i - 1]!), mx, my); }
      path.lineTo(w, ys(smooth[BANDS - 1]!)); 
      const line = new Path2D(path);
      path.lineTo(w, ht); path.closePath();
      const fill = r.createLinearGradient(0, 0, 0, ht);
      fill.addColorStop(0, 'rgba(255,170,60,.55)'); fill.addColorStop(.5, 'rgba(214,68,110,.32)'); fill.addColorStop(1, 'rgba(78,18,118,.05)');
      r.fillStyle = fill; r.fill(path);
      r.lineWidth = Math.max(1.5, w / 160); r.strokeStyle = 'rgba(255,214,150,.95)'; r.lineJoin = 'round'; r.stroke(line);
      /* the peak line */
      r.beginPath();
      for (let i = 0; i < BANDS; i++) { const x = xs(i), y = ys(hold[i]!); if (i) r.lineTo(x, y); else r.moveTo(x, y); }
      r.lineWidth = 1; r.strokeStyle = 'rgba(255,255,255,.4)'; r.stroke();
    };

    const scrollHeat = (bands: Float32Array) => {
      const { width: w, height: ht } = h.canvas;
      h.drawImage(h.canvas, -1, 0);
      const col = h.createImageData(1, ht);
      for (let y = 0; y < ht; y++) {
        /* between two bands, so the column is a smooth slope and not steps */
        const pos = ((ht - 1 - y) / (ht - 1)) * (bands.length - 1);
        const i = Math.min(bands.length - 2, Math.floor(pos)), f = pos - i;
        const [cr, cg, cb] = heatColor(bands[i]! * (1 - f) + bands[i + 1]! * f);
        col.data.set([cr, cg, cb, 255], y * 4);
      }
      h.putImageData(col, w - 1, 0);
    };

    const tick = (now: number) => {
      const tap = playing ? spectrum() : null;
      if (tap) {
        const bands = logBands(spectrumDb(tap.samples), tap.rate, BANDS);
        /* attack quick, release slow (an analyser's ballistics) and a peak that falls 18 dB a second */
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
        for (let i = 0; i < BANDS; i++) {
          const v = bands[i]!;
          smooth[i] = v > smooth[i]! ? smooth[i]! + (v - smooth[i]!) * 0.6 : smooth[i]! + (v - smooth[i]!) * 0.14;
          hold[i] = Math.max(smooth[i]!, hold[i]! - 18 * dt);
        }
        drawRta();
        acc += dt * COLS_PER_SEC;
        const cols = Math.floor(acc);
        acc -= cols;
        for (let c = 0; c < Math.min(cols, 4); c++) scrollHeat(smooth);
      } else if (!playing) {
        /* paused: the last picture stays (the trace settles, the peaks come down), then nothing runs */
        hold.set(smooth); drawRta();
        return;
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, playing, spectrum, rtaSize.w, rtaSize.h, heatSize.w, heatSize.h]);

  const label = 'pointer-events-none absolute text-[8.5px] leading-none tabular-nums text-[rgba(255,255,255,.5)]';
  return (
    <aside data-spectrogram="" aria-label={t('editorTools.spectrogram')}
      className="absolute bottom-2.5 right-2 top-2.5 z-10 flex w-[216px] max-w-[46%] flex-col gap-1.5 rounded-[12px] border border-[var(--border-strong)] bg-[#07080b] p-1.5 shadow-[var(--shadow-lg)]"
      style={open ? undefined : { bottom: 'auto', width: 'auto' }}>
      <button type="button" onClick={onToggle} aria-pressed={open} title={t('editorTools.spectrogram')}
        className="flex shrink-0 items-center justify-between rounded px-1 text-[10px] font-semibold tracking-[.14em] text-[var(--text-muted)] hover:text-[var(--accent)]">
        <span>SPEC</span><span aria-hidden>{open ? '×' : '▸'}</span>
      </button>
      {open ? (
        <>
          <div className="relative min-h-0 flex-[2] overflow-hidden rounded-[4px] bg-[#0b0c11] ring-1 ring-[rgba(255,255,255,.08)]">
            <canvas ref={rta} aria-label={t('editorTools.spectrogramGrey')} className="absolute inset-0 h-full w-full" />
            {DB_LINES.map((db) => <span key={db} className={`${label} left-1`} style={{ top: `calc(${(1 - (db - SPEC_FLOOR_DB) / (SPEC_CEIL_DB - SPEC_FLOOR_DB)) * 100}% - 9px)` }}>{db}</span>)}
          </div>
          <div className="relative min-h-0 flex-[3] overflow-hidden rounded-[4px] bg-black ring-1 ring-[rgba(255,255,255,.08)]">
            <canvas ref={heat} aria-label={t('editorTools.spectrogramColor')} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'auto' }} />
            {MARKS.map(([hz, text]) => (
              <React.Fragment key={hz}>
                <span aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-[rgba(255,255,255,.1)]" style={{ bottom: `${freqPos(hz) * 100}%` }} />
                <span className={`${label} right-1`} style={{ bottom: `calc(${freqPos(hz) * 100}% + 2px)` }}>{text}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="flex shrink-0 justify-between px-0.5 text-[8.5px] text-[var(--text-faint)]"><span>20 Hz</span>{!playing ? <span>{t('editorTools.spectrogramIdle')}</span> : null}<span>20 kHz</span></div>
        </>
      ) : null}
    </aside>
  );
}
