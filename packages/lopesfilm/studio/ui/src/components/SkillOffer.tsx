/**
 * When an agent finishes editing the film: "Make a default skill of this video?" with Yes / No. Yes writes the request
 * for the agent into the chat's message (lib/host.ts `ask`: the person sends it), so the way this film was made is kept
 * as a skill in the project's skills/ folder and can make the next one. It shows only after a run in which the film
 * really changed, and only inside the app (the chat is there). "Don't ask again" is remembered on this computer.
 */
import * as React from 'react';

import { useT } from '@/i18n';
import { useAgentWorking } from '@/lib/agent-working';
import { studioHost } from '@/lib/host';

const KEY = 'lopesfilm.skillOffer.off';
const off = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** `signature` changes whenever the film does (the clips and their sources). */
export function SkillOffer({ signature }: { signature: string }) {
  const t = useT();
  const working = useAgentWorking();
  const [open, setOpen] = React.useState(false);
  const run = React.useRef<{ was: boolean; start: string }>({ was: false, start: signature });
  const latest = React.useRef(signature);
  latest.current = signature;
  React.useEffect(() => {
    if (working && !run.current.was) run.current = { was: true, start: latest.current };
    if (!working && run.current.was) {
      const changed = run.current.start !== latest.current;
      run.current = { was: false, start: latest.current };
      if (changed && studioHost?.ask && !off()) setOpen(true);
    }
  }, [working]);
  if (!open) return null;
  const close = () => setOpen(false);
  const yes = () => { close(); studioHost?.ask?.({ text: t('skillOffer.request'), refs: [] }); };
  const never = () => { try { localStorage.setItem(KEY, '1'); } catch { /* not kept */ } close(); };
  const button = 'h-8 min-w-[72px] rounded-[8px] px-4 text-[13px] font-semibold transition';
  return (
    <div role="dialog" aria-label={t('skillOffer.title')} data-skill-offer=""
      className="fixed bottom-6 left-1/2 z-[10060] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated,#16161b)] p-4 shadow-[0_18px_50px_-12px_rgba(0,0,0,.75)]">
      <div className="text-[14.5px] font-semibold text-[var(--text)]">{t('skillOffer.title')}</div>
      <div className="text-[12px] text-[var(--text-muted)]">{t('skillOffer.hint')}</div>
      <div className="flex items-center gap-2">
        <button type="button" autoFocus onClick={yes} className={`${button} bg-[var(--accent)] text-white hover:brightness-110`}>{t('skillOffer.yes')}</button>
        <button type="button" onClick={close} className={`${button} border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg-hover)]`}>{t('skillOffer.no')}</button>
        <button type="button" onClick={never} className="ml-auto text-[11.5px] text-[var(--text-faint)] underline-offset-2 hover:underline">{t('skillOffer.never')}</button>
      </div>
    </div>
  );
}
