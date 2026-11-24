import React from 'react';
import { X } from '@/lib/icons';
import { useT } from '@/i18n';
import { api, type StyleState } from '@/api';
import { SettingsButton, SettingsGroup, SettingsItem, SettingsSwitch } from './ui';

/**
 * "Meu estilo" (Settings › General), by Lopes: what the person's own edits taught the agents
 * (studio/server/style-memory.mjs), each line shown so it can be taken out (it is not learnt again), the learning
 * switched off, or all of it let go.
 */
export function StyleMemoryGroup() {
  const t = useT();
  const [state, setState] = React.useState<StyleState | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { void api.style().then(setState).catch(() => setState(null)); }, []);
  if (!state) return null;
  const change = (patch: { enabled?: boolean; forget?: string; clear?: boolean }) => {
    setBusy(true);
    void api.setStyle(patch).then(setState).catch(() => {}).finally(() => setBusy(false));
  };
  return (
    <SettingsGroup title={t('settings.style.group')} footnote={t('settings.style.hint')}>
      <SettingsItem title={t('settings.style.learn')} description={t('settings.style.learnHint').replace('{n}', String(state.edits))}
        control={<SettingsSwitch checked={state.enabled} disabled={busy} label={t('settings.style.learn')} onChange={(on) => change({ enabled: on })} />} />
      {state.lines.length ? (
        <ul className="flex flex-col gap-1 px-5 pb-3" data-style-lines="">
          {state.lines.map((line) => (
            <li key={line.key} className="flex items-start gap-2 rounded-[8px] px-2 py-1.5 hover:bg-[var(--bg-field)]">
              <span className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-[var(--text)]">{line.text}</span>
              <button type="button" disabled={busy} title={t('settings.style.forget')} aria-label={`${t('settings.style.forget')}: ${line.text}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--bg-raised)] hover:text-[var(--text)]"
                onClick={() => change({ forget: line.key })}><X size={13} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-3 text-[13px] text-[var(--text-muted)]">{t('settings.style.empty')}</p>
      )}
      <div className="flex justify-end px-5 pb-4">
        <SettingsButton variant="quiet" disabled={busy || (!state.lines.length && !state.edits)}
          onClick={() => { if (window.confirm(t('settings.style.clearConfirm'))) change({ clear: true }); }}>{t('settings.style.clear')}</SettingsButton>
      </div>
    </SettingsGroup>
  );
}
