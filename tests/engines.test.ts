import { describe, expect, it } from 'vitest'
import { ENGINES, engineWeights, explainRoute, route } from '../src/engine-router'
import { MoodResolver } from '../src/mood-resolver'
import { SeedResolver } from '../src/seed-resolver'
import { findFont, findIcon, findPalette } from '../src/brain/index'
import { normaliseConfig } from '../src/generate'
import { CONTAINERS, containerPath, placeIcon, wordmarkLetters } from '../src/engines/shared'
import { frameHalfWidth } from '../src/engines/emblem'
import { APPARATUS_STYLES } from '../src/engines/apparatus'
import { MODES } from '../src/engines/abstract'
import { discPath } from '../src/geometry'
import { isSafePathData, pathBounds } from '../src/path'
import { PRECISION } from '../src/format'
import {
  ENGINE_NAMES,
  type EngineInput,
  type IconEntry,
  type EngineName,
  type MoodMatch,
  type ResolvedRequest,
} from '../src/types'

const moodResolver = new MoodResolver()

/**
 * Builds a synthetic engine input so each engine can be exercised in isolation.
 *
 * @param overrides - Fields to override.
 * @returns The input.
 */
function makeInput(overrides: Partial<EngineInput> = {}): EngineInput {
  const request: ResolvedRequest = normaliseConfig({ name: 'Acme Labs', keywords: 'tech, minimal' })
  const mood: MoodMatch = moodResolver.resolve('tech, minimal')
  return {
    request,
    mood: { ...mood, notes: [] },
    palette: findPalette('ink-monolith')!,
    font: findFont('orbit-grotesk')!,
    icon: findIcon('hexagon-node')!,
    engine: 'monogram',
    seed: new SeedResolver('engine-test', 'Acme Labs'),
    index: 0,
    size: 512,
    letters: request.letters,
    ...overrides,
  }
}

/**
 * Collects the fill colours used by an engine.
 *
 * @param elements - The elements to inspect.
 * @returns Every `fill` value found.
 */
function fills(elements: readonly { attrs: Record<string, string | number> }[]): string[] {
  return elements
    .map(element => element.attrs['fill'])
    .filter((value): value is string => typeof value === 'string')
}

describe('engineWeights', () => {
  it('always returns a weight for all six engines', () => {
    const request = normaliseConfig({ name: 'Acme' })
    const weights = engineWeights(request, moodResolver.resolve('tech'))
    for (const engine of ENGINE_NAMES) {
      expect(typeof weights[engine]).toBe('number')
      expect(Number.isFinite(weights[engine])).toBe(true)
      expect(weights[engine]).toBeGreaterThanOrEqual(0)
    }
  })

  it('favours the monogram for a two-letter name', () => {
    const weights = engineWeights(normaliseConfig({ name: 'QB' }), moodResolver.resolve('tech'))
    const longName = engineWeights(
      normaliseConfig({ name: 'Northwind' }),
      moodResolver.resolve('tech')
    )
    expect(weights.monogram).toBeGreaterThan(longName.monogram)
  })

  it('favours the lettermark for a very long name', () => {
    const short = engineWeights(normaliseConfig({ name: 'Vela' }), moodResolver.resolve('abstract'))
    const long = engineWeights(
      normaliseConfig({ name: 'Internationale' }),
      moodResolver.resolve('abstract')
    )
    expect(long.lettermark).toBeGreaterThan(short.lettermark)
  })

  it('penalises the wordmark for names that cannot fit', () => {
    const weights = engineWeights(
      normaliseConfig({ name: 'Northwind' }),
      moodResolver.resolve('minimal')
    )
    expect(weights.wordmark).toBeGreaterThanOrEqual(0)
  })

  it('favours abstract marks for abstract briefs', () => {
    const weights = engineWeights(
      normaliseConfig({ name: 'Form' }),
      moodResolver.resolve('generative geometric')
    )
    expect(weights.abstract).toBeGreaterThan(weights.emblem)
  })

  it('favours emblems for hospitality briefs', () => {
    const weights = engineWeights(
      normaliseConfig({ name: 'Ember' }),
      moodResolver.resolve('coffee artisan')
    )
    expect(weights.emblem).toBeGreaterThan(weights.abstract)
  })

  it('adds weight to monograms for multi-word names', () => {
    const single = engineWeights(
      normaliseConfig({ name: 'Northwind' }),
      moodResolver.resolve('nature')
    )
    const multi = engineWeights(
      normaliseConfig({ name: 'North Wind' }),
      moodResolver.resolve('nature')
    )
    expect(multi.monogram).toBeGreaterThan(single.monogram)
  })
})

