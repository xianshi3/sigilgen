import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider'
import { zh, type MessageKey } from '../src/i18n/locales/zh'

/**
 * The locale provider, rendered rather than merely imported.
 *
 * The dictionaries are type-checked against each other, so nothing checked that the *provider* honoured
 * them: that a stored locale is read, that an unknown one is ignored, that `document.lang` follows the
 * choice, and that a `{placeholder}` missing from the parameters is left visible rather than blanked.
 * Each of those is invisible to `tsc` and would only show up in a browser.
 *
 * `app.title` is deliberately not used as a probe below: it is the product name and reads the same in
 * both dictionaries, so asserting that switching changes it would be asserting a difference that is
 * correctly absent.
 */

/** Renders a probe exposing the active locale and one message lookup. */
function Probe({ messageKey = 'panel.input' }: { messageKey?: MessageKey }): ReactElement {
  const { locale, t } = useI18n()
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="message">{t(messageKey)}</span>
      <span data-testid="position">{t('concept.position')}</span>
    </div>
  )
}

/** Renders a control that switches between the two shipped languages. */
function Switcher(): ReactElement {
  const { locale, setLocale, t } = useI18n()
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="message">{t('panel.input')}</span>
      <button type="button" onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>
        toggle
      </button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.lang = ''
})

function WithParams(): ReactElement {
  const { t } = useI18n()
  return <span data-testid="position">{t('concept.position', { index: 2, total: 5 })}</span>
}

describe('locale detection', () => {
  it('honours an explicit override over both storage and the browser', () => {
    localStorage.setItem('sigilgen.locale', 'en')
    render(
      <I18nProvider initialLocale="zh">
        <Probe />
      </I18nProvider>
    )
    expect(screen.getByTestId('locale').textContent).toBe('zh')
  })

  it('reads a remembered language', () => {
    localStorage.setItem('sigilgen.locale', 'en')
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )
    expect(screen.getByTestId('locale').textContent).toBe('en')
  })

  it('ignores a stored value that is not one of the shipped languages', () => {
    // Hand-edited storage, or a language removed from the build. Falling back to detection beats starting
    // up in a state where every lookup would miss.
    localStorage.setItem('sigilgen.locale', 'klingon')
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )
    expect(['zh', 'en']).toContain(screen.getByTestId('locale').textContent)
  })

  it('publishes the language on the document, because it selects the font stack', () => {
    // Not cosmetic: the language is not a string swap, it changes the fonts and the leading, and assistive
    // technology is told the document's language through this attribute.
    render(
      <I18nProvider initialLocale="zh">
        <Probe />
      </I18nProvider>
    )
    expect(document.documentElement.lang).toBe('zh')
  })
})

describe('message lookup', () => {
  it('returns the string for the active language', () => {
    render(
      <I18nProvider initialLocale="zh">
        <Probe />
      </I18nProvider>
    )
    expect(screen.getByTestId('message').textContent).toBe(zh['panel.input'])
  })

  it('leaves an unsupplied placeholder visible rather than blanking it', () => {
    // A silent blank reads as a broken control; a visible `{index}` is a bug report instead.
    render(
      <I18nProvider initialLocale="zh">
        <Probe />
      </I18nProvider>
    )
    expect(screen.getByTestId('position').textContent).toContain('{index}')
  })

  it('substitutes the placeholders it is given', () => {
    render(
      <I18nProvider initialLocale="zh">
        <WithParams />
      </I18nProvider>
    )
    const text = screen.getByTestId('position').textContent ?? ''
    expect(text).toContain('2')
    expect(text).toContain('5')
    expect(text).not.toContain('{')
  })
})

describe('switching language', () => {
  it('updates the messages, the document and the remembered choice together', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider initialLocale="zh">
        <Switcher />
      </I18nProvider>
    )
    expect(screen.getByTestId('message').textContent).toBe(zh['panel.input'])

    await user.click(screen.getByRole('button', { name: 'toggle' }))
    expect(screen.getByTestId('locale').textContent).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByTestId('message').textContent).not.toBe(zh['panel.input'])
    expect(localStorage.getItem('sigilgen.locale')).toBe('en')
  })

  it('still switches when storage is unavailable', async () => {
    // A browser with cookies and storage disabled must get a working session; it simply will not
    // remember the choice. Losing the whole interface to a storage quota would be absurd.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const user = userEvent.setup()
    try {
      render(
        <I18nProvider initialLocale="zh">
          <Switcher />
        </I18nProvider>
      )
      await user.click(screen.getByRole('button', { name: 'toggle' }))
      expect(document.documentElement.lang).toBe('en')
    } finally {
      setItem.mockRestore()
    }
  })
})

describe('provider misuse', () => {
  it('says so plainly when used outside the provider', () => {
    // A hook that quietly returned null would fail later and further away, with a message about whatever
    // happened to be undefined at that point.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<Probe />)).toThrow(/I18nProvider/)
    } finally {
      spy.mockRestore()
    }
  })
})
