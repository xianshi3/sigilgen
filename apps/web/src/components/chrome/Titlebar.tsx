import { useState } from 'react'
import { useI18n, type Locale } from '../../i18n/I18nProvider'
import { useStudio, type ThemePreference } from '../../store/useStudio'
import { Button } from '../primitives/Button'
import { Segmented } from '../primitives/Segmented'

export interface TitlebarProps {
  /** True while the brand name has something in it. */
  canReroll: boolean
}

/**
 * The window chrome.
 *
 * The identity sits at the left edge and the controls float in the middle, in one capsule that the page
 * runs behind — an island rather than a bar. It retracts upward on request and leaves only its handle at
 * the top edge, so a reader who is judging a mark can get the chrome out of the way without leaving the
 * screen. Upward because that is the edge it belongs to: sliding sideways would put it back over the
 * artwork.
 */
export function Titlebar({ canReroll }: TitlebarProps) {
  const { t, locale, setLocale } = useI18n()
  const name = useStudio(state => state.name)
  const reroll = useStudio(state => state.reroll)
  const theme = useStudio(state => state.theme)
  const setTheme = useStudio(state => state.setTheme)
  const [open, setOpen] = useState(true)

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center px-4">
      {/* Two lines, the way the reference sets its identity: a wordmark, and a caps rail under it. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="type-title shrink-0 tracking-[-0.02em] text-ink">{t('app.title')}</span>
        <span className="type-caps hidden truncate text-ink-faint sm:block">
          {name.trim() === '' ? t('app.tagline') : name}
        </span>
      </div>

      {/* Centred, and translated as one group: the handle travels with the island so that when it is
          folded away the handle is what is left at the top edge, exactly where the island was. */}
      <div className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center">
        <div
          className={`transition-transform duration-base ease-apple ${
            open ? 'translate-y-2' : '-translate-y-[52px]'
          }`}
        >
          <div className="material flex items-center gap-2 rounded-full p-1.5 shadow-[var(--shadow-lift)]">
            <Segmented<Locale>
              aria-label={t('locale.label')}
              value={locale}
              options={[
                { value: 'zh', label: t('locale.zh') },
                { value: 'en', label: t('locale.en') },
              ]}
              onChange={setLocale}
              className="border-b-0"
            />

            <Segmented<ThemePreference>
              aria-label={t('theme.label')}
              value={theme}
              options={[
                { value: 'light', label: t('theme.light') },
                { value: 'dark', label: t('theme.dark') },
                { value: 'auto', label: t('theme.auto') },
              ]}
              onChange={setTheme}
              className="border-b-0"
            />

            <Button
              variant="primary"
              size="sm"
              className="rounded-full"
              onClick={reroll}
              disabled={!canReroll}
              title={t('action.rerollHint')}
            >
              {t('action.reroll')}
            </Button>
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? t('header.collapse') : t('header.expand')}
            onClick={() => {
              setOpen(previous => !previous)
            }}
            className="mx-auto flex h-4 w-12 items-center justify-center rounded-full text-micro
              leading-none text-ink-faint transition-colors duration-fast
              hover:bg-[var(--surface-sunken)] hover:text-ink"
          >
            {open ? '⌃' : '⌄'}
          </button>
        </div>
      </div>
    </header>
  )
}
