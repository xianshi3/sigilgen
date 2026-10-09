#!/usr/bin/env node
/**
 * Builds `src/brain/fonts.json` from parametric letterform definitions.
 *
 * Sigilgen never parses a font file at runtime: glyph outlines are compiled here, at build time,
 * into SVG path data and shipped as JSON. That is what keeps the runtime dependency free (no
 * opentype.js, no canvas, no font loading) and what makes every render deterministic.
 *
 * ## Coordinate space
 *
 * Per font: 1000 units per em, y grows *downwards* so the data matches SVG directly and needs no
 * flip at render time. The baseline sits at `y = cap`, the cap top at `y = 0`. Every glyph is drawn
 * inside the ink box `x in [0, width]`, `y in [0, cap]`, and given an advance of
 * `width + 2 * sideBearing + tracking`.
 *
 * ## Why there are no elliptical arcs
 *
 * Glyph outlines are emitted as `M`, `L`, `C` and `Z` only. Every curve is a cubic Bézier.
 *
 * This is not a style preference. An SVG `A` command whose endpoints are exactly diametrically
 * opposite is mathematically ambiguous: the two candidate ellipse centres both satisfy the chord,
 * and the large-arc/sweep flags then select a 90° or 270° sweep instead of the intended 180°. The
 * result differs subtly between renderers. A cubic Bézier has no such ambiguity, is smaller on the
 * wire, and converts to cubics losslessly in under 0.02% error, so the outlines are identical
 * everywhere.
 *
 * ## Winding
 *
 * Glyphs render with the default `fill-rule: nonzero`. Overlapping shapes therefore have to agree on
 * orientation: every primitive here emits its body with positive winding, and counters are formed by
 * boundaries that are never covered by another primitive. Overlaps union instead of punching holes.
 *
 * Usage:
 *   node scripts/build-brain.mjs            # regenerate src/brain/fonts.json
 *   node scripts/build-brain.mjs --check    # exit 1 if the committed file is stale
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = resolve(ROOT, 'src/brain/fonts.json')

// ---------------------------------------------------------------------------------------------
// number formatting
// ---------------------------------------------------------------------------------------------

/**
 * Formats a coordinate for path data: at most 2 decimals, no trailing zeros, no negative zero.
 *
 * @param {number} value
 * @returns {string}
 */
function fmt(value) {
  const rounded = Math.round(value * 100) / 100
  const normalised = Object.is(rounded, -0) ? 0 : rounded
  return String(normalised)
}

// ---------------------------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------------------------

/**
 * Point on an ellipse. Angles are degrees, clockwise on screen, because y grows downwards.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number} degrees
 * @returns {{ x: number, y: number }}
 */
function point(cx, cy, rx, ry, degrees) {
  const radians = (degrees * Math.PI) / 180
  return { x: cx + rx * Math.cos(radians), y: cy + ry * Math.sin(radians) }
}

/**
 * Emits an elliptical arc as a run of cubic Béziers, splitting into segments of at most 90° so the
 * approximation error stays negligible.
 *
 * The caller is responsible for emitting an initial `M` to `from`; this function only emits `C`
 * commands.
 *
 * @param {{ cx: number, cy: number, rx: number, ry: number }} ellipse
 * @param {number} from start angle in degrees
 * @param {number} to end angle in degrees
 * @returns {string}
 */
function arcToBeziers(ellipse, from, to) {
  const { cx, cy, rx, ry } = ellipse
  let sweep = to - from
  while (sweep < -360) sweep += 360
  while (sweep > 360) sweep -= 360

  const segments = Math.max(1, Math.ceil(Math.abs(sweep) / 90))
  const step = sweep / segments
  // Cubic approximation of an elliptical arc: handle length = (4/3) * tan(angle / 4). For a
  // quarter turn this collapses to the familiar 0.5523 constant.
  const alpha = (4 / 3) * Math.tan(((step / 4) * Math.PI) / 180)

  const parts = []
  for (let index = 0; index < segments; index++) {
    const a0 = from + step * index
    const a1 = a0 + step
    const p0 = point(cx, cy, rx, ry, a0)
    const p3 = point(cx, cy, rx, ry, a1)
    const d0 = (a0 * Math.PI) / 180
    const d1 = (a1 * Math.PI) / 180
    const p1 = { x: p0.x - alpha * rx * Math.sin(d0), y: p0.y + alpha * ry * Math.cos(d0) }
    const p2 = { x: p3.x + alpha * rx * Math.sin(d1), y: p3.y - alpha * ry * Math.cos(d1) }
    parts.push(`C ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`)
  }
  return parts.join(' ')
}

/**
 * An annular sector: the stroke of a circular or elliptical arc.
 *
 * The band is always emitted with positive winding, whichever way the arc runs: a clockwise outer
 * edge pairs with a counter-clockwise inner edge, and when the requested sweep is negative the whole
 * contour is emitted back to front instead. That matters because letters are built from several
 * overlapping bands (S, G) and opposite windings would cancel into holes.
 *
 * @param {{ cx: number, cy: number, rx: number, ry: number }} ellipse
 * @param {number} weight stroke thickness
 * @param {number} from start angle in degrees
 * @param {number} to end angle in degrees
 * @returns {string}
 */
function arcBand(ellipse, weight, from, to) {
  const { cx, cy, rx, ry } = ellipse
  const inner = { cx, cy, rx: Math.max(rx - weight, 0.5), ry: Math.max(ry - weight, 0.5) }
  const outerFrom = point(cx, cy, rx, ry, from)
  const innerTo = point(inner.cx, inner.cy, inner.rx, inner.ry, to)

  if (to - from < 0) {
    return [
      `M ${fmt(innerTo.x)} ${fmt(innerTo.y)}`,
      arcToBeziers(inner, to, from),
      `L ${fmt(outerFrom.x)} ${fmt(outerFrom.y)}`,
      arcToBeziers(ellipse, from, to),
      'Z',
    ].join(' ')
  }

  return [
    `M ${fmt(outerFrom.x)} ${fmt(outerFrom.y)}`,
    arcToBeziers(ellipse, from, to),
    `L ${fmt(innerTo.x)} ${fmt(innerTo.y)}`,
    arcToBeziers(inner, to, from),
    'Z',
  ].join(' ')
}

