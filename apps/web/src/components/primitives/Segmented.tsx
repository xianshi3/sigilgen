import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

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
 *
 * ## Keyboard behaviour
 *
 * `role="radiogroup"` is a contract, not a label. A group of radios is expected to be **one** tab stop,
 * with the arrow keys moving between the options and selecting as they go. Without that, every segment
 * is its own tab stop — a reader tabbing through the studio passed through eight stops to get from the
 * language control to the theme control, and the arrow keys that a screen reader announces as available
 * did nothing at all.
 *
 * Selection follows focus, which is what the native control does, and the group wraps at both ends so a
 * held arrow key cycles rather than sticking.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
  ...rest
}: SegmentedProps<T>) {
  const activeIndex = options.findIndex(option => option.value === value)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const group = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  // The highlight is positioned from the selected button's *measured* box, not from arithmetic on the
  // option count.
  //
  // Every segment here has a different width — "中文" is two Han glyphs and "English" is seven Latin
  // ones, "Light" is shorter than "Checkerboard" — and they are separated by a gap. Dividing the track
  // by the number of options assumes equal columns that do not exist, so the pill drifted further from
  // its label the further right the selection went. The previous `translateX(index * 100%)` over a
  // `calc((100% - 0.25rem) / n)` width was wrong twice over: the track is inset by the container's own
  // padding, which is twice that, and the segments are not equal to begin with.
  //
  // Measured instead of derived, because nothing in the markup can predict the result: the labels change
  // length between languages, and the webfont arrives after the first paint.
  useLayoutEffect(() => {
    const container = group.current
    const button = activeIndex < 0 ? null : (buttons.current[activeIndex] ?? null)
    if (container === null || button === null) {
      setPill(null)
      return
    }

    const measure = (): void => {
      const from = container.getBoundingClientRect()
      const to = button.getBoundingClientRect()
      setPill({ left: to.left - from.left, width: to.width })
    }
    measure()

    // Observing both ends of the comparison: the container for a window resize, the button for a label
    // that changes length — a language switch, or a webfont swapping in and reflowing the text. Both are
    // things the effect's own dependencies cannot see, which is why they are watched rather than listed.
    //
    // Guarded because jsdom has no `ResizeObserver`. The first measurement has already run by then, so
    // the control is still correctly positioned there — it just will not follow a later resize.
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(button)
    return () => {
      observer.disconnect()
    }
    // `activeIndex` alone, and that is the whole story: the effect reads the *selected button*, not the
    // option list, so it re-runs exactly when that button changes. Growing or shrinking the list either
    // changes the index or leaves the selected button untouched — and if it is untouched, its measured box
    // is still the right one. Listing `options` would re-measure on every render, because it is an array
    // literal at every call site.
  }, [activeIndex])

  /**
   * Moves the selection, and the focus with it.
   *
   * @param from - Index the reader is moving away from.
   * @param delta - How far to move; wrapped into range so the group cycles.
   */
  const move = (from: number, delta: number): void => {
    const count = options.length
    if (count === 0) {
      return
    }
    const next = (((from + delta) % count) + count) % count
    const option = options[next]
    if (option === undefined) {
      return
    }
    onChange(option.value)
    buttons.current[next]?.focus()
  }

  /**
   * Handles the keys a radiogroup is expected to answer to.
   *
   * @param event - The key event on the focused segment.
   * @param index - Index of that segment.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        move(index, 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        move(index, -1)
        break
      case 'Home':
        event.preventDefault()
        move(0, 0)
        break
      case 'End':
        event.preventDefault()
        move(options.length - 1, 0)
        break
      default:
        break
    }
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      className={`relative flex w-fit gap-0.5 rounded-control bg-[var(--surface-sunken)] p-0.5 ${className}`}
      {...rest}
    >
      {pill === null ? null : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[calc(var(--radius-control)-0.125rem)]
            bg-[var(--surface-raised)] shadow-[var(--shadow-control)]
            transition-[transform,width] duration-base ease-apple"
          style={{
            width: `${pill.width}px`,
            // Only the transform is transitioned between selections; `width` rides along so a move
            // between segments of different widths reads as the pill resizing, which is what the native
            // control does.
            transform: `translateX(${pill.left}px)`,
          }}
        />
      )}
      {options.map((option, index) => {
        const selected = option.value === value
        // One tab stop for the whole group, the selected option keeping it. Everything else is reachable
        // with the arrow keys, which is what a `radiogroup` promises.
        //
        // If nothing matches — a stored value from an older build naming an option that no longer exists —
        // the first option takes the tab stop, because a group in which nothing is reachable by keyboard
        // is worse than one showing a stale selection.
        const isTabStop = activeIndex < 0 ? index === 0 : selected
        return (
          <button
            key={option.value}
            ref={element => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={isTabStop ? 0 : -1}
            title={option.title}
            onKeyDown={event => {
              onKeyDown(event, index)
            }}
            onClick={() => {
              onChange(option.value)
            }}
            // `shrink-0` rather than truncating: these labels change length between languages, and a
            // fixed track would clip "System" or "跟随系统" in one of them.
            // `py-1` around a caption line came to 31px: a tier below the buttons this control sits next
            // to, and one that changed with the locale, because Han and Latin lines are different
            // heights. The height comes from the one token now, so the group stops being its own size.
            className={`relative z-1 inline-flex h-[var(--control-h)] shrink-0 items-center
              justify-center whitespace-nowrap rounded-[calc(var(--radius-control)-0.125rem)]
              px-2.5 text-caption font-medium transition-colors duration-fast
              ${selected ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
