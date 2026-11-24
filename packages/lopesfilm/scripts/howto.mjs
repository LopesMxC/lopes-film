#!/usr/bin/env node
/**
 * The "How to use" video, made with the program itself: scenes written as pages (CSS animation), cut together by a
 * film.html with a music bed and a few UI sounds, rendered with src/render.mjs into library/howto/how-to-use.<lang>.mp4.
 *   node scripts/howto.mjs [lang…]      (default: every language below)
 * The words are on screen as subtitles: there is no voice. To add one, open the film in Studio and use the voice-over.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../src/render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..', 'library');
const OUT = join(lib, 'howto');
const W = 1280, H = 720;

const TEXT = {
  'pt-BR': {
    s0: ['Como usar', 'Seu vídeo em 5 passos, sem editar nada à mão'],
    s1: ['1 · Descreva o que quer', 'Escreva no chat, em português normal. O agente monta o vídeo para você.', 'Faça um vídeo de 15 s para o lançamento do meu produto', 'Pronto! Montei 6 cenas, com música e legendas.'],
    s2: ['2 · Veja e ajuste no Studio', 'O vídeo aparece ao lado, ao vivo. Arraste, corte e troque o que quiser.', 'Cenas', 'Música'],
    s3: ['3 · Use a Biblioteca', 'Sons, textos, transições, efeitos e modelos prontos, de graça e offline.', ['Sons', 'Textos', 'Transições', 'Efeitos', 'Modelos', 'Skills']],
    s4: ['4 · Ensine o seu jeito com Skills', 'Importe do GitHub, crie a partir de um vídeo de referência ou ative a que mais usa.', ['Importar do GitHub', 'De um vídeo', 'Aplicar em toda sessão']],
    s5: ['5 · Exporte', 'Escolha o formato e exporte. Para Reels, TikTok, YouTube ou o que precisar.', ['9:16', '1:1', '16:9'], 'Pronto!'],
    s6: ['Comece agora', 'Abra um projeto e descreva o primeiro vídeo.'],
  },
  en: {
    s0: ['How to use', 'Your video in 5 steps, with no hand editing'],
    s1: ['1 · Say what you want', 'Write in the chat, in plain words. The agent builds the video for you.', 'Make a 15 s video for my product launch', 'Done! I made 6 scenes, with music and captions.'],
    s2: ['2 · See it and adjust it in Studio', 'The video appears beside it, live. Drag, cut and swap whatever you like.', 'Scenes', 'Music'],
    s3: ['3 · Use the Library', 'Sounds, texts, transitions, effects and templates, free and offline.', ['Sounds', 'Texts', 'Transitions', 'Effects', 'Templates', 'Skills']],
    s4: ['4 · Teach your way with Skills', 'Import from GitHub, make one from a reference video, or switch on the one you use most.', ['Import from GitHub', 'From a video', 'Apply in every session']],
    s5: ['5 · Export', 'Pick the format and export. For Reels, TikTok, YouTube or whatever you need.', ['9:16', '1:1', '16:9'], 'Done!'],
    s6: ['Start now', 'Open a project and describe your first video.'],
  },
};
/* scene lengths in seconds, in order */
const LENGTHS = [4, 11, 11, 11, 11, 10, 6];