/**
 * A full ring (annulus): a closed outer ellipse plus a closed inner ellipse walked the other way, so
 * the band is filled and the counter stays empty.
 *
 * @param {{ cx: number, cy: number, rx: number, ry: number }} ellipse
 * @param {number} weight
 * @returns {string}
 */
function ring(ellipse, weight) {
  const { cx, cy, rx, ry } = ellipse
  const inner = { cx, cy, rx: Math.max(rx - weight, 0.5), ry: Math.max(ry - weight, 0.5) }
  return [
    `M ${fmt(cx - rx)} ${fmt(cy)}`,
    arcToBeziers(ellipse, 180, 540),
    'Z',
    `M ${fmt(cx - inner.rx)} ${fmt(cy)}`,
    arcToBeziers(inner, 180, -180),
    'Z',
  ].join(' ')
}

/**
 * A straight stroke of the given thickness, as a quad with positive winding.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} weight
 * @returns {string}
 */
function stroke(x1, y1, x2, y2, weight) {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    return ''
  }
  const nx = (-dy / length) * (weight / 2)
  const ny = (dx / length) * (weight / 2)
  return [
    `M ${fmt(x1 + nx)} ${fmt(y1 + ny)}`,
    `L ${fmt(x2 + nx)} ${fmt(y2 + ny)}`,
    `L ${fmt(x2 - nx)} ${fmt(y2 - ny)}`,
    `L ${fmt(x1 - nx)} ${fmt(y1 - ny)}`,
    'Z',
  ].join(' ')
}

/**
 * Parameters in `(0, 1)` where a cubic Bézier's coordinate turns around.
 *
 * Mirrors `cubicExtrema` in `src/path.ts` so that build-time metrics and the runtime's `pathBounds`
 * agree exactly. Sampling the curve instead leaves the true extremum between samples, which is how a
 * round letter ends up a couple of dozen units wider than the advance computed for it.
 *
 * @param {number} p0
 * @param {number} p1
 * @param {number} p2
 * @param {number} p3
 * @returns {number[]}
 */
function cubicExtrema(p0, p1, p2, p3) {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3)
  const b = 6 * (p0 - 2 * p1 + p2)
  const c = 3 * (p1 - p0)
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) {
      return []
    }
    const t = -c / b
    return t > 0 && t < 1 ? [t] : []
  }
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) {
    return []
  }
  const root = Math.sqrt(discriminant)
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)].filter(t => t > 0 && t < 1)
}

/**
 * Measures the ink of path data produced by this script.
 *
 * The compiler writes a deliberately simple dialect — absolute `M`, `L`, `C` and `Z` only — so it can
 * read its own output back. Curves are measured at their turning points, so the result is tight.
 *
 * @param {string} d
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null} `null` when empty.
 */