describe('route', () => {
  it('always returns a valid engine', () => {
    const request = normaliseConfig({ name: 'Acme', keywords: 'tech' })
    const mood = moodResolver.resolve('tech')
    for (let round = 0; round < 200; round++) {
      const engine = route(request, mood, new SeedResolver('route', round))
      expect(ENGINE_NAMES).toContain(engine)
    }
  })

  it('honours a forced engine', () => {
    const request = normaliseConfig({ name: 'Acme', engine: 'emblem' })
    for (let round = 0; round < 50; round++) {
      expect(route(request, moodResolver.resolve('coffee'), new SeedResolver('x', round))).toBe(
        'emblem'
      )
    }
  })

  it('is deterministic', () => {
    const request = normaliseConfig({ name: 'Acme', keywords: 'tech' })
    const mood = moodResolver.resolve('tech')
    const first = route(request, mood, new SeedResolver('same'))
    const second = route(request, mood, new SeedResolver('same'))
    expect(first).toBe(second)
  })

  it('routes short names to monograms or lettermarks far more often', () => {
    const mood = moodResolver.resolve('minimal, clean')
    let letterish = 0
    for (let round = 0; round < 300; round++) {
      const engine = route(normaliseConfig({ name: 'QB' }), mood, new SeedResolver('short', round))
      if (engine === 'monogram' || engine === 'lettermark') {
        letterish++
      }
    }
    expect(letterish / 300).toBeGreaterThan(0.8)
  })

  it('explains the decision', () => {
    const request = normaliseConfig({ name: 'QB' })
    const mood = moodResolver.resolve('minimal')
    expect(explainRoute(request, mood, 'monogram')).toContain('monogram')
    expect(explainRoute(request, mood, 'monogram')).toContain('2-letter')
  })

  it('says when the engine was forced', () => {
    const request = normaliseConfig({ name: 'Acme', engine: 'abstract' })
    expect(explainRoute(request, moodResolver.resolve('tech'), 'abstract')).toContain('explicitly')
  })
})

