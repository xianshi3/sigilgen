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

/** Optical tracking applied between glyphs, in font units. */
const DEFAULT_TRACKING = 0

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
    width += (font.metrics.advance[letter] ?? FALLBACK_ADVANCE) + tracking
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
 * a missing glyph is visible instead of silently turning into a wrong letter.
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
      cursor += ((font.metrics.advance[letter] ?? FALLBACK_ADVANCE) + tracking) * scale
    }
    // A glyph the family does not define draws nothing and consumes no space. Advancing anyway would
    // leave a phantom gap where a character was dropped, which reads as a layout bug.
  }
  return parts.join('')
}
