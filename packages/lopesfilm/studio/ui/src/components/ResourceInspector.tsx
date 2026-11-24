import React from 'react';
import { Download, File as FileIcon, Loader2 } from '@/lib/icons';
import { useT } from '@/i18n';
import { formatClipDuration, formatFileSize, proxyText, type WorkspaceResource, type WorkspaceResourceKind } from '@/lib/workspace-resources';
import { InspectorPanel } from './InspectorPanel';
import { KIND_ICON } from './MediaPreview';

/** A media file's properties, in the inspector's place. `url` is the file itself on the film origin (Download). */
/** Runs one of Studio's tools on the file (`lopesfilm get <verb>`): the file it made, or why not. */
export type AssetRun = (verb: string, args: Record<string, unknown>) => Promise<{ src?: string; error?: string }>;

export function ResourceInspector({ file, url, width, onClose, run }: {
  file: WorkspaceResource; url: string; width: number; onClose: () => void; run?: AssetRun;
}) {
  const t = useT();
  const Icon = KIND_ICON[file.kind] ?? FileIcon;
  return (
    <InspectorPanel title={t('assets.props')} width={width} onClose={onClose}>
      <div className="flex items-start gap-2.5 border-b border-[var(--border)] py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-field)] text-[var(--text-muted)]"><Icon size={18} /></span>
        <div className="min-w-0"><p className="whitespace-pre-wrap break-words text-[12px] font-medium">{file.name}</p><p className="mt-1 break-all text-[10px] leading-relaxed text-[var(--text-muted)]">{file.path}</p></div>
      </div>
      <AssetFields file={file} />
      {run && (file.kind === 'audio' || file.kind === 'video' || file.kind === 'image') ? <AssetTools file={file} run={run} /> : null}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4 text-[11px]">
        <a href={url} download={file.name} className="flex items-center gap-1.5 rounded-md bg-[var(--bg-field)] px-2.5 py-2 hover:bg-[var(--bg-hover)]"><Download size={13} />{t('assets.download')}</a>
      </div>
    </InspectorPanel>
  );
}

function fileExtension(name: string): string {
  const cut = name.lastIndexOf('.');
  return cut <= 0 ? '' : name.slice(cut + 1).toLowerCase();
}

function assetTypeText(file: WorkspaceResource, t: (path: string) => string): string {
  const label = assetKindLabel(file.kind, t);
  if (file.kind === 'mg') return label;
  const ext = fileExtension(file.name);
  return ext ? `${label} · ${ext.toUpperCase()}` : label;
}

function assetKindLabel(kind: WorkspaceResourceKind, t: (path: string) => string): string {
  if (kind === 'mg') return t('assets.kindPage');
  if (kind === 'video') return t('assets.catVideo');
  if (kind === 'image') return t('assets.catImage');
  if (kind === 'audio') return t('assets.kindAudio');
  return t('assets.catOther');
}

