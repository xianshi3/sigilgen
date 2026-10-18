import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { useStudio } from '../src/store/useStudio'
import { NARROW_QUERY } from '../src/hooks/useMediaQuery'
import { Stage } from '../src/components/stage/Stage'
import { ConceptStrip } from '../src/components/stage/ConceptStrip'
import { Disclosure } from '../src/components/primitives/Disclosure'
import { generate } from '../src/lib/generate'
import type { LogoResult } from '@sigilgen/types'

/**
 * The stage and the strip around it.
 *
 * These are composition decisions rather than behaviour, so the assertions are about the properties that
 * carry them: the mark sits on a bounded sheet rather than filling the viewport, and the controls that
 * surround it are large enough to hit. Numbers where a number is the point — a touch target has a
 * minimum — because "looks big enough" is exactly the judgement that produced a 20px row in the first
 * place.
 */

/** Installs a `matchMedia` that never matches, so the studio renders at desktop width. */
function wideViewport(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        get matches(): boolean {
          return query !== NARROW_QUERY
        },
        media: query,
        onchange: null,
        addEventListener: (): void => {},
        removeEventListener: (): void => {},
        addListener: (): void => {},
        removeListener: (): void => {},
        dispatchEvent: (): boolean => false,
      }) as unknown as MediaQueryList,
  })
}

/** One real generated concept, so the stage renders the same markup it renders in the app. */
function aConcept(): LogoResult | undefined {
  return generate({
    name: 'Northwind',
    keywords: 'tech',
    engine: 'abstract',
    variations: 1,
    seed: 3,
  }).concepts[0]
}

beforeEach(() => {
  localStorage.clear()
  wideViewport()
  act(() => {
    useStudio.setState({ zoom: 'fit', backdrop: 'light' })
  })
})

