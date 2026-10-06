export interface RangeFieldProps {
  label: React.ReactNode
  value: number
  min: number
  max: number
  step?: number
  /** Formats the readout, e.g. to add a unit. */
  format?: (value: number) => string
  onChange: (value: number) => void
  disabled?: boolean
}

/**
 * A labelled slider with a live readout.
 *
 * The readout is the editable part: dragging is imprecise, so the number beside it is what a reader
 * can trust, and it doubles as the exact value once the pointer is released.
 */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  disabled = false,
}: RangeFieldProps) {
  const ratio = max === min ? 0 : (value - min) / (max - min)

  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="type-caption text-ink-soft">{label}</span>
        <span className="type-caption text-ink tabular-nums">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => {
          onChange(Number(event.currentTarget.value))
        }}
        className="h-4 w-full cursor-pointer appearance-none bg-transparent
          [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full
          [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[var(--surface-raised)]
          [&::-webkit-slider-thumb]:shadow-[0_0_0_0.5px_var(--hairline-strong),0_1px_3px_oklch(0.22_0.01_260/0.25)]
          [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-fast
          hover:[&::-webkit-slider-thumb]:scale-110
          [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--surface-raised)]"
        style={{
          // The filled portion of the track is drawn with a gradient so the control needs no extra
          // element behind it.
          ['--track' as string]: `linear-gradient(to right,
            var(--accent) 0%, var(--accent) ${ratio * 100}%,
            var(--hairline-strong) ${ratio * 100}%, var(--hairline-strong) 100%)`,
          backgroundImage: 'var(--track)',
          backgroundSize: '100% 4px',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
    </label>
  )
}
