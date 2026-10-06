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
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="type-caps text-ink-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
