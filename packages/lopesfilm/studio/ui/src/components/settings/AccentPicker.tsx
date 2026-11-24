/** The accent colour: a row of swatches, the brand's own first. Kept in localStorage, applied at once (theme.ts). */
import { useT } from '@/i18n';
import { ACCENTS, useAccent } from './theme';

export function AccentPicker() {
  const t = useT();
  const [accent, setAccent] = useAccent();
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light';
  return (
    <div role="radiogroup" aria-label={t('settings.appearance.accent')} className="flex flex-wrap items-center justify-end gap-2">
      {ACCENTS.map((a) => {
        const on = a.id === accent;
        const color = a.id === 'brand' ? (dark ? '#e0384e' : '#8c1325') : dark ? a.dark : a.light;
        const name = t(`settings.appearance.accents.${a.id}`);
        return (
          <button key={a.id} type="button" role="radio" aria-checked={on} aria-label={name} title={name} onClick={() => setAccent(a.id)}
            className={`h-[22px] w-[22px] rounded-full border transition ${on ? 'border-[var(--text)] ring-2 ring-[var(--bg-raised)] ring-offset-2 ring-offset-[var(--text)]' : 'border-[var(--border-strong)] hover:scale-110'}`}
            style={{ background: color }} />
        );
      })}
    </div>
  );
}
