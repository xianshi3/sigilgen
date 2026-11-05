/**
 * Scanline engine 鈥?the letterform sliced into horizontal bars.
 *
 * The letter is not drawn; it is cut. For each row of a fine grid the engine finds the runs that fall
 * inside the outline and paints a bar for each run, with a gap between rows. The result reads as a
 * display or a terminal rather than as type, which is the register the mood weights reach for when the
 * brief says "developer", "cyber" or "signal".
 *
 * The runs are the exact crossings of the scanline with the outline, not a fixed-step sample, so a curve
 * is cut where the curve is. Ends are capsules by default and squared when the seed says so, because a
 * cut end and a rounded end are two different registers of the same mark.
 */

import { roundedRectPath } from '../geometry'
import { pathBounds } from '../path'
import { contrastFill } from '../resolvers/palette-resolver'
import { flatten, scanIntervals } from '../sample'
import { fitGlyphRun, opticalTracking } from './metrics'
import { centreOnInk, monogramLetters, path } from './shared'
import type { Engine, EngineInput, SVGElement } from '../types'

/** Rows the glyph is sliced into. */
export const SCANLINE_ROWS: readonly number[] = [11, 13, 15]

/** Fraction of the cap height the bars occupy, so the mark keeps clear space around it. */
const FIELD = 0.58

/**
 * Draws a scanline mark.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const scanlineEngine: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, font, seed, size } = input
  const letters = monogramLetters(input)
  if (letters === '') {
    return []
  }

  const canvas = palette.background ?? '#ffffff'
  const ink = contrastFill(palette, canvas)
  const rows = seed.choice(SCANLINE_ROWS)
  const fill = seed.range(0.5, 0.64)
  const capsule = seed.chance(0.65)
  const tracking = opticalTracking(font, -0.02)
  const scale = fitGlyphRun(font, letters, size, FIELD, tracking)

  const elements: SVGElement[] = []
  let cursor = 0
  for (const letter of letters) {
    const glyph = font.glyphs[letter]
    if (typeof glyph === 'string' && glyph !== '') {
      const bounds = pathBounds(glyph)
      if (bounds !== null) {
        const edges = flatten(glyph)
        const pitch = (bounds.maxY - bounds.minY) / rows
        const barHeight = pitch * fill * scale
        for (let row = 0; row < rows; row++) {
          const y = bounds.minY + (row + 0.5) * pitch
          for (const [start, end] of scanIntervals(edges, y)) {
            const width = (end - start) * scale
            if (width <= 0) {
              continue
            }
            // `roundedRectPath` takes the top-left corner; the bar is centred on the scanline.
            const left = cursor + start * scale
            const top = y * scale - barHeight / 2
            elements.push(
              path(roundedRectPath(left, top, width, barHeight, capsule ? barHeight / 2 : 0), ink)
            )
          }
        }
      }
    }
    cursor += ((font.metrics.advance[letter] ?? 0) + tracking) * scale
  }

  input.mood.notes.push(
    `Scanline "${letters}" cut into ${rows} horizontal runs, ${capsule ? 'capsule' : 'square'} ends.`
  )

  return centreOnInk(elements, size)
}

export { scanlineEngine as scanline }
