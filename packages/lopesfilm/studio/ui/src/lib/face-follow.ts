/**
 * The zoom and pan that keep a face where it is wanted: from the face's path through a clip (its centre, 0 to 1 of the
 * picture, at seconds of the clip), the clip's `motion` (src/clip-motion.mjs): a fixed scale and a translate that moves
 * with the face, so the face stays at the stage's centre, and never so far that the picture's edge shows.
 */
export interface FacePoint { t: number; x: number; y: number }
export interface FaceMotion { scale: Array<{ t: number; v: number }>; translate: Array<{ t: number; v: [number, number] }> }

/**
 * @param path the face's centre by time in the clip (seconds); `video` the source's size, `stage` the film's, `zoom` > 1
 */
export function faceFollowMotion(path: FacePoint[], video: { w: number; h: number }, stage: { w: number; h: number }, zoom = 1.35): FaceMotion | null {
  if (!path.length || video.w <= 0 || video.h <= 0) return null;
  /* the picture as the stage shows it (contained), in stage px */
  const fit = Math.min(stage.w / video.w, stage.h / video.h);
  const pw = video.w * fit, ph = video.h * fit;
  const limitX = Math.max(0, (pw * zoom - stage.w) / 2), limitY = Math.max(0, (ph * zoom - stage.h) / 2);
  const clamp = (n: number, m: number) => Math.max(-m, Math.min(m, n));
  const round = (n: number) => (Math.round(n * 100) / 100) || 0;
  /* one key about every 0.2 s, no more than 300 */
  const every = Math.max(0.2, (path.at(-1)!.t - path[0]!.t) / 300);
  const kept: FacePoint[] = [];
  for (const p of path) if (!kept.length || p.t - kept.at(-1)!.t >= every - 1e-6) kept.push(p);
  if (kept.at(-1) !== path.at(-1)) kept.push(path.at(-1)!);
  const translate = kept.map((p) => ({ t: round(Math.max(0, p.t)), v: [round(clamp(-(p.x - 0.5) * pw * zoom, limitX)), round(clamp(-(p.y - 0.5) * ph * zoom, limitY))] as [number, number] }));
  return { scale: [{ t: translate[0]!.t, v: zoom }, { t: translate.at(-1)!.t, v: zoom }], translate };
}
