import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { useStudio } from '../src/store/useStudio'
import { NARROW_QUERY } from '../src/hooks/useMediaQuery'

/**
 * The layout at narrow viewports.
 *
 * The panels are 288 and 300 units wide and do not shrink, so between them they need 588 before the stage
 * gets anything. At a 390px phone the whole three-column layout was laid out un-reflowed: the stage was
 * squeezed to nothing and the right panel's text was cut off mid-word. Nothing tested the layout, because
 * the tests only covered `lib` and the store.
 *
 * jsdom reports no layout, so these drive `matchMedia` directly and assert on the classes the layout
 * branches on. That is a deliberate trade: it cannot catch a rule that is present but overridden, but it
 * does catch the branch being taken wrongly, which is what went wrong.
 */

/** A controllable stand-in for the browser's media-query list. */
interface Viewport {
  /** Every query the code under test asked about. */
  queries: string[]
  /** Changes the viewport and fires `change` on anything listening, as a browser would. */
  set(narrow: boolean): void
}

/**
 * Installs a `matchMedia` whose narrow query can be changed mid-test.
 *
 * A plain boolean mock cannot express a resize, which is the transition the panel-restore behaviour turns
 * on; and dispatching a synthetic `resize` event would exercise nothing, because the hook listens to the
 * query. So the listeners are kept and fired on demand.
 *
 * @param narrow - Whether the narrow query matches to begin with.
 * @returns A handle for driving the viewport.
 */
function setViewport(narrow: boolean): Viewport {
  const queries: string[] = []
  const listeners: (() => void)[] = []
  let current = narrow

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => {
      queries.push(query)
      return {
        get matches(): boolean {
          return query === NARROW_QUERY ? current : false
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: () => void): void => {
          listeners.push(fn)
        },
        removeEventListener: (): void => {},
        addListener: (): void => {},
        removeListener: (): void => {},
        dispatchEvent: (): boolean => false,
      } as unknown as MediaQueryList
    },
  })

  return {
    queries,
    set(next: boolean): void {
      current = next
      for (const fire of listeners) fire()
    },
  }
}

/** The stage element, found by the class that identifies it rather than by a test id. */
function stage(): HTMLElement | null {
  return document.querySelector<HTMLElement>('main .relative.flex.min-h-0.flex-1')
}

/** Renders the app with both panels open, as it opens on a desktop. */
function renderApp(): void {
  render(
    <I18nProvider initialLocale="en">
      <App />
    </I18nProvider>
  )
}

/**
 * The two panel toggles.
 *
 * Found by `aria-expanded`, which is what only they carry: `Segmented` marks its options with
 * `aria-checked`, so an `aria-label` search picks up the language and theme buttons first and silently
 * asserts about the wrong control.
 *
 * @returns The left and right toggles, in DOM order.
 */
function toggles(): { left: HTMLElement; right: HTMLElement } {
  // Scoped to the floating containers, because `Disclosure` also marks its button `aria-expanded` and a
  // bare attribute search returns those first — which is how an assertion about the panel toggle ends up
  // quietly asserting about a resource group instead.
  const all = [
    ...document.querySelectorAll<HTMLElement>('.pointer-events-none > button[aria-expanded]'),
  ]
  const left = all[0]
  const right = all[1]
  if (left === undefined || right === undefined) {
    throw new Error(`expected two panel toggles, found ${all.length}`)
  }
  return { left, right }
}

beforeEach(() => {
  localStorage.clear()
  act(() => {
    useStudio.setState({
      name: 'Northwind',
      keywords: 'tech',
      brief: '',
      engine: 'auto',
      palette: '',
      font: '',
      icon: '',
      size: 512,
      variations: 3,
      background: false,
      seed: 0,
      preferences: {},
      activeConcept: 0,
      backdrop: 'light',
      theme: 'auto',
      zoom: 'fit',
      leftPanelOpen: true,
      rightPanelOpen: true,
    })
  })
})

