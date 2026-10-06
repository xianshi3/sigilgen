import { describe, expect, it } from 'vitest'
import { measureText, textPath } from '../src/text'
import { findFont, FONTS } from '../src/brain/index'
import { fitText, naturalWidth } from '../src/engines/metrics'
import { pathBounds } from '../src/path'
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

  it('draws no letter the font does not define, rather than substituting one', () => {
    // Silently substituting a wrong letter would be worse than a gap. Digits are not in the brain, so
    // `A1B` must contribute exactly the sub-paths of `A` and `B` and nothing else.
    const drawn = (letters: string): number =>
      (textPath(font, letters, 0, 0, 1).match(/M/g) ?? []).length
    expect(drawn('A1B')).toBe(drawn('AB'))
  })

  it('advances past a letter it cannot draw, so measuring and drawing agree', () => {
    // The two functions have to agree or the run is laid out wider than it is drawn and the ink ends
    // up off centre by half the difference. Measuring the gap and then not leaving it was exactly that
    // bug: a wordmark's name was measured with a space and drawn without one, which both ran the two
    // words together and pushed the mark off centre.
    const gap = measureText(font, '1', 1).width
    expect(gap).toBeGreaterThan(0)
    expect(measureText(font, 'A1B', 1).width - measureText(font, 'AB', 1).width).toBeCloseTo(gap)

    // The ink must actually move: `B` sits one advance further right in `A1B` than in `AB`.
    const inkOf = (letters: string) => pathBounds(textPath(font, letters, 0, 0, 1))!
    expect(inkOf('A1B').maxX - inkOf('AB').maxX).toBeCloseTo(gap)
    expect(inkOf('A1B').minX).toBeCloseTo(inkOf('AB').minX)
  })

  it('leaves a word space between the words of a multi-word name', () => {
    // The brain carries no space glyph, so this is the whole reason an undrawable letter has to leave
    // its measured gap. Without it a two-word name was set as one: `NORTHWINDCOFFEE`.
    const inkOf = (letters: string) => pathBounds(textPath(font, letters, 0, 0, 1))!
    const tight = inkOf('AC').maxX - inkOf('AC').minX
    const spaced = inkOf('A C').maxX - inkOf('A C').minX
    expect(spaced).toBeGreaterThan(tight)
    // A word space is a fraction of an em, not the full capital it would fall back to.
    expect(measureText(font, ' ', 1).width).toBeLessThan(font.metrics.capHeight)
    expect(measureText(font, ' ', 1).width).toBeGreaterThan(font.metrics.capHeight * 0.15)
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

describe('horizontal centring', () => {
  /**
   * How far the ink of a fitted run sits from where it was asked to be centred, as a fraction of the
   * canvas. This is the invariant behind "the logo looks aligned", and it is measurable rather than a
   * matter of taste: the ink is the only thing a reader sees, so the ink is what has to be centred.
   */
  const drift = (entry: FontEntry, letters: string, tracking: number): number => {
    const centre = 256
    const fitted = fitText(entry, letters, centre, 0, 400, 200, tracking)
    const bounds = pathBounds(textPath(entry, letters, fitted.left, 0, fitted.scale, tracking))
    if (bounds === null) {
      throw new Error(`no ink for ${entry.id} / ${letters}`)
    }
    return Math.abs((bounds.minX + bounds.maxX) / 2 - centre) / 512
  }

  it('centres the ink, not just the advance box, for every typeface', () => {
    // Tracking is the interesting case: the last letter's advance is counted but its glyph stops at
    // the bearing, so centring the advance box leaves the ink half a tracking unit off. Untracked runs
    // are checked too, because equal bearings should already make those exact.
    const worst = Math.max(
      ...FONTS.flatMap(entry => [drift(entry, 'ACME', 0), drift(entry, 'NORTHWIND COFFEE', 0)])
    )
    // A quarter of a percent of the canvas is about a pixel on a 512px mark.
    expect(worst).toBeLessThan(0.0025)
  })

  it('centres the ink under tight and loose tracking alike', () => {
    const worst = Math.max(
      ...FONTS.flatMap(entry => [
        drift(entry, 'ACME', -120),
        drift(entry, 'ACME', 120),
        drift(entry, 'NORTHWIND COFFEE', -90),
        drift(entry, 'NORTHWIND COFFEE', 90),
      ])
    )
    expect(worst).toBeLessThan(0.0025)
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
