import { useId, useState, type ReactNode } from 'react'

export interface DisclosureProps {
  title: ReactNode
  /** Shown on the right of the heading row: the current value, a count, a warning. */
  summary?: ReactNode
  /** False renders the title and the summary but no body, for a section that is not available yet. */
  enabled?: boolean
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * A section heading that opens and closes its body.
 *
 * Collapsing is not decoration here. The resource pickers hold 121 items between them, and a sidebar
 * that renders all of them at once pushes the brand name — the one field that must always be visible
 * — off the bottom of the panel. Folding the long ones keeps the short path short, and the summary line
 * keeps the current choice readable while the body is closed.
 *
 * The disclosure is driven by `aria-expanded` on a real button rather than by `<details>`, so the
 * chevron can rotate and the body can animate without fighting the platform's own marker.
 */
export function Disclosure({
  title,
  summary,
  enabled = true,
  defaultOpen = false,
  children,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={enabled && open}
        aria-controls={bodyId}
        disabled={!enabled}
        onClick={() => {
          setOpen(previous => !previous)
        }}
        // Negative margins let the row's own breathing room extend past the gutter to the panel edge,
        // so widening the touch target costs the layout no horizontal space.
        className="group -mx-2 flex min-h-8 items-center justify-between gap-2 rounded-control px-2
          text-left transition-colors duration-fast hover:bg-[var(--surface-sunken)]
          disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`text-caption leading-none text-ink-faint transition-transform duration-base
              ease-apple ${open ? 'rotate-90' : ''} ${enabled ? 'group-hover:text-ink-soft' : ''}`}
          >
            ›
          </span>
          <span className={`type-caps ${enabled ? 'text-ink-faint' : 'text-ink-faint/40'}`}>
            {title}
          </span>
        </span>
        {summary === undefined ? null : (
          <span className="min-w-0 truncate type-caption text-ink-soft">{summary}</span>
        )}
      </button>
      {/* Kept mounted when open and unmounted when closed rather than hidden, so the icon grid's
          search box does not keep its text after the reader has put it away. */}
      {enabled && open ? <div id={bodyId}>{children}</div> : null}
    </section>
  )
}
