// @remotion/layout-utils: how wide a line of text is, and the size that fits it into a width.
const ctx = () => (ctx.c ??= document.createElement('canvas').getContext('2d'));
export function measureText({ text, fontFamily, fontSize, fontWeight = 'normal', fontStyle = 'normal', letterSpacing = '0px', textTransform }) {
  const c = ctx();
  c.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  const t = textTransform === 'uppercase' ? text.toUpperCase() : textTransform === 'lowercase' ? text.toLowerCase() : text;
  const m = c.measureText(t);
  const spacing = parseFloat(letterSpacing) || 0;
  return { width: m.width + spacing * t.length, height: (m.fontBoundingBoxAscent ?? fontSize * 0.8) + (m.fontBoundingBoxDescent ?? fontSize * 0.2) };
}
export function fitText({ text, withinWidth, fontFamily, fontWeight, fontStyle, letterSpacing, textTransform, validateFontIsLoaded: _v }) {
  const at = (fontSize) => measureText({ text, fontFamily, fontSize, fontWeight, fontStyle, letterSpacing, textTransform }).width;
  const base = 100, fontSize = (withinWidth / at(base)) * base;
  return { fontSize, width: at(fontSize) };
}
export function fillTextBox({ maxBoxWidth, maxLines }) {
  let lines = 0, x = 0;
  return { add({ text, fontFamily, fontSize, fontWeight, letterSpacing }) {
    const { width } = measureText({ text, fontFamily, fontSize, fontWeight, letterSpacing });
    if (x + width > maxBoxWidth && x > 0) { lines++; x = 0; }
    const exceedsBox = lines + 1 > maxLines;
    const out = { exceedsBox, newLine: x === 0 && lines > 0, left: x, top: lines * fontSize };
    x += width;
    return out;
  } };
}
export const fitTextOnNLines = ({ text, maxLines, maxBoxWidth, fontFamily, fontWeight }) => ({ fontSize: fitText({ text, withinWidth: maxBoxWidth * maxLines, fontFamily, fontWeight }).fontSize });
