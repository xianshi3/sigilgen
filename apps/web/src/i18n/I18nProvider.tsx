import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { en } from './locales/en'
import { zh, type MessageKey } from './locales/zh'

/** Languages the interface ships with. */
export type Locale = 'zh' | 'en'

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { zh, en }

/** Where the chosen language is remembered between sessions. */
const STORAGE_KEY = 'sigilgen.locale'

/** Values interpolated into a message, written as `{name}` in the dictionary. */
export type MessageParams = Record<string, string | number>

export interface I18n {
  locale: Locale
  setLocale: (locale: Locale) => void
  /** Looks up a key and substitutes any `{param}` placeholders. */
  t: (key: MessageKey, params?: MessageParams) => string
}

const I18nContext = createContext<I18n | null>(null)

/**
 * Reads the browser's preferred language.
 *
 * Anything that is not Chinese is treated as English: the two shipped dictionaries are Chinese and
 * English, and guessing a third language from a regional tag (`zh-Hant`, `en-GB`) would only produce
 * near-English text with a confusing mix of scripts.
 */
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return 'en'
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** Replaces `{name}` placeholders; an unknown placeholder is left visible rather than blanked. */
function interpolate(template: string, params: MessageParams | undefined): string {
  if (params === undefined) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export interface I18nProviderProps {
  children: ReactNode
  /** Overrides detection. Used by tests and by the storybook-style entry points. */
  initialLocale?: Locale
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initialLocale !== undefined) {
      return initialLocale
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'zh' || stored === 'en') {
        return stored
      }
    }
    return detectLocale()
  })

  useEffect(() => {
    // The language is not just a string swap: it selects the font stack, leading and tracking, so the
    // document has to agree with it or assistive technology will be told the wrong thing.
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A browser with storage disabled still gets a working session; it just will not remember it.
    }
  }, [])

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => interpolate(MESSAGES[locale][key], params),
    }),
    [locale, setLocale]
  )

  return <I18nContext value={value}>{children}</I18nContext>
}

/** Returns the active locale and its message lookup. */
export function useI18n(): I18n {
  const context = use(I18nContext)
  if (context === null) {
    throw new Error('useI18n must be used inside <I18nProvider>')
  }
  return context
}