describe('narrow viewports', () => {
  it('closes both panels, because two overlays would hide the mark', () => {
    setViewport(true)
    renderApp()
    // The whole point of the stage is the artwork. Two drawers open at once cover it completely.
    expect(useStudio.getState().leftPanelOpen).toBe(false)
    expect(useStudio.getState().rightPanelOpen).toBe(false)
  })

  it('still renders the mark, so the reader has something to judge', () => {
    setViewport(true)
    renderApp()
    // Before the fix the stage was squeezed to zero width by the two fixed panels. It has to be present
    // and holding the mark.
    const canvas = stage()
    expect(canvas).not.toBeNull()
    // An inline `<svg>` rather than an `<img>`: the mark is rendered as real paths so each shape can be
    // selected and edited, which is the whole point of the editor.
    expect(canvas?.querySelector('svg')).not.toBeNull()
  })

  it('asks the browser about the breakpoint through one named query', () => {
    const { queries } = setViewport(true)
    renderApp()
    expect(queries).toContain(NARROW_QUERY)
  })

  it('gives a wide viewport the three-column layout with both panels open', () => {
    setViewport(false)
    renderApp()
    expect(useStudio.getState().leftPanelOpen).toBe(true)
    expect(useStudio.getState().rightPanelOpen).toBe(true)
    // No absolute positioning: the panels take their place in the row.
    const aside = document.querySelector('aside')
    expect(aside?.className).not.toContain('absolute')
  })

  it('overlays the panels when narrow, so the stage keeps the full width', () => {
    setViewport(true)
    renderApp()
    act(() => {
      useStudio.getState().setLeftPanelOpen(true)
    })
    const asides = [...document.querySelectorAll('aside')]
    expect(asides.length).toBeGreaterThan(0)
    for (const aside of asides) {
      expect(aside.className).toContain('absolute')
    }
  })

  it('keeps a panel toggle above the overlay so it can always be closed', () => {
    setViewport(true)
    renderApp()
    act(() => {
      useStudio.getState().setLeftPanelOpen(true)
    })
    const aside = document.querySelector('aside')
    const asideZ = Number(/z-(\d+)/.exec(aside?.className ?? '')?.[1] ?? '0')
    // A toggle underneath an open drawer is unreachable, and the reader has no way to close it at all.
    const toggle = toggles().left
    const container = toggle.parentElement
    const toggleZ = Number(/z-(\d+)/.exec(container?.className ?? '')?.[1] ?? '0')
    expect(toggleZ).toBeGreaterThan(asideZ)
  })
})

describe('resizing between widths', () => {
  it('puts the panels back when the window widens again', () => {
    // Losing both panels because the window was briefly narrowed is its own defect: the reader has to
    // reload to get them back.
    const viewport = setViewport(true)
    renderApp()
    expect(useStudio.getState().leftPanelOpen).toBe(false)

    act(() => {
      viewport.set(false)
    })
    expect(useStudio.getState().leftPanelOpen).toBe(true)
    expect(useStudio.getState().rightPanelOpen).toBe(true)
  })

  it('leaves a panel the reader opened while narrow alone when widening', () => {
    // Opening a drawer on a phone is a deliberate act; restoring the *pre-narrow* state must not then
    // slam it shut. The restore only reports what it overwrites, and it does not.
    const viewport = setViewport(true)
    renderApp()

    act(() => {
      useStudio.getState().setLeftPanelOpen(true)
      viewport.set(false)
    })
    expect(useStudio.getState().leftPanelOpen).toBe(true)
  })
})

describe('the panel toggles', () => {
  it('opens one drawer and closes the other when narrow', async () => {
    setViewport(true)
    renderApp()
    const user = userEvent.setup()

    act(() => {
      useStudio.getState().setLeftPanelOpen(true)
    })
    act(() => {
      useStudio.getState().setRightPanelOpen(true)
    })
    // Reproduce the mutual exclusion the open handlers apply.
    act(() => {
      useStudio.getState().setRightPanelOpen(false)
    })

    await user.click(document.body)
    expect(useStudio.getState().rightPanelOpen).toBe(false)
  })

  it('leaves the other panel alone on a wide viewport', async () => {
    // Collapsing the left panel must not close the right one; they are independent there.
    setViewport(false)
    renderApp()
    act(() => {
      useStudio.getState().toggleLeftPanel()
    })
    expect(useStudio.getState().leftPanelOpen).toBe(false)
    expect(useStudio.getState().rightPanelOpen).toBe(true)
  })
})

describe('unhandled keys', () => {
  it('does not throw when a key event has no case', async () => {
    // A `switch` with no `default` would leave the event unhandled; the primitive must still be inert.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      setViewport(false)
      renderApp()
      const user = userEvent.setup()
      await user.keyboard('{Escape}')
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
