import { motion } from 'motion/react'
import type { LogoResult } from '@sigilgen/types'
import type { MessageKey } from '../../i18n/locales/zh'
import { useI18n } from '../../i18n/I18nProvider'
import { svgToDataUrl } from '../../lib/generate'
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
 * Deliberately contains nothing but the mark: every control that would otherwise sit over the artwork
 * lives in the bar beneath it, so nothing can obscure the thing being judged.
 */
export function Stage({ concept, errorKey, errorDetail }: StageProps) {
  const { t } = useI18n()
  const backdrop = useStudio(state => state.backdrop)
  const zoom = useStudio(state => state.zoom)

  return (
    <div
      className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-10
        ${BACKDROP_STYLE[backdrop]}`}
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
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
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
          transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
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
  )
}
