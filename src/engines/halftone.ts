/**
 * Halftone engine — the letterform as a field of dots.
 *
 * A printing metaphor: instead of drawing the outline, the engine samples the glyph into a grid and
 * sets one dot per filled cell, sized by how deeply that cell sits inside the letter. Cell centres on
 * the edge of the shape get small dots and the core gets large ones, which is what a halftone screen does
 * to a gradient — the mark reads as a letter made of light rather than of strokes.
 *
 * The glyphs come from the brain like every other letterform in the project, so nothing here parses a
 * font: the outline is flattened, sampled with the nonzero winding rule, and the result is dots.
 */

import { discPath } from '../geometry'
import { contrastFill } from '../resolvers/palette-resolver'
import { neighbourCount, sampleGlyph } from '../sample'
import { fitGlyphRun, opticalTracking } from './metrics'
import { centreOnInk, monogramLetters, path } from './shared'
import type { Engine, EngineInput, SVGElement } from '../types'

/** Rows the glyph is sampled at. More rows means a finer screen and a finer mark at large sizes. */
export const HALFTONE_ROWS: readonly number[] = [13, 15, 17]

/** Fraction of the cap height the dot field occupies, so the mark keeps clear space around it. */
const FIELD = 0.58

/**
 * Draws a halftone mark.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const halftoneEngine: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, font, seed, size } = input
  const letters = monogramLetters(input)
  if (letters === '') {
    return []
  }

  const canvas = palette.background ?? '#ffffff'
  const ink = contrastFill(palette, canvas)
  const rows = seed.choice(HALFTONE_ROWS)
  // Two thresholds and a spread rather than one size for every dot: the field needs a gradient of weight
  // to read as a letter, and the thresholds are drawn from the seed so two concepts differ.
  const edgeShare = seed.range(0.22, 0.34)
  const coreShare = seed.range(0.54, 0.68)
  const spread = seed.range(0.26, 0.34)
  const tracking = opticalTracking(font, -0.02)
  const scale = fitGlyphRun(font, letters, size, FIELD, tracking)

  const elements: SVGElement[] = []
  let cursor = 0
  for (const letter of letters) {
    const glyph = font.glyphs[letter]
    if (typeof glyph === 'string' && glyph !== '') {
      const sample = sampleGlyph(glyph, rows)
      if (sample !== null) {
        const cellWidth = ((sample.bounds.maxX - sample.bounds.minX) / sample.cols) * scale
        const cellHeight = ((sample.bounds.maxY - sample.bounds.minY) / sample.rows) * scale
        const originX = cursor + sample.bounds.minX * scale
        const originY = sample.bounds.minY * scale
        const base = Math.min(cellWidth, cellHeight) * spread
        for (let row = 0; row < sample.rows; row++) {
          for (let col = 0; col < sample.cols; col++) {
            if (sample.cells[row]?.[col] !== true) {
              continue
            }
            const share = neighbourCount(sample.cells, row, col) / 8
            let weight = 1
            if (share < edgeShare) {
              weight = 0.72
            } else if (share < coreShare) {
              weight = 1
            } else {
              weight = 1.28
            }
            const x = originX + (col + 0.5) * cellWidth
            const y = originY + (row + 0.5) * cellHeight
            elements.push(path(discPath(x, y, base * weight), ink))
          }
        }
      }
    }
    // A missing glyph is skipped rather than substituted, but its advance still moves the cursor, so a
    // gap the typeface would have left is left here too.
    cursor += ((font.metrics.advance[letter] ?? 0) + tracking) * scale
  }

  input.mood.notes.push(
    `Halftone "${letters}" set as a ${rows}-row dot screen, dot weight following the ink's depth.`
  )

  return centreOnInk(elements, size)
}

export { halftoneEngine as halftone }
