import { useEffect, useState } from 'react';
import { studioHost } from '../lib/host';

/**
 * The app's own minimize, maximize and close buttons, at the top bar's right (Windows: the app has no title bar of
 * its own to Windows' buttons, lib/host.ts `windowControls`). Nothing where the host has none (the browser, macOS).
 * Three buttons of 46 x 32 px, thin line glyphs, close red on hover.
 */
export function WindowControls() {
  const controls = studioHost?.windowControls;
  const [state, setState] = useState(() => controls?.state() ?? { maximized: false, fullScreen: false });
  useEffect(() => controls?.onChange(setState), [controls]);
  if (!controls || state.fullScreen) return null;
  const base = 'grid h-8 w-[46px] place-items-center text-[var(--text-muted)] outline-none transition-colors focus-visible:shadow-[inset_0_0_0_1px_var(--accent)]';
  const glyph = { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true } as const;
  return (
    <div data-window-controls className="fixed right-0 top-0 z-[10100] flex h-8 bg-[var(--bg-titlebar)]"
      style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' } as React.CSSProperties}
      onContextMenu={(event) => event.preventDefault()} onDoubleClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Minimizar" title="Minimizar" className={`${base} hover:bg-[var(--bg-hover)] hover:text-[var(--text)]`} onClick={controls.minimize}>
        <svg {...glyph}><path d="M0 5.5h10" /></svg>
      </button>
      <button type="button" aria-label={state.maximized ? 'Restaurar' : 'Maximizar'} title={state.maximized ? 'Restaurar' : 'Maximizar'}
        className={`${base} hover:bg-[var(--bg-hover)] hover:text-[var(--text)]`} onClick={controls.toggleMaximize}>
        {state.maximized
          ? <svg {...glyph}><path d="M2.5 2.5V.5h7v7h-2" /><rect x="0.5" y="2.5" width="7" height="7" /></svg>
          : <svg {...glyph}><rect x="0.5" y="0.5" width="9" height="9" /></svg>}
      </button>
      <button type="button" aria-label="Fechar" title="Fechar" className={`${base} hover:bg-[#e81123] hover:text-white`} onClick={controls.close}>
        <svg {...glyph}><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /></svg>
      </button>
    </div>
  );
}
