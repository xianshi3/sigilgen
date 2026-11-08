import type { ReactNode } from 'react'

export interface NumberFieldProps {
  label: ReactNode
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Called before the first change of a gesture, for one undo step per edit. */
  onFocus?: () => void
  disabled?: boolean
}

/**
 * A compact numeric field for geometry.
 *
 * The inspector edits many coordinates at once, so a full-width labelled input per value would turn a
 * 300px panel into a form. The label and the number share a line; the number is right-aligned so a
 * column of them can be read as a table.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  onFocus,
  disabled = false,
}: NumberFieldProps) {
  return (
    <label className={`flex items-center justify-between gap-2 ${disabled ? 'opacity-40' : ''}`}>
      <span className="type-caption shrink-0 text-ink-soft">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={onFocus}
        onChange={event => {
          const next = event.currentTarget.valueAsNumber
          if (Number.isFinite(next)) {
            onChange(next)
          }
        }}
        className="h-8 w-20 rounded-control border border-[var(--hairline)] bg-transparent px-2
          text-right text-caption text-ink tabular-nums transition-colors duration-fast
          hover:border-[var(--hairline-strong)] focus:border-[var(--accent)] focus:outline-none"
      />
    </label>
  )
}
