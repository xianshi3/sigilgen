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
    // rather than on the desk behind it.
    for (const [backdrop, expected] of [
      ['light', 'var(--paper-light)'],
      ['dark', 'var(--paper-dark)'],
      ['board', 'var(--paper-checker-b)'],
    ] as const) {
      act(() => {
        useStudio.setState({ backdrop })
      })
      const { container } = render(
        <I18nProvider initialLocale="en">
          <Stage concept={aConcept()} errorKey={null} errorDetail={null} />
        </I18nProvider>
      )
      expect(container.querySelector('.rounded-panel')?.className).toContain(expected)
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
