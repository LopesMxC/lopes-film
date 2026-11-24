/**
 * The AI usage button of the Library's bar: nothing on screen until it is clicked, then a card with what was used
 * today and in the last 30 days, by service (GET /api/ai-usage, studio/server/usage.mjs). The cost is an estimate
 * from each service's price range and says so; it is not the provider's bill.
 */
import React from 'react';
import { useT } from '@/i18n';
import { Popover } from '../Popover';

interface Row { id: string; label: string; calls: number; apiCalls: number; minUsd: number; maxUsd: number; local: number }
interface Totals { calls: number; apiCalls: number; minUsd: number; maxUsd: number }
interface Usage extends Totals { byService: Row[]; today: Totals }

const GAUGE = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 17a8.5 8.5 0 1 1 15 0" /><path d="M12 13l3.5-4" /><circle cx="12" cy="13" r="1.2" fill="currentColor" /></svg>;

const usd = (v: number) => `$${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;
const range = (x: Totals) => (x.apiCalls && x.maxUsd > 0 ? (x.minUsd === x.maxUsd ? usd(x.maxUsd) : `${usd(x.minUsd)}–${usd(x.maxUsd)}`) : '—');

export function UsagePopover() {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [usage, setUsage] = React.useState<Usage | null>(null);
  React.useEffect(() => {
    if (!open) return undefined;
    let live = true;
    void fetch('/api/ai-usage', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null), () => null).then((u: Usage | null) => { if (live && u) setUsage(u); });
    return () => { live = false; };
  }, [open]);
  const label = t('assetDrawer.usageTitle');
  const stat = (title: string, x: Totals) => (
    <div className="flex-1 rounded-[12px] border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5">
      <div className="text-[11px] text-[var(--text-muted)]">{title}</div>
      <div className="mt-0.5 text-[18px] font-semibold text-[var(--text)]">{x.calls} <span className="text-[12px] font-normal text-[var(--text-muted)]">{t('assetDrawer.usageCalls')}</span></div>
      <div className="text-[12px] text-[var(--text-muted)]">{t('assetDrawer.usageEstimate')}: {range(x)}</div>
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen} placement="bottom" align="end" clampToViewport
      trigger={(
        <button type="button" onClick={() => setOpen(!open)} title={label} aria-label={label} aria-expanded={open}
          className={`grid h-9 w-9 shrink-0 place-items-center self-center rounded-[10px] transition ${open ? 'bg-[var(--bg-hover)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}>
          {GAUGE}
        </button>
      )}>
      <div role="dialog" aria-label={label} className="w-[320px] rounded-[16px] border border-[var(--border)] bg-[var(--bg-raised)] p-3 shadow-[var(--shadow-lg)]">
        <div className="px-1 pb-2 text-[14px] font-semibold text-[var(--text)]">{label}</div>
        {usage && usage.calls > 0 ? (
          <>
            <div className="flex gap-2">{stat(t('assetDrawer.usageToday'), usage.today)}{stat(t('assetDrawer.usageMonth'), usage)}</div>
            <div className="mt-2 flex flex-col divide-y divide-[var(--border)] rounded-[12px] border border-[var(--border)]">
              {usage.byService.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-[var(--text)]">{r.label}</span>
                  <span className="shrink-0 text-[var(--text-muted)]">{r.calls} · {range(r)}</span>
                </div>
              ))}
            </div>
          </>
        ) : <p className="px-1 py-3 text-[13px] text-[var(--text-muted)]">{usage ? t('assetDrawer.usageEmpty') : '…'}</p>}
        <p className="px-1 pt-2.5 text-[12px] leading-relaxed text-[var(--text-faint)]">{t('assetDrawer.usageNote')}</p>
      </div>
    </Popover>
  );
}
