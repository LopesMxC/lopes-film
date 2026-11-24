// @ts-check
/**
 * Local ou API externa, para cada serviço de IA: o que este computador (memória de vídeo e RAM) dá conta de rodar, a
 * sugestão ("local" ou "api") com o motivo em português, e uma estimativa de custo ANTES de qualquer chamada paga.
 *
 *   GET  /api/ai-advice            → { hardware, services: [{ id, label, mode, why, needs }] }
 *   POST /api/ai-estimate { service, units } → { service, unit, minUsd, maxUsd, approx: true, note }
 *
 * Os preços são faixas aproximadas de mercado (a conta real é a do provedor); servem para a pessoa decidir antes de gastar.
 */
import { NEEDS, whyNot } from './hardware.mjs';

/**
 * `local`: a chave de NEEDS que decide (o serviço roda na placa/CPU local). null: só existe como API.
 * @type {Array<{ id: string, label: string, need: string | null, unit: string, minUsd: number, maxUsd: number, note: string }>}
 */
export const SERVICES = [
  { id: 'narrator', label: 'Narrador (voz)', need: 'tts', unit: '1.000 caracteres', minUsd: 0.015, maxUsd: 0.3, note: 'Voz neural em português do Brasil; o local roda no processador.' },
  { id: 'voiceclone', label: 'Clonagem de voz', need: 'voiceclone', unit: '1.000 caracteres', minUsd: 0.1, maxUsd: 0.4, note: 'Exige consentimento da pessoa cuja voz é clonada.' },
  { id: 'image', label: 'Geração de imagem', need: 'image', unit: 'imagem', minUsd: 0.02, maxUsd: 0.2, note: 'Depende do tamanho e da qualidade.' },
  { id: 'music', label: 'Geração de música', need: 'music', unit: 'minuto de áudio', minUsd: 0.05, maxUsd: 0.5, note: 'Faixas curtas saem mais baratas.' },
  { id: 'video', label: 'Geração de vídeo', need: 'video', unit: 'segundo de vídeo', minUsd: 0.05, maxUsd: 0.75, note: 'Vídeo com pessoa real pede modelo grande: em placa de 6 GB, use API.' },
  { id: 'faceswap', label: 'Troca de rosto (Face Swap)', need: 'faceswap', unit: 'segundo de vídeo', minUsd: 0.01, maxUsd: 0.15, note: 'Só com consentimento da pessoa do rosto.' },
  { id: 'faceenhance', label: 'Melhora de rosto', need: 'faceenhance', unit: 'segundo de vídeo', minUsd: 0.01, maxUsd: 0.1, note: 'Opcional, depois da troca.' },
  { id: 'upscale', label: 'Aumento de resolução', need: 'upscale', unit: 'segundo de vídeo', minUsd: 0.01, maxUsd: 0.1, note: '' },
];

/**
 * @param {import('./hardware.mjs').Hardware | null} hw
 * @returns {Array<{ id: string, label: string, mode: 'local' | 'api', why: string, needs: { vramGb: number, ramGb: number } | null }>}
 */
export function adviceAll(hw) {
  return SERVICES.map((s) => {
    const needs = s.need ? /** @type {Record<string, { vramGb: number, ramGb: number }>} */ (NEEDS)[s.need] ?? null : null;
    const lack = s.need ? whyNot(s.need, hw) : 'Este serviço só existe como API.';
    if (!hw) return { id: s.id, label: s.label, mode: lack ? 'api' : 'local', why: 'Não consegui ler o hardware; o local fica disponível e a API é a alternativa.', needs };
    return { id: s.id, label: s.label, mode: lack ? 'api' : 'local', why: lack ?? 'Seu computador dá conta de rodar localmente, sem custo por uso.', needs };
  });
}

/** @param {unknown} service @param {unknown} units */
export function estimate(service, units) {
  const s = SERVICES.find((x) => x.id === service);
  if (!s) throw Object.assign(new Error('serviço desconhecido'), { status: 400 });
  const n = typeof units === 'number' && Number.isFinite(units) && units > 0 ? units : 1;
  const per = s.unit.startsWith('1.000') ? n / 1000 : n;
  const round = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
  return { service: s.id, unit: s.unit, units: n, minUsd: round(s.minUsd * per), maxUsd: round(s.maxUsd * per), approx: true, note: s.note };
}
