/**
 * Settings, opened from the app menu at the top left: a search and the sections in groups on the left, the section on the
 * right as a page of titled groups. General (the theme and the language), Agents (in an app with a chat: the agents
 * it can use), Services (which model makes each kind of media, and the services connected for it), the keyboard
 * shortcuts, Advanced and Developer; the search finds a section by any phrase on it. At the
 * foot of the nav, quietly, where Lopes.Film lives: its code, the examples and the website.
 */
import React from 'react';
import { BRAND } from '@/lib/brand';
import { createPortal } from 'react-dom';
import { X, Sun, Moon, Monitor, Search } from '@/lib/icons';
import { LANGUAGES, phrasesUnder, useLanguage, useLanguageChoice, useT, type LanguageChoice } from '@/i18n';
import { studioHost, type HostDeveloper } from '@/lib/host';
import { showWhatsNew } from '@/lib/whats-new';
import { openSetupGuide } from '@/lib/setup-guide';
import { usePreviewPrefs, writePreviewPref } from '@/lib/preview-prefs';
import { hasNotes } from '../WhatsNew';
import { AccentPicker } from './AccentPicker';
import { UpdatesGroup } from './UpdatesGroup';
import { api, type StudioPrefs, type StudioVersion } from '@/api';
import { AboutSection } from './AboutSection';
import { AgentsSection } from './AgentsSection';
import { DiagnosticsGroup } from './DiagnosticsGroup';
import { ModelsSection } from './ModelsSection';
import { SettingsSelect } from './SettingsSelect';
import { ShortcutsSection } from './ShortcutsSection';
import { SettingsButton, SettingsField, SettingsGroup, SettingsItem, SettingsPage, SettingsSegmented, SettingsSwitch } from './ui';
import { useThemeMode, isSkin, SKINS, type ThemeMode } from './theme';
import { StorageGroup } from './StorageGroup';
import { LARGE_DIALOG_SIZE } from '../dialog-chrome';
import { LibraryCategoriesGroup } from './LibraryCategoriesGroup';
import { StyleMemoryGroup } from './StyleMemoryGroup';
import { useUiPrefs, type UiPrefs } from '@/lib/ui-prefs';

export type SettingsSection = 'general' | 'agents' | 'models' | 'developer' | 'shortcuts' | 'advanced' | 'about';

/* the nav, in groups: what Lopes.Film does, then help (Agents only inside an app with a chat: lib/host.ts `agents`;
   Advanced for what is already set for the best experience; Developer always, for its diagnostics) */
const NAV: Array<{ group: 'settings' | 'help'; sections: SettingsSection[] }> = [
  { group: 'settings', sections: ['general', ...(studioHost?.agents ? ['agents' as const] : []), 'models'] },
  { group: 'help', sections: ['shortcuts', 'advanced', 'developer', 'about'] },
];

