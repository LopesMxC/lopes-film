import React from 'react';
import { useT } from '@/i18n';
import { arrangedCategories, FIRST_CATEGORY } from '@/lib/library-categories';
import { CATEGORIES } from '../library/LibraryDrawer';
import { CategoryIcon } from '../library/icons';
import { keepArrangement, useLibraryArrangement } from '../library/arrangement';
import { ReorderList } from './ReorderList';
import { SettingsButton, SettingsGroup, SettingsSwitch } from './ui';
import { ChevronDown, ChevronUp } from '@/lib/icons';

/**
 * The library's tabs in the person's order (Settings › General): dragged, or moved a place up or down with the arrows,
 * shown or hidden with the switch, and put back in Lopes.Film's order. Media stays first and shown.
 */
export function LibraryCategoriesGroup() {
  const t = useT();
  const arranged = useLibraryArrangement();
  const [list, setList] = React.useState<{ id: string; on: boolean }[] | null>(null);
  const now = list ?? arrangedCategories(CATEGORIES, arranged);
  const pending = React.useRef(Promise.resolve());
  const revision = React.useRef(0);
  const keep = (next: { id: string; on: boolean }[]) => {
    const attempt = ++revision.current;
    setList(next);
    // A drag commits once, after its preview; successive changes reach prefs in the same order as the gestures.
    pending.current = pending.current.then(async () => { await keepArrangement(next); }).catch(() => {
      if (attempt === revision.current) setList(null);
    });
  };
  /* a tab a place up or down, Media keeping its place */
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (index < 1 || to < 1 || to >= now.length) return;
    const next = [...now];
    [next[index], next[to]] = [next[to], next[index]];
    keep(next);
  };
  const arrow = 'grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--bg-field)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <SettingsGroup title={t('settings.libraryCategories.group')} footnote={t('settings.libraryCategories.hint')}>
      <ReorderList items={now} onChange={setList} onCommit={keep} fixedCount={1}
        label={t('settings.libraryCategories.group')} itemAttribute="data-library-category"
        dragLabel={(item) => t('settings.libraryCategories.drag').replace('{name}', t(`assetDrawer.cat_${item.id}`))}>
        {(category, index) => (
          <>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-field)] text-[var(--text)]"><CategoryIcon id={category.id as never} on={false} size={16} /></span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text)]">{t(`assetDrawer.cat_${category.id}`)}</span>
            <button type="button" className={arrow} disabled={index < 2} title={t('settings.libraryCategories.up')} aria-label={`${t('settings.libraryCategories.up')}: ${t(`assetDrawer.cat_${category.id}`)}`} onClick={() => move(index, -1)}><ChevronUp size={14} /></button>
            <button type="button" className={arrow} disabled={index < 1 || index >= now.length - 1} title={t('settings.libraryCategories.down')} aria-label={`${t('settings.libraryCategories.down')}: ${t(`assetDrawer.cat_${category.id}`)}`} onClick={() => move(index, 1)}><ChevronDown size={14} /></button>
            <SettingsSwitch checked={category.on} disabled={category.id === FIRST_CATEGORY} label={t(`assetDrawer.cat_${category.id}`)}
              onChange={(on) => keep(now.map((item) => item.id === category.id ? { ...item, on } : item))} />
          </>
        )}
      </ReorderList>
      <div className="flex justify-end px-1 pt-2">
        <SettingsButton onClick={() => keep(arrangedCategories(CATEGORIES, null))}>{t('settings.libraryCategories.reset')}</SettingsButton>
      </div>
    </SettingsGroup>
  );
}
