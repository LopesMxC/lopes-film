// @ts-check
/**
 * What the library's text things say about themselves (`about`, `tags` of library/tags.json), made from their group and
 * English name, so `lopesfilm get` finds a look or a motion by what it is: "neon", "typewriter", "lower third".
 * Used by scripts/library-text.mjs when it writes the index.
 */

/** [words of the name, tags they say] in order; every match adds its tags */
const LOOKS = [
  [/neon/, ['neon']], [/gold|silver|bronze|platinum|copper|chrome|rose gold|diamond|emerald|elegant|serif/, ['elegant']],
  [/retro|vaporwave|sunset/, ['retro']], [/comic|cute|candy|bubble|pop\b|sticker|pink/, ['cute']],
  [/handwriting|chalk|marker|ink|graffiti|brush|highlighter/, ['handdrawn']], [/typewriter|terminal|code|blueprint/, ['tech']],
  [/news|breaking|live/, ['news']], [/cinema|movie|trailer/, ['cinematic-look', 'trailer']],
  [/label|pill|box|badge|tape|warning|sale|new\b|stamp/, ['lowerthird']], [/subtitle|caption|karaoke/, ['subtitle']],
  [/fire|lava|ember|plasma|thermal|blood|sunrise/, ['fire']], [/ice|frost|aurora|ocean|glass|hologram|midnight/, ['cool-tone']],
  [/pastel|sakura|lemon|grape|mint/, ['pastel']], [/rainbow|toxic|cyberpunk|galaxy|vivid|variety/, ['vivid']],
  [/black|white|solid|outline|edge|thin|light|clean/, ['minimal']],
];
const MOTIONS = [
  [/fade|blur|breathe|glow|flicker/, ['fade']], [/zoom|expand|shrink|unfold|pulse|heartbeat/, ['zoom']],
  [/slide|left|right|rise|drop|sink|lift|float|light speed|swing in/, ['slide']], [/wipe/, ['wipe']],
  [/spin|flip|tilt|skew|swing|hue/, ['spin']], [/shake|wiggle|jitter|glitch/, ['shake']],
  [/bounce|elastic|rubber|jelly|pop\b/, ['bounce']], [/typewriter/, ['typewriter']],
];

/**
 * @param {{ id: string, group?: string, name: { en: string } }} item
 * @returns {{ about: string, tags: string[] }}
 */
export function describeText(item) {
  const name = item.name.en;
  const low = name.toLowerCase();
  const pick = (/** @type {[RegExp, string[]][]} */ rules) => [...new Set(rules.flatMap(([re, tags]) => (re.test(low) ? tags : [])))];
  switch (item.group) {
    case 'in': return { about: low === 'none' ? 'No entrance motion: the words are simply there when the clip starts.' : `Text motion in, "${name}": the words come in this way when they appear. For titles and captions that should arrive with a move.`, tags: ['title', ...pick(MOTIONS)] };
    case 'loop': return { about: low === 'none' ? 'No motion while shown: the words stay still.' : `Text motion while shown, "${name}": the words keep moving this way the whole time they are on screen.`, tags: ['title', ...pick(MOTIONS)] };
    case 'out': return { about: low === 'none' ? 'No exit motion: the words are simply gone when the clip ends.' : `Text motion out, "${name}": the words leave this way when the clip ends. For titles and captions that should exit with a move.`, tags: ['title', ...pick(MOTIONS)] };
    case 'basic': {
      if (item.id === 'text/text') return { about: 'A plain line of words you type into: the starting point for any title or caption, with its colour, size and font to set.', tags: ['title'] };
      const tag = /subtitle/.test(low) ? 'subtitle' : /line below/.test(low) ? 'lowerthird' : 'title';
      return { about: `The basic "${name}" text style: a ready size and weight for ${tag === 'lowerthird' ? 'a name or caption under the picture' : tag === 'subtitle' ? 'a second line under a title' : 'a heading or a line of body text'}.`, tags: [tag] };
    }
    default: {
      const tags = pick(LOOKS);
      return { about: `A ready-made text look, "${name}": put it on a line of words for a title, a caption or a label${tags.length ? ` with a ${tags[0].replace('-', ' ')} feel` : ''}.`, tags: ['title', ...tags] };
    }
  }
}
