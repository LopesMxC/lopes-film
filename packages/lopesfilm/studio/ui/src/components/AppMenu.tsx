/** The Lopes.Film menu: a branded header and shortcuts straight into each Settings section. */
import React from 'react';
import { Bot, Code2, Cpu, Keyboard, Settings2, SlidersHorizontal, User } from '@/lib/icons';
import { useT } from '@/i18n';
import { BRAND } from '@/lib/brand';
import { useClickOpen } from '@/lib/click-open';
import { studioHost } from '@/lib/host';
import { menuStep } from '@/lib/menu-position';
import { BrandLogo } from './BrandLogo';
import { Popover } from './Popover';
import type { SettingsSection } from './settings/SettingsModal';
import styles from './AppMenu.module.css';

const ENTRIES: { id: SettingsSection; icon: React.ReactNode; agentsOnly?: boolean }[] = [
  { id: 'general', icon: <Settings2 size={15} /> },
  { id: 'agents', icon: <Bot size={15} />, agentsOnly: true },
  { id: 'models', icon: <Cpu size={15} /> },
  { id: 'shortcuts', icon: <Keyboard size={15} /> },
  { id: 'advanced', icon: <SlidersHorizontal size={15} /> },
  { id: 'developer', icon: <Code2 size={15} /> },
  { id: 'about', icon: <User size={15} /> },
];

export function AppMenu({ onSettings }: { onSettings: (section: SettingsSection) => void }) {
  const t = useT();
  const popup = useClickOpen();
  const trigger = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const focused = React.useRef(false);
  const id = React.useId();
  const entries = ENTRIES.filter(entry => !entry.agentsOnly || studioHost?.agents);

  React.useEffect(() => { if (!popup.open) focused.current = false; }, [popup.open]);

  const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusItem = (row: HTMLElement | undefined) => { row?.focus({ preventScroll: true }); row?.scrollIntoView({ block: 'nearest' }); };
  const focus = (last = false) => requestAnimationFrame(() => { const rows = items(); focusItem(rows[last ? rows.length - 1 : 0]); });
  const focusPanel = () => requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
  const dismiss = (restore = false) => {
    popup.dismiss();
    if (restore) trigger.current?.focus({ preventScroll: true });
    focused.current = false;
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Tab') { dismiss(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const rows = items();
    const current = rows.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : menuStep(current, event.key === 'ArrowUp' ? -1 : 1, rows.length);
    focusItem(rows[next]);
  };
  const onBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && !panel.current?.contains(next) && next !== trigger.current) dismiss();
  };

  return <Popover open={popup.open} onOpenChange={(next) => { if (next) popup.setOpen(true); else dismiss(focused.current); }} layer={10060}
    onEscapeKeyDown={(event) => { event.stopPropagation(); dismiss(focused.current); }}
    trigger={<button ref={trigger} type="button" aria-label={t('project.appMenu')} aria-haspopup="menu" aria-expanded={popup.open} aria-controls={popup.open ? id : undefined}
      onClick={(event) => { event.stopPropagation(); popup.toggle(); if (!popup.open) { if (event.detail === 0) focus(); else focusPanel(); } }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault(); event.stopPropagation(); popup.setOpen(true); focus(event.key === 'ArrowUp');
      }}
      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${popup.open ? 'bg-[var(--bg-hover)] text-[var(--text)]' : ''}`}>
      <BrandLogo size={15} />
    </button>}>
    <div ref={panel} id={id} data-app-menu role="menu" tabIndex={-1} aria-label={t('project.appMenu')}
      onKeyDown={onKeyDown} onFocusCapture={() => { focused.current = true; }} onBlur={onBlur} className={styles.menu}>
      <div className={styles.header} aria-hidden>
        <span className={styles.mark}><BrandLogo size={17} /></span>
        <span className={styles.brand}><b>{BRAND.name}</b><i>{t('appMenu.tagline')}</i></span>
      </div>
      <p className={styles.groupLabel}>{t('settings.title')}</p>
      {entries.map(entry => <button key={entry.id} type="button" role="menuitem" tabIndex={-1} className={styles.row}
        onClick={() => { dismiss(true); onSettings(entry.id); }}>
        <span className={styles.icon} aria-hidden>{entry.icon}</span><span className={styles.label}>{t(`settings.sections.${entry.id}`)}</span>
      </button>)}
    </div>
  </Popover>;
}
