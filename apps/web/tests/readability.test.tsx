import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFile } from 'node:fs/promises'
import type { LogoResult } from '@sigilgen/types'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { useStudio } from '../src/store/useStudio'
import { Stage } from '../src/components/stage/Stage'
import { contrastRatio, MIN_CONTRAST, toRgb, worstContrast } from '../src/lib/contrast'
import { ALL_PALETTES, bestPaletteFor, palettesReadingOn } from '../src/lib/resources'
import { generate } from '../src/lib/generate'
import { parseSvgParts } from '../src/lib/svgParts'

/**
 * A mark that cannot be seen where it has been put.
 *
 * The studio offers a dark sheet to preview a mark against, and most of the curated palettes are drawn
 * for a pale one. Choosing both used to leave an empty-looking square with nothing to explain it. These
 * tests pin the two halves of the answer: the studio notices, and the studio offers rather than decides.
 *
 * The paper tokens are the real ones from the token sheet, written onto the document the way the
 * stylesheet would, so the measurement runs against the colours the app actually paints with rather than
 * against a convenient stand-in.
 */

/** The real token values, copied from `src/styles/tokens.css` and pinned there by the last test below. */
const PAPER_LIGHT = 'oklch(0.995 0 0)'
const PAPER_DARK = 'oklch(0.19 0.006 265)'

/** Near-black ink on a pale ground: the palette the reported bug was actually hit with. */
const PALE_SHEET_PALETTE = 'ink-monolith'

/** One real generated concept, in a palette that only reads on a pale sheet. */
function darkInkConcept(): LogoResult {
  const concept = generate({
    name: 'Northwind',
    keywords: 'tech, minimal',
    engine: 'abstract',
    palette: PALE_SHEET_PALETTE,
    variations: 1,
    seed: 3,
  }).concepts[0]
  if (concept === undefined) {
    throw new Error('the generator produced no concept, so this test has nothing to measure')
  }
  return concept
}

/** Every colour the mark is actually painted in, which is what legibility has to be judged on. */
function inksOf(concept: LogoResult): readonly string[] {
  return parseSvgParts(concept.svg)
    .parts.map(part => part.fill)
    .filter((fill): fill is string => fill !== null && fill !== 'none')
}

function renderStage(concept: LogoResult): void {
  render(
    <I18nProvider initialLocale="en">
      <Stage concept={concept} errorKey={null} errorDetail={null} />
    </I18nProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  act(() => {
    useStudio.setState({ backdrop: 'light', palette: '' })
  })
  const root = document.documentElement
  root.style.setProperty('--paper-light', PAPER_LIGHT)
  root.style.setProperty('--paper-dark', PAPER_DARK)
  root.style.setProperty('--paper-checker-b', 'oklch(0.87 0 0)')
})

describe('the paper tokens', () => {
  it('stay in a form the contrast measurement can read', async () => {
    // The measurement reads the sheet's colour out of the resolved custom properties rather than keeping
    // a second copy of it, which means a token written in a form `toRgb` does not understand would make
    // the notice silently stop working — no error, no warning, just an invisible mark and no notice.
    // This is the guard for that: it fails on the token sheet, where the change was made.
    const css = await readFile('src/styles/tokens.css', 'utf8')
    const declared = [
      ...css.matchAll(/--paper-(?:light|dark|checker-a|checker-b):\s*([^;]+);/g),
    ].map(match => (match[1] ?? '').trim())
    expect(declared).toHaveLength(4)
    for (const value of declared) {
      expect(
        toRgb(value),
        `--paper token "${value}" is not readable by the contrast module`
      ).not.toBeNull()
    }
  })
})

describe('pinning a palette', () => {
  it('moves the backdrop to the paper the palette was drawn for', () => {
    // The contradictory pair used to persist: a palette drawn for a pale page, viewed on the dark sheet,
    // reloading into the same state every time with an invisible mark and a notice as the only clue.
    act(() => {
      useStudio.setState({ backdrop: 'dark', palette: '' })
    })
    act(() => {
      useStudio.getState().setField('palette', 'signal-amber')
    })
    // `signal-amber` declares no background, so it belongs on a light page.
    expect(useStudio.getState().backdrop).toBe('light')
  })
})

