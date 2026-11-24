/**
 * A new version of the app is downloaded and ready: say so once, with what it brings, and let the person choose, Update
 * now (restart into it) or Later (it installs when the app closes, and asks again the next time it opens). Shown once
 * per version per run; the button in the top bar (UpdateButton) stays for whoever chose Later.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Wrench, Zap } from '@/lib/icons';
import { useT } from '@/i18n';
import { useHostUpdate } from '@/lib/host';
import { releaseFromSite, type NoteKind } from '@/lib/whats-new';
import { Card, CardActions, CardButton } from './Card';

const KIND_ICON: Record<NoteKind, React.ReactNode> = {
  new: <Sparkles size={13} aria-hidden />,
  improved: <Zap size={13} aria-hidden />,
  fixed: <Wrench size={13} aria-hidden />,
};

export function UpdatePrompt() {
  const t = useT();
  const host = useHostUpdate();
  const [dismissed, setDismissed] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const version = host?.update.status === 'ready' ? host.update.version : null;
  const open = Boolean(host && version && dismissed !== version);
  const later = React.useCallback(() => setDismissed(version), [version]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); later(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, later]);

  if (!host || !version || !open || typeof document === 'undefined') return null;
  const waiting = host.update.waiting;
  const release = host.update.notes ? releaseFromSite(version, host.update.notes) : null;
  const items = release?.notes.en ?? [];
  const now = async () => {
    setError(null);
    const r = await host.restart();
    if (!r.ok) setError(r.error ?? t('update.installFailed').replace('{version}', version));
  };
  return createPortal(
    <div className="fixed inset-0 z-[10100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" onClick={later}>
      <div className="w-full max-w-[460px]" role="dialog" aria-modal="true" aria-label={t('update.promptTitle').replace('{version}', version)} onClick={(e) => e.stopPropagation()}>
        <Card title={t('update.promptTitle').replace('{version}', version)} body={t('update.promptBody')} onClose={later}>
          {items.length ? (
            <ul className="mt-3 flex max-h-[220px] flex-col gap-1.5 overflow-y-auto pr-1">
              {items.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
                  <span className="mt-[3px] shrink-0 text-[var(--text-faint)]">{KIND_ICON[n.kind]}</span>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {waiting === 'agent-busy' || waiting === 'exporting' ? (
            <p className="mt-3 text-[12px] text-[var(--text-muted)]">{t(waiting === 'agent-busy' ? 'update.agentBusy' : 'update.exporting')}</p>
          ) : null}
          {error ? <p role="alert" className="mt-3 text-[12px] text-[var(--danger,#e0384e)]">{error}</p> : null}
          <CardActions>
            <CardButton weight="quiet" onClick={later}>{t('update.later')}</CardButton>
            <CardButton weight="primary" onClick={() => void now()}>{t('update.now')}</CardButton>
          </CardActions>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
