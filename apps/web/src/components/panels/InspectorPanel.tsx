import { useState } from 'react'
import type { LogoResult } from '@sigilgen/types'
import { useI18n } from '../../i18n/I18nProvider'
import { ENGINE_LABEL } from '../../lib/engines'
import { copyText, downloadSvg, fileStem } from '../../lib/export'
import { useStudio } from '../../store/useStudio'
import { Button } from '../primitives/Button'
import { Section } from '../primitives/Section'

export interface InspectorPanelProps {
  concept: LogoResult | undefined
}

/** A label and value pair. The value keeps its own typography so ids stay legible. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-caption shrink-0 text-ink-faint">{label}</dt>
      <dd className="type-caption min-w-0 truncate text-right text-ink" title={value}>
        {value}
      </dd>
    </div>
  )
}

/**
 * What was chosen, and why.
 *
 * The notes are the point of the panel: the generator can produce a mark a reader likes without
 * understanding why, but cannot be iterated on without knowing which decision to push on.
 */
export function InspectorPanel({ concept }: InspectorPanelProps) {
  const { t } = useI18n()
  const name = useStudio(state => state.name)
  const [copied, setCopied] = useState(false)

  if (concept === undefined) {
    return (
      <Section title={t('notes.title')}>
        <p className="type-caption text-ink-faint">{t('notes.empty')}</p>
      </Section>
    )
  }

  const stem = fileStem(name)

  return (
    <>
      <Section title={t('concept.title')}>
        <dl className="flex flex-col gap-1.5">
          <Row label={t('concept.engine')} value={t(ENGINE_LABEL[concept.engine])} />
          <Row
            label={t('concept.font')}
            value={`${concept.font.family} · ${concept.font.weight}`}
          />
          <Row
            label={t('concept.icon')}
            value={concept.icon === null ? t('concept.none') : concept.icon.key}
          />
          <Row label={t('concept.seed')} value={concept.seed} />
        </dl>
        {/* The palette's own colours, so the choice can be judged rather than inferred from a name. */}
        <div className="mt-1 flex gap-1">
          {[
            concept.palette.primary,
            concept.palette.secondary,
            concept.palette.accent,
            ...(concept.palette.background === null ? [] : [concept.palette.background]),
          ].map((colour, index) => (
            <span
              key={`${colour}-${index}`}
              title={colour}
              className="h-5 flex-1 rounded-[4px] shadow-[0_0_0_0.5px_var(--hairline)]"
              style={{ background: colour }}
            />
          ))}
        </div>
      </Section>

      <Section title={t('action.export')}>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              void copyText(concept.svg).then(ok => {
                setCopied(ok)
                setTimeout(() => {
                  setCopied(false)
                }, 1400)
              })
            }}
          >
            {copied ? t('action.copied') : t('action.copySvg')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              downloadSvg(concept, stem)
            }}
          >
            {t('action.downloadSvg')}
          </Button>
        </div>
      </Section>

      <Section title={t('notes.title')}>
        <ol className="flex flex-col gap-2">
          {concept.conceptNotes.map((note, index) => (
            <li
              key={`${index}-${note.slice(0, 12)}`}
              className="type-caption flex gap-2 text-ink-soft"
            >
              <span className="text-ink-faint tabular-nums">{index + 1}</span>
              <span className="min-w-0">{note}</span>
            </li>
          ))}
        </ol>
      </Section>
    </>
  )
}
