/**
 * Deterministic number and string formatting helpers.
 *
 * Everything that reaches SVG output goes through here. `String(0.1 + 0.2)` and friends are stable
 * in JavaScript but produce long, noisy decimals; rounding to a fixed precision first keeps emitted
 * path data short *and* byte-identical across platforms and Node versions.
 */

/** Number of decimals kept in emitted path data and coordinates. */
export const PRECISION = 2

/** Multiplier used to round to {@link PRECISION} decimals. */
const SCALE = 10 ** PRECISION

/**
 * Rounds a number to {@link PRECISION} decimals and returns it as a string.
 *
 * Negative zero is normalised to `0`, and non-finite values collapse to `0` so a degenerate
 * computation can never inject `NaN` or `Infinity` into output.
 *
 * @param value - The number to format.
 * @returns A compact decimal string with no exponent and no trailing zeros.
 */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value * SCALE) / SCALE
  const normalised = Object.is(rounded, -0) ? 0 : rounded
  return String(normalised)
}

/**
 * Rounds a number to {@link PRECISION} decimals, returning a number rather than a string.
 *
 * @param value - The number to round.
 * @returns The rounded number, with `-0` normalised to `0`.
 */
export function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const rounded = Math.round(value * SCALE) / SCALE
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Clamps a number into an inclusive range.
 *
 * @param value - The number to clamp.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns `value` limited to `[min, max]`.
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

/**
 * Returns the keys of an object in a stable, sorted order.
 *
 * Picking from an object must never depend on insertion or hash order, so every such choice sorts
 * first. See the determinism rules in `AGENTS.md`.
 *
 * @param record - The object whose keys to list.
 * @returns A new array of keys in ascending code-unit order.
 */
export function sortedKeys<T>(record: Record<string, T>): string[] {
  return Object.keys(record).toSorted()
}
