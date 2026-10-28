/**
 * Turns real, OFL-licensed fonts into the brain's glyph format, at build time.
 *
 * The brain ships path strings, not font files, so nothing here runs at runtime: this module is a build
 * step. Its output is committed as `src/brain/fonts.json` and verified by `--check` on every CI run.
 *
 * ## Why the outlines come from a font rather than from code
 *
 * The letters used to be constructed here from a skeleton of overlapping primitives. That works for 26
 * capital letters and does not extend to anything else: every join is a parameter, and a butt-cut stroke
 * meeting another leaves a notch that has to be filled by hand. Real outlines are the result of a designer
 * solving the same problem once, properly, for every letter.
 *
 * ## Coordinates
 *
 * The brain speaks `1000` units per em, y down, with the cap top at `0` and the baseline at `capHeight`.
 * Fonts speak their own units per em, y up, baseline at `0`. So each point is scaled to 1000/em and its y
 * is mirrored about the cap line. Quadratics are converted to cubics, which is what keeps every emitted
 * glyph to `M`/`L`/`C`/`Z` — the same alphabet the parser and the path transforms already handle.
 */

import { readFileSync } from 'node:fs'
import * as fontkit from 'fontkit'

/** The brain's coordinate space. */
const UPEM = 1000

/** Uppercase letters, plus the space that wordmarks need. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Formats a coordinate for path data: at most 2 decimals, no trailing zeros, no negative zero.
 *
 * The rounding is what makes the output stable: a font's coordinates are already integers, but the
 * scale is not, and `String(0.1 + 0.2)` is not a deterministic path.
 *
 * @param {number} value
 * @returns {string}
 */
export function fmt(value) {
  const rounded = Math.round(value * 100) / 100
  const normalised = Object.is(rounded, -0) ? 0 : rounded
  return String(normalised)
}

/**
 * Reads one font, instances it at a variation if asked, and extracts the glyphs.
 *
 * @param {object} spec - The family description.
 * @param {string} spec.id - Brain id, kebab-case.
 * @param {string} spec.family - Display name.
 * @param {string} spec.category - One of the four `FontCategory` values.
 * @param {number} spec.weight - Nominal weight, on the usual 100–900 scale.
 * @param {string} spec.file - Path under `assets/fonts/`.
 * @param {Record<string, number>} [spec.variation] - Axis values for a variable font.
 * @param {readonly string[]} spec.tags - Matching tags.
 * @returns {object} A `FontEntry`-shaped object.
 */
export function extractFamily(spec) {
  const buffer = readFileSync(new URL(`../assets/fonts/${spec.file}`, import.meta.url))
  const base = fontkit.create(buffer)
  const font = spec.variation === undefined ? base : base.getVariation(spec.variation)
  const scale = UPEM / font.unitsPerEm
  const cap = Math.round(font.capHeight * scale)

  /** @type {Record<string, string>} */
  const glyphs = {}
  /** @type {Record<string, number>} */
  const advance = {}

  for (const letter of `${LETTERS} `) {
    const glyph = font.glyphForCodePoint(letter.codePointAt(0) ?? 0)
    advance[letter] = Math.round(glyph.advanceWidth * scale)
    if (letter === ' ') {
      // The space carries no outline, only an advance.
      continue
    }
    const d = toPath(glyph, scale, cap)
    if (d === '') {
      throw new Error(`font ${spec.id}: glyph ${letter} has no outline`)
    }
    // Ink has to sit inside its own advance box, or letters collide and centred marks drift off centre.
    // Both failures are invisible in a path dump and obvious in a rendered word. A little slack because
    // a few designs let a terminal overhang its advance on purpose.
    const slack = UPEM * 0.01
    const ink = glyph.bbox
    if (ink.minX * scale < -slack || ink.maxX * scale > advance[letter] + slack) {
      throw new Error(
        `font ${spec.id}: glyph ${letter} ink spans ${fmt(ink.minX * scale)}..${fmt(
          ink.maxX * scale
        )} but its advance is ${advance[letter]}`
      )
    }
    glyphs[letter] = d
  }

  return {
    id: spec.id,
    family: spec.family,
    category: spec.category,
    weight: spec.weight,
    // Real fonts carry their own spacing in the advances, so nothing is added on top.
    letterSpacing: 0,
    glyphs,
    metrics: {
      capHeight: cap,
      xHeight: Math.round(font.xHeight * scale),
      ascender: Math.round(font.ascent * scale),
      descender: Math.round(Math.max(0, -font.descent) * scale),
      advance,
    },
    tags: [...spec.tags],
  }
}

/**
 * Converts one glyph outline to `M`/`L`/`C`/`Z` path data, in the brain's coordinate space.
 *
 * @param {object} glyph - A fontkit glyph.
 * @param {number} scale - Font units to brain units.
 * @param {number} cap - Cap height in brain units.
 * @returns {string}
 */
function toPath(glyph, scale, cap) {
  const parts = []
  /** Current point, in font units. */
  let x = 0
  let y = 0
  const px = value => fmt(value * scale)
  const py = value => fmt(cap - value * scale)

  for (const { command, args } of glyph.path.commands) {
    if (command === 'moveTo') {
      ;[x, y] = args
      parts.push(`M ${px(x)} ${py(y)}`)
    } else if (command === 'lineTo') {
      ;[x, y] = args
      parts.push(`L ${px(x)} ${py(y)}`)
    } else if (command === 'quadraticCurveTo') {
      const [qx, qy, nx, ny] = args
      // The same control points a cubic needs to trace a quadratic exactly.
      const c1x = x + (2 / 3) * (qx - x)
      const c1y = y + (2 / 3) * (qy - y)
      const c2x = nx + (2 / 3) * (qx - nx)
      const c2y = ny + (2 / 3) * (qy - ny)
      parts.push(`C ${px(c1x)} ${py(c1y)} ${px(c2x)} ${py(c2y)} ${px(nx)} ${py(ny)}`)
      ;[x, y] = [nx, ny]
    } else if (command === 'bezierCurveTo') {
      const [c1x, c1y, c2x, c2y, nx, ny] = args
      parts.push(`C ${px(c1x)} ${py(c1y)} ${px(c2x)} ${py(c2y)} ${px(nx)} ${py(ny)}`)
      ;[x, y] = [nx, ny]
    } else if (command === 'closePath') {
      parts.push('Z')
    }
  }
  return parts.join(' ')
}
