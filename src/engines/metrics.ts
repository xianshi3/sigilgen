/**
 * Type-fitting maths shared by the type-bearing engines.
 *
 * The brain's fonts carry real advance widths, so fitting text is arithmetic rather than measurement:
 * scale the run by the tighter of the two constraints and the result is predictable at any output
 * size.
 */

import { letterAdvance, measureText } from '../text'
import type { FontEntry } from '../types'

/** A fitted text run. */
export interface FittedText {
  /** Font units to user units. */
  scale: number
  /** Width of the run's advance box in user units. */
  width: number
  /** Cap height in user units. */
  height: number
  /** Left edge that centres the run on `centreX`, in user units. */
  left: number
  /**
   * Top of the caps that centres the run vertically in its box, in user units.
   *
   * Note this is the cap top, not the baseline: see `textPath`.
   */
  top: number
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
  return {
    scale,
    width: metrics.width,
    height: metrics.height,
    // `metrics.width` is the advance box, not the ink. The two differ by the outer side bearings, which
    // cancel because the compiler gives every glyph equal bearings, plus one trailing tracking unit,
    // which does not: the last letter's advance is counted but its glyph stops at the bearing. So the
    // ink sits `tracking / 2` left of the box's centre, and centring the box centres a mark that is not
    // there. Shifting by half a tracking unit puts the ink where the eye expects it.
    left: centreX - metrics.width / 2 + (tracking * scale) / 2,
    top: boxTop + (boxHeight - metrics.height) / 2,
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
