// @remotion/media-utils: what a sound or a video is (length, size, its samples), read in the page.
import { useEffect, useState } from 'react';
import { continueRender, delayRender } from './react.mjs';

const loadMedia = (tag, src) => new Promise((resolve, reject) => {
  const el = document.createElement(tag);
  el.preload = 'metadata';
  el.onloadedmetadata = () => resolve(el);
  el.onerror = () => reject(new Error(`could not read ${src}`));
  el.src = src;
});
export const getAudioDurationInSeconds = async (src) => (await loadMedia('audio', src)).duration;
export async function getVideoMetadata(src) {
  const v = await loadMedia('video', src);
  return { durationInSeconds: v.duration, width: v.videoWidth, height: v.videoHeight, aspectRatio: v.videoWidth / v.videoHeight, isRemote: /^https?:/.test(src) && !src.startsWith(location.origin), codec: null, canPlayInVideoTag: true };
}
export const getImageDimensions = (src) => new Promise((resolve, reject) => {
  const i = new Image();
  i.onload = () => resolve({ width: i.naturalWidth, height: i.naturalHeight });
  i.onerror = () => reject(new Error(`could not read ${src}`));
  i.src = src;
});

const cache = new Map();
export function getAudioData(src) {
  if (!cache.has(src)) {
    cache.set(src, (async () => {
      const bytes = await (await fetch(src)).arrayBuffer();
      const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
      const buf = await ctx.decodeAudioData(bytes);
      return { channelWaveforms: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), sampleRate: buf.sampleRate, durationInSeconds: buf.duration, numberOfChannels: buf.numberOfChannels, resultId: String(Math.random()), isRemote: false };
    })());
  }
  return cache.get(src);
}
/** The sound's samples once loaded (the frame waits for them); null until then. */
export function useAudioData(src) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const hold = delayRender(`useAudioData ${src}`);
    getAudioData(src).then(setData, (e) => { throw e; }).finally(() => continueRender(hold));
  }, [src]);
  return data;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
/** The loudness of `numberOfSamples` frequency bands (0…1) at `frame`: `numberOfSamples` must be a power of two. */
export function visualizeAudio({ audioData, frame, fps, numberOfSamples, smoothing = true }) {
  if (numberOfSamples & (numberOfSamples - 1)) throw new Error('visualizeAudio: numberOfSamples must be a power of 2');
  const window = numberOfSamples * 2, data = audioData.channelWaveforms[0];
  const out = new Array(numberOfSamples).fill(0);
  const frames = smoothing ? [-1, 0, 1] : [0];
  for (const d of frames) {
    const start = Math.max(0, Math.round(((frame + d) / fps) * audioData.sampleRate) - window / 2);
    const re = new Float64Array(window), im = new Float64Array(window);
    for (let i = 0; i < window; i++) re[i] = (data[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (window - 1)));
    fft(re, im);
    for (let i = 0; i < numberOfSamples; i++) out[i] += Math.min(1, (Math.hypot(re[i], im[i]) / window) * 4) / frames.length;
  }
  return out;
}
export const visualizeAudioWaveform = ({ audioData, frame, fps, windowInSeconds, numberOfSamples }) => {
  const data = audioData.channelWaveforms[0], mid = Math.round((frame / fps) * audioData.sampleRate), half = Math.round((windowInSeconds * audioData.sampleRate) / 2);
  return Array.from({ length: numberOfSamples }, (_, i) => data[Math.max(0, mid - half + Math.floor((i / numberOfSamples) * half * 2))] ?? 0);
};
export const createSmoothSvgPath = ({ points }) => points.reduce((d, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${d} L ${p.x} ${p.y}`), '');