function measure(d) {
  if (d === '') {
    return null
  }
  let cx = 0
  let cy = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  /** @param {number} x @param {number} y */
  const see = (x, y) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  // Walk the commands, which a bare number match cannot distinguish on its own.
  const tokens = d.match(/[MLCZ][^MLCZ]*/g) ?? []
  for (const token of tokens) {
    const [command] = token
    const values = (token.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (command === 'M' || command === 'L') {
      for (let slot = 0; slot + 1 < values.length; slot += 2) {
        cx = values[slot]
        cy = values[slot + 1]
        see(cx, cy)
      }
    } else if (command === 'C') {
      for (let slot = 0; slot + 5 < values.length; slot += 6) {
        const x1 = values[slot]
        const y1 = values[slot + 1]
        const x2 = values[slot + 2]
        const y2 = values[slot + 3]
        const ex = values[slot + 4]
        const ey = values[slot + 5]
        for (const t of [0, 1, ...cubicExtrema(cx, x1, x2, ex)]) {
          const u = 1 - t
          see(
            u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
            u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey
          )
        }
        cx = ex
        cy = ey
      }
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

/**
 * Shifts path data horizontally.
 *
 * @param {string} d
 * @param {number} dx
 * @returns {string}
 */
function shiftPath(d, dx) {
  if (dx === 0) {
    return d
  }
  // Only x coordinates move, and in this dialect every coordinate pair is x then y, so the numbers are
  // rewritten in place rather than re-parsed into commands.
  let seen = 0
  return d.replace(/-?\d+(?:\.\d+)?/g, match => {
    const value = Number(match) + (seen % 2 === 0 ? dx : 0)
    seen++
    return fmt(value)
  })
}

// ---------------------------------------------------------------------------------------------
// font definitions
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} FontStyle
 * @property {string} id
 * @property {string} family
 * @property {'geometric-sans' | 'humanist-sans' | 'serif' | 'display'} category
 * @property {number} weight nominal weight on the 100-900 scale
 * @property {number} cap cap height in font units
 * @property {number} stroke stroke thickness in font units, clamped during compilation
 * @property {number} width default ink width of a standard letter
 * @property {number} sideBearing space added on both sides of every glyph
 * @property {number} tracking extra letter spacing in font units
 * @property {number} xHeight lowercase height
 * @property {number} serif slab-serif strength, 0 disables serifs
 * @property {number} flatA width of the flattened A apex, 0 for a pointed apex
 * @property {number} aperture extra opening angle for C, G and S, in degrees
 * @property {number} oval horizontal squeeze applied to O and Q, 1 keeps them circular
 * @property {ReadonlyArray<string>} tags
 */

/** @type {ReadonlyArray<FontStyle>} */
const FONT_STYLES = [
  {
    id: 'orbit-grotesk',
    family: 'Orbit Grotesk',
    category: 'geometric-sans',
    weight: 500,
    cap: 700,
    stroke: 109,
    width: 580,
    sideBearing: 46,
    tracking: 40,
    xHeight: 500,
    serif: 0,
    flatA: 0.18,
    aperture: 0,
    oval: 1,
    tags: ['geometric', 'clean', 'modern', 'sans', 'circular', 'tech'],
  },
  {
    id: 'nexus-grotesk',
    family: 'Nexus Grotesk',
    category: 'geometric-sans',
    weight: 400,
    cap: 700,
    stroke: 98,
    width: 600,
    sideBearing: 52,
    tracking: 62,
    xHeight: 520,
    serif: 0,
    flatA: 0.3,
    aperture: 4,
    oval: 1,
    tags: ['geometric', 'wide', 'airy', 'minimal', 'sans', 'editorial'],
  },
  {
    id: 'vector-grotesk',
    family: 'Vector Grotesk',
    category: 'geometric-sans',
    weight: 600,
    cap: 700,
    stroke: 119,
    width: 640,
    sideBearing: 30,
    tracking: 22,
    xHeight: 480,
    serif: 0,
    flatA: 0,
    aperture: -4,
    oval: 0.94,
    tags: ['industrial', 'engineered', 'wide', 'futuristic', 'hardware', 'sans'],
  },
  {
    id: 'monolith-grotesk',
    family: 'Monolith Grotesk',
    category: 'geometric-sans',
    weight: 800,
    cap: 700,
    stroke: 140,
    width: 600,
    sideBearing: 26,
    tracking: 12,
    xHeight: 490,
    serif: 0,
    flatA: 0,
    aperture: 0,
    oval: 0.96,
    tags: ['heavy', 'bold', 'impact', 'strong', 'compact', 'sans'],
  },
  {
    id: 'axis-grotesk',
    family: 'Axis Grotesk',
    category: 'geometric-sans',
    weight: 700,
    cap: 700,
    stroke: 130,
    width: 500,
    sideBearing: 34,
    tracking: 30,
    xHeight: 470,
    serif: 0,
    flatA: 0.26,
    aperture: 2,
    oval: 0.9,
    tags: ['condensed', 'narrow', 'bold', 'vertical', 'sans', 'badge'],
  },
  {
    id: 'prism-grotesk',
    family: 'Prism Grotesk',
    category: 'geometric-sans',
    weight: 300,
    cap: 700,
    stroke: 88,
    width: 560,
    sideBearing: 56,
    tracking: 74,
    xHeight: 510,
    serif: 0,
    flatA: 0.22,
    aperture: 6,
    oval: 1,
    tags: ['light', 'thin', 'delicate', 'spacious', 'quiet', 'sans'],
  },
  {
    id: 'flow-humanist',
    family: 'Flow Humanist',
    category: 'humanist-sans',
    weight: 400,
    cap: 700,
    stroke: 98,
    width: 540,
    sideBearing: 44,
    tracking: 46,
    xHeight: 500,
    serif: 0,
    flatA: 0.2,
    aperture: 2,
    oval: 0.97,
    tags: ['humanist', 'friendly', 'readable', 'warm', 'sans', 'body'],
  },
  {
    id: 'cascade-humanist',
    family: 'Cascade Humanist',
    category: 'humanist-sans',
    weight: 500,
    cap: 700,
    stroke: 109,
    width: 555,
    sideBearing: 42,
    tracking: 36,
    xHeight: 505,
    serif: 0,
    flatA: 0.28,
    aperture: 4,
    oval: 0.98,
    tags: ['humanist', 'soft', 'organic', 'wellness', 'sans', 'calm'],
  },
  {
    id: 'baseline-humanist',
    family: 'Baseline Humanist',
    category: 'humanist-sans',
    weight: 600,
    cap: 700,
    stroke: 119,
    width: 570,
    sideBearing: 38,
    tracking: 26,
    xHeight: 500,
    serif: 0,
    flatA: 0.12,
    aperture: -2,
    oval: 0.95,
    tags: ['humanist', 'sturdy', 'workplace', 'trustworthy', 'sans', 'corporate'],
  },
  {
    id: 'signal-humanist',
    family: 'Signal Humanist',
    category: 'humanist-sans',
    weight: 300,
    cap: 700,
    stroke: 88,
    width: 520,
    sideBearing: 52,
    tracking: 64,
    xHeight: 515,
    serif: 0,
    flatA: 0.34,
    aperture: 8,
    oval: 1,
    tags: ['humanist', 'light', 'airy', 'lifestyle', 'sans', 'calm'],
  },
  {
    id: 'classic-serif',
    family: 'Classic Serif',
    category: 'serif',
    weight: 400,
    cap: 700,
    stroke: 98,
    width: 600,
    sideBearing: 40,
    tracking: 42,
    xHeight: 480,
    serif: 0.55,
    flatA: 0.3,
    aperture: 2,
    oval: 0.98,
    tags: ['serif', 'editorial', 'classic', 'trustworthy', 'heritage', 'print'],
  },
  {
    id: 'garamond-serif',
    family: 'Garamond Serif',
    category: 'serif',
    weight: 400,
    cap: 700,
    stroke: 98,
    width: 580,
    sideBearing: 44,
    tracking: 58,
    xHeight: 440,
    serif: 0.5,
    flatA: 0.26,
    aperture: 6,
    oval: 1,
    tags: ['serif', 'refined', 'literary', 'elegant', 'book', 'soft'],
  },
  {
    id: 'slab-serif',
    family: 'Slab Serif',
    category: 'serif',
    weight: 500,
    cap: 700,
    stroke: 109,
    width: 620,
    sideBearing: 34,
    tracking: 30,
    xHeight: 470,
    serif: 1,
    flatA: 0.34,
    aperture: 0,
    oval: 0.96,
    tags: ['slab', 'serif', 'solid', 'sturdy', 'western', 'archive'],
  },
  {
    id: 'didone-serif',
    family: 'Didone Serif',
    category: 'serif',
    weight: 400,
    cap: 700,
    stroke: 98,
    width: 590,
    sideBearing: 46,
    tracking: 52,
    xHeight: 455,
    serif: 0.85,
    flatA: 0.22,
    aperture: 4,
    oval: 1,
    tags: ['serif', 'high-contrast', 'fashion', 'display', 'luxury', 'elegant'],
  },
  {
    id: 'nova-display',
    family: 'Nova Display',
    category: 'display',
    weight: 700,
    cap: 700,
    stroke: 130,
    width: 640,
    sideBearing: 30,
    tracking: 16,
    xHeight: 510,
    serif: 0,
    flatA: 0.3,
    aperture: 2,
    oval: 1,
    tags: ['display', 'bold', 'round', 'friendly', 'startup', 'poster'],
  },
  {
    id: 'halo-display',
    family: 'Halo Display',
    category: 'display',
    weight: 400,
    cap: 700,
    stroke: 98,
    width: 660,
    sideBearing: 58,
    tracking: 84,
    xHeight: 520,
    serif: 0,
    flatA: 0.4,
    aperture: 8,
    oval: 1,
    tags: ['display', 'wide', 'spacious', 'light', 'fashion', 'wordmark'],
  },
  {
    id: 'anchor-display',
    family: 'Anchor Display',
    category: 'display',
    weight: 900,
    cap: 700,
    stroke: 154,
    width: 600,
    sideBearing: 24,
    tracking: 0,
    xHeight: 500,
    serif: 0,
    flatA: 0,
    aperture: -2,
    oval: 0.95,
    tags: ['display', 'black', 'ultra-bold', 'heavy', 'iconic', 'mascot'],
  },
  {
    id: 'stipple-display',
    family: 'Stipple Display',
    category: 'display',
    weight: 600,
    cap: 700,
    stroke: 119,
    width: 680,
    sideBearing: 66,
    tracking: 96,
    xHeight: 460,
    serif: 0,
    flatA: 0.36,
    aperture: -4,
    oval: 0.92,
    tags: ['display', 'letterspaced', 'cinematic', 'tech', 'wide', 'wordmark'],
  },
]

// ---------------------------------------------------------------------------------------------
// glyph construction
// ---------------------------------------------------------------------------------------------

/**
 * Bounds on the stroke, as a fraction of cap height.
 *
 * The floor is Regular weight. A text face can be a hairline; a logo cannot — at 25% of a 512px canvas
 * a 7%-of-cap stroke is barely two pixels and vanishes entirely at favicon size, which is the size a
 * mark has to survive. Nine of the eighteen families were authored below 10% of cap before this floor,
 * so the picker was offering hairline logos.
 *
 * The ceiling keeps counters open. Past a fifth of the cap the bowls of B, R, P and A start to fill
 * in, and a filled counter is not a heavier letter, it is a different one.
 */
const MIN_STROKE_RATIO = 0.12

/** See {@link MIN_STROKE_RATIO} for why this is where it is. */
const MAX_STROKE_RATIO = 0.23

/**
 * Exponent applied to the stroke when deriving letterspacing.
 *
 * Below 1, so a heavier stem gets proportionally *less* air. A slab's stems already fill their
 * counters; giving it the same stroke multiple of gap as a hairline geometric would open the words up.
 */
const LETTERSPACING_EXPONENT = 0.72

/**
 * Base letterspacing, in the units produced by {@link LETTERSPACING_EXPONENT} of the stroke.
 *
 * Calibrated so a mid-weight face lands near 0.8 stroke widths of gap between letters, which is the
 * point at which capitals read as a word. The per-family terms added to it are what keep an open
 * display face open and a closed one closed.
 */
const LETTERSPACING_BASE = 0.98

/**
 * Word space, as a multiple of the gap between two letters.
 *
 * Measured on the *advance*, not on the gap a reader sees. The space sits between two letters' ink,
 * so it has to replace both of their bearings before it opens anything: an advance of `n × gap` leaves
 * a visible gap of `(n − 1) × gap`. Three point two is what makes the space between words read as two
 * point two times the gap between letters, which is the usual convention and the smallest ratio at
 * which the words still clearly come apart.
 */
const WORD_SPACE_RATIO = 3.2

/** Floor on the word space, as a fraction of cap height, so words can never merge. */
const MIN_WORD_SPACE = 0.2

/**
 * Draws the uppercase alphabet for one font style.
 *
 * @param {FontStyle} font
 * @returns {{ glyphs: Record<string, { d: string, advance: number }>, letterGap: number }}
 */
function buildGlyphs(font) {
  const { cap } = font
  // The stroke is clamped into a band that is both drawable and usable.
  //
  // The lower bound is Regular weight, not the hairline a text face can get away with: a mark has to
  // survive at favicon size, and a 7%-of-cap stroke is gone by then. The upper bound leaves the
  // counters of B, R, P and A open — past a fifth of the cap the bowls start to fill in, and a filled
  // counter is a different letter rather than a heavier one.
  const w = Math.max(cap * MIN_STROKE_RATIO, Math.min(font.stroke, cap * MAX_STROKE_RATIO))
  const half = w / 2

  /**
   * Space either side of a letter's ink, in font units.
   *
   * Letterspacing has to be read against the stroke, not in absolute font units. A 66-unit gap is
   * wide air on a 46-unit stem and tight contact on a 241-unit slab, so an absolute number means the
   * light geometric faces came apart into visibly separate letters while the heavy ones ran together.
   * Measured across the 18 families, an absolute gap ranged from 0.34 to 3.45 stroke widths — a spread
   * wide enough that half the library read as broken.
   *
   * Two things keep this from flattening the library's character. The family's authored `sideBearing`
   * and `tracking` survive as fractions added to the base, so a face that was designed open stays
   * looser than one designed closed. And the base is *sub-linear* in the stroke, because a heavy face
   * needs proportionally less air than a light one: a slab's stems already fill the counter.
   *
   * Together these put every family in a 0.46–0.85 stroke-width band, which is where capitals read as
   * a word rather than as a row of letters.
   */
  const leading = Math.round(
    w ** LETTERSPACING_EXPONENT *
      (LETTERSPACING_BASE + font.sideBearing / 1000 + font.tracking / 2000)
  )
  // Slab serifs push the stem inwards so the slabs stay inside the ink box.
  const serifOut = font.serif * w * 0.9
  const inset = half + serifOut
  /**
   * The vertical endpoint inset: half a stroke and nothing else.
   *
   * `inset` does double duty — it is the side bearing as well as the terminal inset — and only the
   * horizontal half of it belongs to the serif. A serif overhang widens a letter; it must not lower its
   * cap line, or the letter sits `serifOut` short of every other letter in the family. Letters that end
   * in a terminal disc use this, so the disc lands exactly on the edge; letters that end in a slab
   * reach the edge through {@link slab} instead.
   */
  const vInset = half
  const minCounter = cap * 0.1

  /** @type {Record<string, { d: string, advance: number }>} */
  const glyphs = {}

  /**
   * Records a glyph, dropping empty primitives.
   *
   * The advance comes from the glyph's *measured* ink, not from the nominal box width the skeleton
   * asked for, and the ink is then shifted so the side bearings are equal on both sides. Deriving the
   * advance from the nominal width instead is wrong in two visible ways: a round letter overshoots its
   * box on the left, and `J` overshoots it on the right by enough to collide with the letter before it.
   * Unequal bearings also push a centred single letter off-centre, because the run is centred on the
   * advance box while the ink is not.
   *
   * @param {string} letter
   * @param {number} _inkWidth nominal box width, kept for readability of the skeletons
   * @param {Array<string>} parts
   * @returns {void}
   */
  const emit = (letter, _inkWidth, parts) => {
    const raw = parts.filter(Boolean).join(' ')
    const bounds = measure(raw)
    if (bounds === null) {
      glyphs[letter] = { d: '', advance: Math.round(font.sideBearing * 2 + font.tracking) }
      return
    }
    const inkWidth = bounds.maxX - bounds.minX
    // `leading` is already split evenly, so tracking lands half on each side rather than all on the
    // right, which is what keeps the ink centred inside its own advance box.
    glyphs[letter] = {
      d: shiftPath(raw, leading - bounds.minX),
      advance: Math.round(inkWidth + leading * 2),
    }
  }

  /**
   * The terminal cap that carries a stroke out to the cap line and the baseline.
   *
   * `stroke` returns a butt-ended quad: it reaches exactly as far as its centreline and no further. Every
   * endpoint in this file is inset by half a stroke, on the assumption that a disc of radius `half` at
   * that endpoint will carry the ink back out to the edge it is supposed to meet. This disc is that
   * mechanism, so it is structural rather than stylistic: without it a stem stops half a stroke short of
   * the cap line and again short of the baseline, and a diagonal stops short by a third of that, because
   * a butt end on a diagonal does not reach the same row a disc does.
   *
   * This used to be gated on `font.round`, on the reasonable-sounding theory that a flat family should
   * not grow round terminals. It was wrong: `round` was read nowhere else, so the flag was not choosing
   * a terminal style, it was choosing whether a terminal existed. Ten of the eighteen families came out
   * with their letters floating clear of both edges — `L` stopping 55 units below the cap line, `I`
   * floating 55 clear at each end, `slab-serif` reaching 61% of cap height. Letters that do not share a
   * baseline do not read as set at all, and the error grows with the mark.
   *
   * So the disc is unconditional and the flag is gone. A geometric sans with softly rounded terminals is
   * idiomatic, and it is the only arrangement in which the geometry is expressible at all: the
   * alternative, running a butt end all the way to the edge, needs a different endpoint inset for the
   * vertical axis than the `inset` the horizontal bearings need, and an audit of every diagonal.
   *
   * @param {number} x
   * @param {number} y
   * @returns {string}
   */
  const capRound = (x, y) =>
    // Wound the same way round as `stroke`. A disc of radius `half` centred on a stroke's endpoint lies
    // half inside the stroke's own rectangle, and under the non-zero fill rule an overlap only stays
    // filled if the two sub-paths wind alike. Wound the other way the overlap cancels and every terminal
    // in the library became a white notch — see the winding guard in `tests/brain.test.ts`, which is what
    // found it. (`ring`'s inner ellipse is deliberately wound the other way; that hole is the point of
    // it. A terminal is not a counter.)
    `M ${fmt(x + half)} ${fmt(y)} ${arcToBeziers({ cx: x, cy: y, rx: half, ry: half }, 0, -360)} Z`

  /**
   * A slab serif centred on a stem, sitting at `y`. Its span reaches the cap line or the baseline, so a
   * serif family lands on the same extremes as a sans rather than a half-stroke inside them.
   *
   * @param {number} x
   * @param {number} y
   * @returns {string}
   */
  const slab = (x, y) => {
    if (font.serif <= 0) {
      return ''
    }
    // The outer edge sits on the cap line or the baseline, not on the stem's endpoint. The stem is
    // inset by half a stroke so that a terminal can carry it out to the edge; a slab centred on that
    // endpoint instead stops half a stroke short, and since `serifOut` is added on top of the half
    // stroke the four serif families came out lowest of all — every letter of slab-serif between 62 and
    // 72% of cap height. Which edge to sit against follows from which end of the stem this is.
    const thickness = w * 0.5
    const centre = y < cap / 2 ? thickness / 2 : cap - thickness / 2
    return stroke(x - inset, centre, x + inset, centre, thickness)
  }

  /**
   * A vertical stem, optionally with terminal treatment at both ends.
   *
   * @param {number} x
   * @param {number} from
   * @param {number} to
   * @param {boolean} [serifs]
   * @param {boolean} [freeTo] - Whether the far end is a free terminal. Pass `false` where the stem runs
   *   into another part of the letter: `U`'s stems end inside the bowl, and a disc there overlaps a band
   *   wound the other way, so under the non-zero fill rule the two cancel and the junction opens a hole.
   *   A junction is not a terminal, so nothing is gained by capping it.
   * @returns {Array<string>}
   */
  const stem = (x, from, to, serifs = true, freeTo = true) => {
    const parts = [stroke(x, from, x, to, w)]
    if (serifs && font.serif > 0) {
      parts.push(slab(x, from))
      if (freeTo) {
        parts.push(slab(x, to))
      }
    } else {
      parts.push(capRound(x, from))
      if (freeTo) {
        parts.push(capRound(x, to))
      }
    }
    return parts
  }

  /**
   * A horizontal bar with matching terminal treatment.
   *
   * @param {number} x0
   * @param {number} x1
   * @param {number} y
   * @returns {Array<string>}
   */
  const bar = (x0, x1, y) => {
    const parts = [stroke(x0, y, x1, y, w), capRound(x0, y), capRound(x1, y)]
    if (font.serif > 0) {
      parts.push(slab(x0, y), slab(x1, y))
    }
    return parts
  }

  /**
   * A right-bulging bowl band hanging off the left stem, spanning `y0` to `y1`. The band's inner
   * edge never reaches left of the stem's right side, so the counter stays open.
   *
   * @param {number} x stem centre
   * @param {number} y0
   * @param {number} y1
   * @param {number} rightX outer right extent
   * @returns {string}
   */
  const bowl = (x, y0, y1, rightX) => {
    const ry = (y1 - y0) / 2
    const rx = rightX - x
    const thickness = Math.min(w, Math.max(ry - minCounter * 0.5, w * 0.5))
    return arcBand({ cx: x, cy: (y0 + y1) / 2, rx, ry }, thickness, -90, 90)
  }

  /**
   * A bowl band hanging off the left stem that spans the full cap height (used by D).
   *
   * @param {number} width ink width
   * @returns {Array<string>}
   */
  const fullBowl = width => [
    stem(inset, inset, cap - inset),
    bowl(inset, inset, cap - inset, width - inset + half),
  ]

  // --- A -------------------------------------------------------------------------------------
  {
    const { width } = font
    const apex = width * font.flatA
    const yBar = cap * 0.7
    const legX = (width / 2 - apex / 2) * (1 - yBar / cap)
    emit('A', width, [
      stroke(width / 2 - apex / 2, vInset, half, cap - vInset, w),
      stroke(width / 2 + apex / 2, vInset, width - half, cap - vInset, w),
      stroke(legX, yBar, width - legX, yBar, w),
      capRound(half, cap - vInset),
      capRound(width - half, cap - vInset),
      // The apex is a horizontal bar, so it needs the same treatment a slab gets: its outer edge sits
      // on the cap line rather than on the stem's endpoint. A pointed apex has nothing to carry it out,
      // so it gets a disc instead. The bar's own weight is `w`, so its centre is half of that.
      apex > 0
        ? stroke(width / 2 - apex / 2, w * 0.5, width / 2 + apex / 2, w * 0.5, w)
        : capRound(width / 2, vInset),
    ])
  }

  // --- B -------------------------------------------------------------------------------------
  {
    const { width } = font
    const split = cap * 0.5
    const right = width - inset + half
    emit('B', width, [
      ...stem(inset, inset, cap - inset),
      bowl(inset, inset, split + minCounter * 0.1, right),
      bowl(inset, split - minCounter * 0.1, cap - inset, right),
      stroke(inset, split, inset + (right - inset) * 0.5, split, w),
    ])
  }

  // --- C -------------------------------------------------------------------------------------
  {
    const { width } = font
    const open = 52 + font.aperture
    emit('C', width, [
      arcBand({ cx: width / 2, cy: cap / 2, rx: width / 2, ry: cap / 2 }, w, open, 360 - open),
    ])
  }

  // --- D -------------------------------------------------------------------------------------
  {
    const { width } = font
    emit('D', width, fullBowl(width))
  }

  // --- E -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.92
    emit('E', width, [
      ...stem(inset, inset, cap - inset),
      ...bar(inset, width - inset, inset),
      ...bar(inset, width - inset, cap - inset),
      ...bar(inset, width - inset - w * 0.6, cap * 0.5),
    ])
  }

  // --- F -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.9
    emit('F', width, [
      ...stem(inset, inset, cap - inset),
      ...bar(inset, width - inset, inset),
      ...bar(inset, width - inset - w * 0.6, cap * 0.5),
    ])
  }

  // --- G -------------------------------------------------------------------------------------
  {
    const { width } = font
    const open = 52 + font.aperture
    const barY = cap * 0.56
    const right = width - half
    emit('G', width, [
      arcBand({ cx: width / 2, cy: cap / 2, rx: width / 2, ry: cap / 2 }, w, open, 360 - open),
      stroke(width * 0.52, barY, right, barY, w),
      stroke(right, barY, right, cap - inset, w),
    ])
  }

  // --- H -------------------------------------------------------------------------------------
  {
    const { width } = font
    emit('H', width, [
      ...stem(inset, inset, cap - inset),
      ...stem(width - inset, inset, cap - inset),
      ...bar(inset, width - inset, cap * 0.5),
    ])
  }

  // --- I -------------------------------------------------------------------------------------
  {
    const width = w + 40
    emit('I', width, stem(width / 2, inset, cap - inset))
  }

  // --- J -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.76
    const stemX = width - inset
    const hookY = cap - Math.max(cap * 0.3, w + minCounter)
    const rx = stemX - inset
    emit('J', width, [
      ...stem(stemX, inset, hookY),
      arcBand({ cx: stemX, cy: hookY, rx, ry: cap - inset - hookY }, w, 0, 180),
      capRound(inset, cap - inset),
    ])
  }

  // --- K -------------------------------------------------------------------------------------
  {
    const { width } = font
    const midY = cap * 0.5
    emit('K', width, [
      ...stem(inset, inset, cap - inset),
      stroke(width * 0.36, midY, width - inset, inset, w),
      stroke(width * 0.3, midY - w * 0.25, width - inset, cap - inset, w),
      ...(font.serif > 0 ? [slab(width - inset, inset), slab(width - inset, cap - inset)] : []),
    ])
  }

  // --- L -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.84
    emit('L', width, [
      ...stem(inset, inset, cap - inset),
      ...bar(inset, width - inset, cap - inset),
    ])
  }

  // --- M -------------------------------------------------------------------------------------
  {
    const width = font.width * 1.14
    const midY = cap * 0.74
    emit('M', width, [
      ...stem(inset, inset, cap - inset),
      ...stem(width - inset, inset, cap - inset),
      stroke(inset, inset, width / 2, midY, w),
      stroke(width - inset, inset, width / 2, midY, w),
    ])
  }

  // --- N -------------------------------------------------------------------------------------
  {
    const width = font.width * 1.06
    emit('N', width, [
      ...stem(inset, inset, cap - inset),
      ...stem(width - inset, inset, cap - inset),
      stroke(inset, inset, width - inset, cap - inset, w),
    ])
  }

  // --- O -------------------------------------------------------------------------------------
  {
    const { width } = font
    emit('O', width, [
      ring({ cx: width / 2, cy: cap / 2, rx: (width / 2) * font.oval, ry: cap / 2 }, w),
    ])
  }

  // --- P -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.94
    const bottom = cap * 0.56
    emit('P', width, [
      ...stem(inset, inset, cap - inset),
      bowl(inset, inset, bottom, width - inset + half),
    ])
  }

  // --- Q -------------------------------------------------------------------------------------
  {
    const { width } = font
    emit('Q', width, [
      ring({ cx: width / 2, cy: cap / 2, rx: (width / 2) * font.oval, ry: cap / 2 }, w),
      stroke(width * 0.52, cap * 0.62, width * 1, cap * 1.06, w * 0.9),
    ])
  }

  // --- R -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.98
    const bottom = cap * 0.54
    emit('R', width, [
      ...stem(inset, inset, cap - inset),
      bowl(inset, inset, bottom, width - inset + half),
      stroke(width * 0.32, bottom - w * 0.45, width - inset, cap - inset, w),
      ...(font.serif > 0 ? [slab(width - inset, cap - inset)] : []),
    ])
  }

  // --- S -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.98
    const cx = width / 2
    const radius = cap * 0.25
    const thickness = Math.min(w, radius * 0.44)
    // Two overlapping C-shapes that meet at the waist. Both sweeps run counter-clockwise so the two
    // bands share a winding and merge instead of cutting a hole where they overlap.
    //
    // The lower bowl sweeps 230 degrees, from the right-hand terminal down through the bottom of its own
    // ellipse, round to the upper left. It used to sweep 130, from 40 to -90, which is the short way:
    // that never passes the bottom, so the letter's lowest point was the terminal on the lower right and
    // S stopped 9% of cap height above the baseline. `arcBand` walks its angles literally, so the sweep
    // that reaches the baseline is the one where `to` is greater than `from`.
    emit('S', width, [
      arcBand({ cx, cy: cap * 0.25, rx: width / 2, ry: radius }, thickness, 330, 80),
      arcBand({ cx, cy: cap * 0.75, rx: width / 2, ry: radius }, thickness, 40, 270),
    ])
  }

  // --- T -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.94
    // `serifs: false` means the stem closes its ends with discs, so its vertical range is `vInset` and
    // not `inset`: a serif overhang is horizontal, and folding it into the vertical range left T short
    // of the baseline by exactly that overhang in the four serif families.
    emit('T', width, [
      ...bar(inset, width - inset, vInset),
      ...stem(width / 2, vInset, cap - vInset, false),
    ])
  }

  // --- U -------------------------------------------------------------------------------------
  {
    const { width } = font
    const side = cap - Math.max(cap * 0.3, w + minCounter)
    emit('U', width, [
      // `serifs: false`, so the vertical range is `vInset`: these stems close with discs, and a serif
      // overhang is horizontal only. `freeTo: false` because the far end runs into the bowl rather than
      // ending in air.
      ...stem(inset, vInset, side, false, false),
      ...stem(width - inset, vInset, side, false, false),
      arcBand(
        // `ry` is measured to the outer edge, so the bowl closes on the baseline rather than a half
        // stroke above it. The sweep is the lower half, so raising `ry` extends the bowl downwards
        // without moving where it meets the stems.
        { cx: width / 2, cy: side, rx: width / 2 - inset + half, ry: cap - side },
        w,
        0,
        180
      ),
    ])
  }

  // --- V -------------------------------------------------------------------------------------
  {
    const { width } = font
    emit('V', width, [
      stroke(inset, vInset, width / 2, cap - vInset, w),
      stroke(width - inset, vInset, width / 2, cap - vInset, w),
      capRound(inset, vInset),
      capRound(width - inset, vInset),
      // The apex needs a terminal too, or the point stops half a stroke above the baseline. A butt end
      // on a diagonal does not even reach that far: its extreme row is offset by the stroke's normal
      // component, which is why every diagonal terminal in this file is closed with a disc.
      capRound(width / 2, cap - vInset),
    ])
  }

  // --- W -------------------------------------------------------------------------------------
  {
    const width = font.width * 1.28
    const q1 = width * 0.29
    const q3 = width * 0.71
    emit('W', width, [
      stroke(inset, vInset, q1, cap - vInset, w),
      stroke(q1, cap - vInset, width / 2, vInset + cap * 0.18, w),
      stroke(width / 2, vInset + cap * 0.18, q3, cap - vInset, w),
      stroke(q3, cap - vInset, width - inset, vInset, w),
      // Terminals at all four outer ends. The two middle joints are interior and are left bare.
      capRound(inset, vInset),
      capRound(width - inset, vInset),
      capRound(q1, cap - vInset),
      capRound(q3, cap - vInset),
    ])
  }

  // --- X -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.96
    emit('X', width, [
      stroke(inset, vInset, width - inset, cap - vInset, w),
      stroke(width - inset, vInset, inset, cap - vInset, w),
      // All four ends are terminals, and none of them is interior, so all four are closed.
      capRound(inset, vInset),
      capRound(width - inset, vInset),
      capRound(width - inset, cap - vInset),
      capRound(inset, cap - vInset),
    ])
  }

  // --- Y -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.96
    const midY = cap * 0.54
    emit('Y', width, [
      stroke(inset, vInset, width / 2, midY, w),
      stroke(width - inset, vInset, width / 2, midY, w),
      // The two upper diagonals need terminals of their own; the stem below carries its own.
      capRound(inset, vInset),
      capRound(width - inset, vInset),
      ...stem(width / 2, midY, cap - vInset, false),
    ])
  }

  // --- Z -------------------------------------------------------------------------------------
  {
    const width = font.width * 0.92
    emit('Z', width, [
      ...bar(inset, width - inset, inset),
      stroke(width - inset, inset, inset, cap - inset, w),
      ...bar(inset, width - inset, cap - inset),
    ])
  }

  // The gap this family was set with, reported so the word space can be sized against it rather than
  // against a constant that would be too small for one family and too large for another.
  return { glyphs, letterGap: leading * 2 }
}

