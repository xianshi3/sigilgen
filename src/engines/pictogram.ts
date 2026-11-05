/**
 * Pictogram engine — the pictogram alone.
 *
 * Some brands are identified by their mark and nothing else: an app on a home screen, a favicon, a
 * badge on a bottle. The engine draws the resolved pictogram at the largest size the canvas allows and
 * pairs it with one of three containers, so a run of concepts varies between a bare mark, a mark ringed
 * like a seal, and a mark reversed out of a disc.
 *
 * There is no name in the output by design. The emblem engine is the one that sets a name under a
 * pictogram; asking for both would produce two engines with the same grammar.
 */

import { discPath, ringPath } from '../geometry'
import { contrastFill } from '../resolvers/palette-resolver'
import { centreOnInk, path, pick, placeIcon } from './shared'
import type { Engine, EngineInput, SVGElement } from '../types'

/** Containers the pictogram can be placed in. */
export const PICTOGRAM_MODES: readonly string[] = ['plain', 'ring', 'disc']

/**
 * Draws a pictogram-only mark.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const pictogramEngine: Engine = (input: EngineInput): SVGElement[] => {
  const { icon, palette, seed, size } = input
  const centre = size / 2
  const canvas = palette.background ?? '#ffffff'
  const ink = contrastFill(palette, canvas)
  const mode = pick(PICTOGRAM_MODES, seed, input.request.preferences.mode)

  if (icon === null) {
    // Defensive: the resolver hands this engine a pictogram on every path that reaches it. If that ever
    // changes, a disc keeps the canvas from coming out empty rather than throwing inside a render.
    return [path(discPath(centre, centre, size * 0.16), ink)]
  }

  const elements: SVGElement[] = []
  let box = size * 0.5
  if (mode === 'ring') {
    // The ring is a seal: the pictogram sits inside the band with clear space on every side, so its box
    // is measured from the ring's inner edge rather than from its outer one.
    const radius = size * seed.range(0.25, 0.29)
    const weight = radius * seed.range(0.07, 0.11)
    elements.push(path(ringPath(centre, centre, radius, radius, weight), ink))
    box = (radius - weight) * seed.range(1.24, 1.4)
  } else if (mode === 'disc') {
    const radius = size * seed.range(0.29, 0.34)
    elements.push(path(discPath(centre, centre, radius), ink))
    box = radius * seed.range(1, 1.14)
  } else {
    box = size * seed.range(0.46, 0.55)
  }

  // Reversed out of the disc in the page colour, or drawn in ink on an open page. The reverse is what
  // makes the disc read as a plate the pictogram sits in, rather than as a blob behind it.
  elements.push(
    placeIcon(icon, centre - box / 2, centre - box / 2, box, mode === 'disc' ? canvas : ink)
  )

  input.mood.notes.push(
    `Pictogram "${icon.key}" as the whole identity, ${describeMode(mode)}; no type.`
  )

  return centreOnInk(elements, size)
}

/**
 * Describes a container mode in the notes' own register.
 *
 * @param mode - One of {@link PICTOGRAM_MODES}.
 * @returns The phrase.
 */
function describeMode(mode: string): string {
  if (mode === 'ring') {
    return 'sealed by a ring'
  }
  if (mode === 'disc') {
    return 'reversed out of a disc'
  }
  return 'on the open page'
}

export { pictogramEngine as pictogram }
