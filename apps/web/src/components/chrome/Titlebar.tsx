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
 * The window chrome, as one island.
 *
 * Everything lives in it — the wordmark, the language, the appearance and the reroll — so the top of the
 * screen is a single object floating in the middle rather than a bar with things pushed to its edges. A
 * hairline rule separates the identity from the controls, which is what keeps them reading as two groups
 * inside one shape.
 *
 * It is flat on purpose: a solid plate and a hairline ring, not a frosted pane. The blur belonged to a
 * window chrome that sat on top of the page; an island sits *in* the page, and blur there reads as a
 * leftover.
 *
 * The handle under it folds the whole group upward — the edge it belongs to — leaving only the handle at
 * the top where the island was.
 */
export function Titlebar({ canReroll }: TitlebarProps) {
  const { t, locale, setLocale } = useI18n()
  const name = useStudio(state => state.name)
  const reroll = useStudio(state => state.reroll)
  const theme = useStudio(state => state.theme)
  const setTheme = useStudio(state => state.setTheme)
  const [open, setOpen] = useState(true)

  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-16 items-center
        justify-center px-4"
    >
      <div className="pointer-events-auto absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center">
        <div
          className={`transition-transform duration-base ease-apple ${
            open ? 'translate-y-3' : '-translate-y-[60px]'
          }`}
        >
          <div
            className="flex items-center gap-3 rounded-full bg-[var(--surface-raised)] px-3.5 py-2
              shadow-[0_0_0_0.5px_var(--hairline),0_1px_2px_oklch(0.2_0.01_70/0.04),0_10px_30px_oklch(0.2_0.01_70/0.07)]"
          >
            {/* The identity, inside the island and on one line: the name is the one label that never
                changes, so it is what the front of the capsule is for. The loaded brand name follows it in
                the caps rail — a second line made the capsule taller than the controls it holds. */}
            <span className="flex items-baseline gap-2">
              <span className="text-[0.9375rem] leading-none font-semibold tracking-[-0.01em] text-ink">
                {t('app.title')}
              </span>
              <span className="type-caps hidden max-w-32 truncate leading-none text-ink-faint sm:inline">
                {name.trim() === '' ? t('app.tagline') : name}
              </span>
            </span>

            <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--hairline-strong)]" />

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
