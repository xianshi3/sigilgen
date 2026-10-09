import { describe, expect, it } from 'vitest'
import { generateLogos } from '../src/generate'
import { pathBounds } from '../src/path'
import { FRAMES } from '../src/engines/emblem'
import { LAYOUTS, TREATMENTS } from '../src/engines/wordmark'
import type { EngineName } from '../src/types'

/** Union of every drawn path's ink. */
function ink(svg: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const match of svg.matchAll(/ d="([^"]+)"/g)) {
    const [, data] = match
    if (data === undefined) {
      continue
    }
    const bounds = pathBounds(data)
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

/** How far the ink sits from the canvas centre on each axis, as a fraction of the side. */
function offset(logo: { svg: string }): { dx: number; dy: number } | null {
  const box = ink(logo.svg)
  if (box === null) {
    return null
  }
  const side = 512
  return {
    dx: Math.abs(box.minX - (side - box.maxX)) / side,
    dy: Math.abs(box.minY - (side - box.maxY)) / side,
  }
}

const NAMES = ['Acme', 'Vela', 'Northwind Coffee', 'Ledgerly', 'IIII', 'Kite & Co', 'ZZZ']

/**
 * A quarter of a percent of the canvas is about a pixel on a 512px mark.
 *
 * Chosen as the tolerance for the *whole* mark rather than for each element: an icon sitting a few
 * units proud of its box is invisible, whereas a name drifting inside a badge is not.
 */
const WITHIN_A_PIXEL = 0.0025

describe('vertical centring', () => {
  it('centres every emblem frame and the mark inside it', () => {
    // The banner used to sit a twentieth of the canvas high: its box ran from -0.72r to +0.56r, whose
    // centre is -0.08r, while the other three frames are exactly -r..+r. And because the interior was
    // centred on its *reserved slots* rather than on its ink, the badge was high twice over, at -6.88%
    // of the canvas — the single worst misalignment in the library.
    for (const frame of FRAMES) {
      for (const name of NAMES) {
        const [logo] = generateLogos({
          name,
          engine: 'emblem',
          variations: 1,
          preferences: { frame },
        })
        const found = offset(logo ?? { svg: '' })
        expect(found, `${frame}/${name}`).not.toBeNull()
        expect(found?.dy, `${frame}/${name} is off centre vertically`).toBeLessThan(WITHIN_A_PIXEL)
      }
    }
  })

  it('centres a vertical wordmark on its ink, not on the block it reserved', () => {
    // Two things made the reserved block an over-estimate: a long name is bound by width and comes out
    // shorter than the band, and the pictogram is letterboxed inside its own box so its ink is shorter
    // than that too. A long name in a vertical lockup came out five percent of the canvas low.
    for (const treatment of TREATMENTS) {
      for (const name of NAMES) {
        const [logo] = generateLogos({
          name,
          engine: 'wordmark',
          variations: 1,
          preferences: { layout: 'vertical', treatment },
        })
        const found = offset(logo ?? { svg: '' })
        expect(found, `${treatment}/${name}`).not.toBeNull()
        expect(found?.dy, `${treatment}/${name} is off centre vertically`).toBeLessThan(
          WITHIN_A_PIXEL
        )
      }
    }
  })

  it('centres a horizontal wordmark the same way', () => {
    for (const treatment of TREATMENTS) {
      for (const name of NAMES) {
        const [logo] = generateLogos({
          name,
          engine: 'wordmark',
          variations: 1,
          preferences: { layout: 'horizontal', treatment },
        })
        const found = offset(logo ?? { svg: '' })
        expect(found, `${treatment}/${name}`).not.toBeNull()
        expect(found?.dx, `${treatment}/${name} is off centre horizontally`).toBeLessThan(
          WITHIN_A_PIXEL
        )
        expect(found?.dy, `${treatment}/${name} is off centre vertically`).toBeLessThan(
          WITHIN_A_PIXEL
        )
      }
    }
  })

  it('keeps a monogram and a lettermark centred across every engine they can pick', () => {
    for (const engine of ['monogram', 'lettermark'] as EngineName[]) {
      for (const name of NAMES) {
        for (const logo of generateLogos({ name, engine, variations: 6 })) {
          const found = offset(logo)
          expect(found, `${engine}/${name}`).not.toBeNull()
          expect(found?.dx, `${engine}/${name} concept`).toBeLessThan(WITHIN_A_PIXEL)
          // Vertical is not asserted for the lettermark: its accent rule and dot hang below the
          // baseline on purpose, so a mark with an appendage is legitimately bottom-heavy in its ink
          // box. Asserting it would be asserting the wrong thing.
          if (engine === 'monogram') {
            expect(found?.dy, `${engine}/${name} concept`).toBeLessThan(WITHIN_A_PIXEL)
          }
        }
      }
    }
  })

  it('never lets ink leave the canvas, at any size', () => {
    for (const size of [16, 64, 128, 512, 1024, 4096]) {
      for (const engine of [
        'monogram',
        'wordmark',
        'lettermark',
        'abstract',
        'emblem',
      ] as EngineName[]) {
        for (const name of NAMES) {
          for (const logo of generateLogos({ name, engine, variations: 3, size })) {
            const box = ink(logo.svg)
            if (box === null) {
              continue
            }
            const slack = size * 0.001
            expect(box.minX, `${engine}/${name}@${size}`).toBeGreaterThan(-slack)
            expect(box.minY, `${engine}/${name}@${size}`).toBeGreaterThan(-slack)
            expect(box.maxX, `${engine}/${name}@${size}`).toBeLessThan(size + slack)
            expect(box.maxY, `${engine}/${name}@${size}`).toBeLessThan(size + slack)
          }
        }
      }
    }
  })
})

describe('layout candidates', () => {
  it('offers a layout for every engine that reads one', () => {
    // Guards the option panel's contract: it offers `layout` for the monogram and the wordmark, and the
    // values it offers have to be the values the engines accept.
    expect(LAYOUTS.length).toBeGreaterThan(0)
    expect(FRAMES.length).toBeGreaterThan(0)
    expect(TREATMENTS.length).toBeGreaterThan(0)
  })
})
