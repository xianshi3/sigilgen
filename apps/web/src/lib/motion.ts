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
