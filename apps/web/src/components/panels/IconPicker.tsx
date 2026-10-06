import { useId, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { ENGINE_USES_ICON } from '../../lib/engines'
import { ALL_ICONS, searchIcons } from '../../lib/resources'
import { useStudio } from '../../store/useStudio'
import { Disclosure } from '../primitives/Disclosure'

/**
 * Pictogram picker: a searchable grid of the brain's icons.
 *
 * Seventy icons do not fit in a sidebar without either a scroll well inside a scroll well or a search
 * box, so this is the one picker that gets both — the box narrows the grid, and the grid itself
 * scrolls within a fixed height so the sections below it stay reachable.
 *
 * The path data comes from the curated brain, which validates every icon's path at load time, and it
 * is handed to `d` as an attribute rather than interpolated into markup.
 */
export function IconPicker() {
  const { t } = useI18n()
  const icon = useStudio(state => state.icon)
  const engine = useStudio(state => state.engine)
  const setField = useStudio(state => state.setField)

  const [query, setQuery] = useState('')
  const searchId = useId()

  const results = searchIcons(query)
  const chosen = ALL_ICONS.find(entry => entry.key === icon)

  // Two engines draw a pictogram and three do not. Saying so is better than showing seventy icons
  // that the reader can select and see nothing change.
  const unused = !ENGINE_USES_ICON[engine]

  return (
    <Disclosure
      title={t('resource.icon')}
      summary={unused ? t('resource.usesIcon') : (chosen?.key ?? t('resource.auto'))}
      enabled={!unused}
    >
      <div className="flex flex-col gap-2.5">
        <input
          id={searchId}
          type="search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('resource.search')}
          aria-label={t('resource.search')}
          onChange={event => {
            setQuery(event.currentTarget.value)
          }}
          className="h-8 w-full rounded-control bg-[var(--surface-sunken)] px-2.5 text-caption text-ink
            shadow-[var(--shadow-inset)] transition-shadow duration-fast
            placeholder:text-ink-faint hover:bg-[var(--surface-raised)]
            focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />

        <div
          role="radiogroup"
          aria-label={t('resource.icon')}
          className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto pr-0.5"
        >
          <IconTile
            label={t('resource.auto')}
            title={t('resource.autoHint')}
            selected={icon === ''}
            onClick={() => {
              setField('icon', '')
            }}
          />
          {results.map(entry => (
            <IconTile
              key={entry.key}
              label={entry.key}
              title={`${entry.key} · ${entry.tags.slice(0, 3).join(', ')}`}
              selected={icon === entry.key}
              path={entry.path}
              viewBox={entry.viewBox}
              onClick={() => {
                setField('icon', entry.key)
              }}
            />
          ))}
        </div>

        {/* Always present, so a search that matches nothing does not collapse the grid and reflow
            everything below it. */}
        <p className="type-caption min-h-4 text-ink-faint">
          {results.length === 0
            ? t('resource.noMatch')
            : t('resource.iconCount', { count: results.length })}
        </p>
      </div>
    </Disclosure>
  )
}

interface IconTileProps {
  label: string
  title: string
  selected: boolean
  onClick: () => void
  path?: string
  viewBox?: string
}

function IconTile({ label, title, selected, onClick, path, viewBox }: IconTileProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={`flex aspect-square items-center justify-center rounded-chip p-1.5 transition-colors duration-fast
        ${
          selected
            ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
            : 'hover:bg-[var(--surface-sunken)]'
        }`}
    >
      {path === undefined || viewBox === undefined ? (
        // The "automatic" tile has nothing to draw, so it gets the same marker the palette grid uses
        // rather than an empty cell that reads as a broken icon.
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full border-2 ${selected ? 'border-[var(--accent)]' : 'border-ink-faint'}`}
        />
      ) : (
        <svg
          viewBox={viewBox}
          className="h-full w-full text-ink"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={path} />
        </svg>
      )}
    </button>
  )
}
