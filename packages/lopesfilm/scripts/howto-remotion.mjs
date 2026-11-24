#!/usr/bin/env node
/**
 * The "How to use" video, made as a Remotion project (scripts/howto-remotion: TSX, springs, TransitionSeries, a cursor
 * that works the timeline) and rendered by Lopes.Film itself, which runs Remotion as written: no bundler, no compile.
 * A soft music bed and a few UI sounds are added on the film's own timeline (Remotion's <Audio> is not used here).
 *   node scripts/howto-remotion.mjs [lang…]      (default: every language below)
 * Output: library/howto/how-to-use.<lang>.mp4 and .jpg. The words are on screen: there is no voice.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../src/render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..', 'library');
const OUT = join(lib, 'howto');
const W = 1280, H = 720, FPS = 30;
/* the same lengths as src/Main.tsx: scene frames, less 15 frames of overlap at each of the 6 cuts */
const LENGTHS = [120, 240, 240, 240, 240, 210, 150];
const TOTAL = (LENGTHS.reduce((a, b) => a + b, 0) - 15 * (LENGTHS.length - 1)) / FPS;
const starts = LENGTHS.map((_, i) => (LENGTHS.slice(0, i).reduce((a, b) => a + b, 0) - 15 * i) / FPS);

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

const run = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TEXT);
mkdirSync(OUT, { recursive: true });
for (const lang of langs) {
  if (!TEXT[lang]) throw new Error(`no words for ${lang}`);
  const work = mkdtempSync(join(tmpdir(), 'howto-rm-'));
  try {
    mkdirSync(join(work, 'assets'));
    cpSync(join(here, 'howto-remotion'), join(work, 'remo'), { recursive: true });
    writeFileSync(join(work, 'remo', 'src', 'text.ts'), `export const TEXT = ${JSON.stringify(TEXT[lang])} as any;\n`);
    /* a soft music bed made here: a slow chord (A minor 7) with a gentle swell, no samples */
    run('-f', 'lavfi', '-i', `aevalsrc='0.10*(sin(2*PI*110*t)+0.7*sin(2*PI*164.81*t)+0.5*sin(2*PI*220*t)+0.4*sin(2*PI*261.63*t))*(0.75+0.25*sin(2*PI*0.12*t))':s=44100:d=${TOTAL}`,
      '-af', `lowpass=f=1200,afade=t=in:d=2,afade=t=out:st=${TOTAL - 3}:d=3,volume=0.55`, '-b:a', '128k', join(work, 'assets', 'bed.mp3'));
    copyFileSync(join(lib, 'sounds', 'click.m4a'), join(work, 'assets', 'click.m4a'));
    const clicks = starts.map((at) => `  <audio src="assets/click.m4a" at="${at}" volume="0.5"></audio>`);
    writeFileSync(join(work, 'film.html'), `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=${W}, height=${H}">\n</head>\n<body>\n<section>\n  <iframe src="remo/index.html#t=0,${TOTAL}" at="0"></iframe>\n</section>\n<section>\n  <audio src="assets/bed.mp3" volume="0.6"></audio>\n</section>\n<section>\n${clicks.join('\n')}\n</section>\n</body>\n</html>\n`);
    const raw = join(work, 'out.mp4');
    await render([work], { out: raw, fps: FPS, quiet: true });
    run('-i', raw, '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', join(OUT, `how-to-use.${lang}.mp4`));
    run('-ss', '9', '-i', raw, '-frames:v', '1', '-vf', 'scale=640:360', '-q:v', '5', join(OUT, `how-to-use.${lang}.jpg`));
    console.log(`→ library/howto/how-to-use.${lang}.mp4`);
  } finally { if (!process.env.KEEP) rmSync(work, { recursive: true, force: true }); }
}
