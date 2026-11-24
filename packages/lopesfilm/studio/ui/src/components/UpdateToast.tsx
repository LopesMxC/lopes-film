/**
 * A new version was found: a small pop-up in the corner says so while it downloads in the background (once per
 * version per run). When it is downloaded the UpdatePrompt takes over ("Update now" / "Later"), so this one leaves.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from '@/lib/icons';
import { useT } from '@/i18n';
import { studioHost, type HostUpdateState } from '@/lib/host';

export function UpdateToast() {
  const t = useT();
  const host = studioHost?.update;
  const [state, setState] = React.useState<HostUpdateState | null>(null);
  const [closed, setClosed] = React.useState<string | null>(null);
  React.useEffect(() => host?.onState?.(setState), [host]);

  const version = state?.availableVersion ?? null;
  const finding = state && state.enabled !== false && (state.status === 'available' || state.status === 'downloading');
  if (!finding || !version || closed === version || typeof document === 'undefined') return null;
  const progress = Math.round(state.progress);
  return createPortal(
    <div role="status" aria-live="polite" className="lf-update-toast fixed bottom-5 right-5 z-[10050] w-[320px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-raised)] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)]">
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><Download size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-[var(--text)]">{t('update.foundTitle').replace('{version}', version)}</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
            {state.status === 'downloading' && progress > 0 ? t('update.foundProgress').replace('{progress}', String(progress)) : t('update.foundBody')}
          </p>
        </div>
        <button type="button" aria-label="×" onClick={() => setClosed(version)} className="-mr-1 -mt-1 rounded-md p-1 text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"><X size={14} /></button>
      </div>
      <div className="h-[3px] bg-[var(--bg-pressed)]"><div className="h-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${state.status === 'downloading' ? Math.max(4, progress) : 4}%` }} /></div>
    </div>,
    document.body,
  );
}
