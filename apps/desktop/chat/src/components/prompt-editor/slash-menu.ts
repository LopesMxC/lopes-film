/**
 * The `/` menu: a library of what the person can ask for, opened by typing `/` at the start of a line or after a space.
 * Picking one writes a ready request into the sentence, to finish and send; nothing is run by the menu itself.
 *
 * Pure logic (when `/` counts, which commands show, in what order) apart from the Lexical half (SlashMenuPlugin), so
 * the rules are tested on plain strings. The words are in Portuguese and English; the other languages show English.
 */
import { scoreMentionText } from './mention-menu.ts';

export type SlashLocale = 'pt' | 'en';
type Words = Record<SlashLocale, string>;

export interface SlashCommand {
  id: string;
  group: string;
  label: Words;
  /** what it does, one line */
  hint: Words;
  /** what is written into the sentence */
  text: Words;
  /** other words that find it */
  keywords?: string[];
}

export const SLASH_GROUPS: Record<string, Words> = {
  edit: { pt: 'Editar', en: 'Edit' },
  media: { pt: 'Mídia', en: 'Media' },
  motion: { pt: 'Animação e efeitos', en: 'Motion and effects' },
  sound: { pt: 'Som', en: 'Sound' },
  skills: { pt: 'Skills', en: 'Skills' },
  project: { pt: 'Projeto', en: 'Project' },
};
const GROUP_ORDER = Object.keys(SLASH_GROUPS);

const c = (id: string, group: string, pt: [string, string, string], en: [string, string, string], keywords: string[] = []): SlashCommand => ({
  id, group, keywords,
  label: { pt: pt[0], en: en[0] }, hint: { pt: pt[1], en: en[1] }, text: { pt: pt[2], en: en[2] },
});

/** The library. Each text is a request the agent can do with what Lopes.Film has. */
export const SLASH_COMMANDS: SlashCommand[] = [
  c('cut', 'edit', ['Cortar', 'Corta trechos do vídeo', 'Corte o vídeo: tire '], ['Cut', 'Remove parts of the video', 'Cut the video: remove '], ['trim', 'tirar', 'remover']),
  c('silence', 'edit', ['Cortar silêncios', 'Tira pausas e hesitações', 'Corte os silêncios e pausas longas do vídeo.'], ['Cut silences', 'Removes pauses and hesitations', 'Cut the silences and long pauses from the video.'], ['pausas', 'silence']),
  c('captions', 'edit', ['Legendas', 'Cria legendas a partir da fala', 'Crie legendas para o vídeo a partir da fala, com estilo '], ['Captions', 'Makes captions from the speech', 'Make captions for the video from the speech, styled '], ['legenda', 'subtitles']),
  c('reframe', 'edit', ['Formato vertical', 'Adapta para 9:16 (Reels, Shorts, TikTok)', 'Adapte o vídeo para o formato vertical 9:16, mantendo o rosto em quadro.'], ['Vertical format', 'Fits it to 9:16 (Reels, Shorts, TikTok)', 'Fit the video to vertical 9:16, keeping the face in frame.'], ['9:16', 'shorts', 'reels', 'tiktok']),
  c('speed', 'edit', ['Velocidade', 'Acelera ou desacelera um trecho', 'Mude a velocidade do trecho '], ['Speed', 'Speeds a part up or slows it down', 'Change the speed of '], ['rápido', 'lento', 'slow']),
  c('grade', 'edit', ['Cor', 'Correção e gradação de cor', 'Faça a correção de cor do vídeo para um visual '], ['Color grade', 'Color correction and look', 'Color-grade the video for a look that is '], ['cinema', 'lut', 'color']),
  c('image', 'media', ['Gerar imagem', 'Cria uma imagem a partir de um texto', 'Gere uma imagem: '], ['Make an image', 'Makes a picture from a prompt', 'Make an image: '], ['imagem', 'picture']),
  c('video', 'media', ['Gerar clipe', 'Cria um clipe curto de vídeo', 'Gere um clipe de vídeo curto: '], ['Make a clip', 'Makes a short video clip', 'Make a short video clip: '], ['clipe', 'clip']),
  c('upscale', 'media', ['Melhorar resolução', 'Amplia e dá nitidez (Real-ESRGAN)', 'Aumente a resolução e a nitidez de '], ['Upscale', 'Larger and sharper (Real-ESRGAN)', 'Upscale and sharpen '], ['nitidez', 'ampliar', 'sharpen']),
  c('eyes', 'media', ['Contato visual', 'Corrige o olhar para a lente', 'Corrija o contato visual do vídeo: os olhos devem olhar para a câmera.'], ['Eye contact', 'Moves the eyes back to the lens', 'Fix the eye contact in the video: the eyes should look at the camera.'], ['olhos', 'olhar']),
  c('cutout', 'media', ['Remover fundo', 'Recorta a pessoa ou objeto', 'Remova o fundo de '], ['Remove background', 'Cuts out the person or object', 'Remove the background of '], ['recortar', 'cutout', 'bg']),
  c('title', 'motion', ['Título animado', 'Título ou abertura em HTML/GSAP', 'Crie um título animado: "'], ['Animated title', 'A title or opener in HTML/GSAP', 'Make an animated title: "'], ['abertura', 'intro', 'opener']),
  c('effectcraft', 'motion', ['Motion graphics (Skill de Motion)', 'Animação estilo After Effects, fundo transparente', 'Use o Skill de Motion para fazer uma animação de motion graphics: '], ['Motion graphics (Skill de Motion)', 'After Effects-style, transparent background', 'Use Skill de Motion to make a motion graphics animation: '], ['after effects', 'brilho', 'glow', 'particulas', '3d']),
  c('lower', 'motion', ['Lower third', 'Nome e cargo na tela', 'Crie um lower third com o nome "'], ['Lower third', 'Name and title on screen', 'Make a lower third with the name "'], ['nome', 'identificação']),
  c('transition', 'motion', ['Transição', 'Transição entre dois clipes', 'Adicione uma transição entre os clipes '], ['Transition', 'A transition between two clips', 'Add a transition between clips '], ['fade', 'dissolve']),
  c('chart', 'motion', ['Gráfico animado', 'Dados em gráfico que se desenha', 'Crie um gráfico animado com estes dados: '], ['Animated chart', 'Data as a chart that draws itself', 'Make an animated chart from this data: '], ['dados', 'data', 'barras']),
  c('voice', 'sound', ['Narração', 'Gera uma locução a partir de um texto', 'Gere uma narração com este texto: "'], ['Voice-over', 'Makes a voice from a text', 'Make a voice-over of this text: "'], ['voz', 'tts', 'locução']),
  c('music', 'sound', ['Trilha sonora', 'Música de fundo', 'Adicione uma trilha sonora de fundo no estilo '], ['Music', 'Background music', 'Add background music in the style of '], ['música', 'trilha', 'bgm']),
  c('sfx', 'sound', ['Efeito sonoro', 'Cria ou adiciona um efeito de som', 'Adicione um efeito sonoro de '], ['Sound effect', 'Makes or adds a sound effect', 'Add a sound effect of '], ['som', 'sfx']),
  c('clean', 'sound', ['Limpar áudio', 'Reduz ruído e normaliza o volume', 'Limpe o áudio do vídeo: reduza o ruído e normalize o volume.'], ['Clean audio', 'Reduces noise and evens the volume', 'Clean the audio: reduce the noise and normalize the volume.'], ['ruído', 'noise', 'volume']),
  c('skill', 'skills', ['Fazer skill deste vídeo', 'Guarda o jeito que este vídeo foi feito', 'Faça uma skill padrão deste vídeo, para eu repetir o mesmo estilo nos próximos.'], ['Make a skill of this video', 'Keeps how this video was made', 'Make a default skill of this video, so I can repeat the same style in the next ones.'], ['padrão', 'template', 'estilo']),
  c('recreate', 'skills', ['Recriar um vídeo', 'Refaz um vídeo de referência', 'Recrie este vídeo de referência com o meu conteúdo: '], ['Recreate a video', 'Remakes a reference video', 'Recreate this reference video with my content: '], ['referência', 'copiar', 'reference']),
  c('review', 'project', ['Revisar o filme', 'Confere o resultado e aponta problemas', 'Revise o filme inteiro e liste o que está errado ou pode melhorar.'], ['Review the film', 'Checks the result and lists problems', 'Review the whole film and list what is wrong or could be better.'], ['checar', 'qualidade']),
  c('export', 'project', ['Exportar', 'Prepara o arquivo final', 'Exporte o vídeo final em '], ['Export', 'Prepares the final file', 'Export the final video as '], ['renderizar', 'render', 'mp4']),
  c('summary', 'project', ['Resumir o projeto', 'O que há no projeto agora', 'Resuma em poucas linhas o que há neste projeto agora.'], ['Summarize the project', 'What is in the project now', 'Summarize in a few lines what is in this project now.'], ['resumo']),
];

