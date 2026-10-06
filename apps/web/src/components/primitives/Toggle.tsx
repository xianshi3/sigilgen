export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  disabled?: boolean
}

/** A switch. Uses a real checkbox so keyboard and form behaviour come for free. */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 ${disabled ? 'opacity-40' : ''}`}
    >
      <span className="type-caption text-ink-soft">{label}</span>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={event => {
            onChange(event.currentTarget.checked)
          }}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="block h-5 w-9 rounded-full transition-colors duration-base ease-apple
            bg-[var(--hairline-strong)] peer-checked:bg-accent peer-focus-visible:ring-2
            peer-focus-visible:ring-[var(--accent)]/40 peer-focus-visible:ring-offset-2"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white
            shadow-[0_1px_3px_oklch(0.22_0.01_260/0.3)]
            transition-transform duration-base ease-apple peer-checked:translate-x-4"
        />
      </span>
    </label>
  )
}
