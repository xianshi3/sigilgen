import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DURATION_PANEL, EASE_APPLE, panelTransition } from '../src/lib/motion'
import { REDUCED_MOTION_QUERY } from '../src/hooks/useMediaQuery'

/**
 * The two halves of `prefers-reduced-motion`.
 *
 * `tokens.css` zeroes every CSS transition and animation under the setting, and that covers the whole
 * studio except the animations framer-motion drives — those are inline styles and never see the rule. So
 * the drawers kept resizing the stage over 280ms with the setting on, which is the one motion a reader
 * who asked for less motion is asking to be spared: it is not a fade in place, it reflows everything
 * beside it.
 *
 * jsdom does not animate, so this file cannot time a drawer. What it can hold is the decision the
 * drawers are built on, and the fact that the stylesheet and the hook agree on which query that is.
 */

describe('reduced motion', () => {
  it('removes the panel travel when the system asks for it', () => {
    const normal = panelTransition(false)
    const reduced = panelTransition(true)

    expect(normal.duration).toBe(DURATION_PANEL)
    expect(reduced.duration).toBe(0)
    // The curve is kept. It means nothing at duration 0, and keeping it is what makes the two branches
    // differ in exactly one property rather than in two.
    expect(reduced.ease).toEqual(EASE_APPLE)
  })

  it('watches the same query the stylesheet overrides', () => {
    // Drift here is silent: the CSS half would still reduce and the JS half would not, which is the
    // exact bug this file exists for.
    expect(readFileSync('src/styles/tokens.css', 'utf8')).toContain(
      `@media ${REDUCED_MOTION_QUERY}`
    )
  })

  it('is what both drawers ask for, rather than a literal duration', () => {
    // A literal `{ duration: DURATION_PANEL }` at a drawer is the state this replaced, and it is
    // invisible in a rendered DOM: the value only exists as an inline style while the panel is moving.
    const uses = readFileSync('src/App.tsx', 'utf8').match(
      /transition=\{panelTransition\(reduced\)\}/g
    )
    expect(uses ?? []).toHaveLength(2)
  })
})