/* ícones próprios do Lopes.Film: traço fino + um ponto de acento, nada de lucide */
const G = ({ children }: { children: React.ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const SECTION_ICON: Record<SettingsSection, React.ReactNode> = {
  general: <G><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></G>,
  agents: <G><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /><circle cx="19" cy="19" r="1.2" fill="currentColor" /></G>,
  models: <G><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></G>,
  developer: <G><path d="M8 8l-4 4 4 4M16 8l4 4-4 4" /><path d="M13.5 6l-3 12" /></G>,
  shortcuts: <G><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" /></G>,
  advanced: <G><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><rect x="8" y="8" width="8" height="8" rx="2" transform="rotate(45 12 12)" /></G>,
  about: <G><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r=".6" fill="currentColor" /></G>,
};

/** what a search through each section reads: its name and every phrase it shows (Notifications only where it shows:
    inside an app that offers them, lib/host.ts `notifications`) */
const SECTION_WORDS: Record<SettingsSection, string | string[]> = {
  general: ['settings.appearance', 'settings.ui', 'settings.storage'],
  agents: 'settings.agents',
  models: ['settings.models', 'settings.providers'],
  developer: ['settings.developer', 'settings.report'],
  shortcuts: 'settings.shortcuts',
  about: 'settings.creatorPage',
  advanced: ['settings.advanced', ...(studioHost?.notifications ? ['settings.notifications'] : []), 'settings.versions', 'settings.playback', 'settings.libraryCategories'],
};

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Where it opens (General when not given). */
  section?: SettingsSection;
}

/** Opens on General each time, or on the section asked for. */
export function SettingsModal({ open, onClose, section: opening }: SettingsModalProps) {
  const t = useT();
  const language = useLanguage();
  const [section, setSection] = React.useState<SettingsSection>('general');
  const [query, setQuery] = React.useState('');
  const dialog = React.useRef<HTMLDivElement>(null);
  const search = React.useRef<HTMLInputElement>(null);
  /* the latest onClose without re-running the effect below: the page re-renders every frame while it plays, and
     re-running it would take the focus back each time */
  const close = React.useRef(onClose);
  close.current = onClose;

  React.useEffect(() => { if (open) { setSection(opening ?? 'general'); setQuery(''); } }, [open, opening]);

  /* the sections a search finds: by their names and by every phrase on them */
  const words = React.useMemo(() => Object.fromEntries((Object.keys(SECTION_WORDS) as SettingsSection[]).map((id) => [
    id, [t(`settings.sections.${id}`), ...[SECTION_WORDS[id]].flat().flatMap((under) => phrasesUnder(under, language))].join('\n').toLowerCase(),
  ])) as Record<SettingsSection, string>, [t, language]);
  const needle = query.trim().toLowerCase();
  const nav = NAV.map((group) => ({ ...group, sections: group.sections.filter((id) => !needle || words[id].includes(needle)) }))
    .filter((group) => group.sections.length > 0);
  const found = nav.flatMap((group) => group.sections);
  const showing: SettingsSection | null = found.includes(section) ? section : found[0] ?? null;

  React.useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab' || !dialog.current?.contains(document.activeElement)) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    /* shown at once, as the projects window is; the search takes the keys */
    const r = requestAnimationFrame(() => search.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      cancelAnimationFrame(r);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] grid place-items-center p-6"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', animation: 'st-fade .2s ease both' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className={`relative flex ${LARGE_DIALOG_SIZE} gap-2 max-md:flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-app)] p-2 shadow-[var(--shadow-lg)]`}
        style={{ animation: 'st-pop .3s cubic-bezier(.2,.8,.2,1) both' }}
      >
        <style>{`@keyframes st-fade{from{opacity:0}to{opacity:1}}@keyframes st-pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){[role=dialog]{animation:none!important}}`}</style>
        <nav aria-label={t('settings.title')} className="flex w-[280px] shrink-0 flex-col overflow-y-auto rounded-[16px] max-md:max-h-[40%] max-md:w-full border border-[var(--border)] bg-[var(--bg-panel)] p-3">
          <label className="mb-3 flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-field)] px-3 text-[var(--text-muted)] transition focus-within:border-[var(--accent)]">
            <Search size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settings.search')}
              aria-label={t('settings.search')}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
          </label>
          {nav.map((group) => (
            <div key={group.group} className="mt-3 flex flex-col gap-0.5">
              <div className="px-2.5 pb-1.5 text-[13px] text-[var(--text-faint)]">{t(group.group === 'help' ? 'settings.groups.help' : 'settings.title')}</div>
              {group.sections.map((id) => {
                const active = showing === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setSection(id)}
                    style={{ borderColor: active ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'transparent' }}
                    className={`flex h-10 min-w-0 items-center gap-2.5 rounded-[10px] border px-3 text-left text-[15px] transition ${
                      active ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text)]' : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center transition ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{SECTION_ICON[id]}</span>
                    <span className="min-w-0 truncate">{t(`settings.sections.${id}`)}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {found.length === 0 ? <p className="px-2.5 pt-4 text-[14px] text-[var(--text-faint)]">{t('settings.noResults')}</p> : null}
        </nav>

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-panel)]">
          <button type="button" onClick={onClose} aria-label={t('settings.done')}
            className="absolute right-4 top-[14px] z-10 flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
            <X size={19} strokeWidth={1.75} />
          </button>
          {/* one column in the middle of whatever room the window gives */}
          <div key={showing ?? 'none'} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-8 pt-0">
            <div className="w-full">
            {showing ? <h2 id="settings-title" className="sticky top-0 z-[1] -mx-7 mb-5 flex h-16 items-center border-b border-[var(--border)] bg-[var(--bg-panel)] px-7 text-[20px] font-semibold text-[var(--text)]">{t(`settings.sections.${showing}`)}</h2> : null}
            {showing === 'general' && <GeneralSection />}
            {showing === 'agents' && <AgentsSection />}
            {showing === 'models' && <ModelsSection />}
            {showing === 'developer' && <DeveloperSection />}
            {showing === 'shortcuts' && <ShortcutsSection />}
            {showing === 'advanced' && <AdvancedSection />}
            {showing === 'about' && <AboutSection />}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GeneralSection() {
  const t = useT();
  const [mode, setMode] = useThemeMode();
  const [language, setLanguage] = useLanguageChoice();

  return (
    <SettingsPage>
      <SettingsGroup title={t('settings.appearance.group')}>
        <SettingsItem
          title={t('settings.appearance.theme')}
          description={t('settings.appearance.themeHint')}
          control={(
            <SettingsSegmented<ThemeMode>
              label={t('settings.appearance.theme')}
              value={isSkin(mode) ? ('' as ThemeMode) : mode}
              onChange={setMode}
              options={[
                { value: 'system', label: t('settings.appearance.system'), icon: <Monitor size={15} /> },
                { value: 'light', label: t('settings.appearance.light'), icon: <Sun size={15} /> },
                { value: 'dark', label: t('settings.appearance.dark'), icon: <Moon size={15} /> },
              ]}
            />
          )}
        />
        <SettingsItem
          title={t('settings.appearance.skins')}
          description={t('settings.appearance.skinsHint')}
          control={(
            <SettingsSelect<ThemeMode>
              label={t('settings.appearance.skins')}
              value={isSkin(mode) ? mode : ('' as ThemeMode)}
              onChange={setMode}
              options={[{ value: '' as ThemeMode, label: t('settings.ui.skinNone') }, ...SKINS.map((id) => ({ value: id as ThemeMode, label: t(`settings.appearance.${id}`) }))]}
            />
          )}
        />
        <SettingsItem
          title={t('settings.appearance.accent')}
          description={t('settings.appearance.accentHint')}
          control={<AccentPicker />}
        />
        <SettingsItem
          title={t('settings.appearance.language')}
          description={t('settings.appearance.languageHint')}
          control={(
            /* each language named in itself, so a person who cannot read the one shown still finds theirs */
            <SettingsSelect<LanguageChoice>
              label={t('settings.appearance.language')}
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'system', label: t('settings.appearance.languageSystem') },
                ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
              ]}
            />
          )}
        />
      </SettingsGroup>
      <InterfaceGroup />
      <LibraryCategoriesGroup />
      <StyleMemoryGroup />
      <UpdatesGroup />
      <GuideGroup />
      <ObsidianGroup />
      <StorageGroup />
      <AboutGroup />
    </SettingsPage>
  );
}

/** How the editor looks and behaves (lib/ui-prefs.ts): the library's tabs, the size of everything, motion, corners, the agent's cursors. */
function InterfaceGroup() {
  const t = useT();
  const [ui, set] = useUiPrefs();
  const seg = <K extends keyof UiPrefs>(key: K, values: Array<UiPrefs[K]>, label: (v: UiPrefs[K]) => string) => (
    <SettingsSegmented<string>
      label={t(`settings.ui.${String(key)}`)}
      value={String(ui[key])}
      onChange={(v) => set({ [key]: (typeof ui[key] === 'number' ? Number(v) : v) } as Partial<UiPrefs>)}
      options={values.map((v) => ({ value: String(v), label: label(v) }))}
    />
  );
  return (
    <SettingsGroup title={t('settings.ui.group')}>
      <SettingsItem title={t('settings.ui.libraryTabs')} description={t('settings.ui.libraryTabsHint')}
        control={seg('libraryTabs', ['top', 'bottom', 'left', 'right'], (v) => t(`settings.ui.pos_${v}`))} />
      <SettingsItem title={t('settings.ui.libraryTabNames')} description={t('settings.ui.libraryTabNamesHint')}
        control={<SettingsSwitch checked={ui.libraryTabNames} onChange={(v) => set({ libraryTabNames: v })} label={t('settings.ui.libraryTabNames')} />} />
      <SettingsItem title={t('settings.ui.scale')} description={t('settings.ui.scaleHint')}
        control={seg('scale', [90, 100, 110, 125], (v) => `${v}%`)} />
      <SettingsItem title={t('settings.ui.corners')} description={t('settings.ui.cornersHint')}
        control={seg('corners', ['round', 'square'], (v) => t(`settings.ui.corners_${v}`))} />
      <SettingsItem title={t('settings.ui.motion')} description={t('settings.ui.motionHint')}
        control={seg('motion', ['full', 'reduced'], (v) => t(`settings.ui.motion_${v}`))} />
      <SettingsItem title={t('settings.ui.agentCursors')} description={t('settings.ui.agentCursorsHint')}
        control={<SettingsSwitch checked={ui.agentCursors} onChange={(v) => set({ agentCursors: v })} label={t('settings.ui.agentCursors')} />} />
      <SettingsItem title={t('settings.ui.cursorIdle')} description={t('settings.ui.cursorIdleHint')}
        control={seg('cursorIdle', ['infinity', 'still'], (v) => t(`settings.ui.idle_${v}`))} />
    </SettingsGroup>
  );
}

/** In the app: the system's notification of a chat's turn done, stopped or waiting, while its window is not in front. */
function NotificationsGroup() {
  const t = useT();
  const notifications = studioHost?.notifications;
  const [on, setOn] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!notifications) return undefined;
    void notifications.get().then(setOn);
    return notifications.onChange(setOn);
  }, [notifications]);
  const sound = notifications?.sound;
  const [soundOn, setSoundOn] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!sound) return undefined;
    void sound.get().then(setSoundOn);
    return sound.onChange(setSoundOn);
  }, [sound]);
  const front = notifications?.front;
  const [frontOn, setFrontOn] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!front) return undefined;
    void front.get().then(setFrontOn);
    return front.onChange(setFrontOn);
  }, [front]);
  const test = notifications?.test;
  const [tested, setTested] = React.useState<string | null>(null);
  return (
    <SettingsGroup title={t('settings.notifications.group')}>
      <SettingsItem
        title={t('settings.notifications.turns')}
        description={t('settings.notifications.turnsHint')}
        /* drawn once the app has said whether they are on: no switch slid on each time the page opens */
        control={on === null ? null : <SettingsSwitch checked={on} label={t('settings.notifications.turns')} onChange={(next) => { setOn(next); void notifications?.set(next); }} />}
      />
      {front ? (
        <SettingsItem
          title={t('settings.notifications.front')}
          description={t('settings.notifications.frontHint')}
          control={frontOn === null ? null : <SettingsSwitch checked={frontOn} label={t('settings.notifications.front')} onChange={(next) => { setFrontOn(next); void front.set(next); }} />}
        />
      ) : null}
      {test ? (
        <SettingsItem
          title={t('settings.notifications.test')}
          description={tested === null ? undefined : tested === 'failed' ? t('settings.notifications.testFailed') : tested === 'unsupported' ? t('settings.notifications.testUnsupported') : t('settings.notifications.testSent')}
          control={(
            <button type="button" onClick={() => { setTested(null); void test(t('settings.notifications.testTitle'), t('settings.notifications.testBody')).then(setTested); }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--text)] transition hover:bg-[var(--surface-hover)]">
              {t('settings.notifications.testButton')}
            </button>
          )}
        />
      ) : null}
      {sound ? (
        <SettingsItem
          title={t('settings.notifications.sound')}
          description={t('settings.notifications.soundHint')}
          control={soundOn === null ? null : <SettingsSwitch checked={soundOn} label={t('settings.notifications.sound')} onChange={(next) => { setSoundOn(next); void sound.set(next); }} />}
        />
      ) : null}
    </SettingsGroup>
  );
}

/**
 * How the preview plays heavy footage (studio/server/proxies.mjs): from a lighter copy made in the background (a
 * proxy), and how tall that copy is; whether pages draw at the viewer's size, and whether stretches that play late are
 * rendered to play smoothly (lib/preview-prefs). Exports always read the originals and draw at full size.
 */
function PlaybackGroup() {
  const t = useT();
  const { fitPages, renders } = usePreviewPrefs();
  const [prefs, setPrefs] = React.useState<StudioPrefs | null>(null);
  React.useEffect(() => { void api.prefs().then(setPrefs).catch(() => {}); }, []);
  if (!prefs) return null;
  const change = (proxies: Partial<StudioPrefs['proxies']>) => {
    setPrefs({ ...prefs, proxies: { ...prefs.proxies, ...proxies } });
    void api.setPrefs({ proxies }).then(setPrefs).catch(() => {});
  };
  return (
    <SettingsGroup title={t('settings.playback.group')}>
      <SettingsItem
        title={t('settings.playback.proxies')}
        description={t('settings.playback.proxiesHint')}
        control={<SettingsSwitch checked={prefs.proxies.on} onChange={(on) => change({ on })} label={t('settings.playback.proxies')} />}
      />
      {prefs.proxies.on ? (
        <SettingsItem
          title={t('settings.playback.proxySize')}
          description={t('settings.playback.proxySizeHint')}
          control={(
            <SettingsSegmented<'540' | '720' | '1080'>
              label={t('settings.playback.proxySize')}
              value={String(prefs.proxies.height) as '540' | '720' | '1080'}
              onChange={(v) => change({ height: Number(v) as 540 | 720 | 1080 })}
              options={[{ value: '540', label: '540p' }, { value: '720', label: '720p' }, { value: '1080', label: '1080p' }]}
            />
          )}
        />
      ) : null}
      <SettingsItem
        title={t('settings.advanced.fitPages')}
        description={t('settings.advanced.fitPagesHint')}
        control={<SettingsSwitch checked={fitPages} onChange={(on) => writePreviewPref('fitPages', on)} label={t('settings.advanced.fitPages')} />}
      />
      <SettingsItem
        title={t('settings.advanced.renders')}
        description={t('settings.advanced.rendersHint')}
        control={<SettingsSwitch checked={renders} onChange={(on) => writePreviewPref('renders', on)} label={t('settings.advanced.renders')} />}
      />
    </SettingsGroup>
  );
}

/** The setup guide again, and the person's own browser for the agent's research (`get browse`). */
function GuideGroup() {
  const t = useT();
  const [prefs, setPrefs] = React.useState<StudioPrefs | null>(null);
  React.useEffect(() => { void api.prefs().then(setPrefs).catch(() => {}); }, []);
  return (
    <SettingsGroup title={t('settings.guide.group')}>
      <SettingsItem
        title={t('settings.guide.repeat')}
        description={t('settings.guide.repeatHint')}
        control={<SettingsButton onClick={() => { openSetupGuide(); }}>{t('settings.guide.open')}</SettingsButton>}
      />
      {prefs ? (
        <SettingsItem
          title={t('settings.guide.browser')}
          description={t('settings.guide.browserHint')}
          control={<SettingsSwitch checked={prefs.researchBrowser === true} onChange={(on) => { setPrefs({ ...prefs, researchBrowser: on }); void api.setPrefs({ researchBrowser: on }).then(setPrefs).catch(() => setPrefs(prefs)); }} label={t('settings.guide.browser')} />}
        />
      ) : null}
    </SettingsGroup>
  );
}

/** Each finished video as a note in the person's Obsidian (studio/server/obsidian.mjs). */
function ObsidianGroup() {
  const t = useT();
  const [prefs, setPrefs] = React.useState<StudioPrefs | null>(null);
  const [folder, setFolder] = React.useState('');
  React.useEffect(() => { void api.prefs().then((p) => { setPrefs(p); setFolder(p.obsidianFolder ?? ''); }).catch(() => {}); }, []);
  if (!prefs) return null;
  const save = (patch: { obsidianOn?: boolean; obsidianFolder?: string | null }) => { void api.setPrefs(patch).then(setPrefs).catch(() => {}); };
  return (
    <SettingsGroup title={t('settings.obsidian.group')}>
      <SettingsItem
        title={t('settings.obsidian.on')}
        description={t('settings.obsidian.onHint')}
        control={<SettingsSwitch checked={prefs.obsidianOn !== false} onChange={(on) => { setPrefs({ ...prefs, obsidianOn: on }); save({ obsidianOn: on }); }} label={t('settings.obsidian.on')} />}
      />
      <SettingsItem
        title={t('settings.obsidian.folder')}
        description={t('settings.obsidian.folderHint')}
        control={<SettingsField value={folder} placeholder="Mapas de Estudo/Aprendizados Claude" aria-label={t('settings.obsidian.folder')}
          onChange={(e) => setFolder(e.target.value)} onBlur={() => save({ obsidianFolder: folder.trim() || null })} />}
      />
    </SettingsGroup>
  );
}

/** What is already set for the best experience, for whoever wants it otherwise: how the preview plays (PlaybackGroup). */
function AdvancedSection() {
  const t = useT();
  return (
    <SettingsPage note={t('settings.advanced.intro')}>
      {studioHost?.notifications ? <NotificationsGroup /> : null}
      <PlaybackGroup />
    </SettingsPage>
  );
}

/** This Studio's version, and the notes of its release. Lopes.Film does not look for updates. */
function AboutGroup() {
  const t = useT();
  const [info, setInfo] = React.useState<StudioVersion | null>(null);
  React.useEffect(() => { void api.version().then(setInfo).catch(() => {}); }, []);
  return (
    <SettingsGroup title={t('settings.about.group')}>
      <SettingsItem title={info ? `${BRAND.name} ${info.version}` : BRAND.name}>
        {hasNotes(info?.version) ? <WhatsNewLink /> : null}
      </SettingsItem>
    </SettingsGroup>
  );
}

/** This release's notes again (components/WhatsNew). */
function WhatsNewLink() {
  const t = useT();
  return (
    <button type="button" onClick={() => showWhatsNew()}
      className="mb-2 text-[13.5px] text-[var(--text-muted)] underline underline-offset-2 transition hover:text-[var(--text)]">
      {t('settings.about.whatsNew')}
    </button>
  );
}

/**
 * Diagnostics (DiagnosticsGroup), for when something does not work; how playing goes, in the viewer's corner
 * (lib/preview-prefs `stats`); in the app, what its chat shows of each turn: what it changed in the files, and its
 * full log (lib/host.ts `developer`).
 */
function DeveloperSection() {
  const t = useT();
  const developer = studioHost?.developer;
  const [prefs, setPrefs] = React.useState<HostDeveloper | null>(null);
  React.useEffect(() => {
    if (!developer) return undefined;
    void developer.get().then(setPrefs);
    return developer.onChange(setPrefs);
  }, [developer]);
  const change = (next: Partial<HostDeveloper>) => {
    setPrefs((was) => (was ? { ...was, ...next } : was));
    void developer?.set(next);
  };
  const { stats } = usePreviewPrefs();
  return (
    <SettingsPage note={t('settings.developer.intro')}>
      <DiagnosticsGroup />
      <SettingsGroup title={t('settings.developer.playbackGroup')}>
        <SettingsItem
          title={t('settings.developer.playbackStats')}
          description={t('settings.developer.playbackStatsHint')}
          control={<SettingsSwitch checked={stats} onChange={(on) => writePreviewPref('stats', on)} label={t('settings.developer.playbackStats')} />}
        />
      </SettingsGroup>
      {developer ? (
        <SettingsGroup title={t('settings.developer.group')} footnote={t('settings.developer.where')}>
          {/* drawn once the app has said whether each is on: drawn off first, a switch slid on each time the page opened */}
          <SettingsItem
            title={t('settings.developer.changes')}
            description={t('settings.developer.changesHint')}
            control={prefs ? <SettingsSwitch checked={prefs.changes} label={t('settings.developer.changes')} onChange={(on) => change({ changes: on })} /> : null}
          />
          <SettingsItem
            title={t('settings.developer.logs')}
            description={t('settings.developer.logsHint')}
            control={prefs ? <SettingsSwitch checked={prefs.logs} label={t('settings.developer.logs')} onChange={(on) => change({ logs: on })} /> : null}
          />
        </SettingsGroup>
      ) : null}
    </SettingsPage>
  );
}