// ---------------------------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------------------------

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Compiles every font style into a `FontEntry`-shaped object.
 *
 * @returns {Array<object>}
 */
function buildBrain() {
  return FONT_STYLES.map(font => {
    const { glyphs, letterGap: gapBetweenLetters } = buildGlyphs(font)
    /** @type {Record<string, string>} */
    const paths = {}
    /** @type {Record<string, number>} */
    const advance = {}

    // A letter drawn without one of its strokes does not look like a damaged letter, it looks like a
    // different one: E without its bottom bar is F. Assert each letter's minimum sub-path count so that
    // mistake fails the build rather than shipping.
    const MINIMUM_SUBPATHS = {
      A: 3,
      B: 4,
      C: 1,
      D: 2,
      E: 4,
      F: 3,
      G: 3,
      H: 3,
      I: 1,
      J: 2,
      K: 3,
      L: 2,
      M: 4,
      N: 3,
      O: 2,
      P: 2,
      Q: 3,
      R: 3,
      S: 2,
      T: 2,
      U: 3,
      V: 2,
      W: 4,
      X: 2,
      Y: 3,
      Z: 3,
    }

    for (const letter of LETTERS) {
      const glyph = glyphs[letter]
      if (!glyph || glyph.d === '') {
        throw new Error(`font ${font.id}: glyph ${letter} compiled to an empty path`)
      }
      if (/[^MLCZ0-9.,\- ]/.test(glyph.d)) {
        throw new Error(`font ${font.id}: glyph ${letter} emitted a non-path character`)
      }
      const subpaths = (glyph.d.match(/M/g) ?? []).length
      const required = MINIMUM_SUBPATHS[letter] ?? 1
      if (subpaths < required) {
        throw new Error(
          `font ${font.id}: glyph ${letter} has ${subpaths} sub-path(s), expected at least ${required}`
        )
      }

      // Ink has to sit inside its own advance box, or letters collide and centred marks drift off
      // centre. Both failure modes are invisible in a path dump and obvious in a rendered word, so they
      // are asserted here rather than left to be spotted by eye.
      const ink = measure(glyph.d)
      if (ink === null) {
        throw new Error(`font ${font.id}: glyph ${letter} measured no ink`)
      }
      const tolerance = 1
      if (ink.minX < -tolerance || ink.maxX > glyph.advance + tolerance) {
        throw new Error(
          `font ${font.id}: glyph ${letter} ink spans ${fmt(ink.minX)}..${fmt(ink.maxX)} but its ` +
            `advance is ${glyph.advance}, so it overlaps its neighbours`
        )
      }

      paths[letter] = glyph.d
      advance[letter] = glyph.advance
    }

    /**
     * The word space, carried in `advance` alongside the letters.
     *
     * It lives here rather than as a constant in the renderer because it is a property of the
     * typeface: a family with wide letterspacing needs a wider word space, and one with a tight set
     * needs a narrower one. A single hard-coded number made the space narrower than the gap between
     * letters in the loosest family and three times wider in the tightest, so `Northwind Coffee` read
     * as one word in one face and two in another.
     *
     * Sized as a multiple of this family's own letter gap, with a floor tied to the cap height: the
     * multiple keeps the words clearly separated, and the floor stops a tightly-set family from
     * closing the space up altogether.
     */
    advance[' '] = Math.round(
      Math.max(gapBetweenLetters * WORD_SPACE_RATIO, font.cap * MIN_WORD_SPACE)
    )

    return {
      id: font.id,
      family: font.family,
      category: font.category,
      weight: font.weight,
      letterSpacing: font.tracking,
      glyphs: paths,
      metrics: {
        capHeight: font.cap,
        xHeight: font.xHeight,
        ascender: font.cap + 20,
        descender: font.cap * 0.22,
        advance,
      },
      tags: [...font.tags],
    }
  })
}

const fonts = buildBrain()
const json = `${JSON.stringify({ fonts }, null, 2)}\n`

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(OUTPUT, 'utf8')
  } catch {
    console.error(`error: ${OUTPUT} does not exist; run \`pnpm run build:brain\``)
    process.exit(1)
  }
  if (current !== json) {
    console.error('error: src/brain/fonts.json is out of date with scripts/build-brain.mjs')
    console.error('       run `pnpm run build:brain` and commit the result')
    process.exit(1)
  }
  console.log(`fonts.json is in sync (${fonts.length} families, ${LETTERS.length} glyphs each)`)
} else {
  writeFileSync(OUTPUT, json, 'utf8')
  console.log(`wrote ${OUTPUT}`)
  console.log(
    `  ${fonts.length} families, ${fonts.length * LETTERS.length} glyphs, ${json.length} bytes`
  )
}
