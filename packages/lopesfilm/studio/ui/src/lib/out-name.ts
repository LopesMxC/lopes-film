/**
 * A name `lopesfilm get --out` accepts (letters, digits, `_` and `-`, no folder, no extension) made from a file's name:
 * "Meu vídeo (2).final.mp4" → "Meu-vídeo-2-final". Empty names become `fallback`.
 */
export function outName(file: string, fallback = 'audio'): string {
  return ((file.split('/').pop() ?? '').replace(/\.[^.]+$/, '')
    .normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 90)) || fallback;
}
