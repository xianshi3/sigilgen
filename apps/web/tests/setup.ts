import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

/**
 * Test setup for the studio.
 *
 * Three things live here rather than in each test file, because getting either wrong fails in a way that
 * looks like a product bug:
 *
 * - **The jest-dom matchers.** `toHaveFocus` and `toHaveAttribute` are how the accessibility assertions
 *   are phrased; without the matcher they fail as "Invalid Chai property", which reads like a broken
 *   control rather than a missing import.
 * - **Automatic cleanup.** Testing Library unmounts between tests when it detects a global afterEach,
 *   but doing it explicitly means a leaked component cannot reach into the next test's DOM — which is how
 *   a persistence test ends up asserting against another test's leftovers.
 * - **`matchMedia`.** jsdom implements none, so the first component to ask it anything throws
 *   `window.matchMedia is not a function` — a crash that reads as a product failure. Every query reports
 *   no match here: desktop width, light theme, motion allowed. A test that needs another answer replaces
 *   it, as `stage.test.tsx` does for the narrow viewport.
 */

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        get matches(): boolean {
          return false
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
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
