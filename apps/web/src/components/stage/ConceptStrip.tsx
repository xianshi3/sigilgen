import type { LogoResult } from '@sigilgen/types'
import { motion } from 'motion/react'
import { useReducedMotion } from '../../hooks/useMediaQuery'
import { useI18n } from '../../i18n/I18nProvider'
import { svgToDataUrl } from '../../lib/generate'
import { DURATION_BASE, EASE_APPLE } from '../../lib/motion'
import { useStudio } from '../../store/useStudio'

/**
 * Seconds between one tile arriving and the next.
 *
 * A batch of six lands over about 150ms rather than all at once, which reads as the strip being dealt
 * rather than replaced. Capped at the fifth tile so a longer batch does not keep its last tile waiting.
 */
const STAGGER = 0.03

export interface ConceptStripProps {
  concepts: readonly LogoResult[]
}

/**
 * The paper a concept is drawn on.
 *
 * A palette that declares no background has had its colours chosen for a light page, so it is shown on
 * light paper. Using the interface's own surface instead would render dark ink on a dark tile and hide
 * the very thing the thumbnail exists to show.
 */
function paper(background: string | null): string {
  return background ?? 'var(--paper-light)'
}

/**
 * The row of alternative concepts.
 *
 * Each thumbnail renders the real output rather than an approximation, so what a reader picks from is
 * exactly what they get. The selected tile is lifted and outlined rather than tinted, which keeps the
 * colour of the artwork itself as the only saturated thing on screen.
 *
 * A new batch arrives rather than replacing the old one in a single frame. The animation lives on a
 * wrapper rather than on the tile, because the tile's own opacity is a state — dimmed when unselected,
 * full on hover — and an animated inline opacity would overwrite it.
 */
export function ConceptStrip({ concepts }: ConceptStripProps) {
  const { t } = useI18n()
  const active = useStudio(state => state.activeConcept)
  const setActive = useStudio(state => state.setActiveConcept)
  const reduced = useReducedMotion()

  if (concepts.length === 0) {
    return null
  }

  return (
    // Scrolls sideways rather than compressing: six tiles plus gutters need more than a phone is wide,
    // so on a narrow viewport they either overflowed the page or shrank past being clickable.
    <div className="flex items-stretch gap-3 overflow-x-auto px-gutter py-4">
      {concepts.map((concept, index) => {
        const selected = index === active
        return (
          <motion.div
            key={concept.seed}
            className="shrink-0"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DURATION_BASE,
              delay: reduced ? 0 : Math.min(index, 5) * STAGGER,
              ease: EASE_APPLE,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActive(index)
              }}
              aria-current={selected}
              aria-label={t('concept.position', { index: index + 1, total: concepts.length })}
              title={`${concept.engine} · ${concept.palette.id}`}
              className={`group relative flex aspect-square w-tile items-center justify-center
                overflow-hidden rounded-card border transition-all duration-base ease-apple
                ${
                  selected
                    ? 'border-[var(--accent)] opacity-100 shadow-[var(--shadow-card)]'
                    : 'border-[var(--hairline)] opacity-70 hover:border-[var(--hairline-strong)] hover:opacity-100'
                }`}
              style={{ background: paper(concept.palette.background) }}
            >
              <img
                src={svgToDataUrl(concept.svg)}
                alt=""
                className="h-full w-full object-contain p-2"
                draggable={false}
              />
              {/* The index is always visible on the selected tile and fades in on hover otherwise, so the
                  strip reads as a sequence rather than as a row of identical squares. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 bg-[var(--scrim)] py-px text-center
                  text-micro leading-4 text-[var(--scrim-ink)] tabular-nums transition-opacity
                  duration-fast
                  ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              >
                {index + 1}
              </span>
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}
