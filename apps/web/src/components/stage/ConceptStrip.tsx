import type { LogoResult } from '@sigilgen/types'
import { useI18n } from '../../i18n/I18nProvider'
import { svgToDataUrl } from '../../lib/generate'
import { useStudio } from '../../store/useStudio'

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
 */
export function ConceptStrip({ concepts }: ConceptStripProps) {
  const { t } = useI18n()
  const active = useStudio(state => state.activeConcept)
  const setActive = useStudio(state => state.setActiveConcept)

  if (concepts.length === 0) {
    return null
  }

  return (
    <div className="flex items-stretch gap-2.5 px-gutter py-3">
      {concepts.map((concept, index) => {
        const selected = index === active
        return (
          <button
            key={concept.seed}
            type="button"
            onClick={() => {
              setActive(index)
            }}
            aria-current={selected}
            aria-label={t('concept.position', { index: index + 1, total: concepts.length })}
            title={`${concept.engine} · ${concept.palette.id}`}
            className={`group relative flex aspect-square w-16 shrink-0 items-center justify-center
              overflow-hidden rounded-card transition-all duration-base ease-apple
              ${
                selected
                  ? 'shadow-[var(--shadow-lift)] ring-2 ring-[var(--accent)]'
                  : 'opacity-65 shadow-[var(--shadow-card)] hover:opacity-100 hover:shadow-[var(--shadow-lift)]'
              }`}
            style={{ background: paper(concept.palette.background) }}
          >
            <img
              src={svgToDataUrl(concept.svg)}
              alt=""
              className="h-full w-full object-contain p-1.5"
              draggable={false}
            />
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 bottom-0 bg-[oklch(0_0_0/0.55)] py-px text-center
                text-[10px] leading-4 text-white/90 transition-opacity duration-fast
                ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              {index + 1}
            </span>
          </button>
        )
      })}
    </div>
  )
}
