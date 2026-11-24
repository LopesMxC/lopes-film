/**
 * The engines that run on this computer and are not library models (studio/server/local-engines.mjs): the picture maker,
 * the video maker, the upscaler and the eye-contact model. Each is fetched on its own, in the background.
 */
import React from 'react';

export type EngineId = 'image' | 'video' | 'upscale' | 'eyes' | 'effectcraft' | 'figcraft' | 'vectorcraft' | 'interpolate' | 'autoedit' | 'soundcraft' | 'anicraft' | 'ytdlp' | 'whisperfast' | 'voiceclean' | 'earshot' | 'reavideo' | 'pack-sfx' | 'pack-ui' | 'pack-models3d-kits' | 'pack-models3d-more' | 'pack-vfx' | 'pack-fonts';

export interface LocalEngine {
  id: EngineId;
  /** `pack`: an optional free pack (sounds, sprites, fonts) rather than a model */
  kind?: string;
  license?: string;
  by?: string;
  folder?: string;
  files?: number;
  name: string;
  bytes: number;
  installed: boolean;
  /** this computer can run it */
  supported: boolean;
  /** why this computer cannot run it with room to spare (memory, graphics card); set means the download is unavailable */
  blocked?: string;
  /** coming: what it is doing now, and how much of it is here */
  installing?: { say: string; bytes: number };
  /** its last fetch failed: the reason */
  failed?: string;
}

async function call(path: string, method = 'GET'): Promise<LocalEngine[]> {
  const res = await fetch(`/api/local-engines${path}`, { method, cache: 'no-store' });
  const data = await res.json().catch(() => ({})) as { engines?: LocalEngine[]; error?: string };
  if (!res.ok || !data.engines) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.engines;
}

/** The engines, kept current (asked again every second while one is coming). */
export function useLocalEngines() {
  const [engines, setEngines] = React.useState<LocalEngine[] | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  /** engines with a newer release than the one pinned, by id (told, not taken in) */
  const [updates, setUpdates] = React.useState<Record<string, { latest: string; url: string }>>({});
  React.useEffect(() => { void call('').then(setEngines, (e: Error) => setProblem(e.message)); }, []);
  React.useEffect(() => {
    void fetch('/api/local-engines/updates', { cache: 'no-store' }).then((r) => r.json() as Promise<{ updates?: Array<{ id: string; latest: string; url: string }> }>)
      .then((d) => setUpdates(Object.fromEntries((d.updates ?? []).map((u) => [u.id, { latest: u.latest, url: u.url }])))).catch(() => {});
  }, []);
  const coming = engines?.some((e) => e.installing) ?? false;
  React.useEffect(() => {
    if (!coming) return;
    const timer = window.setInterval(() => { void call('').then(setEngines, () => {}); }, 1000);
    return () => window.clearInterval(timer);
  }, [coming]);
  return {
    engines,
    updates,
    problem,
    install: (id: EngineId) => call(`/${id}/install`, 'POST').then((next) => { setEngines(next); setProblem(null); }, (e: Error) => setProblem(e.message)),
  };
}
