/** Settings → Updates (the app only): receive updates on or off, the channel (stable or beta), and a check now. */
import React from 'react';
import { useT } from '@/i18n';
import { studioHost, type HostUpdateState } from '@/lib/host';
import { SettingsButton, SettingsGroup, SettingsItem, SettingsSegmented, SettingsStatus, SettingsSwitch } from './ui';

export function UpdatesGroup() {
  const t = useT();
  const host = studioHost?.update;
  const [state, setState] = React.useState<HostUpdateState | null>(null);
  const [checking, setChecking] = React.useState(false);
  React.useEffect(() => host?.onState?.(setState), [host]);
  /* a build with no feed (run from source, or built without one) never updates: nothing to set */
  if (!host?.onState || !state || state.status === 'off') return null;
  const enabled = state.enabled !== false;
  const status = !enabled ? t('settings.updates.off')
    : state.status === 'ready' || state.status === 'installing' ? t('settings.updates.ready').replace('{version}', String(state.availableVersion ?? ''))
    : state.status === 'downloading' ? t('settings.updates.downloading').replace('{progress}', String(Math.round(state.progress)))
    : state.status === 'error' ? t('settings.updates.error')
    : state.status === 'current' ? t('settings.updates.current').replace('{version}', String(state.version))
    : t('settings.updates.version').replace('{version}', String(state.version));
  return (
    <SettingsGroup title={t('settings.updates.group')}>
      <SettingsItem
        title={t('settings.updates.receive')}
        description={t('settings.updates.receiveHint')}
        control={<SettingsSwitch checked={enabled} label={t('settings.updates.receive')} onChange={(on) => { void host.setEnabled?.(on).then((s) => s && setState(s)); }} />}
      />
      <SettingsItem
        title={t('settings.updates.channel')}
        description={t('settings.updates.channelHint')}
        control={(
          <SettingsSegmented<'stable' | 'beta'>
            label={t('settings.updates.channel')}
            value={state.channel}
            onChange={(channel) => { void host.setChannel?.(channel).then((s) => s && setState(s)); }}
            options={[{ value: 'stable', label: t('settings.updates.stable') }, { value: 'beta', label: t('settings.updates.beta') }]}
          />
        )}
      />
      <SettingsItem
        title={t('settings.updates.check')}
        description={<SettingsStatus tone={state.status === 'error' ? 'muted' : 'ok'}>{status}</SettingsStatus>}
        control={(
          <SettingsButton disabled={!enabled || checking} onClick={() => { setChecking(true); void host.check?.().finally(() => setChecking(false)); }}>
            {checking ? t('settings.updates.checking') : t('settings.updates.checkNow')}
          </SettingsButton>
        )}
      />
    </SettingsGroup>
  );
}
