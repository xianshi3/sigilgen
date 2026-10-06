import { useMemo } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { fontSample } from '../../lib/font-sample'
import { FONT_GROUPS, findFontEntry } from '../../lib/resources'
import { useStudio } from '../../store/useStudio'
import { Disclosure } from '../primitives/Disclosure'

/** Cap height of the specimen, in the specimen's own coordinate system. */
const SAMPLE_CAP = 18

/**
 * Typeface picker, grouped by tone.
 *
 * Each row sets the reader's own brand name in the typeface it represents, drawn from the brain's
 * outlines rather than asked of the operating system. Every family name here is invented, so the
 * browser would fall back to the same UI face for all eighteen and the list would be a column of
 * identical text. Grouping by tone is what makes eighteen rows navigable: within a group the faces are
 * close enough that the specimen is the deciding factor, and across groups the tone already says
 * whether this is the family that was meant.
 */
export function FontPicker() {
  const { t } = useI18n()
  const font = useStudio(state => state.font)
  const name = useStudio(state => state.name)
  const setField = useStudio(state => state.setField)

  const chosen = findFontEntry(font)

  // The specimen is the reader's own name, so it is recomputed when the name changes and not before.
  const letters = useMemo(() => specimenLetters(name), [name])

  return (
    <Disclosure title={t('resource.font')} summary={chosen?.family ?? t('resource.auto')}>
      <div role="radiogroup" aria-label={t('resource.font')} className="flex flex-col gap-3">
        <FontRow
          label={t('resource.auto')}
          title={t('resource.autoHint')}
          selected={font === ''}
          onClick={() => {
            setField('font', '')
          }}
        />
        {FONT_GROUPS.map(group => (
          <div key={group.category} className="flex flex-col gap-1">
            <h3 className="type-caption text-ink-faint">{t(`fontCategory.${group.category}`)}</h3>
            {group.fonts.map(entry => (
              <FontRow
                key={entry.id}
                label={entry.family}
                title={entry.id}
                selected={font === entry.id}
                specimen={fontSample(entry, letters, SAMPLE_CAP)}
                onClick={() => {
                  setField('font', entry.id)
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </Disclosure>
  )
}

/**
 * The letters set in each specimen.
 *
 * Taken from the reader's own brand name so the list previews the mark they are about to make. Two
 * letters show proportion and joint without wrapping a 288px column; a name with no letters at all
 * falls back to `AG`, which is the classic type specimen and shows the two most distinct letterforms.
 */
function specimenLetters(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '')
  return letters === '' ? 'AG' : letters.slice(0, 2)
}

interface FontRowProps {
  label: string
  title: string
  selected: boolean
  onClick: () => void
  specimen?: { path: string; viewBox: string }
}

function FontRow({ label, title, selected, onClick, specimen }: FontRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={title}
      onClick={onClick}
      className={`flex h-9 items-center justify-between gap-2 rounded-control px-2.5 text-left
        transition-colors duration-fast
        ${selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-sunken)]'}`}
    >
      <span className={`truncate type-caption ${selected ? 'text-ink' : 'text-ink-soft'}`}>
        {label}
      </span>
      {specimen !== undefined && specimen.path !== '' ? (
        <svg
          viewBox={specimen.viewBox}
          height={SAMPLE_CAP}
          // Decoration: the row already carries the family name as its accessible name, and a second
          // copy read out would only repeat it.
          aria-hidden="true"
          className="shrink-0 text-ink"
          fill="currentColor"
        >
          <path d={specimen.path} />
        </svg>
      ) : null}
    </button>
  )
}
