import { useEffect, useState } from 'react'
import { NARROW_QUERY } from '../lib/layout'

/**
 * Width below which the studio stops trying to be three columns.
 *
 * Re-exported rather than declared here, because the boundary is not a free parameter: it is the sum of
 * the two panel widths and the narrowest stage worth showing. See `lib/layout` for the measured numbers
 * behind it.
 */
export { NARROW_QUERY }

/**
 * Tracks a CSS media query.
 *
 * Read through `useSyncExternalStore` so the value is correct on the very first render. `useEffect` would
 * report `false` for a narrow viewport until after the first paint, which means the desktop layout is
 * rendered, and its fixed panels measured, before the correction arrives.
 *
 * @param query - A media query string.
 * @returns Whether the query currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  )

  useEffect(() => {
    const list = window.matchMedia(query)
    const apply = (): void => {
      setMatches(list.matches)
    }
    apply()
    list.addEventListener('change', apply)
    return () => {
      list.removeEventListener('change', apply)
    }
  }, [query])

  return matches
}

/**
 * Whether the viewport is too narrow for three columns.
 *
 * @returns `true` when the panels should overlay the stage rather than sit beside it.
 */
export function useIsNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY)
}