describe('the readability notice', () => {
  it('says nothing while the mark can be seen', () => {
    renderStage(darkInkConcept())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps the notice off the artwork', () => {
    // The first version was on the sheet, which is the one place it must not be: at a 242px sheet it
    // covered 45.8% of the mark it was reporting on, and the smaller the sheet the worse the share. How
    // much it covers is layout and cannot be asserted here, but *which element contains it* is structure,
    // and structure is the part that was wrong.
    const { container } = render(
      <I18nProvider initialLocale="en">
        <Stage concept={darkInkConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    act(() => {
      useStudio.setState({ backdrop: 'dark' })
    })

    const notice = screen.getByRole('status')
    const sheet = container.querySelector('[class*="aspect-square"]')
    expect(sheet).not.toBeNull()
    expect(sheet?.contains(notice)).toBe(false)
  })

  it('says so when the mark cannot be seen, and shows the measured ratio', () => {
    const concept = darkInkConcept()
    act(() => {
      useStudio.setState({ backdrop: 'dark' })
    })
    renderStage(concept)

    const notice = screen.getByRole('status')
    const expected = worstContrast(inksOf(concept), PAPER_DARK)
    expect(expected).not.toBeNull()
    expect(expected ?? 99).toBeLessThan(MIN_CONTRAST)
    // The number on screen is the measurement of this mark, not a placeholder.
    expect(notice.textContent).toContain(`${(expected ?? 0).toFixed(1)}:1`)
  })

  it('offers a palette that reads there without applying it unasked', async () => {
    const user = userEvent.setup()
    act(() => {
      useStudio.setState({ backdrop: 'dark' })
    })
    renderStage(darkInkConcept())

    // The palette is a design decision, so a viewing choice must not make it. The reader is told and
    // offered the choice back.
    expect(useStudio.getState().palette).toBe('')

    await user.click(screen.getByRole('button', { name: /readable/i }))
    const chosen = useStudio.getState().palette
    expect(chosen).toBe(bestPaletteFor(PAPER_DARK)?.id)

    const palette = ALL_PALETTES.find(entry => entry.id === chosen)
    expect(palette).toBeDefined()
    // And the offer is honest: the palette it named is legible on this sheet, not merely different.
    expect(contrastRatio(palette?.primary ?? '#000000', PAPER_DARK) ?? 0).toBeGreaterThan(
      MIN_CONTRAST
    )
  })

  it('withdraws the offer when it would name the palette already in use', () => {
    // Then the sheet is the problem rather than the palette, and a button that changes nothing is worse
    // than no button. What is left is the information, and the backdrop control beside it.
    act(() => {
      useStudio.setState({ backdrop: 'dark', palette: bestPaletteFor(PAPER_DARK)?.id ?? '' })
    })
    renderStage(darkInkConcept())

    expect(screen.queryByRole('status')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /readable/i })).toBeNull()
  })

  it('disappears once the mark can be seen again', async () => {
    const concept = darkInkConcept()
    act(() => {
      useStudio.setState({ backdrop: 'dark' })
    })
    renderStage(concept)
    expect(screen.queryByRole('status')).not.toBeNull()

    act(() => {
      useStudio.setState({ backdrop: 'light' })
    })
    // It leaves rather than vanishing. The exit transition keeps the element mounted for a beat after
    // the state has changed, which is the whole point of it, so the assertion has to allow for that.
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull()
    })
  })

  it('stays quiet on a sheet it cannot read, rather than guessing', () => {
    // No tokens loaded — a test environment without the stylesheet, or a build where the sheet is not
    // styled. Warning on an unknown surface would be inventing a measurement.
    document.documentElement.style.removeProperty('--paper-dark')
    act(() => {
      useStudio.setState({ backdrop: 'dark' })
    })
    renderStage(darkInkConcept())
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('palettesReadingOn', () => {
  it('ranks by measured contrast, best first', () => {
    const ranked = palettesReadingOn(PAPER_DARK)
    expect(ranked.length).toBe(ALL_PALETTES.length)
    const ratios = ranked.map(entry => contrastRatio(entry.primary, PAPER_DARK) ?? 0)
    for (let index = 1; index < ratios.length; index++) {
      expect(ratios[index] ?? 0).toBeLessThanOrEqual(ratios[index - 1] ?? 0)
    }
  })

  it('picks the same palette every time', () => {
    // It names a palette a reader will be offered, so it has to be the same one on every machine and in
    // every locale. Anything collation-dependent here would fail that.
    expect(bestPaletteFor(PAPER_DARK)?.id).toBe(bestPaletteFor(PAPER_DARK)?.id)
    expect(palettesReadingOn(PAPER_DARK).map(entry => entry.id)).toEqual(
      palettesReadingOn(PAPER_DARK).map(entry => entry.id)
    )
  })

  it('ranks the pale palette low on the dark sheet and high on the pale one', () => {
    const rankedDark = palettesReadingOn(PAPER_DARK).map(entry => entry.id)
    const rankedLight = palettesReadingOn(PAPER_LIGHT).map(entry => entry.id)
    expect(rankedDark[0]).not.toBe(rankedLight[0])
    // The palette from the report is near the top on paper and near the bottom on the dark sheet, which
    // is the bug in one line.
    expect(rankedLight.indexOf(PALE_SHEET_PALETTE)).toBeLessThan(
      rankedDark.indexOf(PALE_SHEET_PALETTE)
    )
  })

  it('returns nothing when the surface is unknown', () => {
    expect(palettesReadingOn('')).toEqual([])
    expect(bestPaletteFor('not a colour')).toBeNull()
  })
})
