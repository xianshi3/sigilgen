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
        // An underline, not a filled box. A field is a line of writing on the page; a sunken rounded box
        // is a form control from a different product. The border does the focus signal as well, so the
        // field keeps one rule at rest and one under the pointer.
        className="h-8 w-full border-b border-[var(--hairline-strong)] bg-transparent px-0 text-body
          text-ink transition-colors duration-fast placeholder:text-ink-faint
          hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
        {...rest}
      />
      {/* Always rendered, so that adding or removing a hint cannot reflow the fields below it. */}
      <span id={hintId} className="type-caption min-h-4 text-ink-faint">
        {hint}
      </span>
    </div>
  )
}
