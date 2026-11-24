/**
 * The picture's shape, in a small bar above the viewer: the usual ratios as buttons (16:9, 9:16, 1:1, 4:3) and a menu
 * with all of them, the film's own size when it has one, and a custom shape. The same choice as the inspector's Stage
 * menu (FilmInspector), kept where the picture is.
 */
import { useT } from '@/i18n';
import { originalShape, shaped } from '@/lib/canvas-fit';
import { filmFrameRatio, type FilmFrameId } from '@/lib/film-frame';
import { CANVAS_RATIOS, canvasRatioLabel } from './FramePicker';
import { MenuSelect } from './MenuSelect';

const QUICK: FilmFrameId[] = ['16:9', '9:16', '1:1', '4:3'];

export function ViewerShapeBar({ stage, original, onCanvas, disabled = false }: {
  stage: { w: number; h: number };
  original: { w: number; h: number } | null;
  onCanvas: (next: FilmFrameId) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const preset = CANVAS_RATIOS.find((r) => shaped(stage, filmFrameRatio(r.id, stage)));
  const { frame: fit, current: isFit } = originalShape(stage, original);
  return (
    <div data-viewer-shape-bar="" className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">{t('inspector.stageShape')}</span>
      {QUICK.map((id) => {
        const on = !isFit && preset?.id === id;
        return (
          <button key={id} type="button" disabled={disabled} aria-pressed={on} onClick={() => onCanvas(id)}
            className={`h-6 rounded px-2 text-[11px] tabular-nums transition-colors ${on ? 'bg-[var(--bg-picked)] text-[var(--accent)] shadow-[inset_0_-2px_0_var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}>
            {id}
          </button>
        );
      })}
      <span className="w-1" />
      <div className="w-28">
        <MenuSelect
          label={t('inspector.stageShape')}
          value={isFit ? 'original' : preset?.id ?? 'custom'}
          disabled={disabled}
          groups={[
            { choices: [
              ...(fit ? [{ value: 'original', label: t('viewer.ratioOriginal') }] : []),
              ...(preset || isFit ? [] : [{ value: 'custom', label: t('viewer.frameCustom') }]),
            ] },
            { choices: CANVAS_RATIOS.filter((r) => r.group === 'wide').map((r) => ({ value: r.id, label: canvasRatioLabel(t, r) })) },
            { choices: CANVAS_RATIOS.filter((r) => r.group === 'tall').map((r) => ({ value: r.id, label: canvasRatioLabel(t, r) })) },
          ].filter((g) => g.choices.length)}
          onPick={(id) => { if (id === 'original') { if (fit) onCanvas(fit); } else if (id !== 'custom') onCanvas(id as FilmFrameId); }}
        />
      </div>
      <span className="ml-auto text-[10px] tabular-nums text-[var(--text-faint)]">{stage.w}×{stage.h}</span>
    </div>
  );
}
