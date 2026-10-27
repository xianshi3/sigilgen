/**
 * Apparatus engine — a mark laid out the way equipment is laid out.
 *
 * The vocabulary comes from instruments rather than from heraldry: a core with its corners cut, arcs
 * that stop short of closing, radial ticks with one long index, brackets that frame without enclosing.
 * What carries the look is not any one of those but the contrast between them — a single solid mass and
 * everything else a hairline a few units thick. Drawn at the same weight as the other engines' shapes it
 * would read as generic geometry; drawn this way it reads as something machined.
 *
 * The engine is typographic: the core holds the initials, reversed out of the mass. That is what
 * separates it from `abstract`, which draws no type at all, and from `emblem`, which encloses a
 * pictogram and a whole name inside one closed silhouette. It draws no icon for the same reason a
 * monogram does not: at this size the initials are the picture.
 */

import {
  arcBandPath,
  capsulePath,
  chamferedRectPath,
  polar,
  ringPath,
  segmentPath,
} from '../geometry'
import { contrastFill, readableOn } from '../resolvers/palette-resolver'
import { fitText, opticalTracking } from './metrics'
import { monogramLetters, path, pick } from './shared'
import { textPath } from '../text'
import type { SeedResolver } from '../seed-resolver'
import type { Engine, EngineInput, SVGElement } from '../types'

/** Styles available to the engine. */
export const APPARATUS_STYLES: readonly string[] = ['dial', 'reticle', 'brackets', 'sector']

/** Half-width of the chamfered core, as a fraction of the canvas. */
const CORE_RATIO = 0.212

/** How far each corner of the core is cut back, as a fraction of the canvas. */
const CHAMFER_RATIO = 0.052

/**
 * Hairline weight, as a fraction of the canvas.
 *
 * The engine turns on this number. At 512 it is a 4.6-unit rule: thick enough to still read as a grey
 * edge when the mark is scaled down to a favicon, thin enough that the mass beside it stays the subject.
 */
const HAIRLINE_RATIO = 0.009

/** Radius of the ring layer, as a fraction of the canvas. */
const RING_RATIO = 0.352

/** Inner and outer radius of the tick band, as fractions of the canvas. */
const TICK_INNER_RATIO = 0.378
const TICK_OUTER_RATIO = 0.418

/** Half-width of the bracket frame, as a fraction of the canvas. */
const FRAME_RATIO = 0.418

/**
 * Fraction of the core's box the initials may fill.
 *
 * Bounded above by the chamfer rather than by taste: a letter's ink can reach the corner of its box, and
 * that corner is the one place the cut can bite into it. The safe half-width is `CORE - CHAMFER / 2`,
 * which is 0.186 of the canvas here, and this leaves a little of that unused on purpose.
 */
const LETTER_FILL = 0.82

/**
 * Tracking the initials tighten by, as a fraction of cap height.
 *
 * Two letters in a small core are read as one object rather than as two, so they close up slightly. Same
 * reasoning and same value as the monogram pair, so the two engines agree on what a pair looks like.
 */
const CORE_TRACKING = -0.025

/**
 * Tick counts the dial may use.
 *
 * Multiples of four, so the quarters always land on a major tick, and none of them dense: at icon size a
 * finer band stops reading as a scale and starts reading as texture.
 */
const TICK_COUNTS: readonly number[] = [12, 16]

/** One line per style, for the concept notes. */
const STYLE_NOTE: Record<string, string> = {
  dial: 'a segmented bezel over a tick band',
  reticle: 'crosshair arms through a ring, with ticks on the diagonals',
  brackets: 'corner brackets and a base rule',
  sector: 'a heavy upper arc over a thin ring',
}

/** What every style helper needs in order to draw its grammar layer. */
interface Grammar {
  /** Centre of the canvas, in user units. */
  centre: number
  /** Canvas size, in user units. */
  size: number
  /** Colour for the hairlines. */
  hair: string
  /** Colour for the one element the style marks out as the index. */
  index: string
  /** Deterministic stream, for the counts a style varies. */
  seed: SeedResolver
}

