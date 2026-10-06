import { measureText, textPath } from '@sigilgen/text'
import type { FontEntry } from '@sigilgen/types'

/**
 * Lays out a short run in a typeface so the interface can show it.
 *
 * The picker does not ask the operating system to render a font family name in that family — the names
 * are invented, so every one of them would fall back to the same UI face and the list would be a column
 * of identical text. Instead the outlines from the brain are used directly, which is the only way the
 * reader sees what they are about to pick. The generator's own `textPath` does the layout, so a sample
 * is set with the same metrics the mark will use.
 *
 * @param font - The typeface to show.
 * @param letters - Uppercase letters to set, typically the start of the brand name.
 * @param capHeight - Cap height in the returned coordinate system.
 * @returns An inline SVG body plus the viewBox that fits it.
 */
export function fontSample(
  font: FontEntry,
  letters: string,
  capHeight: number
): {
  path: string
  viewBox: string
} {
  const scale = capHeight / font.metrics.capHeight
  const usable = [...letters.toUpperCase()].filter(letter => font.glyphs[letter] !== undefined)
  const run = usable.length > 0 ? usable.join('') : 'A'
  const { width } = measureText(font, run, scale)
  // One unit of padding, because a glyph whose ink sits flush on the advance width would otherwise be
  // clipped by the viewBox edge and look broken.
  const boxWidth = Math.max(width, capHeight) + 2
  return {
    path: textPath(font, run, 1, 0, scale),
    viewBox: `0 0 ${boxWidth} ${capHeight + 1}`,
  }
}
