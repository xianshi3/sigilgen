import type { ReactNode } from 'react'

export interface SectionProps {
  title: ReactNode
  /** Optional control rendered on the trailing edge of the heading row. */
  action?: ReactNode
  children: ReactNode
}

/** A titled group of controls inside a panel. */
export function Section({ title, action, children }: SectionProps) {
  return (
    // A hairline above every section but the first: the panels are read as a stack of rules with controls
    // between them, not as cards. That is the whole of the reference's grouping grammar.
    <section
      className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-4
        first:border-t-0 first:pt-0"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="type-caps text-ink-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
