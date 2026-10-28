import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

/**
 * Press feedback is a scale of 0.97 rather than a colour change: at the size these controls are used,
 * a slight shrink reads as physical feedback the way a colour shift does not.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-[var(--accent-ink)] shadow-[var(--shadow-card)] hover:brightness-110 active:brightness-95',
  secondary:
    'bg-[var(--surface-raised)] text-ink hairline-b shadow-[var(--shadow-card)] hover:bg-[var(--surface-sunken)]',
  ghost: 'text-ink-soft hover:text-ink hover:bg-[var(--accent-soft)]',
}

/**
 * `size` no longer sets the height. Both tiers sit on `--control-h`, because a control shorter than its
 * neighbour is a control harder to hit than its neighbour — and a 28px button next to a 32px input is a
 * difference nobody can name and everybody can feel. What separates the tiers is the horizontal padding
 * and the type size, which is what the names were really about.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-[var(--control-h)] px-2.5 text-caption',
  md: 'h-[var(--control-h)] px-3.5 text-body',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-medium
        transition-[transform,background-color,filter,opacity] duration-fast ease-apple
        active:scale-[var(--scale-press)] disabled:pointer-events-none disabled:opacity-40
        ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    />
  )
}
