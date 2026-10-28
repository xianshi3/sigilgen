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
      className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2
        sm:h-14 sm:flex-nowrap sm:py-0"
    >
      {/* Two lines, the way the reference sets its identity: a wordmark, and a caps rail under it. The
          name replaces the tagline once there is one, so the rail always says something true. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="type-title shrink-0 tracking-[-0.02em] text-ink">{t('app.title')}</span>
        <span className="type-caps hidden truncate text-ink-faint sm:block">
          {name.trim() === '' ? t('app.tagline') : name}
        </span>
      </div>

      <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
        {/* A floating island rather than a bar: one capsule the page flows behind, so the header reads as
            a piece of the instrument rather than as a strip of chrome glued to the top edge. */}
        <div className="material flex items-center gap-2 rounded-full p-1.5 shadow-[var(--shadow-lift)]">
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
            className="rounded-full"
            onClick={reroll}
            disabled={!canReroll}
            title={t('action.rerollHint')}
          >
            {t('action.reroll')}
          </Button>
        </div>
      </div>
    </header>
  )
}
