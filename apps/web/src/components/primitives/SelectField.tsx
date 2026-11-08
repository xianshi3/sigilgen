import type { ReactNode } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps {
  label: ReactNode
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * A labelled native select.
 *
 * Native rather than a custom listbox: the font and pictogram catalogues are long, and the platform
 * picker already gives type-ahead, keyboard navigation and a scrollbar that behaves like every other
 * scrollbar on the machine.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SelectFieldProps) {
  return (
    <label className={`flex flex-col gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <span className="type-caption text-ink-soft">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={event => {
          onChange(event.currentTarget.value)
        }}
        className="h-8 w-full rounded-control border border-[var(--hairline)] bg-transparent px-1.5
          text-caption text-ink transition-colors duration-fast
          hover:border-[var(--hairline-strong)] focus:border-[var(--accent)] focus:outline-none"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
