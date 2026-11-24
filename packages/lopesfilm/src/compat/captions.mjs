// @remotion/captions: subtitles read from SRT, grouped into the pages of a TikTok-style caption.
export function parseSrt({ input }) {
  const ms = (t) => { const [h, m, rest] = t.trim().split(':'); const [s, f = '0'] = rest.replace(',', '.').split('.'); return Math.round(((+h * 60 + +m) * 60 + +s) * 1000 + +`0.${f}` * 1000); };
  const captions = [];
  for (const block of input.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(Boolean);
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const startMs = ms(a), endMs = ms(b.split(/\s/).filter(Boolean)[0]);
    captions.push({ text: lines.slice(at + 1).join(' '), startMs, endMs, timestampMs: (startMs + endMs) / 2, confidence: null });
  }
  return { captions };
}
export function serializeSrt({ lines }) {
  const t = (m) => { const h = Math.floor(m / 3600000), mi = Math.floor(m / 60000) % 60, s = Math.floor(m / 1000) % 60, f = Math.round(m % 1000); return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(f).padStart(3, '0')}`; };
  return lines.map((l, i) => `${i + 1}\n${t(l[0].startMs)} --> ${t(l[l.length - 1].endMs)}\n${l.map((c) => c.text).join('')}\n`).join('\n');
}
/** Words grouped into pages: a word joins the page when it starts less than `combineTokensWithinMilliseconds` after the page began. */
export function createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds = 800 }) {
  const pages = [];
  for (const c of captions) {
    const page = pages[pages.length - 1];
    if (page && c.startMs - page.startMs < combineTokensWithinMilliseconds) {
      page.text += c.text;
      page.tokens.push({ text: c.text, fromMs: c.startMs, toMs: c.endMs });
      page.durationMs = c.endMs - page.startMs;
    } else pages.push({ text: c.text, startMs: c.startMs, durationMs: c.endMs - c.startMs, tokens: [{ text: c.text, fromMs: c.startMs, toMs: c.endMs }] });
  }
  return { pages };
}
