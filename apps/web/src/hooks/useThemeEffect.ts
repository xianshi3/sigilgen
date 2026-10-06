import { useEffect } from 'react'
import { useStudio, type ThemePreference } from '../store/useStudio'

const QUERY = '(prefers-color-scheme: dark)'

/**
 * Writes the resolved theme onto the document element.
 *
 * The token sheet applies dark values through `data-theme` rather than a media query, because a reader
 * must be able to choose light on a dark system — which a media query cannot express. Resolving the
 * preference here keeps that sheet to a single dark block instead of two copies that have to be kept
 * in step, and lets the system setting keep working live while the choice is "auto".
 */
export function useThemeEffect(): void {
  const theme = useStudio(state => state.theme)

  useEffect(() => {
    const system = window.matchMedia(QUERY)
    const apply = (): void => {
      const resolved: Exclude<ThemePreference, 'auto'> =
        theme === 'auto' ? (system.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }

    apply()
    if (theme !== 'auto') {
      return
    }
    // Only listen while following the system; an explicit choice has nothing to react to.
    system.addEventListener('change', apply)
    return () => {
      system.removeEventListener('change', apply)
    }
  }, [theme])
}
