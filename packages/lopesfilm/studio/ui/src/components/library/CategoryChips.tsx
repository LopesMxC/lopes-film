/**
 * The Skills filter by what a skill is for: All, made for editing, for optimizing, for a function, for customizing.
 * A skill's category is its lopesfilm.json's (src/skills.mjs), else read from its words.
 */
import { useT } from '@/i18n';

export type SkillCategory = 'edit' | 'optimize' | 'function' | 'customize';
const CATEGORIES: SkillCategory[] = ['edit', 'optimize', 'function', 'customize'];

export function CategoryChips({ value, onChange }: { value: SkillCategory | ''; onChange: (next: SkillCategory | '') => void }) {
  const t = useT();
  const chip = (id: SkillCategory | '', label: string) => (
    <button key={id || 'all'} type="button" aria-pressed={value === id} onClick={() => onChange(id)}
      className={`h-6 rounded-full border px-2.5 text-[11px] transition ${value === id ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
      {label}
    </button>
  );
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5 pb-2" role="group" aria-label={t('assetDrawer.category')}>
      {chip('', t('assetDrawer.all'))}
      {CATEGORIES.map((c) => chip(c, t(`assetDrawer.category_${c}`)))}
    </div>
  );
}