const CSS = `
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:Carlito,'DejaVu Sans',sans-serif;color:#f3f3f5}
body{background:radial-gradient(1200px 700px at 20% 0%,#2a1218 0,#111114 60%)}
.title{position:absolute;left:70px;top:48px;font-size:54px;font-weight:800;letter-spacing:-.02em;animation:up .6s cubic-bezier(.2,.7,.2,1) both}
.title b{color:#e0384e}
.cap{position:absolute;left:70px;right:70px;bottom:44px;font-size:30px;line-height:1.3;color:#f3f3f5;background:rgba(0,0,0,.55);padding:14px 22px;border-radius:14px;animation:fade .5s .5s both}
.win{position:absolute;background:#1b1b20;border:1px solid #34343c;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.45);overflow:hidden}
.chip{display:inline-block;padding:10px 20px;border-radius:999px;background:#26262d;border:1px solid #3a3a44;font-size:26px;font-weight:600}
.acc{background:#e0384e;border-color:#e0384e;color:#fff}
.tile{position:absolute;width:190px;height:120px;border-radius:14px;background:#26262d;border:1px solid #3a3a44;display:flex;align-items:center;justify-content:center;font-size:25px;font-weight:700}
@keyframes up{from{opacity:0;translate:0 24px}to{opacity:1;translate:0 0}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes pop{0%{opacity:0;scale:.6}70%{opacity:1;scale:1.06}100%{opacity:1;scale:1}}
@keyframes grow{from{width:0}to{width:var(--w)}}
@keyframes type{from{width:0}to{width:var(--w)}}
@keyframes slide{from{opacity:0;translate:-60px 0}to{opacity:1;translate:0 0}}
@keyframes sweep{from{left:0}to{left:100%}}
@keyframes check{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(224,56,78,.0)}50%{box-shadow:0 0 0 14px rgba(224,56,78,.35)}}
`;
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${W}, height=${H}"><style>${CSS}</style><script>window.film = { frame() {} };</script></head><body>${body}</body></html>`;
const head = (title, caption) => `<div class="title">${title.replace(/^(\d) ·/, '<b>$1</b> ·')}</div><div class="cap">${caption}</div>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function scenes(T) {
  const [t0, c0] = T.s0;
  const [t1, c1, ask, answer] = T.s1;
  const [t2, c2, laneA, laneB] = T.s2;
  const [t3, c3, cats] = T.s3;
  const [t4, c4, skills] = T.s4;
  const [t5, c5, formats, done] = T.s5;
  const [t6, c6] = T.s6;
  const lane = (top, label, color, parts) => `<div style="position:absolute;left:24px;right:24px;top:${top}px;height:44px"><span style="position:absolute;left:0;top:8px;font-size:20px;color:#9a9aa6">${label}</span>${parts.map(([l, w, d]) => `<div style="position:absolute;left:${l}px;top:0;height:44px;width:${w}px;border-radius:9px;background:${color};animation:slide .5s ${d}s both"></div>`).join('')}</div>`;
  return [
    page(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px">
      <div style="font-size:112px;font-weight:800;letter-spacing:-.03em;animation:pop .8s both">${esc(t0)}</div>
      <div style="font-size:36px;color:#c9c9d2;animation:up .7s .5s both">${esc(c0)}</div></div>`),
    page(`${head(t1, c1)}
      <div class="win" style="left:70px;top:150px;width:700px;height:410px;padding:26px">
        <div style="font-size:24px;color:#9a9aa6;margin-bottom:14px">chat</div>
        <div style="display:inline-block;max-width:600px;background:#e0384e;border-radius:18px;padding:16px 22px;font-size:27px;line-height:1.3;animation:up .5s .6s both">${esc(ask)}</div>
        <div style="margin-top:26px;max-width:620px;background:#2a2a31;border-radius:18px;padding:16px 22px;font-size:27px;line-height:1.3;animation:up .5s 4.2s both">${esc(answer)}</div></div>
      <div class="win" style="left:810px;top:150px;width:400px;height:410px;animation:fade .6s 5.2s both">
        <div style="margin:24px;height:200px;border-radius:12px;background:linear-gradient(135deg,#e0384e,#8c1325);display:flex;align-items:center;justify-content:center;font-size:60px;font-weight:800">▶</div>
        ${lane(250, '', '#4a6cf7', [[0, 120, 5.8], [130, 90, 6.1], [230, 110, 6.4]])}${lane(310, '', '#3ec28f', [[0, 330, 6.8]])}</div>`),
    page(`${head(t2, c2)}
      <div class="win" style="left:70px;top:150px;width:1140px;height:410px">
        <div style="position:absolute;left:40px;top:28px;width:420px;height:236px;border-radius:12px;background:linear-gradient(135deg,#4a6cf7,#e0384e);animation:pop .6s .4s both"></div>
        <div style="position:absolute;left:500px;top:40px;display:flex;flex-direction:column;gap:14px"><span class="chip" style="animation:pop .4s 3s both">✂</span><span class="chip" style="animation:pop .4s 4s both">↔</span><span class="chip" style="animation:pop .4s 5s both">⟲</span></div>
        <div style="position:absolute;left:0;right:0;top:290px;height:1px;background:#34343c"></div>
        ${lane(300, laneA, '#4a6cf7', [[120, 200, 1.2], [330, 160, 1.6], [500, 260, 2.0], [770, 220, 2.4]])}${lane(356, laneB, '#3ec28f', [[120, 870, 2.8]])}
        <div style="position:absolute;top:286px;bottom:0;width:3px;background:#fff;left:120px;animation:sweep 6s 3s linear both;animation-name:play"></div></div>
      <style>@keyframes play{from{left:120px}to{left:1050px}}</style>`),
    page(`${head(t3, c3)}
      <div style="position:absolute;left:70px;top:170px;display:flex;gap:12px;flex-wrap:wrap;width:1140px">${cats.map((c, i) => `<span class="chip ${i === 1 ? 'acc' : ''}" style="animation:pop .4s ${0.4 + i * 0.25}s both">${esc(c)}</span>`).join('')}</div>
      ${Array.from({ length: 12 }, (_, i) => `<div class="tile" style="left:${70 + (i % 6) * 192}px;top:${290 + Math.floor(i / 6) * 138}px;animation:pop .45s ${2 + i * 0.22}s both"><span style="opacity:.8">${['♪', 'Aa', '⇄', '✦', '▣', '★'][i % 6]}</span></div>`).join('')}`),
    page(`${head(t4, c4)}
      ${skills.map((s, i) => `<div class="win" style="left:${70 + i * 385}px;top:190px;width:360px;height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;animation:pop .5s ${0.6 + i * 1.6}s both">
        <div style="font-size:64px">${['⌥', '▶', '⚡'][i]}</div><div style="font-size:28px;font-weight:700;text-align:center;padding:0 16px">${esc(s)}</div></div>`).join('')}
      <div style="position:absolute;left:70px;top:480px;width:1140px;height:44px;display:flex;align-items:center;gap:14px;animation:fade .5s 5.6s both"><div style="width:76px;height:40px;border-radius:999px;background:#e0384e;position:relative;animation:glow 1.4s 6s 3"><div style="position:absolute;right:5px;top:5px;width:30px;height:30px;border-radius:50%;background:#fff"></div></div><span style="font-size:26px;color:#c9c9d2">${esc(skills[2])}</span></div>`),
    page(`${head(t5, c5)}
      <div style="position:absolute;left:70px;top:170px;display:flex;gap:16px">${formats.map((f, i) => `<span class="chip ${i === 0 ? 'acc' : ''}" style="animation:pop .4s ${0.4 + i * 0.3}s both">${esc(f)}</span>`).join('')}</div>
      <div class="win" style="left:70px;top:290px;width:1140px;height:150px;padding:34px 40px">
        <div style="height:26px;border-radius:13px;background:#2a2a31;overflow:hidden"><div style="--w:100%;height:100%;background:#e0384e;border-radius:13px;animation:grow 4s 2s ease-in-out both"></div></div></div>
      <div style="position:absolute;left:70px;top:470px;display:flex;align-items:center;gap:18px;animation:pop .5s 6.2s both"><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3ec28f"/><path d="M18 33l10 10 19-21" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-dasharray="60" style="animation:check .5s 6.5s both"/></svg><span style="font-size:40px;font-weight:800">${esc(done)}</span></div>`),
    page(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px">
      <div style="font-size:96px;font-weight:800;letter-spacing:-.03em;animation:pop .8s both">${esc(t6)}</div>
      <div style="font-size:36px;color:#c9c9d2;animation:up .7s .5s both">${esc(c6)}</div></div>`),
  ];
}

const run = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TEXT);
mkdirSync(OUT, { recursive: true });
for (const lang of langs) {
  if (!TEXT[lang]) throw new Error(`no words for ${lang}`);
  const work = mkdtempSync(join(tmpdir(), 'howto-'));
  try {
    mkdirSync(join(work, 'assets'));
    scenes(TEXT[lang]).forEach((html, i) => writeFileSync(join(work, `s${i}.html`), html));
    const total = LENGTHS.reduce((a, b) => a + b, 0);
    /* a soft music bed made here: a slow chord (A minor 7) with a gentle swell, no samples */
    run('-f', 'lavfi', '-i', `aevalsrc='0.10*(sin(2*PI*110*t)+0.7*sin(2*PI*164.81*t)+0.5*sin(2*PI*220*t)+0.4*sin(2*PI*261.63*t))*(0.75+0.25*sin(2*PI*0.12*t))':s=44100:d=${total}`,
      '-af', `lowpass=f=1200,afade=t=in:d=2,afade=t=out:st=${total - 3}:d=3,volume=0.55`, '-b:a', '128k', join(work, 'assets', 'bed.mp3'));
    copyFileSync(join(lib, 'sounds', 'click.m4a'), join(work, 'assets', 'click.m4a'));
    let at = 0;
    const clips = LENGTHS.map((len, i) => { const c = `  <iframe src="s${i}.html#t=0,${len}" at="${at}"></iframe>`; at += len; return c; });
    at = 0;
    const clicks = LENGTHS.map((len) => { const c = `  <audio src="assets/click.m4a" at="${at}" volume="0.5"></audio>`; at += len; return c; });
    writeFileSync(join(work, 'film.html'), `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=${W}, height=${H}">\n</head>\n<body>\n<section>\n${clips.join('\n')}\n</section>\n<section>\n  <audio src="assets/bed.mp3" volume="0.6"></audio>\n</section>\n<section>\n${clicks.join('\n')}\n</section>\n</body>\n</html>\n`);
    const raw = join(work, 'out.mp4');
    await render([work], { out: raw, fps: 30, quiet: true });
    run('-i', raw, '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', join(OUT, `how-to-use.${lang}.mp4`));
    run('-ss', '6', '-i', raw, '-frames:v', '1', '-vf', 'scale=640:360', '-q:v', '5', join(OUT, `how-to-use.${lang}.jpg`));
    console.log(`→ library/howto/how-to-use.${lang}.mp4`);
  } finally { rmSync(work, { recursive: true, force: true }); }
}