/** Frame rate as people say it: 29.97 keeps two decimals, 30 is 30. */
function formatFps(fps: number): string {
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * A file's facts, read-only: one per row and not drawn as inputs — anything that looks like an input gets clicked,
 * and none of these can be changed. Everything comes from props, so the panel opens without a request.
 */
function AssetFields({ file }: { file: WorkspaceResource }) {
  const t = useT();
  const rows: { label: string; value: string }[] = [
    { label: t('assets.propType'), value: assetTypeText(file, t) },
    { label: t('assets.propSize'), value: formatFileSize(file.size) },
  ];
  if (file.durationMs) {
    rows.push({ label: t('assets.propDuration'), value: formatClipDuration(file.durationMs) });
  }
  if (file.w && file.h) {
    rows.push({ label: t('assets.propDimensions'), value: `${file.w} × ${file.h}` });
  }
  /* only footage has a frame rate; 25 and 30 mixed in one film repeat a frame every few on export, and this is
     where it shows before then */
  if (file.kind === 'video' && file.fps) {
    rows.push({ label: t('assets.propFps'), value: `${formatFps(file.fps)} fps` });
  }
  if (file.mtimeMs) {
    rows.push({ label: t('assets.propModified'), value: new Date(file.mtimeMs).toLocaleString() });
  }
  /* heavy footage's proxy for the preview, or the copy this browser plays it from: being made, ready, or not to be */
  if (file.proxy) rows.push({ label: t('assets.propProxy'), value: proxyText(file.proxy, t) });
  /* a link to media kept elsewhere (a NAS): where it is, or that it cannot be reached now */
  if (file.link) {
    rows.push({ label: t('assets.propLinked'), value: file.link.missing ? `${file.link.to} (${t('media.linkMissing')})` : file.link.to });
  }

  return (
    <dl className="py-2">
      {rows.map((row) => (
        <div key={row.label} className="border-t border-[var(--border)] py-2 first:border-t-0 first:pt-1">
          <dt className="text-[11px] leading-none text-[var(--text-muted)]">{row.label}</dt>
          <dd className="mt-1 break-all text-[12px] leading-[1.45] text-[var(--text)]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Which of the tools below an agent's run is (studio/server/get.mjs ASSET_EDITS): the control its cursor works. */
export function assetToolOf(verb: string, args: Record<string, unknown> = {}): string {
  if (verb === 'audio-clean') {
    if (args.dereverb && args.dereverb !== 'off') return 'dereverb';
    if ((args.denoise === 'off' || args.denoise === undefined) && args.normalize !== undefined && args.normalize !== 'off' && !args.voice) return 'volume';
    return 'audio-clean';
  }
  if (verb === 'stems' && args.mode === 'instrumental') return 'stems-music';
  return verb;
}
const AGENT_ASSET = 'lopesfilm:agent-asset';

/**
 * The file's own tools, the same the agents use: its loudness (a slider), noise, room echo and the voice alone for sound;
 * steadying, background and eyes for video; a larger picture and its background for pictures. Each makes a new file
 * beside it (the original stays). When an agent runs one on this file, its control shows the run and its value
 * (the cursor works it, components/AgentCursor.tsx).
 */
function AssetTools({ file, run }: { file: WorkspaceResource; run: AssetRun }) {
  const t = useT();
  const [lufs, setLufs] = React.useState(-16);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60) || 'asset';
  const video = file.kind === 'video';
  React.useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ phase: string; verb: string; src: string; args?: Record<string, unknown>; made?: string }>).detail;
      if (!d || d.src !== file.path) return;
      const tool = assetToolOf(d.verb, d.args);
      if (d.phase === 'start') {
        setNote(null); setBusy(tool);
        if (tool === 'volume' && d.args?.normalize !== undefined) setLufs(Number(d.args.normalize) || -16);
      } else {
        setBusy(null);
        setNote(d.phase === 'done' ? { ok: true, text: t('assets.toolDone').replace('{file}', (d.made ?? '').split('/').pop() ?? '') } : { ok: false, text: t('assets.toolFailed') });
      }
    };
    window.addEventListener(AGENT_ASSET, on);
    return () => window.removeEventListener(AGENT_ASSET, on);
  }, [file.path, t]);
  const go = async (tool: string, verb: string, args: Record<string, unknown>) => {
    setBusy(tool); setNote(null);
    const r = await run(verb, { src: file.path, ...args });
    setBusy(null);
    setNote(r.src ? { ok: true, text: t('assets.toolDone').replace('{file}', r.src.split('/').pop() ?? r.src) } : { ok: false, text: r.error ?? t('assets.toolFailed') });
  };
  const btn = (tool: string, label: string, verb: string, args: Record<string, unknown>) => (
    <button key={tool} type="button" data-asset-tool={tool} disabled={busy !== null} onClick={() => { void go(tool, verb, args); }}
      className={`flex h-8 items-center justify-center gap-1.5 rounded-[10px] border px-2 text-[12px] text-[var(--text)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60 ${busy === tool || (tool === 'volume-apply' && busy === 'volume') ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
      {busy === tool || (tool === 'volume-apply' && busy === 'volume') ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}{label}
    </button>
  );
  const sound = file.kind === 'audio' || video;
  return (
    <section data-asset-tools="" className="flex flex-col gap-2 border-t border-[var(--border)] py-3">
      <p className="text-[11px] font-semibold text-[var(--text)]">{t('assets.tools')}</p>
      {sound ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]"><span>{t('assets.toolVolume')}</span><span className="tabular-nums">{lufs} LUFS</span></div>
          <input data-asset-tool="volume" type="range" min={-30} max={-9} step={1} value={lufs} disabled={busy !== null}
            onChange={(e) => setLufs(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label={t('assets.toolVolume')} />
          {btn('volume-apply', t('assets.toolVolumeApply'), 'audio-clean', { out: `${base}-volume`, denoise: 'off', normalize: String(lufs), ...(video ? { video: true } : {}) })}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        {sound ? btn('audio-clean', t('assets.toolNoise'), 'audio-clean', { out: `${base}-limpo`, denoise: 'medium', normalize: 'off', ...(video ? { video: true } : {}) }) : null}
        {sound ? btn('dereverb', t('assets.toolEcho'), 'audio-clean', { out: `${base}-sem-eco`, denoise: 'off', dereverb: 'medium', normalize: 'off', ...(video ? { video: true } : {}) }) : null}
        {file.kind === 'audio' ? btn('stems', t('assets.toolVoice'), 'stems', { out: `${base}-voz`, mode: 'voice' }) : null}
        {file.kind === 'audio' ? btn('stems-music', t('assets.toolMusic'), 'stems', { out: `${base}-musica`, mode: 'instrumental' }) : null}
        {video ? btn('stabilize', t('assets.toolStabilize'), 'stabilize', { out: `${base}-estavel`, level: 'medium' }) : null}
        {video ? btn('cutout-video', t('assets.toolCutout'), 'cutout-video', { out: `${base}-sem-fundo` }) : null}
        {video ? btn('eyes', t('assets.toolEyes'), 'eyes', { out: `${base}-olhos` }) : null}
        {file.kind === 'image' ? btn('upscale', t('assets.toolUpscale'), 'upscale', { out: `${base}-2x`, scale: 2 }) : null}
        {file.kind === 'image' ? btn('cutout', t('assets.toolCutout'), 'cutout', { out: `${base}-sem-fundo` }) : null}
      </div>
      <p className="text-[11px] text-[var(--text-faint)]">{t('assets.toolsHint')}</p>
      {note ? <p className={`text-[11px] ${note.ok ? 'text-[var(--ok,#3fb67a)]' : 'text-[var(--danger,#e5484d)]'}`}>{note.text}</p> : null}
    </section>
  );
}
