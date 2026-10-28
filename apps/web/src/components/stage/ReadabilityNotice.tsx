import type { PaletteEntry } from '@sigilgen/types'
import { motion } from 'motion/react'
import { useReducedMotion } from '../../hooks/useMediaQuery'
import { useI18n } from '../../i18n/I18nProvider'
import { DURATION_BASE, EASE_APPLE } from '../../lib/motion'
import { Button } from '../primitives/Button'

export interface ReadabilityNoticeProps {
  /** The lowest contrast any part of the mark manages against the sheet, from 1 upward. */
  ratio: number
  /** A palette that would be legible here, or `null` when there is nothing left to suggest. */
  palette: PaletteEntry | null
  /** Called with the palette id when the reader takes the offer. */
  onUsePalette: (id: string) => void
}

/**
 * Says that the mark cannot be seen where it is, and offers a way out.
 *
 * The stage will happily put a pale-sheet palette on the dark sheet, because the backdrop describes how
 * the mark is being *viewed* and the reader is entitled to view it anywhere. The catch is that the result
 * is an empty-looking square with no indication that anything is wrong, which is what this notice exists
 * to prevent.
 *
 * ## Why it is not on the sheet
 *
 * The obvious place for it is on top of the mark, and the first version was. That is the one place it must
 * not be: at a 242px sheet it covered 45.8% of the artwork, hiding the very thing it was reporting on, and
 * the smaller the sheet the worse the share. It sits in the stage's own gutter instead, below the sheet,
 * on the stage surface rather than on the paper.
 *
 * That also settles its colours. Sitting on the stage means it is drawn with the same theme tokens as
 * everything around it, in both themes, instead of needing fixed light-on-dark values to survive being
 * dropped onto white or near-black paper.
 *
 * @param props - The measured ratio, the palette on offer, and what to do with it.
 */
export function ReadabilityNotice({ ratio, palette, onUsePalette }: ReadabilityNoticeProps) {
  const { t } = useI18n()
  const reduced = useReducedMotion()

  return (
    <motion.div
      // A live region: the notice appears as the reader switches the backdrop, and a sighted reader sees
      // it the moment it does. Without this it would only ever be found by exploring the stage.
      role="status"
      // It arrives rather than blinking into place. Six units of rise is enough to read as the stage
      // telling the reader something; more would compete with the mark it is talking about.
      // A fade is allowed when motion is reduced; the six units of rise are not. So the offset is the
      // only part of the entrance the setting removes, and the notice still arrives rather than blinking.
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 6 }}
      transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
      className="card absolute inset-x-3 bottom-2 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center
        justify-center gap-x-2 gap-y-1 rounded-control px-2.5 py-1.5"
    >
      <span
        className="type-caption shrink-0 rounded-[calc(var(--radius-control)-0.25rem)] bg-[var(--surface-sunken)]
          px-1.5 py-0.5 tabular-nums text-ink-soft"
      >
        {ratio.toFixed(1)}:1
      </span>
      {/* The explanation is dropped when the stage has no room for it.
       *
       * The badge and the button survive at every size, and `role="status"` means the sentence is announced
       * in either case — what goes is the least load-bearing part of it.
       *
       * The query resolves against the stage, which declares `container-type: size`; this card declares no
       * container of its own, so 26rem is the stage's width rather than the card's. */}
      <span className="type-caption hidden min-w-0 text-center text-ink-soft @[26rem]:inline">
        {t('stage.readabilityHint')}
      </span>
      {palette === null ? null : (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            onUsePalette(palette.id)
          }}
        >
          {t('stage.readabilityFix')}
        </Button>
      )}
    </motion.div>
  )
}
