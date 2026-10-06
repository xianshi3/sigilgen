import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Shown as a tooltip. Used where the label alone cannot carry the meaning. */
  title?: string
}

export interface SegmentedProps<T extends string> {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  'aria-label': string
  className?: string
}

/**
 * A row of mutually exclusive choices.
 *
 * The moving highlight behind the selected segment is the whole point: it is the one piece of motion
 * in the control, and it tells the eye where the value went without the label having to change
 * contrast to signal selection.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
  ...rest
}: SegmentedProps<T>) {
  const activeIndex = options.findIndex(option => option.value === value)

  return (
    <div
      role="radiogroup"
      className={`relative flex w-fit gap-0.5 rounded-control bg-[var(--surface-sunken)] p-0.5 ${className}`}
      {...rest}
    >
      {activeIndex >= 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-0.5 bottom-0.5 rounded-[calc(var(--radius-control)-2px)] bg-[var(--surface-raised)]
            shadow-[0_1px_2px_oklch(0.22_0.01_260/0.10),0_0_0_0.5px_var(--hairline)]
            transition-transform duration-base ease-apple"
          style={{
            width: `calc((100% - 0.25rem) / ${options.length})`,
            transform: `translateX(calc(${activeIndex} * 100%))`,
            left: '0.125rem',
          }}
        />
      ) : null}
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
            // `shrink-0` rather than truncating: these labels change length between languages, and a
            // fixed track would clip "System" or "跟随系统" in one of them.
            className={`relative z-1 shrink-0 whitespace-nowrap rounded-[calc(var(--radius-control)-2px)]
              px-2.5 py-1 text-caption font-medium transition-colors duration-fast
              ${selected ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
