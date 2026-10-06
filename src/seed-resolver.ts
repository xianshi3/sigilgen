/**
 * Deterministic pseudo-randomness.
 *
 * Every "random" choice in Sigilgen comes from here. The class hashes its inputs once with SHA-256
 * and then hands out values read from that digest, so the whole generation pipeline is a pure
 * function of its inputs: identical inputs always produce identical output, on any platform, in any
 * process.
 *
 * Banned by construction: `Math.random`, `Date.now`, and any dependence on object iteration order.
 * When a choice must be made from a keyed collection, sort the keys first (see `src/format.ts`).
 */

import { sha256, toHex } from './sha256'

/** Denominator used to convert a 32-bit digest chunk into the unit interval. */
const UNIT = 0x1_0000_0000

/**
 * A reproducible stream of numbers derived from a set of inputs.
 *
 * ```ts
 * const seed = new SeedResolver('Acme', 'tech, minimal', 0)
 * seed.nextFloat()      // 0.0 – 1.0
 * seed.int(0, 5)        // 0 – 5
 * seed.choice(['a', 'b'])
 * ```
 */
export class SeedResolver {
  /** Digest of the constructor inputs. */
  private readonly digest: Uint8Array

  /** Index into {@link digest} for the next four-byte read. */
  private cursor = 0

  /**
   * Hashes the inputs into a deterministic stream.
   *
   * Inputs are joined with `|` after string coercion. Because `|` can appear inside an input, each
   * part is prefixed with its length, so `['a|b']` and `['a', 'b']` cannot collide.
   *
   * @param inputs - Strings or numbers that fully determine the stream.
   */
  constructor(...inputs: (string | number)[]) {
    const payload = inputs
      .map(input => {
        const text = String(input)
        return `${text.length}:${text}`
      })
      .join('|')
    this.digest = sha256(`sigilgen:v1|${payload}`)
  }

  /**
   * Returns the digest of this stream's inputs as lowercase hex.
   *
   * Useful for deriving independent child streams and for showing a reproducible identifier.
   *
   * @returns A 64-character hex string.
   */
  hex(): string {
    return toHex(this.digest)
  }

  /**
   * Returns the next value in `[0, 1)`.
   *
   * @returns A float in the unit interval.
   */
  nextFloat(): number {
    const start = this.cursor % this.digest.length
    const bytes = new Uint8Array(4)
    for (let index = 0; index < 4; index++) {
      bytes[index] = this.digest[(start + index) % this.digest.length] as number
    }
    const value = new DataView(bytes.buffer).getUint32(0, false)
    this.cursor += 4
    return value / UNIT
  }

  /**
   * Returns the next value in `[min, max)`.
   *
   * @param min - Inclusive lower bound.
   * @param max - Exclusive upper bound.
   * @returns A float in the requested range.
   */
  range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min)
  }

  /**
   * Returns the next integer in `[min, max]`, both bounds inclusive.
   *
   * @param min - Inclusive lower bound.
   * @param max - Inclusive upper bound.
   * @returns An integer in the requested range.
   */
  int(min: number, max: number): number {
    if (max <= min) {
      return min
    }
    const span = max - min + 1
    return min + Math.min(Math.floor(this.nextFloat() * span), span - 1)
  }

  /**
   * Deterministically picks one element of a non-empty array.
   *
   * @param items - Candidates to choose from.
   * @returns The chosen element.
   * @throws {TypeError} When `items` is empty.
   */
  choice<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new TypeError('SeedResolver.choice() requires a non-empty array')
    }
    const index = Math.min(Math.floor(this.nextFloat() * items.length), items.length - 1)
    return items[index] as T
  }

  /**
   * Deterministically picks one weighted bucket.
   *
   * @param buckets - Candidates with non-negative weights.
   * @returns The chosen bucket's `value`.
   * @throws {TypeError} When `buckets` is empty or every weight is zero.
   */
  weighted<T>(buckets: readonly { value: T; weight: number }[]): T {
    if (buckets.length === 0) {
      throw new TypeError('SeedResolver.weighted() requires at least one bucket')
    }
    let total = 0
    for (const bucket of buckets) {
      total += Math.max(0, bucket.weight)
    }
    if (total <= 0) {
      return (buckets[0] as { value: T }).value
    }
    let ticket = this.nextFloat() * total
    for (const bucket of buckets) {
      ticket -= Math.max(0, bucket.weight)
      if (ticket < 0) {
        return bucket.value
      }
    }
    return (buckets[buckets.length - 1] as { value: T }).value
  }

  /**
   * Deterministically shuffles a copy of `items` using Fisher-Yates.
   *
   * @param items - Items to shuffle.
   * @returns A new, shuffled array.
   */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let index = out.length - 1; index > 0; index--) {
      const swap = Math.min(Math.floor(this.nextFloat() * (index + 1)), index)
      const a = out[index] as T
      const b = out[swap] as T
      out[index] = b
      out[swap] = a
    }
    return out
  }

  /**
   * Returns `true` with the given probability.
   *
   * @param probability - Chance of returning `true`, clamped to `[0, 1]`.
   * @returns Whether the draw succeeded.
   */
  chance(probability: number): boolean {
    return this.nextFloat() < probability
  }

  /**
   * Creates an independent child stream.
   *
   * Lets a pipeline stage branch without disturbing the caller's stream, which is what keeps concept
   * generation order-independent: concept 2 never sees values consumed by concept 1.
   *
   * @param label - A label that distinguishes the child stream.
   * @returns A new resolver.
   */
  derive(label: string): SeedResolver {
    return new SeedResolver(this.hex(), label)
  }
}

/**
 * Creates a resolver from an ordered list of parts.
 *
 * A small helper so callers do not have to remember that `new SeedResolver(...)` is variadic.
 *
 * @param parts - Ordered inputs.
 * @returns A resolver seeded from `parts`.
 */
export function seeded(...parts: (string | number)[]): SeedResolver {
  return new SeedResolver(...parts)
}
