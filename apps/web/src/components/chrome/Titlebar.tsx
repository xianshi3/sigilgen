import { useState } from 'react'
import { useI18n, type Locale } from '../../i18n/I18nProvider'
import { useStudio, type ThemePreference } from '../../store/useStudio'
import { useIsNarrow } from '../../hooks/useMediaQuery'
import { PANEL_WIDTH_LEFT, PANEL_WIDTH_RIGHT } from '../../lib/layout'
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
 * The island is a flat plate on purpose. The page breathing behind it is what sells the depth — a solid
 * capsule set well above it — and a blurred pane would only soften the very thing that needs to stay a
 * hard, readable shape.
 *
 * The handle under it folds the whole group upward — the edge it belongs to — leaving only the handle at
 * the top where the island was.
 */
export function Titlebar({ canReroll }: TitlebarProps) {
  const { t, locale, setLocale } = useI18n()
  const name = useStudio(state => state.name)
  const reroll = useStudio(state => state.reroll)
  const mode = useStudio(state => state.mode)
  const setMode = useStudio(state => state.setMode)
  const theme = useStudio(state => state.theme)
  const setTheme = useStudio(state => state.setTheme)
  const leftOpen = useStudio(state => state.leftPanelOpen)
  const rightOpen = useStudio(state => state.rightPanelOpen)
  // On a wide screen the two docked panels flank the stage, so the island is centred on the *gap* they
  // leave rather than on the window — centred on the window it slid under the right panel, which the
  // panel (correctly) outranks in the stacking order, and the reroll vanished behind it. On a narrow
  // screen the panels are drawers over the stage, and the island spans the window again.
  const narrow = useIsNarrow()
  const padLeft = !narrow && leftOpen ? PANEL_WIDTH_LEFT + 8 : 0
  const padRight = !narrow && rightOpen ? PANEL_WIDTH_RIGHT + 8 : 0
  const [open, setOpen] = useState(true)

  return (
    <header
      className="pointer-events-none absolute top-0 z-20 flex h-16 items-center justify-center px-2"
      style={{ left: padLeft, right: padRight }}
    >
      <div className="pointer-events-auto flex w-full flex-col items-center">
        <div
          className={`transition-[transform,opacity] duration-base ease-apple ${
            open ? 'translate-y-3' : '-translate-y-10'
          }`}
        >
          <div
            className={`flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1.5
              rounded-panel bg-[var(--surface-raised)] px-3 py-2 sm:gap-x-3 sm:px-3.5
              shadow-[0_0_0_0.5px_var(--hairline),0_1px_2px_oklch(0.2_0.01_70/0.04),0_10px_30px_oklch(0.2_0.01_70/0.07)]
              transition-opacity duration-base ${open ? '' : 'pointer-events-none opacity-0'}`}
          >
            {/* The identity, inside the island and on one line: the name is the one label that never
                changes, so it is what the front of the capsule is for. The loaded brand name follows it in
                the caps rail — a second line made the capsule taller than the controls it holds. */}
            {/* The identity, hidden below 1250px: the three-column gap at its narrowest is 404px, and the
                controls alone need most of it. */}
            <span className="hidden items-baseline gap-2 min-[1250px]:flex">
              <span className="text-[0.9375rem] leading-none font-semibold tracking-[-0.01em] text-ink">
                {t('app.title')}
              </span>
              <span className="type-caps hidden max-w-32 truncate leading-none text-ink-faint lg:inline">
                {name.trim() === '' ? t('app.tagline') : name}
              </span>
            </span>

            <span
              aria-hidden="true"
              className="hidden h-5 w-px shrink-0 bg-[var(--hairline-strong)] min-[1250px]:block"
            />

            <Segmented<'generate' | 'draw'>
              aria-label={t('mode.label')}
              value={mode}
              options={[
                { value: 'generate', label: t('mode.generate') },
                { value: 'draw', label: t('mode.draw') },
              ]}
              onChange={setMode}
              className="border-b-0"
            />

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

            {mode === 'generate' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={reroll}
                disabled={!canReroll}
                title={t('action.rerollHint')}
              >
                {t('action.reroll')}
              </Button>
            ) : null}
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? t('header.collapse') : t('header.expand')}
            onClick={() => {
              setOpen(previous => !previous)
            }}
            className="group mx-auto flex h-4 w-14 items-center justify-center"
          >
            <span
              aria-hidden="true"
              className="h-1 w-9 rounded-full bg-[var(--hairline-strong)] transition-colors
                duration-fast group-hover:bg-[var(--ink-faint)]"
            />
          </button>
        </div>
      </div>
    </header>
  )
}
