import { useRef, type KeyboardEvent, type ReactNode } from 'react'

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
      role="radiogroup"
      className={`relative flex w-fit gap-0.5 rounded-control bg-[var(--surface-sunken)] p-0.5 ${className}`}
      {...rest}
    >
      {activeIndex >= 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-0.5 bottom-0.5 rounded-[calc(var(--radius-control)-0.125rem)]
            bg-[var(--surface-raised)] shadow-[var(--shadow-control)]
            transition-transform duration-base ease-apple"
          style={{
            width: `calc((100% - 0.25rem) / ${options.length})`,
            transform: `translateX(calc(${activeIndex} * 100%))`,
            left: '0.125rem',
          }}
        />
      ) : null}
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
            className={`relative z-1 shrink-0 whitespace-nowrap
              rounded-[calc(var(--radius-control)-0.125rem)]
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