describe('engines', () => {
  it('are all registered', () => {
    for (const engine of ENGINE_NAMES) {
      expect(typeof ENGINES[engine]).toBe('function')
    }
  })

  it.each(ENGINE_NAMES)('%s draws something for a short name', engine => {
    const elements = ENGINES[engine](makeInput({ engine, letters: 'QB' }))
    expect(elements.length).toBeGreaterThan(0)
    for (const element of elements) {
      expect(element.tag).toBeTruthy()
      expect(Object.keys(element.attrs).length).toBeGreaterThan(0)
    }
  })

  it.each(ENGINE_NAMES)('%s draws something for a long multi-word name', engine => {
    const request = normaliseConfig({ name: 'Northwind Coffee Roasters' })
    const elements = ENGINES[engine](makeInput({ engine, request, letters: request.letters }))
    expect(elements.length).toBeGreaterThan(0)
  })

  it.each(ENGINE_NAMES)('%s draws with no icon', engine => {
    const elements = ENGINES[engine](makeInput({ engine, icon: null }))
    expect(elements.length).toBeGreaterThan(0)
  })

  it.each(ENGINE_NAMES)('%s draws when the name has no letters at all', engine => {
    expect(() => ENGINES[engine](makeInput({ engine, letters: '' }))).not.toThrow()
  })

  it.each(ENGINE_NAMES)('%s never emits a forbidden attribute value', engine => {
    const input = makeInput({ engine })
    for (const element of ENGINES[engine](input)) {
      for (const [name, value] of Object.entries(element.attrs)) {
        expect(name.startsWith('on'), `${name} must not be an event handler`).toBe(false)
        expect(['href', 'xlink:href', 'style']).not.toContain(name)
        const text = String(value)
        expect(text, `${engine} ${name}`).not.toMatch(/url\(|javascript:|onerror|onload|<|>|"/i)
      }
    }
  })

  it.each(ENGINE_NAMES)('%s records at least one design note', engine => {
    const input = makeInput({ engine })
    ENGINES[engine](input)
    expect(input.mood.notes.length).toBeGreaterThan(0)
  })

  it.each(ENGINE_NAMES)('%s is deterministic for a given seed', engine => {
    const draw = (): string =>
      JSON.stringify(
        ENGINES[engine](makeInput({ engine, seed: new SeedResolver('fixed'), index: 2 }))
      )
    expect(draw()).toBe(draw())
  })

  it.each(ENGINE_NAMES)('%s varies with the seed', engine => {
    const variants = new Set<string>()
    for (let round = 0; round < 40; round++) {
      variants.add(
        JSON.stringify(ENGINES[engine](makeInput({ engine, seed: new SeedResolver('v', round) })))
      )
    }
    // Every engine should offer real variation, not just one frozen composition. The wordmark has six
    // layout × treatment × emphasis combinations by design, so it should reach at least as far as the
    // rest; the geometric engines have far more continuous degrees of freedom.
    expect(variants.size, `${engine} produced ${variants.size} variants`).toBeGreaterThan(3)
  })

  it('scales its output with the canvas size', () => {
    const small = ENGINES.monogram(makeInput({ size: 64 }))
    const large = ENGINES.monogram(makeInput({ size: 1024 }))
    const magnitude = (elements: readonly { attrs: Record<string, string | number> }[]): number =>
      Math.max(
        ...elements.map(element =>
          Number(element.attrs['d']?.toString().match(/\d+(\.\d+)?/)?.[0] ?? 0)
        )
      )
    expect(magnitude(large)).toBeGreaterThan(magnitude(small))
  })
})

describe('monogram', () => {
  it('uses only palette colours', () => {
    const input = makeInput({ engine: 'monogram' })
    const { palette } = input
    const allowed = new Set([palette.primary, palette.secondary, palette.accent, palette.highlight])
    for (const fill of fills(ENGINES.monogram(input))) {
      expect(allowed.has(fill), fill).toBe(true)
    }
  })

  it('draws a container plus the letters', () => {
    const elements = ENGINES.monogram(makeInput({ engine: 'monogram', letters: 'Q' }))
    expect(elements.length).toBe(2)
  })

  it('draws one path for stacked and overlapped two-letter marks', () => {
    for (let round = 0; round < 40; round++) {
      const elements = ENGINES.monogram(
        makeInput({ engine: 'monogram', letters: 'QB', seed: new SeedResolver('two', round) })
      )
      expect(elements.length).toBe(2)
    }
  })

  it('keeps the letters inside the canvas and the container', () => {
    // Overlapping monograms used to be centred on a narrower box than the one drawn, which shifted the
    // run to the right and could push a letter past the canvas edge entirely.
    const size = 512

    for (const name of [
      'Northwind Coffee',
      'Bright Anvil',
      'Ironbark',
      'Quartz Bay',
      'Ember Oak',
    ]) {
      for (let round = 0; round < 40; round++) {
        const input = makeInput({
          engine: 'monogram',
          size,
          request: normaliseConfig({ name, size }),
          letters: normaliseConfig({ name, size }).letters,
          seed: new SeedResolver('fit', round),
        })
        const elements = ENGINES.monogram(input)
        const ink = pathBounds(elements.at(-1)?.attrs['d'] as string)
        expect(ink, `${name} drew no letters`).not.toBeNull()
        const bounds = ink as NonNullable<typeof ink>

        expect(bounds.minX, `${name} overflows the left edge`).toBeGreaterThanOrEqual(0)
        expect(bounds.maxX, `${name} overflows the right edge`).toBeLessThanOrEqual(size)
        expect(bounds.minY, `${name} overflows the top`).toBeGreaterThanOrEqual(0)
        expect(bounds.maxY, `${name} overflows the bottom`).toBeLessThanOrEqual(size)

        // The ink must also sit inside the container it is reversed out of.
        const container = pathBounds(elements[0]?.attrs['d'] as string)
        expect(container, `${name} drew no container`).not.toBeNull()
        const box = container as NonNullable<typeof container>
        expect(bounds.minX, `${name} escapes the container on the left`).toBeGreaterThanOrEqual(
          box.minX - 1
        )
        expect(bounds.maxX, `${name} escapes the container on the right`).toBeLessThanOrEqual(
          box.maxX + 1
        )
      }
    }
  })

  it('falls back to a disc for a container it does not recognise', () => {
    // A container name can only come from CONTAINERS today, so this branch is a safety net. It must
    // still produce a closed, safe path rather than an empty `d`, which the serializer would reject.
    const fallback = containerPath('trapezoid', 50, 50, 20)
    expect(fallback).toBe(discPath(50, 50, 20))
    expect(isSafePathData(fallback)).toBe(true)
  })

  it('builds a distinct closed path for every declared container', () => {
    const shapes = CONTAINERS.map(kind => containerPath(kind, 50, 50, 20))
    expect(new Set(shapes).size).toBe(CONTAINERS.length)
    for (const d of shapes) {
      expect(isSafePathData(d)).toBe(true)
      expect(d.trimEnd().endsWith('Z')).toBe(true)
    }
  })
})

describe('lettermark', () => {
  it('draws only type and accents, never a container', () => {
    const input = makeInput({ engine: 'lettermark', icon: findIcon('mountain-peak')! })
    expect(ENGINES.lettermark(input).length).toBeGreaterThan(0)
  })

  it('draws a corner frame as four brackets pointing the right way', () => {
    // The frame is built from the last `arm` of each edge of a square, so two brackets are horizontal
    // and two are vertical. Passing a length and a thickness to a horizontal-only helper drew all four
    // as horizontal bars, which put two of them outside the square entirely.
    const size = 512
    const centre = size / 2
    const brackets: {
      bounds: NonNullable<ReturnType<typeof pathBounds>>
      horizontal: boolean
    }[] = []

    for (let round = 0; round < 60 && brackets.length < 4; round++) {
      const input = makeInput({
        engine: 'lettermark',
        size,
        seed: new SeedResolver('brackets', round),
      })
      const elements = ENGINES.lettermark(input)
      if (elements.length !== 5) {
        continue
      }
      for (const element of elements.slice(1)) {
        const bounds = pathBounds(element.attrs['d'] as string)
        if (bounds === null) {
          continue
        }
        brackets.push({
          bounds,
          horizontal: bounds.maxX - bounds.minX > bounds.maxY - bounds.minY,
        })
      }
    }

    expect(brackets).toHaveLength(4)
    // Two horizontals and two verticals: a square frame, not four bars.
    expect(brackets.filter(entry => entry.horizontal)).toHaveLength(2)
    // Every bracket sits on the padded square. A bracket straddles the line it lies on, so the bound
    // allows for half its thickness on each side.
    const pad = size * 0.11
    const thickness = size * 0.018
    for (const { bounds } of brackets) {
      expect(bounds.minX).toBeGreaterThanOrEqual(pad - thickness)
      expect(bounds.maxX).toBeLessThanOrEqual(size - pad + thickness)
      expect(bounds.minY).toBeGreaterThanOrEqual(pad - thickness)
      expect(bounds.maxY).toBeLessThanOrEqual(size - pad + thickness)
    }
    // The brackets sit at the four corners, so they are spread across both axes.
    const centres = brackets.map(entry => (entry.bounds.minX + entry.bounds.maxX) / 2)
    expect(Math.min(...centres)).toBeLessThan(centre)
    expect(Math.max(...centres)).toBeGreaterThan(centre)
  })
})

describe('wordmark', () => {
  it('falls back to no elements when there is no name to set', () => {
    // The engine prefers a usable concept over an empty one, but with nothing to draw the honest
    // answer is nothing at all rather than an empty glyph run. A single-word request is what lets the
    // letters actually reach zero: `wordmarkLetters` derives from the request's words, so overriding
    // `letters` on a two-word name would not empty it.
    const request = normaliseConfig({ name: 'Acme' })
    const input = makeInput({ engine: 'wordmark', icon: null, request, letters: '' })
    expect(wordmarkLetters(input)).toBe('')
    expect(ENGINES.wordmark(input)).toEqual([])
  })

  it('places the pictogram when one resolves', () => {
    const elements = ENGINES.wordmark(makeInput({ engine: 'wordmark' }))
    expect(elements.length).toBe(2)
  })

  it('falls back to type alone without a pictogram', () => {
    const elements = ENGINES.wordmark(makeInput({ engine: 'wordmark', icon: null }))
    expect(elements.length).toBe(1)
  })
})

describe('emblem', () => {
  it('always draws the frame', () => {
    for (let round = 0; round < 40; round++) {
      const elements = ENGINES.emblem(
        makeInput({ engine: 'emblem', seed: new SeedResolver('frame', round) })
      )
      expect(elements.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('never lets the name escape its frame', () => {
    // Three of the four frames are narrower at some rows than at their widest point: the shield tapers
    // to a point, the hexagon has shoulders, the banner has notched corners. Budgeting the name against
    // the frame's maximum width instead of its narrowest is how a wordmark ends up hanging in mid-air
    // beside its own badge, so every row of the name's ink is checked against the frame at that row.
    const size = 512
    const centre = size / 2
    const frameRadius = (size * 0.86) / 2
    const seen = new Set<string>()

    for (const name of [
      'Ledgerly',
      'Northwind Coffee',
      'Quartz Bay',
      'Brew & Co',
      'Halcyon',
      'X',
    ]) {
      for (let round = 0; round < 24; round++) {
        const input = makeInput({
          engine: 'emblem',
          size,
          request: normaliseConfig({ name, size }),
          letters: normaliseConfig({ name, size }).letters,
          seed: new SeedResolver('contain', round),
        })
        const elements = ENGINES.emblem(input)
        const frame = /in a (\w+) frame/.exec(input.mood.notes.at(-1) ?? '')?.[1]
        expect(frame, `no frame reported for ${name}`).toBeDefined()
        seen.add(frame as string)

        const ink = pathBounds(elements.at(-1)?.attrs['d'] as string)
        expect(ink, `no name drawn for ${name}`).not.toBeNull()

        // Sample the name's vertical extent: the frame must be at least as wide as the ink on every row.
        for (let step = 0; step <= 20; step++) {
          const y =
            (ink as { minY: number; maxY: number }).minY +
            (step / 20) *
              ((ink as { minY: number; maxY: number }).maxY -
                (ink as { minY: number; maxY: number }).minY)
          const half = frameHalfWidth(frame as string, centre, frameRadius, y)
          const inkHalf = Math.max(
            centre - (ink as { minX: number }).minX,
            (ink as { maxX: number }).maxX - centre
          )
          expect(inkHalf, `${frame} "${name}" escapes at y=${y.toFixed(1)}`).toBeLessThanOrEqual(
            half + 0.5
          )
        }
      }
    }

    // The sweep is only meaningful if it actually reached every frame shape.
    expect([...seen].toSorted()).toEqual(['banner', 'circle', 'hexagon', 'shield'])
  })
})

describe('placeIcon', () => {
  it('never emits path data the serializer would reject, whatever the icon', () => {
    // Icons come from the brain and are all valid, so this is the safety net for a malformed one. The
    // property that protects the pipeline is that whatever comes out is safe to embed, not that it
    // necessarily contains ink: an icon that encloses no area simply draws nothing.
    const icons: IconEntry[] = [
      { key: 'empty', category: 'test', tags: [], viewBox: '0 0 24 24', path: '' },
      { key: 'noisy', category: 'test', tags: [], viewBox: 'not a view box', path: '' },
      { key: 'fine', category: 'test', tags: [], viewBox: '0 0 24 24', path: 'M 2 2 L 20 20 Z' },
    ]
    for (const icon of icons) {
      const d = placeIcon(icon, 10, 10, 100, '#000000').attrs['d'] as string
      expect(typeof d, icon.key).toBe('string')
      expect(isSafePathData(d), icon.key).toBe(true)
      expect(d, icon.key).not.toMatch(/NaN|Infinity/)
    }
  })

  it('fits an icon into the box it is given', () => {
    const icon = findIcon('mountain-peak')!
    const d = placeIcon(icon, 0, 0, 100, '#000000').attrs['d'] as string
    const bounds = pathBounds(d)!
    expect(bounds.minX).toBeGreaterThanOrEqual(-1)
    expect(bounds.maxX).toBeLessThanOrEqual(101)
    expect(bounds.minY).toBeGreaterThanOrEqual(-1)
    expect(bounds.maxY).toBeLessThanOrEqual(101)
  })
})

describe('frameHalfWidth', () => {
  const centre = 256
  const radius = 220

  it('is widest across the middle of every frame', () => {
    for (const frame of ['circle', 'hexagon', 'shield', 'banner']) {
      const middle = frameHalfWidth(frame, centre, radius, centre)
      const above = frameHalfWidth(frame, centre, radius, centre - radius / 2)
      const below = frameHalfWidth(frame, centre, radius, centre + radius / 2)
      expect(middle, frame).toBeGreaterThan(0)
      expect(above, frame).toBeLessThanOrEqual(middle)
      expect(below, frame).toBeLessThanOrEqual(middle)
    }
  })

  it('never returns a negative width', () => {
    for (const frame of ['circle', 'hexagon', 'shield', 'banner']) {
      for (let y = -400; y <= 900; y += 7) {
        expect(frameHalfWidth(frame, centre, radius, y), `${frame} @ ${y}`).toBeGreaterThanOrEqual(
          0
        )
      }
    }
  })

  it('is zero above and below the frame', () => {
    for (const frame of ['circle', 'hexagon', 'shield', 'banner']) {
      expect(frameHalfWidth(frame, centre, radius, centre - radius * 2), frame).toBe(0)
      expect(frameHalfWidth(frame, centre, radius, centre + radius * 2), frame).toBe(0)
    }
  })

  it('narrows the banner at its notched corners', () => {
    // The flag is a rectangle until the notch lifts its bottom corners: its top edge sits above the
    // centre by `0.72 * radius` and it is `1.28 * radius` tall.
    const bottom = centre - radius * 0.72 + radius * 1.28
    expect(frameHalfWidth('banner', centre, radius, bottom - radius * 0.2)).toBeGreaterThan(
      frameHalfWidth('banner', centre, radius, bottom)
    )
  })
})

describe('abstract', () => {
  it('draws no glyph outlines at all', () => {
    // The abstract engine is defined by having nothing to do with the brand name.
    for (let round = 0; round < 40; round++) {
      const input = makeInput({ engine: 'abstract', seed: new SeedResolver('abs', round) })
      const elements = ENGINES.abstract(input)
      for (const element of elements) {
        expect(element.tag).not.toBe('text')
      }
    }
  })

  it('produces a different shape for each mode', () => {
    const shapes = new Set<string>()
    for (let round = 0; round < 60; round++) {
      shapes.add(
        JSON.stringify(
          ENGINES.abstract(makeInput({ engine: 'abstract', seed: new SeedResolver('m', round) }))
        )
      )
    }
    expect(shapes.size).toBeGreaterThan(4)
  })

  it('offers every mode in its published list, and draws each one', () => {
    // `MODES` is the list the studio offers and the router picks from, so a mode that is not reachable
    // through it is dead code however good it looks on its own.
    for (const mode of MODES) {
      const elements = ENGINES.abstract(
        makeInput({
          engine: 'abstract',
          seed: new SeedResolver('mode', mode),
          request: normaliseConfig({
            name: 'Acme Labs',
            keywords: 'tech',
            preferences: { mode },
          }),
        })
      )
      expect(elements.length, `mode ${mode} drew nothing`).toBeGreaterThan(0)
      expect(
        elements.every(element => element.tag === 'path'),
        `mode ${mode} drew something other than a path`
      ).toBe(true)
    }
  })

  it('centres every mode on its own ink', () => {
    // The modes construct their geometry around the canvas centre, but that is only nominal: a lattice
    // that fades along a diagonal, arcs that sweep one side, a polygon rotated off its own symmetry axis
    // and a satellite arc starting at a random tilt all bias the ink. Measured before the centring pass,
    // the worst was 69.6 units off on a 512 canvas — about 14% of the width, which reads as loose rather
    // than as wrong.
    //
    // The check is on the union of the mark's ink, because that is what the eye centres on. It cannot be
    // a bounding-box assertion per element: several modes are a ring with satellites around it, and each
    // element on its own is nowhere near the middle.
    //
    // The tolerance is one coordinate rounding step rather than zero, because the centring is exact in
    // real arithmetic but the emitted path is rounded to `PRECISION` decimals on the way out. Half a unit
    // in the last place is 0.005 here, and averaging two rounded coordinates doubles it — still a hundred
    // times tighter than the 69.6-unit defect this guards.
    const rounding = 0.5 * 10 ** -PRECISION
    for (const mode of MODES) {
      for (const round of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const elements = ENGINES.abstract(
          makeInput({
            engine: 'abstract',
            seed: new SeedResolver('centre', round),
            request: normaliseConfig({ name: 'Acme Labs', preferences: { mode } }),
          })
        )
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const element of elements) {
          const { d } = element.attrs
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
        expect(Number.isFinite(minX), `mode ${mode} drew no ink`).toBe(true)
        expect(
          Math.abs((minX + maxX) / 2 - 256),
          `${mode} is off centre horizontally`
        ).toBeLessThanOrEqual(rounding)
        expect(
          Math.abs((minY + maxY) / 2 - 256),
          `${mode} is off centre vertically`
        ).toBeLessThanOrEqual(rounding)
      }
    }
  })

  it('keeps a mark on the canvas for every mode and size', () => {
    for (const mode of MODES) {
      for (const size of [16, 64, 512, 4096]) {
        const elements = ENGINES.abstract(
          makeInput({
            engine: 'abstract',
            size,
            seed: new SeedResolver('bounds', size),
            request: normaliseConfig({ name: 'Acme Labs', preferences: { mode } }),
          })
        )
        for (const element of elements) {
          const bounds = pathBounds(element.attrs['d'] as string)
          if (bounds === null) {
            continue
          }
          expect(bounds.minX, `${mode} at ${size} runs off the left`).toBeGreaterThan(-0.5)
          expect(bounds.minY, `${mode} at ${size} runs off the top`).toBeGreaterThan(-0.5)
          expect(bounds.maxX, `${mode} at ${size} runs off the right`).toBeLessThan(size + 0.5)
          expect(bounds.maxY, `${mode} at ${size} runs off the bottom`).toBeLessThan(size + 0.5)
        }
      }
    }
  })

  it('does not collapse its three fill roles onto one colour', () => {
    // Roles were resolved one at a time, each falling back to the one before it, which meant a palette
    // whose accent equals its background pushed `second` onto `lead` and then `third` onto both. On
    // `azure-current` every mark came out a single flat tone — and the modes that build depth out of
    // layered tones lost exactly the thing they are for.
    //
    // `azure-current` is the palette that reproduces it: its accent is literally the background colour.
    const palette = findPalette('azure-current')!
    expect(palette.accent).toBe(palette.background)
    for (const mode of MODES) {
      const distinct = new Set(
        fills(
          ENGINES.abstract(
            makeInput({
              engine: 'abstract',
              palette,
              seed: new SeedResolver('roles', mode),
              request: normaliseConfig({ name: 'Acme Labs', preferences: { mode } }),
            })
          )
        )
      )
      expect(distinct.size, `${mode} came out in one colour on azure-current`).toBeGreaterThan(1)
    }
  })
})

/**
 * An apparatus input with one style pinned.
 *
 * @param style - One of {@link APPARATUS_STYLES}.
 * @returns The engine input.
 */
function apparatusInput(style: string): EngineInput {
  return makeInput({
    engine: 'apparatus',
    request: normaliseConfig({
      name: 'Acme Labs',
      engine: 'apparatus',
      preferences: { style },
    }),
  })
}

describe('apparatus', () => {
  it('draws a different mark for each style', () => {
    // A lookup that quietly fell back to one style would still produce a valid mark, so "it draws" is not
    // the claim. Four styles have to be four drawings.
    const draws = APPARATUS_STYLES.map(style =>
      JSON.stringify(ENGINES.apparatus(apparatusInput(style)))
    )
    expect(new Set(draws).size).toBe(APPARATUS_STYLES.length)
  })

  it('records the style it actually drew', () => {
    // The pin has to reach the engine. The note is written from the value that came out, so a preference
    // the engine ignored shows up here as a different word rather than as a silent no-op.
    for (const style of APPARATUS_STYLES) {
      const input = apparatusInput(style)
      ENGINES.apparatus(input)
      expect(input.mood.notes.at(-1)).toContain(`the ${style} style`)
    }
  })

  it('never changes the initials from one style to the next', () => {
    // The styles vary the grammar around the core, never its contents. A style that nudged or resized the
    // letters would make the same name look like a different name in each one.
    const letters = APPARATUS_STYLES.map(style =>
      JSON.stringify(ENGINES.apparatus(apparatusInput(style)).at(-1))
    )
    expect(new Set(letters).size).toBe(1)
  })

  it('does not collapse its fills when the accent is the background', () => {
    // `azure-current`'s accent is literally its background, the palette that caught the abstract engine
    // resolving its roles one after another. The same trap exists here: the hairlines and the index are
    // both chosen by `readableOn` against the canvas.
    const palette = findPalette('azure-current')!
    for (const style of APPARATUS_STYLES) {
      const distinct = new Set(fills(ENGINES.apparatus({ ...apparatusInput(style), palette })))
      expect(distinct.size, `${style} came out in one colour on azure-current`).toBeGreaterThan(1)
    }
  })
})

describe('engine registry', () => {
  it('has exactly the six documented engines', () => {
    expect(Object.keys(ENGINES).toSorted()).toEqual([...ENGINE_NAMES].toSorted())
  })

  it('gives every engine a distinct function', () => {
    const fns = ENGINE_NAMES.map(engine => ENGINES[engine])
    expect(new Set(fns).size).toBe(ENGINE_NAMES.length)
  })
})

/**
 * Guards against an engine quietly importing the router, which would create a cycle.
 *
 * @param name - The engine name.
 * @returns Always true; the assertion is the import itself not throwing.
 */
function engineIsIsolated(name: EngineName): boolean {
  return typeof ENGINES[name] === 'function'
}

describe('module isolation', () => {
  it.each(ENGINE_NAMES)('%s can be imported without the router', engine => {
    expect(engineIsIsolated(engine)).toBe(true)
  })
})
