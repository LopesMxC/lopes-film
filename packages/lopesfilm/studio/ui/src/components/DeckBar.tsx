import * as React from 'react';

export interface DeckItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The strip of pages along the bottom of the window (as in DaVinci Resolve): the places a project is worked in, one tap
 * each, the one open lit. It only moves what the top bar and the panes' own buttons already move.
 */
export function DeckBar({ items }: { items: DeckItem[] }): React.JSX.Element {
  /* the bar is its own band under every pane: the chat column (a layer over the window) stops above it */
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--deck-h', '48px');
    return () => { root.style.removeProperty('--deck-h'); };
  }, []);
  return (
    <nav data-deck-bar="" aria-label="Pages" className="deck-bar">
      {items.map((item) => (
        <button key={item.id} type="button" data-deck-item={item.id} data-on={item.on ? '' : undefined} disabled={item.disabled} aria-pressed={!!item.on}
          onClick={item.onClick} className="deck-item">
          <span className="deck-icon">{item.icon}</span>
          <span className="deck-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
