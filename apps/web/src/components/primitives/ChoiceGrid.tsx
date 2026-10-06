import type { ReactNode } from 'react'

export interface ChoiceGridOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export interface ChoiceGridProps<T extends string> {
  value: T
  options: readonly ChoiceGridOption<T>[]
  onChange: (value: T) => void
  'aria-label': string
  /** Grid columns at the widest breakpoint. Three fits six Chinese engine names in two tidy rows. */
  columns?: 2 | 3
}

/**
 * Mutually exclusive choices that wrap onto several rows.
 *
 * `Segmented` slides a single highlight along one track, which needs every option on one line. Six
 * engine names will not fit a 288px panel in any language, so this variant wraps and marks the chosen
 * cell instead — the selection has to survive the wrap, and a sliding highlight cannot cross rows.
 */
export function ChoiceGrid<T extends string>({
  value,
  options,
  onChange,
  columns = 3,
  'aria-label': ariaLabel,
}: ChoiceGridProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid gap-1 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
    >
      {options.map(option => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => {
              onChange(option.value)
            }}
            className={`truncate rounded-control px-1.5 py-1.5 text-center text-caption font-medium
              transition-all duration-fast ease-apple
              ${
                selected
                  ? 'bg-accent text-white shadow-[var(--shadow-card)]'
                  : 'bg-[var(--surface-sunken)] text-ink-soft hover:bg-[var(--surface-raised)] hover:text-ink'
              }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
