/**
 * Lettermark engine — letters only, no pictogram.
 *
 * The most reduced mark in the set: one or two letters, tight tracking, and at most one small accent
 * element to give the eye somewhere to land. Used for abbreviation brands and for anything whose brief
 * asked for restraint, where an icon would be one decision too many.
 *
 * Letters are optically tightened rather than merely centred: a two-letter lettermark wants negative
 * tracking so the pair reads as one glyph, not two.
 */

import { accentRule, monogramLetters, path, pick } from './shared'
import { contrastFill } from './monogram'
import { readableOn } from '../resolvers/palette-resolver'
import { fitText } from './metrics'
import { textPath } from '../text'
import { discPath, segmentPath } from '../geometry'
import type { Engine, EngineInput, SVGElement } from '../types'

/** Accent treatments available to the engine. */
export const ACCENTS: readonly string[] = ['none', 'rule', 'dot', 'corner-frame']

/** Fraction of the canvas the letters may occupy. */
const FILL_RATIO = 0.54

/** Tracking applied between letters, as a fraction of the font's baked tracking. */
const TIGHT_TRACKING = -0.9

/** The four edges of a square frame, as `[x1, y1, x2, y2]` pairs. */
const FRAME_EDGES: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 1, 0],
  [1, 0, 1, 1],
  [1, 1, 0, 1],
  [0, 1, 0, 0],
]

/**
 * Draws a lettermark.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const lettermark: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, font, seed, size } = input
  const letters = monogramLetters(input)
  if (letters === '') {
    return []
  }

  const accent = pick(ACCENTS, seed, input.request.preferences.accent)
  const centre = size / 2
  const tracking = font.letterSpacing * TIGHT_TRACKING

  // Reserve vertical room for the accent so the letters never collide with it.
  const reserveTop = accent === 'none' ? 0 : size * 0.07
  const reserveBottom = accent === 'none' ? 0 : size * 0.13
  const boxTop = reserveTop
  const boxHeight = size - reserveTop - reserveBottom

  const fitted = fitText(font, letters, centre, boxTop, size * FILL_RATIO, boxHeight, tracking)
  const canvas = palette.background ?? '#ffffff'
  const fill = contrastFill(palette, canvas)

  const elements: SVGElement[] = [
    path(textPath(font, letters, fitted.left, fitted.top, fitted.scale, tracking), fill),
  ]

  const baseline = fitted.top + fitted.height
  const accentColour = readableOn(palette.accent, canvas, fill)
  switch (accent) {
    case 'rule':
      elements.push(
        accentRule(centre, baseline + size * 0.06, fitted.width * 0.52, size * 0.026, accentColour)
      )
      break
    case 'dot':
      elements.push(path(discPath(centre, baseline + size * 0.055, size * 0.03), accentColour))
      break
    case 'corner-frame': {
      const pad = size * 0.11
      const inner = size - pad * 2
      const thickness = size * 0.018
      const arm = inner * 0.26
      for (const [x1, y1, x2, y2] of FRAME_EDGES) {
        const ax = pad + x1 * inner
        const ay = pad + y1 * inner
        const bx = pad + x2 * inner
        const by = pad + y2 * inner
        // Each bracket is the last `arm` of one edge, so the four of them sit in the four corners.
        // `segmentPath` takes the direction from these endpoints: a vertical edge has to be drawn
        // vertically, which a horizontal capsule cannot do.
        const sx = x1 === x2 ? ax : bx - Math.sign(bx - ax) * arm
        const sy = y1 === y2 ? ay : by - Math.sign(by - ay) * arm
        elements.push(path(segmentPath(sx, sy, bx, by, thickness), accentColour))
      }
      break
    }
    default:
      break
  }

  input.mood.notes.push(
    accent === 'none'
      ? `Lettermark in ${letters.length} letters, no accent, tracking tightened to ${tracking.toFixed(0)} units.`
      : `Lettermark in ${letters.length} letters with a ${accent.replace('-', ' ')} accent; tracking tightened to ${tracking.toFixed(0)} units.`
  )

  return elements
}
