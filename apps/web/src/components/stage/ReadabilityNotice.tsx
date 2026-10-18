import type { PaletteEntry } from '@sigilgen/types'
import { useI18n } from '../../i18n/I18nProvider'
import { Button } from '../primitives/Button'

export interface ReadabilityNoticeProps {
  /** The lowest contrast any part of the mark manages against the sheet, from 1 upward. */
  ratio: number
  /** A palette that would be legible here, or `null` when the sheet colour could not be read. */
  palette: PaletteEntry | null
  /** Called with the palette id when the reader takes the offer. */
  onUsePalette: (id: string) => void
}

/**
 * Says that the mark cannot be seen where it is, and offers a way out.
 *
 * The stage will happily put a pale-sheet palette on the dark sheet, because the backdrop describes how
 * the mark is being *viewed* and the reader is entitled to view it anywhere. The catch is that the
 * result is an empty-looking square with no indication that anything is wrong, which is what this
 * notice exists to prevent.
 *
 * ## Why it is not styled with the theme
 *
 * It sits on the sheet, and the sheet is not themed — it keeps its paper colour in either theme, because
 * it is the surface the palette was chosen against. So a notice drawn from theme tokens would be a white
 * card on white paper in the light theme, which is a poor way to warn somebody about legibility. It is
 * fixed light-on-dark instead, which reads on both sheets and in both themes.
 *
 * It is placed at the foot of the sheet rather than over its centre so that it covers as little of the
 * artwork as it can while still being attached to the thing it is about.
 *
 * @param props - The measured ratio, the palette on offer, and what to do with it.
 */
export function ReadabilityNotice({ ratio, palette, onUsePalette }: ReadabilityNoticeProps) {
  const { t } = useI18n()

  return (
    <div
      // A live region: the notice appears as the reader switches the backdrop, and a sighted reader sees
      // it the moment it does. Without this it would only ever be found by exploring the stage.
      role="status"
      className="absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2
        rounded-control bg-[oklch(0.2_0.012_265_/_0.94)] px-3 py-2 text-[oklch(0.97_0.005_260)]
        shadow-[var(--shadow-lift)] backdrop-blur-sm"
    >
      <span className="type-caption shrink-0 rounded-[calc(var(--radius-control)-0.25rem)] bg-[oklch(1_0_0_/_0.12)] px-1.5 py-0.5 tabular-nums">
        {ratio.toFixed(1)}:1
      </span>
      <span className="type-caption min-w-0 text-center opacity-80">
        {t('stage.readabilityHint')}
      </span>
      {palette === null ? null : (
        <Button
          size="sm"
          variant="ghost"
          // The button inherits the notice's fixed foreground rather than the theme's ink, or it would
          // take a colour chosen against the app surface and lose it against the card.
          className="shrink-0 text-inherit hover:bg-[oklch(1_0_0_/_0.12)] hover:text-inherit"
          onClick={() => {
            onUsePalette(palette.id)
          }}
        >
          {t('stage.readabilityFix')}
        </Button>
      )}
    </div>
  )
}
