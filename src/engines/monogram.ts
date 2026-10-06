/**
 * Monogram engine — initials set inside a geometric container.
 *
 * This is the default for short brand names, where a wordmark has no room to breathe. The engine
 * makes three structural decisions, each recorded in the concept notes: which container, which letter
 * layout, and which palette colour carries the container.
 *
 * Two rules are enforced rather than left to taste:
 *
 * - Never mix typefaces inside one mark. A monogram is a single voice.
 * - The container must not overpower the letters. It occupies at most 84% of the canvas, and the
 *   letter colour is chosen for contrast against the container so the mark survives at 16px.
 */

import {
  CONTAINER_INNER,
  CONTAINERS,
  LETTER_LAYOUTS,
  containerPath,
  monogramLetters,
  path,
  pick,
} from './shared'
import { opticalTracking } from './metrics'
import { contrastFill } from '../resolvers/palette-resolver'
import { measureText, textPath } from '../text'
import type { Engine, EngineInput, SVGElement } from '../types'

export { contrastFill } from '../resolvers/palette-resolver'

/** Largest fraction of the canvas the container radius may occupy. */
const MAX_CONTAINER_RATIO = 0.42

/** Cap height as a fraction of the container radius. */
const CAP_RATIO = 0.94

/** Fraction of the natural width the letters are squeezed to when overlapping. */
const OVERLAP_TIGHTENING = 0.7

/**
 * Letterspacing a side-by-side monogram tightens, as a fraction of cap height.
 *
 * Two letters inside a container are one mark, so they are closed up more than a lettermark's are:
 * there is a border right beside them. Two and a half percent takes the tightest family in the brain
 * from 68/1000 down to 43, which still leaves air.
 */
const PAIR_TRACKING = -0.025

/**
 * Widest a letter run may be, as a fraction of the container's radius.
 *
 * @param kind - One of {@link CONTAINERS}.
 * @returns The fraction of the radius available on each side of the centre.
 */
export function innerWidthRatio(kind: string): number {
  return CONTAINER_INNER[kind] ?? 1
}

/**
 * Draws a monogram.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const monogram: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, font, seed, size } = input
  const letters = monogramLetters(input)
  if (letters === '') {
    return []
  }

  const kind = pick(CONTAINERS, seed, input.request.preferences.container)
  const layout =
    letters.length > 1 ? pick(LETTER_LAYOUTS, seed, input.request.preferences.layout) : 'single'

  const centre = size / 2
  const radius = size * MAX_CONTAINER_RATIO
  const capHeight = radius * CAP_RATIO
  const scale = capHeight / font.metrics.capHeight

  // Container colour: the mood's palette leads with primary, so it wins unless the seed says otherwise.
  const containerColours = [palette.primary, palette.secondary, palette.accent]
  const containerFill = pick(containerColours, seed)
  const letterFill = contrastFill(palette, containerFill)

  const elements: SVGElement[] = [path(containerPath(kind, centre, centre, radius), containerFill)]

  if (layout === 'stacked' && letters.length === 2) {
    // Two half-height letters read as one block, so the stack occupies the same cap height as a
    // single letter would.
    const singleHeight = capHeight / 2.02
    const oneScale = singleHeight / font.metrics.capHeight
    const first = letters[0] as string
    const second = letters[1] as string
    const firstWidth = measureText(font, first, oneScale).width
    const secondWidth = measureText(font, second, oneScale).width
    const stackTop = centre - capHeight / 2
    elements.push(
      path(
        textPath(font, first, centre - firstWidth / 2, stackTop, oneScale) +
          textPath(font, second, centre - secondWidth / 2, stackTop + singleHeight, oneScale),
        letterFill
      )
    )
  } else {
    const overlap = layout === 'overlap'
    const natural = measureText(font, letters, scale).width
    // Overlap is produced by the tracking, not by moving the run's origin. Centring on a narrower box
    // than the one actually drawn shifts the letters off centre and can push them past the canvas edge.
    // `textPath` adds tracking after every glyph, so the run has one gap per letter.
    let tracking = 0
    if (overlap) {
      tracking = (natural * OVERLAP_TIGHTENING - natural) / letters.length
    } else if (letters.length > 1) {
      tracking = opticalTracking(font, PAIR_TRACKING)
    }
    const metrics = measureText(font, letters, scale, tracking)
    // Two wide letters can be wider than the container is across the band they occupy. Scaling the whole
    // run down is the only remedy that keeps it centred, since the tracking is in font units and scales
    // with everything else.
    const available = radius * 2 * innerWidthRatio(kind)
    const runScale = metrics.width > available ? (available / metrics.width) * scale : scale
    const run = measureText(font, letters, runScale, tracking)
    const x = centre - run.width / 2
    // `textPath` takes the top of the caps, so the run is centred by offsetting the cap top.
    const capTop = centre - run.height / 2
    elements.push(path(textPath(font, letters, x, capTop, runScale, tracking), letterFill))
  }

  input.mood.notes.push(
    `Monogram in a ${kind} container, ${layout} lettering, ${containerFill} reversed out in ${letterFill}.`
  )

  return elements
}