describe('Stage', () => {
  it('draws the mark on a sheet, not edge to edge', () => {
    // An edge-to-edge fill puts the artwork in the middle of a large undifferentiated rectangle, and
    // the eye reads that as an unfinished canvas. The sheet gives the artwork a boundary.
    const { container } = render(
      <I18nProvider initialLocale="en">
        <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    const paper = container.querySelector('.rounded-panel')
    expect(paper, 'no rounded sheet in the stage').not.toBeNull()
    // Square, so a mark is never stretched by the shape of its container.
    expect(paper?.className).toContain('aspect-square')
  })

  it('keeps the sheet inside a margin rather than touching the stage edges', () => {
    const { container } = render(
      <I18nProvider initialLocale="en">
        <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    const stage = container.firstElementChild
    expect(stage?.className).toMatch(/p-5/)
  })

  it('carries the backdrop onto the sheet, not the stage', () => {
    // The backdrop is the surface the palette's colours were chosen against, so it belongs on the paper
    // rather than on the desk behind it. `data-paper` is the second half of the same claim: the sheet's
    // own ink and its selection outline are chosen from the paper rather than from the theme, so the
    // element has to say which sort of paper it is. It did not, and the empty state drawn on it measured
    // 1.45:1 in one theme/backdrop pairing.
    for (const [backdrop, expected, paper] of [
      ['light', 'var(--paper-light)', 'light'],
      ['dark', 'var(--paper-dark)', 'dark'],
      ['board', 'var(--paper-checker-b)', 'light'],
    ] as const) {
      act(() => {
        useStudio.setState({ backdrop })
      })
      const { container } = render(
        <I18nProvider initialLocale="en">
          <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
        </I18nProvider>
      )
      const sheet = container.querySelector('.rounded-panel')
      expect(sheet?.className).toContain(expected)
      expect(sheet?.getAttribute('data-paper')).toBe(paper)
    }
  })

  it('shows the mark as a real image with an alt naming the engine and palette', () => {
    const concept = aConcept()
    render(
      <I18nProvider initialLocale="en">
        <Stage concept={concept} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    const image = screen.getByRole('img')
    // An `<svg>` names itself with `aria-label`, not `alt` — `alt` is an `<img>` attribute and would be
    // invalid markup on a container element.
    expect(image.getAttribute('aria-label')).toContain(concept?.engine ?? '')
    expect(image.getAttribute('aria-label')).toContain(concept?.palette.id ?? '')
  })

  it('fills the sheet in fit mode, so the mark is never letterboxed', () => {
    // Guards the class that makes the SVG fill its parent. A `scale` animation on the wrapper shrank
    // the SVG's rendered box below the size its viewBox expected, so the content letterboxed instead of
    // filling the sheet — but jsdom reports no layout, so that particular regression is caught by
    // inspecting the live page rather than here. What this does catch is the class going wrong, which
    // is the other way to break the same thing.
    //
    // `getAttribute('class')` rather than `.className`: on an SVG element `className` is an
    // `SVGAnimatedString`, not a string, so the property reads as an object and the assertion fails.
    act(() => {
      useStudio.setState({ zoom: 'fit' })
    })
    const { container, rerender } = render(
      <I18nProvider initialLocale="en">
        <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    // `getAttribute('class')` rather than `.className`: on an SVG element `className` is an
    // `SVGAnimatedString`, not a string, so the property reads as an object and the assertion fails.
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('h-full')
    expect(svg?.getAttribute('class')).toContain('w-full')

    // Away from fit the SVG is sized as a percentage of the stage, so it can grow past the sheet.
    act(() => {
      useStudio.setState({ zoom: 2 })
    })
    rerender(
      <I18nProvider initialLocale="en">
        <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    const zoomed = container.querySelector('svg')
    expect(zoomed?.getAttribute('class')).toContain('max-h-none')
    expect(zoomed?.style.width).toBe('200%')
  })

  it('sizes the sheet as min(width, height) so it stays square', () => {
    // The sheet has to be a square that fits whichever axis runs out first. Neither `aspect-square`
    // nor a percentage can express that: `width: 100%` only ever resolves against the width, and
    // `aspect-ratio` is ignored once both axes are constrained — and a flex item's width is settled by
    // the flex algorithm before aspect-ratio runs at all. `w-full max-h-full` therefore produced a
    // 1376x635 "square" on a wide stage, which letterboxed the mark at fit and broke zoom centring.
    //
    // jsdom resolves no layout, so this guards the declaration rather than the rendered box; the
    // rendered box was confirmed by measuring the live stage at each limit (1200x400 -> 400,
    // 300x800 -> 300, 600x600 -> 600, each centred to the pixel).
    const { container } = render(
      <I18nProvider initialLocale="en">
        <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    const sheet = container.querySelector('.rounded-panel')
    expect(sheet?.className).toContain('w-[min(100cqw,100cqh)]')
    // The units resolve against the stage, which must therefore be a size container in both axes.
    // `container-type: inline-size` only contains the inline axis, and `cqh` silently falls back to
    // the small viewport — the sheet then came out the height of the window rather than the stage.
    expect(container.firstElementChild?.className).toContain('[container-type:size]')
  })

  it('centres the mark inside the sheet at every zoom', () => {
    // Away from fit the SVG is smaller than the sheet, and a block child of a non-flex wrapper hugs
    // the left edge — so zooming out visibly threw the mark off-centre. The wrapper has to centre it.
    const { container, rerender } = render(
      <I18nProvider initialLocale="en">
        <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    const wrapper = container.querySelector('svg')?.parentElement
    expect(wrapper?.className).toContain('items-center')
    expect(wrapper?.className).toContain('justify-center')

    act(() => {
      useStudio.setState({ zoom: 0.75 })
    })
    rerender(
      <I18nProvider initialLocale="en">
        <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    expect(container.querySelector('svg')?.style.width).toBe('75%')
  })

  it('explains itself instead of showing a mark when there is none', () => {
    render(
      <I18nProvider initialLocale="en">
        <Stage concept={undefined} errorKey={null} errorDetail={null} />
      </I18nProvider>
    )
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText(/enter a name|brand name/i)).toBeTruthy()
  })
})

describe('ConceptStrip', () => {
  it('numbers every concept for a screen reader', () => {
    const concepts = generate({
      name: 'Northwind',
      keywords: 'tech',
      variations: 3,
      seed: 1,
    }).concepts
    render(
      <I18nProvider initialLocale="en">
        <ConceptStrip concepts={concepts} />
      </I18nProvider>
    )
    expect(screen.getByRole('button', { name: `1 of ${concepts.length}` })).toBeTruthy()
  })

  it('renders nothing rather than an empty bar when there are no concepts', () => {
    const { container } = render(
      <I18nProvider initialLocale="en">
        <ConceptStrip concepts={[]} />
      </I18nProvider>
    )
    expect(container.firstElementChild).toBeNull()
  })

  it('scrolls sideways rather than compressing past being clickable', () => {
    const concepts = generate({
      name: 'Northwind',
      keywords: 'tech',
      variations: 6,
      seed: 1,
    }).concepts
    const { container } = render(
      <I18nProvider initialLocale="en">
        <ConceptStrip concepts={concepts} />
      </I18nProvider>
    )
    expect(container.firstElementChild?.className).toContain('overflow-x-auto')
  })
})

describe('Disclosure', () => {
  it('gives its heading row a hit target worth hitting', () => {
    // Measured at 20px tall before, beside 32–35px controls. The row is the only way to reach 121
    // resources, so an easy-to-miss target is not a cosmetic problem.
    render(
      <Disclosure title="Palette" summary="Auto">
        <span>body</span>
      </Disclosure>
    )
    const button = screen.getByRole('button')
    expect(button.className).toContain('min-h-8')
    expect(button.className).toMatch(/-mx-2/)
  })

  it('opens and closes on click, and reports it', () => {
    render(
      <Disclosure title="Palette" summary="Auto">
        <span>body content</span>
      </Disclosure>
    )
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('body content')).toBeNull()
    // `fireEvent` rather than a bare `click()`: the native call dispatches outside React's batching, so the
    // state update has not flushed by the time the assertion runs.
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('body content')).toBeTruthy()
  })

  it('shows the heading and the summary but no body when it is not available', () => {
    render(
      <Disclosure title="Pictogram" summary="—" enabled={false}>
        <span>body content</span>
      </Disclosure>
    )
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Pictogram')).toBeTruthy()
    expect(screen.queryByText('body content')).toBeNull()
  })
})
