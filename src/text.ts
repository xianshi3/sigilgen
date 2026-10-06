/**
 * Lays out text runs from the JSON brain's pre-generated glyph outlines.
 *
 * No font file is ever loaded and no text-measurement API is used: advances come from the font's own
 * metrics, and glyph paths are baked into coordinates by {@link transformPath} rather than wrapped in
 * a `transform` attribute, which keeps the emitted SVG flat and each glyph independently movable.
 */

import { transformPath } from './path'
import type { FontEntry } from './types'

/**
 * Reduces arbitrary text to the letters a mark can actually draw.
 *
 * Every stage that turns user text into geometry funnels through this one rule: uppercase `A`–`Z` and
 * nothing else. Keeping it in a single place is what stops the call sites — config validation,
 * monogram initials, wordmark words — from drifting apart and silently disagreeing about which
 * letters a logo is allowed to draw.
 *
 * @param value - Arbitrary text.
 * @returns Only `A`–`Z`, uppercased.
 */
export function normaliseLetters(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '')
}

/** Advance assumed for a glyph the font does not define. */
const FALLBACK_ADVANCE = 620

/**
 * Advance of a word space, in font units.
 *
 * The brain's `advance` table covers `A`–`Z` only, because those are the letters a logo is allowed to
 * draw. A wordmark for a two-word name still needs a gap between the words, so the space gets a width
 * of its own rather than inheriting `FALLBACK_ADVANCE` — which is a full capital's advance and would
 * set `Northwind Coffee` as two names a country apart.
 *
 * 260 units is 0.26 em, inside the 0.2–0.4 em range a display face uses for a word space.
 */
const SPACE_ADVANCE = 260

/** Optical tracking applied between glyphs, in font units. */
const DEFAULT_TRACKING = 0

/**
 * Advance width of one letter, in font units.
 *
 * Measurement and drawing must resolve this identically. When they disagreed — measurement counting a
 * character the drawer skipped — the run was laid out wider than it was drawn, which put the ink off
 * centre and, for a wordmark with a space in it, ran the two words together. Routing both through one
 * function is what makes that class of bug unreachable rather than merely fixed.
 *
 * @param font - The typeface.
 * @param letter - One character of the run.
 * @returns The advance in font units.
 */
export function letterAdvance(font: FontEntry, letter: string): number {
  const advance = font.metrics.advance[letter]
  if (advance !== undefined) {
    return advance
  }
  return letter === ' ' ? SPACE_ADVANCE : FALLBACK_ADVANCE
}

/** Measured size of a laid-out text run. */
export interface TextMetrics {
  /** Total advance width in user units, including tracking. */
  width: number
  /** Cap height in user units. */
  height: number
}

/**
 * Measures a text run.
 *
 * @param font - The typeface.
 * @param letters - Uppercase letters to lay out.
 * @param scale - Font units to user units.
 * @param tracking - Extra tracking in font units, on top of the font's baked advances.
 * @returns The run's width and cap height in user units.
 */
export function measureText(
  font: FontEntry,
  letters: string,
  scale: number,
  tracking = DEFAULT_TRACKING
): TextMetrics {
  let width = 0
  let count = 0
  for (const letter of letters) {
    width += letterAdvance(font, letter) + tracking
    count++
  }
  // Each advance already includes both side bearings, which is exactly the box the run occupies.
  return { width: Math.max(width, 0) * scale, height: font.metrics.capHeight * scale }
}

/**
 * Lays out a text run into a single path.
 *
 * Glyph outlines are authored with the cap top at `y = 0` and the baseline at `y = capHeight`, and the
 * transform is a plain scale plus translation — there is no flip. So `topY` is the *top of the caps*,
 * not the baseline: a run drawn with `topY = 100` and cap height `80` has its baseline at `180`.
 *
 * Glyphs the font does not define are skipped rather than substituted, which keeps the output honest:
 * a missing glyph is visible instead of silently turning into a wrong letter. Their advance is still
 * applied, so an undrawable character leaves the gap it was measured as — which is what makes a space
 * in `Northwind Coffee` a space, and what keeps this function in agreement with `measureText`.
 *
 * @param font - The typeface.
 * @param letters - Uppercase letters to draw.
 * @param x - Left edge of the run, in user units.
 * @param topY - Top of the caps, in user units.
 * @param scale - Font units to user units.
 * @param tracking - Extra tracking in font units, on top of the font's baked advances.
 * @returns Path data, or an empty string when nothing could be drawn.
 */
export function textPath(
  font: FontEntry,
  letters: string,
  x: number,
  topY: number,
  scale: number,
  tracking = DEFAULT_TRACKING
): string {
  const parts: string[] = []
  let cursor = x
  for (const letter of letters) {
    const glyph = font.glyphs[letter]
    if (typeof glyph === 'string' && glyph !== '') {
      parts.push(transformPath(glyph, scale, cursor, topY))
    }
    // The advance is applied whether or not the glyph was drawn, because that is what `measureText`
    // counted. The two functions have to agree or the run is laid out wider than it is drawn, which
    // puts the ink off centre by half the difference.
    //
    // For a space this is also the only way a space can exist: the brain carries no space glyph, so a
    // run that advanced only on drawn glyphs set `Northwind Coffee` as `NORTHWINDCOFFEE`. A character
    // the family genuinely lacks still leaves a gap, but the gap is its measured advance rather than an
    // arbitrary one, so the layout stays predictable instead of depending on which letters survived.
    cursor += (letterAdvance(font, letter) + tracking) * scale
  }
  return parts.join('')
}
