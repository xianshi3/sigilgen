/**
 * Type-fitting maths shared by the type-bearing engines.
 *
 * The brain's fonts carry real advance widths, so fitting text is arithmetic rather than measurement:
 * scale the run by the tighter of the two constraints and the result is predictable at any output
 * size.
 */

import { letterAdvance, measureText, textInk, type TextInk } from '../text'
import type { FontEntry } from '../types'

/** A fitted text run. */
export interface FittedText {
  /** Font units to user units. */
  scale: number
  /** Width of the run's advance box in user units. */
  width: number
  /** Cap height in user units. */
  height: number
  /** Left edge that centres the run's *ink* on `centreX`, in user units. */
  left: number
  /**
   * Top of the caps that centres the run's *ink* vertically in its box, in user units.
   *
   * Note this is the cap top, not the baseline: see `textPath`.
   */
  top: number
  /**
   * The ink the run will draw, relative to its origin and cap top.
   *
   * Engines that lay out *around* a run need this rather than `width` and `height`. Those two are the
   * advance box and the cap box; the ink is narrower by the outer side bearings and shorter by however
   * much the letters fall short of the cap line, which in this library is most of them.
   */
  ink: TextInk
}

/**
 * Fits a text run into a box, centred both ways.
 *
 * @param font - The typeface.
 * @param letters - Uppercase letters to fit.
 * @param centreX - Centre x of the box.
 * @param boxTop - Top edge of the box.
 * @param boxWidth - Width of the box.
 * @param boxHeight - Height of the box.
 * @param tracking - Extra tracking in font units.
 * @returns The fitted run.
 */
export function fitText(
  font: FontEntry,
  letters: string,
  centreX: number,
  boxTop: number,
  boxWidth: number,
  boxHeight: number,
  tracking = 0
): FittedText {
  const natural = naturalWidth(font, letters, tracking)
  const { capHeight } = font.metrics
  const byWidth = natural > 0 ? boxWidth / natural : Number.POSITIVE_INFINITY
  const byHeight = capHeight > 0 ? boxHeight / capHeight : Number.POSITIVE_INFINITY
  const scale = Math.max(Math.min(byWidth, byHeight), 0.0001)

  const metrics = measureText(font, letters, scale, tracking)
  const ink = textInk(font, letters, scale, tracking)
  return {
    scale,
    width: metrics.width,
    height: metrics.height,
    ink,
    // Both axes are centred on the measured ink rather than on the boxes the run is measured by.
    //
    // The advance box is wider than the ink by the two outer side bearings and one trailing tracking
    // unit, so centring the box left every composed mark a bearing's width off centre — a vertical
    // wordmark's icon and name came out 1.2% of the canvas left. The cap box is taller than the ink by
    // however far the tallest letter falls short of the cap line, so centring the box pushed a stacked
    // name down by a gap larger than the one that was asked for.
    left: centreX - ink.width / 2 - ink.offsetX,
    top: boxTop + (boxHeight - ink.height) / 2 - ink.offsetY,
  }
}

/**
 * Natural advance width of a run, in font units.
 *
 * @param font - The typeface.
 * @param letters - Uppercase letters to measure.
 * @param tracking - Extra tracking in font units.
 * @returns The width in font units.
 */
export function naturalWidth(font: FontEntry, letters: string, tracking = 0): number {
  let width = 0
  for (const letter of letters) {
    // `measureText` resolves advances through `letterAdvance`, which gives a space its own width
    // rather than the missing-glyph fallback. This must match it exactly, or a wordmark with a space
    // is scaled against a width that includes a full capital the drawer never draws.
    width += letterAdvance(font, letter) + tracking
  }
  return width
}

/**
 * Optical tracking for a run, in font units, from a fraction of the cap height.
 *
 * Engines used to express tracking as a multiple of `font.letterSpacing`, which is an authoring
 * constant: a number the compiler happened to use when it derived the family's side bearings, with no
 * relationship to the spacing those bearings actually produce. Because tracking is added to every
 * advance, one unit widens the gap between two letters by exactly that unit — so multiplying an
 * unrelated constant put the gap anywhere from a third of a stroke to three times it, depending on the
 * family. A wordmark set in the loosest face came out at 309/1000 of cap height between letters, and
 * the tightest lettermark came out negative, with the letters overlapping.
 *
 * A fraction of cap height is the unit type designers actually specify letterspacing in, and it is
 * stable: it does not move when the compiler changes how it derives bearings, because it is measured
 * against the one dimension every typeface shares.
 *
 * @param font - The typeface.
 * @param fraction - Tracking as a fraction of cap height. Positive opens the letters up.
 * @returns Tracking in font units.
 */
export function opticalTracking(font: FontEntry, fraction: number): number {
  return font.metrics.capHeight * fraction
}

/**
 * Cap height a run should use to occupy a target width.
 *
 * @param font - The typeface.
 * @param letters - Uppercase letters to fit.
 * @param targetWidth - Desired run width in user units.
 * @returns The cap height in user units.
 */
export function capHeightForWidth(font: FontEntry, letters: string, targetWidth: number): number {
  const natural = naturalWidth(font, letters)
  if (natural <= 0) {
    return 0
  }
  return (targetWidth / natural) * font.metrics.capHeight
}
