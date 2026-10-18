import { afterEach, describe, expect, it, vi } from 'vitest'
import { contrastRatio, readPaper, toRgb, worstContrast } from '../src/lib/contrast'

/**
 * Contrast measurement.
 *
 * The point of this module is to notice a mark that has been put somewhere it cannot be seen. A wrong
 * answer is worse than no answer: it would either stay quiet over an invisible mark or cry wolf over a
 * legible one, and both would teach the reader to ignore it. So the conversions are checked against
 * anchors whose correct values are known independently — WCAG's own worked examples, and the primaries
 * and backgrounds actually in the brain.
 */

/** A palette ink from `palettes.json`, against the pale ground it was designed for. */
const INK_ON_PAPER = '#1c1917'
const PAPER = '#faf7f0'

describe('toRgb', () => {
  it('reads the hex forms the generator emits', () => {
    expect(toRgb('#fff')).toEqual([255, 255, 255])
    expect(toRgb('#451a03')).toEqual([69, 26, 3])
    expect(toRgb('#000000')).toEqual([0, 0, 0])
  })

  it('reads the forms a browser computes', () => {
    expect(toRgb('rgb(20, 26, 38)')).toEqual([20, 26, 38])
    expect(toRgb('rgba(20, 26, 38, 0.72)')).toEqual([20, 26, 38])
    expect(toRgb('color(srgb 0.078 0.102 0.149)')).toEqual([20, 26, 38])
  })

  it('converts the oklch the paper tokens are written in', () => {
    // `oklch(1 0 0)` is white by definition, so the conversion has no room to be approximate here — it
    // either lands on 255 or it is wrong. `--paper-light` is `oklch(0.995 0 0)`, which is *not* white: it
    // is a hair under it, and 253 is the right answer rather than a rounding artefact.
    expect(toRgb('oklch(1 0 0)')).toEqual([255, 255, 255])
    expect(toRgb('oklch(0.995 0 0)')).toEqual([253, 253, 253])
    expect(toRgb('oklch(0 0 0)')).toEqual([0, 0, 0])
  })

  it('converts a real paper token to something dark', () => {
    // `--paper-dark: oklch(0.19 0.006 265)`. The exact channels matter less than the fact that they are
    // dark, which is the whole reason the warning exists; 20-ish is what that lightness produces.
    const rgb = toRgb('oklch(0.19 0.006 265)')
    expect(rgb).not.toBeNull()
    expect(Math.max(...(rgb ?? [255, 255, 255]))).toBeLessThan(90)
  })

  it('says so rather than guessing at a form it does not know', () => {
    expect(toRgb('var(--paper-dark)')).toBeNull()
    expect(toRgb('')).toBeNull()
  })

  it('reads the percentage forms of oklch as well', () => {
    // `oklch(20% 0.006 265)` and `oklch(0.2 0.006 265)` are the same colour, and which one a browser
    // serialises depends on how it was authored. The paper tokens use plain numbers today; this is what
    // makes that a detail of the token sheet rather than a rule the measurement has come to depend on.
    expect(toRgb('oklch(20% 0.006 265)')).toEqual(toRgb('oklch(0.2 0.006 265)'))
    // Chroma's percentage scale is not lightness's: 100% of it is 0.4, which is the whole reason the two
    // are not parsed alike.
    expect(toRgb('oklch(0.5 10% 120)')).toEqual(toRgb('oklch(0.5 0.04 120)'))
  })
})

describe('readPaper', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns nothing when there is no document to read from', () => {
    // The guard is for a runtime with no DOM at all. It is one line, and an unhandled `getComputedStyle`
    // in that situation is a crash rather than an absent measurement.
    vi.stubGlobal('document', null)
    expect(readPaper('dark')).toBe('')
  })

  it('returns nothing when the token is not loaded', () => {
    // Which is also the app's state before the stylesheet applies, or if it never does. Staying quiet is
    // the only honest answer there: there is no surface to measure against.
    document.documentElement.style.setProperty('--paper-dark', 'oklch(0.19 0.006 265)')
    expect(readPaper('dark')).not.toBe('')
    document.documentElement.style.removeProperty('--paper-dark')
    expect(readPaper('dark')).toBe('')
  })
})

describe('contrastRatio', () => {
  it('reproduces the extremes WCAG defines', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#451a03', '#451a03')).toBeCloseTo(1, 5)
  })

  it('is the same whichever way round the two colours are given', () => {
    expect(contrastRatio(INK_ON_PAPER, PAPER)).toBeCloseTo(contrastRatio(PAPER, INK_ON_PAPER), 10)
  })

  it('shows the reported case as unreadable', () => {
    // The bug as reported: a `#451a03` mark on the dark paper token. Measured, not asserted by eye —
    // this is the number the warning is built on.
    const onDark = contrastRatio('#451a03', 'oklch(0.19 0.006 265)')
    const onLight = contrastRatio('#451a03', PAPER)
    expect(onDark).not.toBeNull()
    expect(onLight).not.toBeNull()
    // Unreadable on the dark sheet, and comfortable on the light one.
    expect(onDark ?? 99).toBeLessThan(1.5)
    expect(onLight ?? 0).toBeGreaterThan(10)
  })

  it('returns nothing when a colour cannot be read', () => {
    expect(contrastRatio('rebeccapurple', PAPER)).toBeNull()
    expect(contrastRatio(INK_ON_PAPER, 'nonsense')).toBeNull()
  })
})

describe('worstContrast', () => {
  it('reports the least legible colour, not the average', () => {
    // A mark that is mostly comfortable dark ink with one pale shape in it. Averaging the three would put
    // the answer comfortably above the threshold and the vanishing shape would go unmentioned, which is
    // precisely the failure this function exists to catch.
    const inks = ['#1c1917', '#1c1917', '#fef3c7']
    const worst = worstContrast(inks, PAPER)
    expect(worst).toBeCloseTo(contrastRatio('#fef3c7', PAPER) ?? -1, 10)
    // The two halves of that claim, so the fixture cannot quietly stop being the case it describes.
    expect(contrastRatio('#1c1917', PAPER) ?? 0).toBeGreaterThan(10)
    expect(worst ?? 99).toBeLessThan(1.5)
  })

  it('returns nothing for a mark with no readable colour', () => {
    expect(worstContrast([], PAPER)).toBeNull()
    expect(worstContrast(['nonsense'], PAPER)).toBeNull()
  })
})
