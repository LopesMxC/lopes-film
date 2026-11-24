'use client';

/**
 * Type `/` (at the start of a line or after a space) to open the library of what can be asked for, and pick one: the typed
 * `/xxx` is replaced by a ready request (slash-menu.ts), to finish and send. Same anchoring, keys and look as the `@` menu.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useChatMenu } from '@/lib/chat-menu';
import { chatLayer } from '@/lib/chat-layer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin, MenuOption, type MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode, COMMAND_PRIORITY_CRITICAL, KEY_ESCAPE_COMMAND, type TextNode } from 'lexical';
import { buildSlashMenu, matchSlashTrigger, type SlashEntry, type SlashLocale } from './slash-menu.ts';

export interface SlashMenuConfig {
  /** The menu's accessible name. */
  label: string;
  locale: SlashLocale;
  /** The line under the list, saying what picking does. */
  footer: string;
}

class SlashOption extends MenuOption {
  readonly entry: SlashEntry;
  constructor(entry: SlashEntry) { super(entry.command.id); this.entry = entry; }
}

export function SlashMenuPlugin({ label, locale, footer }: SlashMenuConfig) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = React.useState('');
  const options = React.useMemo(() => buildSlashMenu(query, locale).map((e) => new SlashOption(e)), [query, locale]);
  const localeRef = React.useRef(locale);
  localeRef.current = locale;
  const handleQueryChange = React.useCallback((value: string | null) => setQuery(value ?? ''), []);

  const triggerFn = React.useCallback((text: string): MenuTextMatch | null => {
    const trigger = matchSlashTrigger(text);
    if (!trigger) return null;
    /* nothing found, no menu: an open menu takes the arrow keys and Enter */
    if (buildSlashMenu(trigger.query, localeRef.current).length === 0) return null;
    return { leadOffset: trigger.leadOffset, matchingString: trigger.query, replaceableString: trigger.replaceableString };
  }, []);

  const onSelectOption = React.useCallback((option: SlashOption, nodeToReplace: TextNode | null, closeMenu: () => void) => {
    editor.update(() => {
      const node = $createTextNode(option.entry.command.text[localeRef.current]);
      if (nodeToReplace) nodeToReplace.replace(node);
      else editor.getEditorState();
      node.selectEnd();
      closeMenu();
    });
    if (typeof window !== 'undefined') window.requestAnimationFrame(() => { if (editor.getRootElement()?.isConnected && editor.isEditable()) editor.focus(); });
  }, [editor]);

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
      options={options}
      onQueryChange={handleQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      commandPriority={COMMAND_PRIORITY_CRITICAL}
      menuRenderFn={(anchorRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => (
        anchorRef.current && options.length > 0 && typeof document !== 'undefined'
          ? createPortal(
            <SlashMenu label={label} footer={footer} locale={locale} options={options} selectedIndex={selectedIndex} onPick={selectOptionAndCleanUp} onHighlight={setHighlightedIndex}
              shell={composerShell(editor.getRootElement())} editorRoot={editor.getRootElement()}
              onDismiss={() => editor.dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown', { key: 'Escape' }))} />,
            chatLayer(),
          )
          : null
      )}
    />
  );
}

function composerShell(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return root.closest<HTMLElement>('[data-prompt-shell]') ?? root.parentElement ?? root;
}

function SlashMenu({ label, footer, locale, options, selectedIndex, onPick, onHighlight, shell, editorRoot, onDismiss }: {
  label: string; footer: string; locale: SlashLocale; options: SlashOption[]; selectedIndex: number | null;
  onPick: (option: SlashOption) => void; onHighlight: (index: number) => void;
  shell: HTMLElement | null; editorRoot: HTMLElement | null; onDismiss: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties | null>(null);
  useChatMenu(true);
  React.useLayoutEffect(() => {
    if (!shell) return undefined;
    const place = () => {
      const r = shell.getBoundingClientRect();
      const width = Math.min(420, Math.max(300, r.width));
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const gap = 8;
      const roomAbove = r.top - gap - 8;
      const roomBelow = window.innerHeight - r.bottom - gap - 8;
      const up = roomAbove >= Math.min(360, roomBelow) || roomAbove >= 220;
      setStyle({ position: 'fixed', left, width, maxHeight: Math.max(180, Math.min(400, up ? roomAbove : roomBelow)),
        ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [shell]);
  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;
  React.useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || editorRoot?.contains(target)) return;
      dismissRef.current();
    };
    const blur = () => dismissRef.current();
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('blur', blur); };
  }, [editorRoot]);
  /* the arrow keys' row kept in view (the menu is in the chat layer, so Lexical does not scroll it) */
  React.useEffect(() => {
    if (selectedIndex == null) return;
    const row = options[selectedIndex]?.ref?.current;
    if (selectedIndex === 0) row?.parentElement?.scrollTo({ top: 0 });
    else {
      if (options[selectedIndex]!.entry.firstOfGroup) row?.previousElementSibling?.scrollIntoView({ block: 'nearest' });
      row?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, options]);
  if (!style) return null;
  return (
    <div ref={ref} role="listbox" aria-label={label} data-prompt-menu="" data-slash-menu="" style={style}
      className="z-[10000] flex flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg-raised)] shadow-[0_18px_48px_-12px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.12)]">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1.5">
        {options.map((option, index) => {
          const { command, groupLabel, firstOfGroup } = option.entry;
          const selected = index === selectedIndex;
          return (
            <React.Fragment key={option.key}>
              {firstOfGroup ? (
                <div role="presentation" className={`px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)] ${index === 0 ? 'pt-1' : 'mt-1 border-t border-[var(--border)] pt-2.5'}`}>{groupLabel}</div>
              ) : null}
              <div role="option" id={`typeahead-item-${index}`} aria-selected={selected} ref={option.setRefElement}
                onMouseEnter={() => onHighlight(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(option)}
                className={`flex cursor-pointer items-baseline gap-2.5 rounded-[6px] px-2 py-1.5 text-[13px] ${selected ? 'bg-[var(--bg-hover)]' : ''}`}>
                <span className="w-3 shrink-0 text-[var(--accent)]">/</span>
                <span className="max-w-[55%] shrink-0 truncate font-medium text-[var(--text)]">{command.label[locale]}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-faint)]" title={command.hint[locale]}>{command.hint[locale]}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div aria-hidden className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-faint)]">
        <span>↑ ↓</span><span>↵</span><span className="truncate">{footer}</span><span className="ml-auto">esc</span>
      </div>
    </div>
  );
}