/**
 * A radial tick band with a longer index every quarter.
 *
 * The band is the one element that makes the mark read as a scale rather than as decoration, and it sits
 * outside the ring with a deliberate gap: touching, the two would merge into a thick edge.
 *
 * @param input - Grammar inputs.
 * @returns The tick elements.
 */
function ticks(input: Grammar): SVGElement[] {
  const { centre, size, hair, index, seed } = input
  const hairline = size * HAIRLINE_RATIO
  const inner = size * TICK_INNER_RATIO
  const outer = size * TICK_OUTER_RATIO
  const count = pick(TICK_COUNTS, seed)
  const every = count / 4
  const elements: SVGElement[] = []
  for (let tick = 0; tick < count; tick += 1) {
    const angle = (360 / count) * tick - 90
    const major = tick % every === 0
    const from = polar(centre, centre, major ? inner - hairline : inner, angle)
    const to = polar(centre, centre, major ? outer + hairline : outer, angle)
    elements.push(
      path(
        segmentPath(from.x, from.y, to.x, to.y, hairline * (major ? 1.8 : 1)),
        major ? index : hair
      )
    )
  }
  return elements
}

/**
 * Dial: a segmented bezel over a tick band.
 *
 * The bezel is four arcs with a gap at each cardinal point rather than a closed ring. The gaps sit under
 * the long ticks, which is what makes the band read as a scale being indexed rather than as a border
 * drawn around the core; a closed ring would turn the whole mark into a badge, which is the emblem's job.
 *
 * @param input - Grammar inputs.
 * @returns The dial elements.
 */
function dial(input: Grammar): SVGElement[] {
  const { centre, size, hair } = input
  const ring = size * RING_RATIO
  const hairline = size * HAIRLINE_RATIO
  const elements = ticks(input)
  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    const from = quadrant * 90 - 84
    // Thicker than the hairlines for a reason: the ticks are already a band of short rules, and a bezel of
    // the same weight loses the hierarchy and reads as a second, noisier band. At 2.4 hairlines the ring is
    // the structure and the ticks are the detail on it.
    elements.push(
      path(arcBandPath(centre, centre, ring, ring, hairline * 2.4, from, from + 78), hair)
    )
  }
  return elements
}

/**
 * Reticle: four arms that stop short of the core, a hairline ring, and four ticks on the diagonals.
 *
 * The gap between an arm and the core is what makes it read as an alignment mark rather than as a cross
 * drawn through the letters.
 *
 * @param input - Grammar inputs.
 * @returns The reticle elements.
 */
function reticle(input: Grammar): SVGElement[] {
  const { centre, size, hair, index } = input
  const ring = size * RING_RATIO
  const hairline = size * HAIRLINE_RATIO
  const near = size * CORE_RATIO * 1.12
  const far = size * TICK_INNER_RATIO
  const elements: SVGElement[] = []
  for (const angle of [-90, 0, 90, 180]) {
    const from = polar(centre, centre, near, angle)
    const to = polar(centre, centre, far, angle)
    elements.push(path(segmentPath(from.x, from.y, to.x, to.y, hairline), hair))
  }
  elements.push(path(ringPath(centre, centre, ring, ring, hairline * 1.2), hair))
  for (const angle of [-45, 45, 135, 225]) {
    const from = polar(centre, centre, size * TICK_INNER_RATIO, angle)
    const to = polar(centre, centre, size * TICK_OUTER_RATIO, angle)
    elements.push(path(segmentPath(from.x, from.y, to.x, to.y, hairline * 1.6), index))
  }
  return elements
}

/**
 * Brackets: four corner marks that frame without closing, and one heavy rule beneath the core.
 *
 * The rule is the only solid horizontal in the mark. It gives the composition a base, and it stops the
 * four brackets from reading as a crop mark left on a photograph.
 *
 * @param input - Grammar inputs.
 * @returns The bracket elements.
 */
