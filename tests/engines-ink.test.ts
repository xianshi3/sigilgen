import { describe, expect, it } from 'vitest'
import { ENGINES } from '../src/engine-router'
import { MoodResolver } from '../src/mood-resolver'
import { SeedResolver } from '../src/seed-resolver'
import { findFont, findIcon, findPalette } from '../src/brain/index'
import { normaliseConfig } from '../src/generate'
import { pathBounds } from '../src/path'
import type { EngineName, EngineInput, ResolvedRequest } from '../src/types'

/**
 * The three ink engines, beyond the contract every engine satisfies.
 *
 * `tests/engines.test.ts` already holds each engine to the shared rules — draws something, records a
 * note, never emits a forbidden attribute, survives an absent icon. What is specific here is the
 * grammar: what shape the mark is made of, and whether it stays on the canvas.
 */

const moodResolver = new MoodResolver()

/**
 * Builds a synthetic engine input.
 *
 * @param engine - The engine under test.
 * @param overrides - Fields to override.
 * @returns The input.
 */
function makeInput(engine: EngineName, overrides: Partial<EngineInput> = {}): EngineInput {
  const request: ResolvedRequest = normaliseConfig({
    name: 'Acme Labs',
    keywords: 'tech, minimal',
  })
  const mood = moodResolver.resolve('tech, minimal')
  return {
    request,
    mood: { ...mood, notes: [] },
    palette: findPalette('ink-monolith')!,
    font: findFont('inter-regular')!,
    icon: findIcon('hexagon-node')!,
    engine,
    seed: new SeedResolver('ink-test', 'Acme Labs'),
    index: 0,
    size: 512,
    letters: request.letters,
    ...overrides,
  }
}

/** Every element's ink box, measured from its path data. */
function boxes(elements: ReturnType<(typeof ENGINES)[EngineName]>) {
  return elements.map(element => pathBounds(String(element.attrs['d'] ?? '')))
}

/** The distinct fill values an engine emitted. */
function distinctFills(elements: ReturnType<(typeof ENGINES)[EngineName]>): string[] {
  return [...new Set(elements.map(element => String(element.attrs['fill'])))]
}

describe('pictogram', () => {
  it('draws the pictogram and nothing else in plain mode', () => {
    const input = makeInput('pictogram', {
      request: normaliseConfig({ name: 'Acme', preferences: { mode: 'plain' } }),
    })
    const elements = ENGINES.pictogram(input)
    expect(elements).toHaveLength(1)
    expect(input.mood.notes.join(' ')).toContain('Pictogram')
  })

  it('seals the pictogram inside a ring in ring mode', () => {
    const input = makeInput('pictogram', {
      request: normaliseConfig({ name: 'Acme', preferences: { mode: 'ring' } }),
    })
    const elements = ENGINES.pictogram(input)
    expect(elements).toHaveLength(2)
    // The ring is the first element and the pictogram sits inside it.
    const ring = pathBounds(String(elements[0]?.attrs['d']))
    const icon = pathBounds(String(elements[1]?.attrs['d']))
    expect(ring).not.toBeNull()
    expect(icon).not.toBeNull()
    expect((icon?.minX ?? 0) > (ring?.minX ?? 0)).toBe(true)
    expect((icon?.maxX ?? 0) < (ring?.maxX ?? 0)).toBe(true)
  })

  it('reverses the pictogram out of a disc in the page colour', () => {
    const input = makeInput('pictogram', {
      request: normaliseConfig({ name: 'Acme', preferences: { mode: 'disc' } }),
    })
    const elements = ENGINES.pictogram(input)
    expect(elements).toHaveLength(2)
    expect(elements[1]?.attrs['fill']).toBe(input.palette.background ?? '#ffffff')
  })

  it('falls back to a seeded mode rather than failing on an unknown preference', () => {
    const input = makeInput('pictogram', {
      request: normaliseConfig({ name: 'Acme', preferences: { mode: 'nonsense' } }),
    })
    expect(ENGINES.pictogram(input).length).toBeGreaterThan(0)
  })

  it('still draws when the icon is missing', () => {
    // Defensive: the resolver always hands this engine a pictogram. If it ever does not, the canvas must
    // not come out blank.
    const input = makeInput('pictogram', { icon: null })
    expect(ENGINES.pictogram(input).length).toBeGreaterThan(0)
  })
})

describe('halftone', () => {
  it('draws a field of dots rather than a stroke', () => {
    const elements = ENGINES.halftone(makeInput('halftone', { letters: 'A' }))
    expect(elements.length).toBeGreaterThan(20)
    expect(distinctFills(elements)).toHaveLength(1)
  })

  it('keeps every dot on the canvas', () => {
    const size = 512
    const elements = ENGINES.halftone(makeInput('halftone', { letters: 'MW' }))
    for (const box of boxes(elements)) {
      expect(box).not.toBeNull()
      expect(box!.minX).toBeGreaterThanOrEqual(-0.5)
      expect(box!.minY).toBeGreaterThanOrEqual(-0.5)
      expect(box!.maxX).toBeLessThanOrEqual(size + 0.5)
      expect(box!.maxY).toBeLessThanOrEqual(size + 0.5)
    }
  })

  it('leaves the counter of a letter open', () => {
    // Sampled under the nonzero rule, the inside of an `O` is empty space, so no dot may be centred
    // there. The dot field is measured in the mark's own coordinates, so this asks about the grid.
    const elements = ENGINES.halftone(makeInput('halftone', { letters: 'O' }))
    const centres = boxes(elements).map(box => ({
      x: ((box?.minX ?? 0) + (box?.maxX ?? 0)) / 2,
      y: ((box?.minY ?? 0) + (box?.maxY ?? 0)) / 2,
    }))
    const middle = 256
    const nearMiddle = centres.filter(
      centre => Math.abs(centre.x - middle) < 20 && Math.abs(centre.y - middle) < 20
    )
    expect(nearMiddle).toHaveLength(0)
  })
})

describe('scanline', () => {
  it('cuts the letter into horizontal runs', () => {
    const elements = ENGINES.scanline(makeInput('scanline', { letters: 'I' }))
    expect(elements.length).toBeGreaterThan(8)
    for (const box of boxes(elements)) {
      expect(box).not.toBeNull()
      expect(box!.maxY - box!.minY).toBeLessThan(box!.maxX - box!.minX)
    }
  })

  it('keeps every bar on the canvas', () => {
    const size = 512
    const elements = ENGINES.scanline(makeInput('scanline', { letters: 'H' }))
    for (const box of boxes(elements)) {
      expect(box).not.toBeNull()
      expect(box!.minX).toBeGreaterThanOrEqual(-0.5)
      expect(box!.minY).toBeGreaterThanOrEqual(-0.5)
      expect(box!.maxX).toBeLessThanOrEqual(size + 0.5)
      expect(box!.maxY).toBeLessThanOrEqual(size + 0.5)
    }
    expect(distinctFills(elements)).toHaveLength(1)
  })

  it('separates the rings of a letter with a hole', () => {
    // `O` must come out as two bars per row on most rows: the screen follows the outline, not a bounding
    // box, so the counter stays open.
    const elements = ENGINES.scanline(makeInput('scanline', { letters: 'O' }))
    const rows = new Map<number, number>()
    for (const box of boxes(elements)) {
      const y = Math.round((((box?.minY ?? 0) + (box?.maxY ?? 0)) / 2) * 10) / 10
      rows.set(y, (rows.get(y) ?? 0) + 1)
    }
    const doubleRows = [...rows.values()].filter(count => count >= 2)
    expect(doubleRows.length).toBeGreaterThan(2)
  })
})