const MAX_QUERY = 24;
export interface SlashTrigger { leadOffset: number; query: string; replaceableString: string }

/** Whether the text before the caret ends in a `/` being typed: at the start or after a space (not in a path or an address). */
export function matchSlashTrigger(textBeforeCursor: string): SlashTrigger | null {
  const at = textBeforeCursor.lastIndexOf('/');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(textBeforeCursor[at - 1]!)) return null;
  const query = textBeforeCursor.slice(at + 1);
  if (query.length > MAX_QUERY || /\s/.test(query)) return null;
  return { leadOffset: at, query, replaceableString: textBeforeCursor.slice(at) };
}

export interface SlashEntry { command: SlashCommand; firstOfGroup: boolean; groupLabel: string }

/** The commands for what is typed after `/`, grouped (in the library's order) and the best match first inside a group. */
export function buildSlashMenu(query: string, locale: SlashLocale, commands: SlashCommand[] = SLASH_COMMANDS): SlashEntry[] {
  const scored = commands.flatMap((command) => {
    const best = [command.label[locale], command.label.en, command.id, ...(command.keywords ?? [])]
      .map((text) => scoreMentionText(text, query)).filter((n): n is number => n !== null).sort((a, b) => a - b)[0];
    return best === undefined ? [] : [{ command, score: best }];
  });
  const out: SlashEntry[] = [];
  for (const group of GROUP_ORDER) {
    const inGroup = scored.filter((s) => s.command.group === group).sort((a, b) => a.score - b.score);
    inGroup.forEach((s, i) => out.push({ command: s.command, firstOfGroup: i === 0, groupLabel: SLASH_GROUPS[group]![locale] }));
  }
  return out;
}

/** The menu's language: Portuguese for the Portuguese UI, English for the rest. @param {string} locale */
export const slashLocale = (locale: string): SlashLocale => (/^pt/i.test(locale) ? 'pt' : 'en');
