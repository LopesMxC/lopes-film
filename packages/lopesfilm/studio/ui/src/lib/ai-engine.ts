/**
 * Local or an outside API, for each AI service (Narrador aside): what Studio has connected, what this computer runs
 * (GET /api/ai-advice), the engine the person last chose (kept per service), and the cost asked before a paid call
 * (POST /api/ai-estimate).
 */
import * as React from 'react';
import type { OwnProvider, ProvidersState } from './providers';

export type Engine = 'local' | 'api';
export type Service = 'image' | 'music' | 'video' | 'faceswap';

/** The providers that run on this computer, whatever they make. */
export const LOCAL_PROVIDERS = new Set(['local', 'localimage', 'localvideo', 'acestep', 'stableaudio', 'supertonic', 'voicestudio']);
/** The `get` verb each service is made with. */
export const VERB: Record<Service, 'image' | 'music' | 'video'> = { image: 'image', music: 'music', video: 'video', faceswap: 'video' };
/** Face swap at fal: the model that puts the people of pictures in place of a clip's. */
export const FACE_SWAP_MODEL = 'minimax-h3-max-recast';

export interface Advice { id: string; label: string; mode: Engine; why: string }
export interface Estimate { minUsd: number; maxUsd: number; unit: string; note: string }

interface Loaded { providers: OwnProvider[]; use: ProvidersState['use']; advice: Advice[] }

export function useAi(): Loaded | null {
  const [state, setState] = React.useState<Loaded | null>(null);
  React.useEffect(() => {
    let live = true;
    void Promise.all([
      fetch('/api/providers', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null), () => null),
      fetch('/api/ai-advice', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null), () => null),
    ]).then(([p, a]: [ProvidersState | null, { services?: Advice[] } | null]) => {
      if (live && p && Array.isArray(p.providers)) setState({ providers: p.providers, use: p.use ?? {}, advice: a?.services ?? [] });
    });
    return () => { live = false; };
  }, []);
  return state;
}

/** The provider and model that make `service` on `engine`, or null when none is connected for it. */
export function route(state: Loaded | null, service: Service, engine: Engine): { via: string; model?: string; name: string } | null {
  if (!state) return null;
  const verb = VERB[service];
  const fits = (p: OwnProvider) => Boolean(p.source) && p.verbs.includes(verb) && (service === 'faceswap' ? p.models.video?.some((m) => m.id === FACE_SWAP_MODEL) ?? false : true);
  const pool = state.providers.filter((p) => fits(p) && LOCAL_PROVIDERS.has(p.id) === (engine === 'local'));
  const chosen = pool.find((p) => p.id === state.use[verb]) ?? pool[0];
  if (!chosen) return null;
  const model = service === 'faceswap' ? FACE_SWAP_MODEL : chosen.models[verb]?.[0]?.id;
  return { via: chosen.id, ...(model ? { model } : {}), name: chosen.name };
}

const KEY = (s: Service) => `lopesfilm.engine.${s}`;
/** The engine last chosen for a service, else what this computer is advised, else the API. */
export function useEngine(service: Service, advice: Advice[] | undefined): [Engine, (e: Engine) => void] {
  const [chosen, setChosen] = React.useState<Engine | null>(() => { try { const v = localStorage.getItem(KEY(service)); return v === 'local' || v === 'api' ? v : null; } catch { return null; } });
  const advised = advice?.find((a) => a.id === service)?.mode;
  const set = React.useCallback((e: Engine) => { setChosen(e); try { localStorage.setItem(KEY(service), e); } catch { /* not kept */ } }, [service]);
  return [chosen ?? advised ?? 'api', set];
}

export function useEstimate(service: Service, units: number, on: boolean): Estimate | null {
  const [est, setEst] = React.useState<Estimate | null>(null);
  React.useEffect(() => {
    if (!on) { setEst(null); return undefined; }
    let live = true;
    void fetch('/api/ai-estimate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service, units }) })
      .then((r) => (r.ok ? r.json() : null), () => null).then((b: Estimate | null) => { if (live) setEst(b); });
    return () => { live = false; };
  }, [service, units, on]);
  return est;
}
