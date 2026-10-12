import { motion } from 'motion/react'
import type { LogoResult } from '@sigilgen/types'
import type { MessageKey } from '../../i18n/locales/zh'
import { useI18n } from '../../i18n/I18nProvider'
import { svgToDataUrl } from '../../lib/generate'
import { DURATION_BASE, EASE_APPLE } from '../../lib/motion'
import { useStudio, type Backdrop } from '../../store/useStudio'

export interface StageProps {
  concept: LogoResult | undefined
  /** Set when generation failed; the stage explains it instead of showing a mark. */
  errorKey: MessageKey | null
  errorDetail: string | null
}

/** Backdrop fills. Fixed paper colours, not themed tokens — see `--paper-light` in the token sheet. */
const BACKDROP_STYLE: Record<Backdrop, string> = {
  light: 'bg-[var(--paper-light)]',
  dark: 'bg-[var(--paper-dark)]',
  board: 'bg-[var(--paper-checker-b)]',
}

/**
 * The canvas.
 *
 * The mark sits on a *sheet* — a square of paper, inset, rounded and lifted — rather than filling the
 * stage edge to edge. An edge-to-edge fill puts the artwork in the middle of a large undifferentiated
 * rectangle, and the eye reads that as an unfinished canvas rather than a presentation. A sheet with an
 * edge, a corner and a shadow has a boundary, which is what makes the artwork the subject of the screen
 * instead of the middle of it.
 *
 * The sheet is the surface the palette's colours were chosen against, so it keeps its fixed paper colours
 * in both themes — see `--paper-light` in the token sheet.
 *
 * Deliberately contains nothing but the mark: every control that would otherwise sit over the artwork
 * lives in the bar beneath it, so nothing can obscure the thing being judged.
 */
export function Stage({ concept, errorKey, errorDetail }: StageProps) {
  const { t } = useI18n()
  const backdrop = useStudio(state => state.backdrop)
  const zoom = useStudio(state => state.zoom)

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--stage)] p-5 sm:p-8">
      <div
        className={`relative flex aspect-square max-h-full w-full max-w-full items-center justify-center
          overflow-hidden rounded-panel ${BACKDROP_STYLE[backdrop]} shadow-[var(--shadow-lift)]`}
        style={
          backdrop === 'board'
            ? {
                backgroundImage: `linear-gradient(45deg, var(--paper-checker-a) 25%, transparent 25%),
                  linear-gradient(-45deg, var(--paper-checker-a) 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, var(--paper-checker-a) 75%),
                  linear-gradient(-45deg, transparent 75%, var(--paper-checker-a) 75%)`,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
              }
            : undefined
        }
      >
        {concept === undefined ? (
          <div className="flex max-w-[min(22rem,80%)] flex-col items-center gap-2 text-center">
            <p className={`type-title ${errorKey === null ? 'text-ink-soft' : 'text-ink'}`}>
              {errorKey === null ? t('empty.title') : t('error.title')}
            </p>
            <p className="type-body text-ink-faint">
              {errorKey === null ? t('empty.body') : t(errorKey)}
            </p>
            <p className="type-caption text-ink-faint/70">
              {errorKey === null ? t('empty.suggestion') : errorDetail}
            </p>
          </div>
        ) : (
          <motion.img
            // Keyed by the concept's own seed fingerprint, so switching concepts cross-fades while
            // retyping the name swaps the image without a flash.
            key={concept.seed}
            src={svgToDataUrl(concept.svg)}
            alt={`${concept.engine} — ${concept.palette.id}`}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
            className={
              zoom === 'fit'
                ? 'max-h-full max-w-full object-contain'
                : 'max-h-none max-w-none object-contain'
            }
            style={zoom === 'fit' ? undefined : { width: `${zoom * 100}%` }}
            draggable={false}
          />
        )}
      </div>
    </div>
  )
}
