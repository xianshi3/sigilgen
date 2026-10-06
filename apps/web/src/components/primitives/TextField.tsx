import type { InputHTMLAttributes, ReactNode } from 'react'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: ReactNode
  /** Persistent help text. Associated with `aria-describedby` rather than placed inside the label,
   *  because text inside a label becomes part of the accessible name, and a field should not be
   *  announced together with its own instructions. */
  hint?: ReactNode
  /** Rendered on the trailing edge of the label row. */
  trailing?: ReactNode
}

export function TextField({ label, hint, trailing, id, ...rest }: TextFieldProps) {
  const hintId = id === undefined ? undefined : `${id}-hint`

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-baseline justify-between gap-2" htmlFor={id}>
        <span className="type-caption text-ink-soft">{label}</span>
        {trailing}
      </label>
      <input
        id={id}
        aria-describedby={hint === undefined ? undefined : hintId}
        className="h-8 w-full rounded-control bg-[var(--surface-sunken)] px-2.5 text-body text-ink
          shadow-[var(--shadow-inset)] transition-shadow duration-fast
          placeholder:text-ink-faint hover:bg-[var(--surface-raised)]
          focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        {...rest}
      />
      {/* Always rendered, so that adding or removing a hint cannot reflow the fields below it. */}
      <span id={hintId} className="type-caption min-h-4 text-ink-faint">
        {hint}
      </span>
    </div>
  )
}
