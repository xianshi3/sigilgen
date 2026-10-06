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
    <section className="flex flex-col gap-2.5">
      <button
        type="button"
        aria-expanded={enabled && open}
        aria-controls={bodyId}
        disabled={!enabled}
        onClick={() => {
          setOpen(previous => !previous)
        }}
        className="group flex items-baseline justify-between gap-2 text-left disabled:cursor-default"
      >
        <span className="flex items-baseline gap-1">
          <span
            aria-hidden="true"
            className={`text-micro leading-none text-ink-faint transition-transform duration-base ease-apple
              ${open ? 'rotate-90' : ''} ${enabled ? 'group-hover:text-ink-soft' : ''}`}
          >
            ›
          </span>
          <span className={`type-caps ${enabled ? 'text-ink-faint' : 'text-ink-faint/50'}`}>
            {title}
          </span>
        </span>
        {summary === undefined ? null : (
          <span className="truncate type-caption text-ink-faint">{summary}</span>
        )}
      </button>
      {/* Kept mounted when open and unmounted when closed rather than hidden, so the icon grid's
          search box does not keep its text after the reader has put it away. */}
      {enabled && open ? <div id={bodyId}>{children}</div> : null}
    </section>
  )
}
