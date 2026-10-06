/**
 * Wordmark engine — a pictogram and the brand name locked up together.
 *
 * The name is treated as part of the mark rather than text dropped next to one: the run is fitted to
 * the space the pictogram leaves, tracking is set optically, and the colours come from a single palette
 * so the lockup reads as one object.
 *
 * Three independent axes give the engine real range, so a `variations: 6` run produces six ideas
 * rather than two marks in different colours:
 *
 * - **Layout** — horizontal (pictogram left, name right) suits wide canvases and header use; vertical
 *   (pictogram above, name below) suits square canvases and emblems.
 * - **Treatment** — `plain` sets the pictogram directly; `badge` gives it a filled tile and reverses
 *   the glyph out of it; `rule` separates the two with a hairline, the way a masthead divides columns.
 * - **Colour emphasis** — whether the name or the pictogram carries the accent.
 */

import { accentRule, path, pick, placeIcon, wordmarkLetters } from './shared'
import { contrastFill, readableOn } from '../resolvers/palette-resolver'
import { fitText } from './metrics'
import { textPath } from '../text'
import { roundedRectPath } from '../geometry'
import type { Engine, EngineInput, IconEntry, SVGElement } from '../types'

/** Layouts available to the engine. */
export const LAYOUTS: readonly string[] = ['horizontal', 'vertical']

/** Lockup treatments available to the engine. */
export const TREATMENTS: readonly string[] = ['plain', 'badge', 'rule']

/** Fraction of the canvas width the pictogram occupies in a horizontal lockup. */
const HORIZONTAL_ICON_RATIO = 0.17

/** Fraction of the canvas height the pictogram occupies in a vertical lockup. */
const VERTICAL_ICON_RATIO = 0.3

/** Optical tracking added to the run, as a fraction of the font's baked tracking. */
const WORDMARK_TRACKING = 0.15

/** Space between pictogram and type, as a fraction of the canvas. */
const GAP = 0.07

/** Canvas margin the lockup keeps on every side. */
const MARGIN = 0.07

/** Corner radius factor for the badge tile. */
const BADGE_CORNER = 0.3

/** Inset between the badge tile and the glyph it carries, as a fraction of the tile. */
const BADGE_INSET = 0.18

/** Thickness of the rule treatment's divider, as a fraction of the canvas. */
const RULE_THICKNESS = 0.012

/**
 * Draws a wordmark.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const wordmark: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, font, seed, size, icon } = input
  const letters = wordmarkLetters(input)
  if (letters === '' || icon === null) {
    // Without a pictogram there is nothing to lock up; fall back to a plain type mark so the concept
    // is still usable rather than empty.
    return drawTypeOnly(input)
  }

  const canvas = palette.background ?? '#ffffff'
  const nameFill = contrastFill(palette, canvas)
  const accent = readableOn(palette.accent, canvas, nameFill)

  const layout = pick(LAYOUTS, seed, input.request.preferences.layout)
  const treatment = pick(TREATMENTS, seed, input.request.preferences.treatment)
  const accentLeads = seed.chance(0.4)

  // The badge reverses its glyph out of a filled tile, so that glyph must contrast with the tile
  // rather than with the canvas. Everything else contrasts with the canvas.
  const badgeTile = accentLeads ? nameFill : accent
  const lockupFill = accentLeads ? accent : nameFill
  let glyphFill = lockupFill
  if (treatment === 'badge') {
    glyphFill = contrastFill(palette, badgeTile)
  }

  const tracking = font.letterSpacing * WORDMARK_TRACKING
  const elements: SVGElement[] = []

  if (layout === 'horizontal') {
    // The name leads a wordmark, so it gets the larger share and the pictogram is sized to sit beside it
    // rather than compete with it. The rule treatment needs a slightly wider pictogram to separate.
    const margin = size * MARGIN
    const gap = size * GAP
    const iconBox = size * HORIZONTAL_ICON_RATIO * (treatment === 'rule' ? 1.3 : 1)
    const textLeft = margin + iconBox + gap
    const textWidth = size - textLeft - margin
    const fitted = fitText(
      font,
      letters,
      textLeft + textWidth / 2,
      0,
      textWidth,
      size * 0.34,
      tracking
    )
    const capTop = size / 2 - fitted.height / 2

    elements.push(
      ...decorate(icon, treatment, margin, size / 2 - iconBox / 2, iconBox, glyphFill, badgeTile)
    )
    if (treatment === 'rule') {
      elements.push(
        accentRule(
          margin + iconBox + gap * 0.45,
          size / 2,
          size * RULE_THICKNESS,
          fitted.height * 1.15,
          accent
        )
      )
    }
    elements.push(
      path(textPath(font, letters, fitted.left, capTop, fitted.scale, tracking), lockupFill)
    )
  } else {
    const margin = size * MARGIN
    const gap = size * GAP
    const iconBox = size * VERTICAL_ICON_RATIO
    const blockHeight = iconBox + gap + size * 0.16
    const iconTop = (size - blockHeight) / 2
    const textTop = iconTop + iconBox + gap
    const fitted = fitText(
      font,
      letters,
      size / 2,
      textTop,
      size - margin * 2,
      size * 0.16,
      tracking
    )

    elements.push(
      ...decorate(icon, treatment, (size - iconBox) / 2, iconTop, iconBox, glyphFill, badgeTile),
      path(textPath(font, letters, fitted.left, fitted.top, fitted.scale, tracking), lockupFill)
    )
  }

  input.mood.notes.push(
    `Wordmark: ${layout} lockup with a ${treatment} treatment; ${icon.key} in ${glyphFill} beside the name in ${lockupFill}, set in ${font.family}.`
  )

  return elements
}

/**
 * Places the pictogram, applying the lockup's treatment.
 *
 * @param icon - The pictogram to place.
 * @param treatment - One of {@link TREATMENTS}.
 * @param x - Left edge of the pictogram's box.
 * @param y - Top edge of the pictogram's box.
 * @param box - Side length of the pictogram's box.
 * @param glyph - Colour for the pictogram itself.
 * @param tile - Tile colour, used only by the badge treatment.
 * @returns The SVG elements for this part of the lockup.
 */
function decorate(
  icon: IconEntry,
  treatment: string,
  x: number,
  y: number,
  box: number,
  glyph: string,
  tile: string
): SVGElement[] {
  if (treatment !== 'badge') {
    return [placeIcon(icon, x, y, box, glyph)]
  }
  const inset = box * BADGE_INSET
  return [
    path(roundedRectPath(x, y, box, box, box * BADGE_CORNER), tile),
    placeIcon(icon, x + inset, y + inset, box - inset * 2, glyph),
  ]
}

/**
 * Draws the type on its own, used when no pictogram resolved.
 *
 * @param input - The engine input.
 * @returns The SVG elements.
 */
function drawTypeOnly(input: EngineInput): SVGElement[] {
  const { palette, font, size } = input
  const letters = wordmarkLetters(input)
  if (letters === '') {
    return []
  }
  const canvas = palette.background ?? '#ffffff'
  const fill = contrastFill(palette, canvas)
  const tracking = font.letterSpacing * WORDMARK_TRACKING
  const fitted = fitText(font, letters, size / 2, size * 0.26, size * 0.86, size * 0.48, tracking)
  input.mood.notes.push(
    `Wordmark without a pictogram; the name alone is set in ${font.family} in ${fill}.`
  )
  return [path(textPath(font, letters, fitted.left, fitted.top, fitted.scale, tracking), fill)]
}
