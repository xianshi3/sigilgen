import { describe, expect, it } from 'vitest'
import { ENGINES } from '../src/engine-router'
import { ICONS, findFont, findPalette } from '../src/brain/index'
import { normaliseConfig } from '../src/generate'
import { MoodResolver } from '../src/mood-resolver'
import { pathBounds, type Bounds } from '../src/path'
import { SeedResolver } from '../src/seed-resolver'
import type { EngineInput, SVGElement } from '../src/types'

/**
 * The pictogram engine's alignment contract, over the whole set.
 *
 * `centreOnInk` makes the union look centred, but that can hide a mark that is off-centre *inside*
 * its ring or disc: the container is symmetric, so the union still measures centred while the icon
 * sits to one side. These cases check both centres, for all 70 icons in all three modes.
 */

const moodResolver = new MoodResolver()
const palette = findPalette('ink-monolith')
const font = findFont('inter-regular')

if (palette === undefined || font === undefined) {
  throw new Error('the brain is missing the audit palette or typeface')
}

/**
 * The union of every element's ink.
 *
 * @param elements - The engine output.
 * @returns The enclosing bounds, or `null` when nothing was drawn.
 */
function unionBounds(elements: readonly SVGElement[]): Bounds | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const element of elements) {
    const d = element.attrs['d']
    if (typeof d !== 'string') {
      continue
    }
    const bounds = pathBounds(d)
    if (bounds === null) {
      continue
    }
    minX = Math.min(minX, bounds.minX)
    minY = Math.min(minY, bounds.minY)
    maxX = Math.max(maxX, bounds.maxX)
    maxY = Math.max(maxY, bounds.maxY)
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

/**
 * Builds an input for one icon and mode.
 *
 * @param icon - The icon entry.
 * @param mode - `plain`, `ring` or `disc`.
 * @returns The engine input.
 */
function inputFor(icon: (typeof ICONS)[number], mode: string): EngineInput {
  const size = 512
  const request = normaliseConfig({
    name: 'Acme',
    engine: 'pictogram',
    preferences: { mode },
    size,
  })
  const mood = moodResolver.resolve('tech, minimal')
  return {
    request,
    mood: { ...mood, notes: [] },
    palette: palette!,
    font: font!,
    icon,
    engine: 'pictogram',
    seed: new SeedResolver('pictogram-centre', `${icon.key}-${mode}`),
    index: 0,
    size,
    letters: request.letters,
  }
}

describe('pictogram centring', () => {
  it('centres every icon in the canvas in every mode', () => {
    for (const icon of ICONS) {
      for (const mode of ['plain', 'ring', 'disc']) {
        const elements = ENGINES.pictogram(inputFor(icon, mode))
        const bounds = unionBounds(elements)
        expect(bounds, `${icon.key}/${mode} drew no ink`).not.toBeNull()
        const box = bounds as NonNullable<typeof bounds>
        expect((box.minX + box.maxX) / 2, `${icon.key}/${mode} horizontal`).toBeCloseTo(256, 0)
        expect((box.minY + box.maxY) / 2, `${icon.key}/${mode} vertical`).toBeCloseTo(256, 0)
      }
    }
  })

  it('keeps the icon centred inside its ring or disc', () => {
    for (const icon of ICONS) {
      for (const mode of ['ring', 'disc']) {
        const elements = ENGINES.pictogram(inputFor(icon, mode))
        expect(elements, `${icon.key}/${mode}`).toHaveLength(2)
        const container = pathBounds(String(elements[0]?.attrs['d']))
        const mark = pathBounds(String(elements[1]?.attrs['d']))
        expect(container, `${icon.key}/${mode} container`).not.toBeNull()
        expect(mark, `${icon.key}/${mode} icon`).not.toBeNull()
        const ring = container as NonNullable<typeof container>
        const ink = mark as NonNullable<typeof mark>
        expect((ink.minX + ink.maxX) / 2, `${icon.key}/${mode} horizontal`).toBeCloseTo(
          (ring.minX + ring.maxX) / 2,
          0
        )
        expect((ink.minY + ink.maxY) / 2, `${icon.key}/${mode} vertical`).toBeCloseTo(
          (ring.minY + ring.maxY) / 2,
          0
        )
        expect(ink.minX, `${icon.key}/${mode} escapes left`).toBeGreaterThanOrEqual(ring.minX)
        expect(ink.maxX, `${icon.key}/${mode} escapes right`).toBeLessThanOrEqual(ring.maxX)
        expect(ink.minY, `${icon.key}/${mode} escapes top`).toBeGreaterThanOrEqual(ring.minY)
        expect(ink.maxY, `${icon.key}/${mode} escapes bottom`).toBeLessThanOrEqual(ring.maxY)
      }
    }
  })
})
