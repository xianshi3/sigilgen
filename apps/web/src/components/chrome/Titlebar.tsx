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
 * On a desktop platform this would be the browser's own title bar, but the app sets `display:
 * standalone` when installed and draws its own — so this is chrome in its own right, not decoration
 * around a page.
 */
export function Titlebar({ canReroll }: TitlebarProps) {
  const { t, locale, setLocale } = useI18n()
  const name = useStudio(state => state.name)
  const reroll = useStudio(state => state.reroll)
  const theme = useStudio(state => state.theme)
  const setTheme = useStudio(state => state.setTheme)

  return (
    // `flex-wrap`, with the controls taking a full row below `sm`. The brand, two segmented controls and
    // the primary button need about 420px between them, so on a 390px phone they could not share one row
    // and the brand was clipped mid-word. Wrapping keeps every control reachable instead of dropping some,
    // and costs 24px of height only where there is height to spare.
    <header
      className="material hairline-b relative z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5
        px-4 py-1.5 sm:h-12 sm:flex-nowrap sm:py-0"
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <span className="type-title shrink-0 text-ink">{t('app.title')}</span>
        {name.trim() === '' ? (
          <span className="type-caption hidden truncate text-ink-faint sm:inline">
            {t('app.tagline')}
          </span>
        ) : (
          <span className="type-caption hidden truncate text-ink-faint sm:inline">{name}</span>
        )}
      </div>

      <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <Segmented<Locale>
          aria-label={t('locale.label')}
          value={locale}
          options={[
            { value: 'zh', label: t('locale.zh') },
            { value: 'en', label: t('locale.en') },
          ]}
          onChange={setLocale}
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
        />

        <Button
          variant="primary"
          size="sm"
          onClick={reroll}
          disabled={!canReroll}
          title={t('action.rerollHint')}
        >
          {t('action.reroll')}
        </Button>
      </div>
    </header>
  )
}
