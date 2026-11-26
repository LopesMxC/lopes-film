import React from 'react';
import { Check, FolderOpen, Plus, X } from '@/lib/icons';
import { useT } from '@/i18n';
import { studioHost, type HostAgent } from '@/lib/host';
import { SettingsButton, SettingsInset } from './ui';

/**
 * Claude Code's accounts (Settings › Agents › Claude Code), by Lopes: the computer's own sign-in, and others of the
 * app's, each signed in apart in a folder of its own and, if the person has a second install of Claude Code, with that
 * program. Choosing one connects with it at once: nobody is signed out, so going back is instant.
 */
export function ClaudeAccounts({ agent, onError }: { agent: HostAgent; onError: (text: string | null) => void }) {
  const t = useT();
  const host = studioHost?.agents?.claudeAccounts;
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const accounts = agent.claudeAccounts;
  /* how much of its plan each account has used, as the plan says it (when sharing, or on a look) */
  const [used, setUsed] = React.useState<Record<string, { five: number | null; seven: number | null }>>({});
  const key = JSON.stringify([accounts?.list.map((a) => a.id), accounts?.active]);
  React.useEffect(() => {
    let live = true;
    void host?.usage?.().then((all) => {
      if (!live) return;
      setUsed(Object.fromEntries(all.map((u) => [u.id ?? 'own', { five: u.five?.pct ?? null, seven: u.seven?.pct ?? null }])));
    }).catch(() => {});
    return () => { live = false; };
  }, [host, key]);
  if (!host || !accounts) return null;
  const run = (job: () => Promise<{ ok?: boolean; error?: string } | unknown>) => {
    setBusy(true);
    onError(null);
    void job()
      .then((r) => { const res = r as { ok?: boolean; error?: string } | undefined; if (res && res.ok === false && res.error) onError(res.error); })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const rows = [{ id: null as string | null, name: t('settings.agents.claudeAccounts.own'), path: undefined as string | undefined }, ...accounts.list];
  const row = 'flex items-center gap-2 rounded-[8px] px-2.5 py-2';
  return (
    <SettingsInset>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{t('settings.agents.claudeAccounts.title')}</p>
        {!adding ? (
          <SettingsButton variant="quiet" disabled={busy} onClick={() => { setAdding(true); setName(''); }}>
            <Plus size={14} /> {t('settings.agents.claudeAccounts.add')}
          </SettingsButton>
        ) : null}
      </div>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label={t('settings.agents.claudeAccounts.title')}>
        {rows.map((a) => {
          const on = (accounts.active ?? null) === a.id;
          return (
            <div key={a.id ?? 'own'} data-claude-account={a.id ?? 'own'} className={`${row} ${on ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-field)]'}`}>
              <button type="button" role="radio" aria-checked={on} disabled={busy || on}
                onClick={() => run(() => host.use(a.id))}
                className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default">
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--border)]'}`}>
                  {on ? <Check size={11} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[var(--text)]">{a.name}</span>
                  <span className="block truncate text-[12px] text-[var(--text-muted)]">
                    {(() => {
                      const u = used[a.id ?? 'own'];
                      return u && (u.five != null || u.seven != null)
                        ? `${u.five != null ? `5 h ${Math.round(u.five)}%` : ''}${u.five != null && u.seven != null ? ' · ' : ''}${u.seven != null ? `7 d ${Math.round(u.seven)}%` : ''}  ·  `
                        : '';
                    })()}
                    {a.id === null ? t('settings.agents.claudeAccounts.ownHint') : a.path ? a.path : t('settings.agents.claudeAccounts.programAuto')}
                  </span>
                </span>
              </button>
              {a.id !== null ? (
                <>
                  <button type="button" disabled={busy} title={t('settings.agents.claudeAccounts.program')} aria-label={`${t('settings.agents.claudeAccounts.program')}: ${a.name}`}
                    className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--bg-field)] hover:text-[var(--text)]"
                    onClick={() => run(() => (a.path ? host.clearProgram(a.id!) : host.program(a.id!, { title: t('settings.agents.claudeAccounts.programTitle'), button: t('settings.agents.locateButton'), kind: 'folder' })))}>
                    {a.path ? <X size={14} /> : <FolderOpen size={14} />}
                  </button>
                  <button type="button" disabled={busy} title={t('settings.agents.claudeAccounts.remove')} aria-label={`${t('settings.agents.claudeAccounts.remove')}: ${a.name}`}
                    className="rounded-[6px] px-2 py-1 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-field)] hover:text-[var(--text)]"
                    onClick={() => { if (window.confirm(t('settings.agents.claudeAccounts.removeConfirm').replace('{name}', a.name))) run(() => host.remove(a.id!)); }}>
                    {t('settings.agents.claudeAccounts.remove')}
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {accounts.list.length >= 1 && host.share ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] px-2.5 py-2 hover:bg-[var(--bg-field)]">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={accounts.share === true} disabled={busy}
            onChange={(e) => run(() => host.share!(e.target.checked))} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-[var(--text)]">{t('settings.agents.claudeAccounts.share')}</span>
            <span className="block text-[12px] text-[var(--text-muted)]">{t('settings.agents.claudeAccounts.shareHint')}</span>
          </span>
        </label>
      ) : null}
      {adding ? (
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setAdding(false); run(() => host.add(name.trim() || t('settings.agents.claudeAccounts.defaultName'))); }}>
          <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('settings.agents.claudeAccounts.namePlaceholder')}
            className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg-field)] px-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
          <SettingsButton variant="quiet" onClick={() => setAdding(false)}>{t('settings.agents.cancel')}</SettingsButton>
          <SettingsButton variant="primary" type="submit">{t('settings.agents.claudeAccounts.addRun')}</SettingsButton>
        </form>
      ) : null}
      <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">{agent.name ? t('settings.agents.claudeAccounts.hint') : null}</p>
    </SettingsInset>
  );
}
