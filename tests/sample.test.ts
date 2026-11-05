import { describe, expect, it } from 'vitest'
import { discPath, ringPath } from '../src/geometry'
import {
  flatten,
  isPainted,
  neighbourCount,
  sampleGlyph,
  scanIntervals,
  windingNumber,
} from '../src/sample'
import { pathBounds } from '../src/path'

/**
 * The ink sampler.
 *
 * Two engines draw from this module, and both of them decide what is inside a glyph by asking its
 * winding number rather than by counting contours 鈥?so the ring case below is the one that matters:
 * a counter has to come back open even though a point inside it is inside the outer contour too.
 */

describe('flatten', () => {
  it('turns a closed rectangle into four edges', () => {
    expect(flatten('M 0 0 L 10 0 L 10 10 L 0 10 Z')).toHaveLength(4)
  })

  it('closes a sub-path that relies on Z rather than an explicit line home', () => {
    // Without the closing edge the top of the rectangle would not count as inside at all.
    const edges = flatten('M 0 0 L 10 0 L 10 10 L 0 10 Z')
    expect(
      edges.some(edge => edge.x1 === 0 && edge.y1 === 10 && edge.x2 === 0 && edge.y2 === 0)
    ).toBe(true)
  })

  it('samples a cubic into several straight edges', () => {
    const edges = flatten('M 0 0 C 10 0 20 10 20 20')
    expect(edges.length).toBeGreaterThan(1)
  })
})

describe('windingNumber', () => {
  it('reports the inside of a solid disc as painted', () => {
    const disc = flatten(discPath(50, 50, 40))
    expect(windingNumber(disc, 50, 50)).not.toBe(0)
    expect(windingNumber(disc, 5, 50)).toBe(0)
  })

  it('reports the middle of a ring as open', () => {
    // The hole is a sub-path wound against its parent. Counting contours would call this painted.
    const ring = flatten(ringPath(50, 50, 40, 40, 10))
    expect(windingNumber(ring, 50, 50)).toBe(0)
    expect(windingNumber(ring, 50, 15)).not.toBe(0)
  })
})

describe('scanIntervals', () => {
  it('finds the single run through the middle of a disc', () => {
    const d = discPath(50, 50, 40)
    const bounds = pathBounds(d)
    expect(bounds).not.toBeNull()
    const intervals = scanIntervals(flatten(d), 50)
    expect(intervals).toHaveLength(1)
    const [start, end] = intervals[0] as [number, number]
    expect(start).toBeCloseTo(10, 0)
    expect(end).toBeCloseTo(90, 0)
  })

  it('finds two runs where the scanline crosses a ring', () => {
    const d = ringPath(50, 50, 40, 40, 10)
    const bounds = pathBounds(d)
    expect(bounds).not.toBeNull()
    const intervals = scanIntervals(flatten(d), 50)
    expect(intervals).toHaveLength(2)
    expect((intervals[0] as [number, number])[0]).toBeCloseTo(10, 0)
    expect((intervals[1] as [number, number])[1]).toBeCloseTo(90, 0)
  })

  it('finds nothing where the scanline misses the shape', () => {
    const d = discPath(50, 50, 40)
    const bounds = pathBounds(d)
    expect(bounds).not.toBeNull()
    expect(scanIntervals(flatten(d), 5)).toEqual([])
  })
})

describe('sampleGlyph', () => {
  it('puts a solid disc inside its own grid', () => {
    const sample = sampleGlyph(discPath(50, 50, 40), 5)
    expect(sample).not.toBeNull()
    expect(sample?.cells[2]?.[2]).toBe(true)
    expect(sample?.cells[0]?.[0]).toBe(false)
  })

  it('leaves a counter open', () => {
    const sample = sampleGlyph(ringPath(50, 50, 40, 40, 10), 9)
    expect(sample).not.toBeNull()
    // the grid's middle cell is the ring's hole
    expect(sample?.cells[4]?.[4]).toBe(false)
    // and the band itself is filled
    expect(sample?.cells[0]?.[4]).toBe(true)
  })

  it('follows the outline aspect rather than forcing a square', () => {
    const wide = sampleGlyph('M 0 0 L 40 0 L 40 10 L 0 10 Z', 5)
    expect(wide).not.toBeNull()
    expect((wide?.cols ?? 0) > (wide?.rows ?? 0)).toBe(true)
  })

  it('reports nothing for a path that encloses no area', () => {
    expect(sampleGlyph('', 8)).toBeNull()
    expect(sampleGlyph('M 5 5 L 5 5', 8)).toBeNull()
  })
})

describe('neighbourCount', () => {
  it('counts filled neighbours and stops at the grid edge', () => {
    const cells = [
      [true, true, false],
      [false, true, false],
      [false, false, false],
    ]
    expect(neighbourCount(cells, 1, 1)).toBe(2)
    expect(neighbourCount(cells, 0, 0)).toBe(2)
    expect(neighbourCount(cells, 2, 2)).toBe(1)
  })
})

describe('isPainted', () => {
  it('agrees with the winding rule it wraps', () => {
    const disc = flatten(discPath(50, 50, 40))
    expect(isPainted(disc, 50, 50)).toBe(true)
    expect(isPainted(disc, 5, 5)).toBe(false)
  })
})
