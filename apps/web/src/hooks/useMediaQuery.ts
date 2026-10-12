import { useEffect, useState } from 'react'

/**
 * Width below which the studio stops trying to be three columns.
 *
 * The panels are 288 and 300 user units wide and do not shrink, so past this width they leave the canvas
 * too little to judge a mark in. Measured rather than guessed: at 390 CSS pixels the two panels consumed
 * every pixel of the viewport and the stage was squeezed to nothing, with the right-hand panel's text
 * cut off mid-word.
 *
 * A single named constant so the layout and its tests cannot disagree about where the boundary is.
 */
export const NARROW_QUERY = '(max-width: 900px)'

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
