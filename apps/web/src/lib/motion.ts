/**
 * The app's motion curve, in the form framer-motion needs it.
 *
 * `tokens.css` already defines `--ease-apple` and `--duration-base`, and every CSS transition in the
 * studio reads them. Framer-motion animates an inline style and cannot read a custom property — it
 * wants a four-number cubic Bézier and a duration in seconds — so those same two values have to be
 * written a second time as numbers.
 *
 * This module is that second copy, in one place. It existed inline in three call sites instead, at
 * two different durations: the stage sheet and both drawers, each with the curve spelled out. A
 * change to the curve in `tokens.css` would have reached the CSS transitions and silently missed the
 * ones framer-motion drives, which is the kind of drift that only shows up as "the drawer feels
 * different from the card" weeks later.
 *
 * The durations are not duplicated from `--duration-base`; they are the values that token describes,
 * and the larger one is deliberate — a panel travelling the full height of the viewport takes longer
 * than a mark fading in place, and matching them would make one of the two feel rushed.
 */

/** Apple's signature curve: a quick departure that settles slowly. Mirrors `--ease-apple`. */
export const EASE_APPLE: [number, number, number, number] = [0.32, 0.72, 0, 1]

/** Seconds. Mirrors `--duration-base`. */
export const DURATION_BASE = 0.24

/** Seconds, for a panel travelling a long distance. No CSS counterpart: nothing transitions on it. */
export const DURATION_PANEL = 0.28

/**
 * The transition for a panel opening or closing.
 *
 * Under `prefers-reduced-motion` the travel is what has to go, and here the travel is the `width`: it
 * reflows the stage, which is precisely the motion that setting asks to be spared. The blanket
 * `transition-duration` override in `tokens.css` cannot reach it — framer-motion writes an inline style
 * rather than starting a CSS transition — so this is the second place that has to ask.
 *
 * The fade goes with it at duration 0, which is fine: the panel still opens, it just arrives. The two
 * opacity-only animations elsewhere, the scrim and the mark's cross-fade, deliberately keep their
 * duration, because a fade in place is not the kind of movement the setting is about.
 *
 * @param reduced - Whether the system asks for less motion.
 * @returns The transition object to hand to `motion`.
 */
export function panelTransition(reduced: boolean): {
  duration: number
  ease: [number, number, number, number]
} {
  return { duration: reduced ? 0 : DURATION_PANEL, ease: EASE_APPLE }
}
