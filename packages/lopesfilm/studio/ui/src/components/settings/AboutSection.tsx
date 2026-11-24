/** Sobre: quem criou o Lopes.Film e o que o sistema é, em poucas linhas. A foto é src/assets/creator.jpg. */
import { useT } from '@/i18n';
import { BRAND, branded } from '@/lib/brand';
import { BrandLogo } from '../BrandLogo';

/* a foto é opcional: sem o arquivo, o avatar mostra a inicial e o build não quebra */
const PHOTO = Object.values(import.meta.glob('../../assets/creator.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)[0] ?? null;

export function AboutSection() {
  const t = useT();
  return (
    <div className="flex max-w-[640px] flex-col gap-8">
      <section className="flex items-center gap-5" aria-label={t('settings.creatorPage.creator')}>
        {PHOTO
          ? <img src={PHOTO} alt="Lopes" width={96} height={96} className="h-24 w-24 shrink-0 rounded-full border border-[var(--border)] object-cover" />
          : <span aria-hidden className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-hover)] text-[34px] font-semibold text-[var(--text)]">L</span>}
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('settings.creatorPage.creator')}</p>
          <h3 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--text)]">Lopes</h3>
          <p className="text-[14px] text-[var(--text-muted)]">{branded(t('settings.creatorPage.role'))}</p>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">{t('settings.creatorPage.bio')}</p>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]"><BrandLogo size={16} />{t('settings.creatorPage.systemTitle')}</h3>
        <p className="text-[14.5px] leading-relaxed text-[var(--text-muted)]">{branded(t('settings.creatorPage.system'))}</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14px] text-[var(--text)]">
          {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`settings.creatorPage.feature${n}`)}</li>)}
        </ul>
      </section>
      <p className="text-[12.5px] text-[var(--text-muted)]">{BRAND.name} · {t('settings.creatorPage.madeBy')}</p>
    </div>
  );
}