function brackets(input: Grammar): SVGElement[] {
  const { centre, size, hair, index } = input
  const frame = size * FRAME_RATIO
  const hairline = size * HAIRLINE_RATIO
  const arm = frame * 0.42
  const elements: SVGElement[] = []
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x = centre + sx * frame
    const y = centre + sy * frame
    // One arm along each edge, drawn from the corner inwards. Two separate rules rather than a polyline:
    // the corner is square, and a polyline with a mitre would need a stroke join flat output cannot set.
    elements.push(
      path(segmentPath(x, y, x - sx * arm, y, hairline * 2), hair),
      path(segmentPath(x, y, x, y - sy * arm, hairline * 2), hair)
    )
  }
  elements.push(path(capsulePath(centre, centre + size * 0.28, size * 0.26, hairline * 3.2), index))
  return elements
}

/**
 * Sector: one heavy arc across the top, a hairline ring, and three ticks at the base.
 *
 * The heavy arc is the mark's direction. Everything else is symmetric, so without it the style would be
 * a dial with fewer marks.
 *
 * @param input - Grammar inputs.
 * @returns The sector elements.
 */
function sector(input: Grammar): SVGElement[] {
  const { centre, size, hair, index } = input
  const ring = size * RING_RATIO
  const hairline = size * HAIRLINE_RATIO
  const elements: SVGElement[] = [
    path(ringPath(centre, centre, ring, ring, hairline), hair),
    path(
      arcBandPath(
        centre,
        centre,
        ring + hairline * 6.5,
        ring + hairline * 6.5,
        hairline * 3.6,
        -168,
        -12
      ),
      index
    ),
  ]
  for (const angle of [62, 90, 118]) {
    const from = polar(centre, centre, ring + hairline * 1.5, angle)
    const to = polar(centre, centre, ring + hairline * 5.5, angle)
    elements.push(path(segmentPath(from.x, from.y, to.x, to.y, hairline * 1.4), hair))
  }
  return elements
}

/** The style helpers, keyed by the value `APPARATUS_STYLES` offers. */
const GRAMMAR: Readonly<Record<string, (input: Grammar) => SVGElement[]>> = Object.freeze({
  dial,
  reticle,
  brackets,
  sector,
})

/**
 * Draws an apparatus.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const apparatus: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, font, seed, size } = input
  const letters = monogramLetters(input)
  if (letters === '') {
    return []
  }

  const style = pick(APPARATUS_STYLES, seed, input.request.preferences.style)
  const centre = size / 2
  const canvas = palette.background ?? '#ffffff'

  // One mass, everything else hairline. The mass is whichever palette colour reads hardest against the
  // canvas, and the type is reversed out of the mass rather than chosen against the canvas — so the
  // initials stay legible whichever slot happens to lead.
  const mass = contrastFill(palette, canvas)
  const typeFill = contrastFill(palette, mass)
  const hairFill = readableOn(palette.secondary, canvas, mass)
  const indexFill = readableOn(palette.accent, canvas, mass)

  // The grammar goes on first, the core over it, and the type last. Ordering rather than geometry is what
  // guarantees that no tick, arc or bracket can ever cross an initial: the core covers the band of canvas
  // where the two layers could meet, and the type is drawn after the core.
  const elements = (GRAMMAR[style] ?? dial)({
    centre,
    size,
    hair: hairFill,
    index: indexFill,
    seed,
  })

  elements.push(
    path(chamferedRectPath(centre, centre, size * CORE_RATIO, size * CHAMFER_RATIO), mass)
  )

  const tracking = opticalTracking(font, CORE_TRACKING)
  const box = size * CORE_RATIO * 2 * LETTER_FILL
  const fitted = fitText(font, letters, centre, centre - box / 2, box, box, tracking)
  elements.push(
    path(textPath(font, letters, fitted.left, fitted.top, fitted.scale, tracking), typeFill)
  )

  input.mood.notes.push(
    `Apparatus in the ${style} style: initials reversed out of a chamfered core, ${STYLE_NOTE[style] ?? 'framed by hairlines'}.`
  )

  return elements
}
