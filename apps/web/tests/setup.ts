import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Test setup for the studio.
 *
 * Two things live here rather than in each test file, because getting either wrong fails in a way that
 * looks like a product bug:
 *
 * - **The jest-dom matchers.** `toHaveFocus` and `toHaveAttribute` are how the accessibility assertions
 *   are phrased; without the matcher they fail as "Invalid Chai property", which reads like a broken
 *   control rather than a missing import.
 * - **Automatic cleanup.** Testing Library unmounts between tests when it detects a global afterEach,
 *   but doing it explicitly means a leaked component cannot reach into the next test's DOM — which is how
 *   a persistence test ends up asserting against another test's leftovers.
 */

afterEach(() => {
  cleanup()
  localStorage.clear()
})
