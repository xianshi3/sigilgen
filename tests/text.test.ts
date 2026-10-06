import { describe, expect, it } from 'vitest'
import { measureText, textPath } from '../src/text'
import { findFont } from '../src/brain/index'
import { fitText, naturalWidth } from '../src/engines/metrics'
import { polar } from '../src/geometry'
import type { FontEntry } from '../src/types'

const font: FontEntry = findFont('orbit-grotesk')!

describe('measureText', () => {
  it('measures a single glyph as its advance', () => {
    expect(measureText(font, 'A', 1).width).toBe(font.metrics.advance['A'])
  })

  it('measures a run as the sum of its advances', () => {
    expect(measureText(font, 'ABC', 1).width).toBe(
      (font.metrics.advance['A'] ?? 0) +
        (font.metrics.advance['B'] ?? 0) +
        (font.metrics.advance['C'] ?? 0)
    )
  })

  it('scales linearly', () => {
    expect(measureText(font, 'ACME', 2).width).toBeCloseTo(measureText(font, 'ACME', 1).width * 2)
  })

  it('reports the cap height scaled', () => {
    expect(measureText(font, 'A', 0.5).height).toBe(font.metrics.capHeight * 0.5)
  })

  it('measures an empty run as zero width', () => {
    expect(measureText(font, '', 1).width).toBe(0)
  })

  it('accepts an explicit tracking value', () => {
    expect(measureText(font, 'AB', 1, 100).width).toBe(measureText(font, 'AB', 1).width + 200)
  })
})

describe('textPath', () => {
  it('concatenates the sub-paths of every drawable glyph', () => {
    // A glyph is several sub-paths (a leg, a crossbar), so the count is the sum of its parts rather
    // than one per letter. Two runs of the same letter must differ by exactly that.
    const countOf = (letters: string): number =>
      (textPath(font, letters, 0, 0, 1).match(/M/g) ?? []).length
    const one = countOf('A')
    expect(one).toBeGreaterThan(0)
    expect(countOf('AA')).toBe(one * 2)
  })

  it('returns an empty string for an empty run', () => {
    expect(textPath(font, '', 0, 0, 1)).toBe('')
  })

  it('skips glyphs the font does not define rather than substituting', () => {
    // Silently substituting a wrong letter would be worse than a visible gap. Digits are not in the
    // brain, so `A1B` must render exactly as `AB`.
    expect(textPath(font, 'A1B', 0, 0, 1)).toBe(textPath(font, 'AB', 0, 0, 1))
  })

  it('emits only safe absolute commands', () => {
    expect(textPath(font, 'ACME', 3, 7, 0.2)).toMatch(/^[MLCZ0-9.,\- ]+$/)
  })

  it('places the cap top at the given y, so the baseline sits one cap height below', () => {
    const top = 100
    const scale = 0.1
    const cap = font.metrics.capHeight * scale
    // Parse per command and keep only the second number of each coordinate pair. Collecting every
    // number in the string would mix x and y and describe a diagonal that does not exist.
    const ys: number[] = []
    for (const segment of textPath(font, 'I', 0, top, scale).match(/[MLC][^MLCZ]*/g) ?? []) {
      const numbers = (segment.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      for (let index = 1; index < numbers.length; index += 2) {
        ys.push(numbers[index] as number)
      }
    }
    // Glyphs are inset from the cap line by half a stroke and carry round terminals that overhang it,
    // so this checks a band: ink starts at the cap top and runs one cap height down to the baseline.
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    // Ink begins at or just below the cap top (glyphs are inset by half a stroke) and ends at or just
    // past the baseline (round terminals overhang it).
    expect(minY).toBeGreaterThanOrEqual(top - 1)
    expect(minY).toBeLessThan(top + cap * 0.1)
    expect(maxY).toBeGreaterThan(top + cap * 0.9)
    expect(maxY).toBeLessThanOrEqual(top + cap * 1.15)
  })

  it('advances each glyph by its own advance', () => {
    const single = textPath(font, 'W', 0, 0, 1)
    const pair = textPath(font, 'WW', 0, 0, 1)
    expect(pair.length).toBeGreaterThan(single.length)
  })
})

describe('normalWidth', () => {
  it('is zero for an empty run', () => {
    expect(naturalWidth(font, '')).toBe(0)
  })

  it('adds tracking per gap between glyphs', () => {
    expect(naturalWidth(font, 'ABC', 10)).toBe(naturalWidth(font, 'ABC') + 30)
  })
})

describe('polar', () => {
  it('measures clockwise from the positive x axis, matching screen coordinates', () => {
    expect(polar(0, 0, 10, 0)).toEqual({ x: 10, y: 0 })
    expect(polar(0, 0, 10, 90).y).toBeCloseTo(10)
    expect(polar(0, 0, 10, 180).x).toBeCloseTo(-10)
    expect(polar(0, 0, 10, 270).y).toBeCloseTo(-10)
  })

  it('respects the centre', () => {
    expect(polar(50, 60, 10, 0)).toEqual({ x: 60, y: 60 })
  })

  it('handles a zero radius', () => {
    expect(polar(7, 8, 0, 45).x).toBeCloseTo(7)
  })
})

describe('fitText integration', () => {
  it('never exceeds the box it is given', () => {
    for (const letters of ['A', 'ACME', 'NORTHWIND', 'MMMMMMMM']) {
      const fitted = fitText(font, letters, 100, 0, 80, 30)
      expect(fitted.width, letters).toBeLessThanOrEqual(80.01)
      expect(fitted.height, letters).toBeLessThanOrEqual(30.01)
    }
  })

  it('produces a path whose geometry matches the reported metrics', () => {
    const fitted = fitText(font, 'ACME', 200, 0, 300, 100)
    const d = textPath(font, 'ACME', fitted.left, fitted.top, fitted.scale)
    expect(d).not.toBe('')
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    expect(Math.max(...numbers)).toBeLessThanOrEqual(fitted.left + fitted.width + 1)
  })
})
