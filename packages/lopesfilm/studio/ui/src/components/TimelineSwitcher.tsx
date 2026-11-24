import * as React from 'react';
import { Plus, X } from '@/lib/icons';
import { useT } from '@/i18n';

export interface TimelineChoice { folder: string; name: string; main: boolean; current: boolean }

/**
 * The project's timelines as sub-tabs above its timeline (the way CapCut keeps its sequences): the project's own film
 * first, then the others, and a + that makes a new empty timeline inside this project. Each one is a film of the
 * project, shown in this same window and tab: picking one never opens another project.
 */
export function TimelineSwitcher({ items, onPick, onCreate, onDelete }: {
  items: readonly TimelineChoice[];
  onPick: (item: TimelineChoice) => void;
  onCreate: (name: string) => Promise<void>;
  /** take a timeline out of the project (its folder to the Trash) */
  onDelete?: (item: TimelineChoice) => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  /* the timeline whose × was pressed once: pressed again within a few seconds, it is deleted */
  const [asked, setAsked] = React.useState<string | null>(null);
  React.useEffect(() => { if (asked === null) return; const id = window.setTimeout(() => setAsked(null), 3000); return () => window.clearTimeout(id); }, [asked]);
  const make = async () => {
    if (busy) return;
    setBusy(true);
    try { await onCreate(`${t('timelines.untitled')} ${items.length + 1}`); } finally { setBusy(false); }
  };
  return (
    <div role="tablist" aria-label={t('timelines.title')} data-timeline-tabs="" className="flex h-[28px] shrink-0 items-end gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 pt-1">
      {items.map((item) => (
        <div key={item.folder || 'main'} className="flex shrink-0 items-end">
          <button type="button" role="tab" aria-selected={item.current} data-timeline-tab={item.main ? 'main' : item.folder}
            onClick={() => { if (!item.current) onPick(item); }}
            className={`flex h-[24px] max-w-[180px] items-center gap-1.5 rounded-t-[7px] border border-b-0 pl-3 ${item.main || !onDelete ? 'pr-3' : 'pr-1'} text-[11.5px] font-medium transition ${item.current
              ? 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text)]'
              : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.current ? 'bg-[var(--accent)]' : 'bg-[var(--text-faint)]'}`} aria-hidden />
            <span className="truncate">{item.main ? t('timelines.main') : item.name}</span>
            {!item.main && onDelete ? (
              <span role="button" tabIndex={0} data-timeline-delete={item.folder} aria-label={t('timelines.delete')} title={asked === item.folder ? t('timelines.deleteSure') : t('timelines.delete')}
                onClick={(e) => { e.stopPropagation(); if (asked === item.folder) { setAsked(null); void onDelete(item); } else setAsked(item.folder); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (asked === item.folder) { setAsked(null); void onDelete(item); } else setAsked(item.folder); } }}
                className={`ml-0.5 flex h-4 items-center justify-center rounded-[4px] px-0.5 transition ${asked === item.folder ? 'bg-[var(--err)] px-1.5 text-[10px] font-semibold text-white' : 'text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}>
                {asked === item.folder ? t('timelines.deleteSure') : <X size={11} aria-hidden />}
              </span>
            ) : null}
          </button>
        </div>
      ))}
      <button type="button" data-timeline-new="" aria-label={t('timelines.new')} title={t('timelines.new')} disabled={busy} onClick={() => { void make(); }}
        className="mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-50">
        <Plus size={13} aria-hidden />
      </button>
    </div>
  );
}
