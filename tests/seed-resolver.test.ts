import { describe, expect, it } from 'vitest'
import { SeedResolver, seeded } from '../src/seed-resolver'

describe('SeedResolver', () => {
  it('produces the same float sequence for the same inputs', () => {
    const first = new SeedResolver('Acme', 'tech, minimal', 0)
    const second = new SeedResolver('Acme', 'tech, minimal', 0)
    const a = Array.from({ length: 32 }, () => first.nextFloat())
    const b = Array.from({ length: 32 }, () => second.nextFloat())
    expect(a).toEqual(b)
  })

  it('produces a different sequence when any input changes', () => {
    const base = Array.from(
      { length: 16 },
      (
        (s = new SeedResolver('Acme', 0)) =>
        () =>
          s.nextFloat()
      )()
    )
    for (const variant of [
      ['Acme!', 0],
      ['acme', 0],
      ['Acme', 1],
      ['Acme', 'tech'],
    ]) {
      const other = new SeedResolver(...variant)
      const values = Array.from({ length: 16 }, () => other.nextFloat())
      expect(values).not.toEqual(base)
    }
  })

  it('cannot be made to collide by shifting a pipe character between inputs', () => {
    // Inputs are length-prefixed, so these must not hash the same.
    expect(new SeedResolver('a|b').hex()).not.toBe(new SeedResolver('a', 'b').hex())
  })

  it('stays inside the unit interval', () => {
    const seed = new SeedResolver('bounds')
    for (let index = 0; index < 512; index++) {
      const value = seed.nextFloat()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('wraps around the digest rather than running out of bytes', () => {
    const seed = new SeedResolver('wrap')
    // More reads than the digest has bytes must keep working and stay in range.
    for (let index = 0; index < 100; index++) {
      expect(seed.nextFloat()).toBeLessThan(1)
    }
  })

  it('produces a roughly uniform distribution', () => {
    const buckets = Array.from<number>({ length: 10 }).fill(0)
    for (let index = 0; index < 10_000; index++) {
      const value = new SeedResolver('uniform', index).nextFloat()
      buckets[Math.floor(value * 10)] = (buckets[Math.floor(value * 10)] ?? 0) + 1
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800)
      expect(count).toBeLessThan(1200)
    }
  })

  it('maps ranges inclusively at the bottom and exclusively at the top', () => {
    const seed = new SeedResolver('range')
    for (let index = 0; index < 200; index++) {
      const value = seed.range(-5, 5)
      expect(value).toBeGreaterThanOrEqual(-5)
      expect(value).toBeLessThan(5)
    }
  })

  it('returns integers inclusive of both bounds', () => {
    const seen = new Set<number>()
    for (let round = 0; round < 2000; round++) {
      const value = new SeedResolver('int', round).int(1, 4)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(4)
      seen.add(value)
    }
    expect([...seen].toSorted()).toEqual([1, 2, 3, 4])
  })

  it('clamps a degenerate integer range to its lower bound', () => {
    expect(new SeedResolver('degenerate').int(7, 7)).toBe(7)
    expect(new SeedResolver('degenerate').int(9, 2)).toBe(9)
  })

  it('picks from arrays deterministically', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const first = Array.from(
      { length: 20 },
      (
        (s = new SeedResolver('choice')) =>
        () =>
          s.choice(items)
      )()
    )
    const second = Array.from(
      { length: 20 },
      (
        (s = new SeedResolver('choice')) =>
        () =>
          s.choice(items)
      )()
    )
    expect(first).toEqual(second)
    for (const value of first) {
      expect(items).toContain(value)
    }
  })

  it('covers the whole array when picking repeatedly', () => {
    const items = ['a', 'b', 'c', 'd']
    const picked = new Set<string>()
    for (let index = 0; index < 400; index++) {
      picked.add(new SeedResolver('cover', index).choice(items))
    }
    expect(picked.size).toBe(items.length)
  })

  it('rejects an empty array', () => {
    expect(() => new SeedResolver('empty').choice([])).toThrow(TypeError)
  })

  it('honours weights', () => {
    const buckets = [
      { value: 'heavy', weight: 90 },
      { value: 'light', weight: 10 },
    ]
    let heavy = 0
    for (let index = 0; index < 2000; index++) {
      if (new SeedResolver('weights', index).weighted(buckets) === 'heavy') {
        heavy++
      }
    }
    expect(heavy).toBeGreaterThan(1600)
    expect(heavy).toBeLessThan(2000)
  })

  it('falls back to the first bucket when every weight is zero', () => {
    const seed = new SeedResolver('zero')
    expect(
      seed.weighted([
        { value: 'a', weight: 0 },
        { value: 'b', weight: 0 },
      ])
    ).toBe('a')
  })

  it('rejects an empty bucket list', () => {
    expect(() => new SeedResolver('nobuckets').weighted([])).toThrow(TypeError)
  })

  it('shuffles without losing or duplicating elements', () => {
    const items = Array.from({ length: 12 }, (_, index) => index)
    const shuffled = new SeedResolver('shuffle').shuffle(items)
    expect(shuffled).toHaveLength(items.length)
    expect([...shuffled].toSorted((a, b) => a - b)).toEqual(items)
    expect(items).toEqual(Array.from({ length: 12 }, (_, index) => index))
  })

  it('shuffles deterministically', () => {
    const items = Array.from({ length: 10 }, (_, index) => index)
    expect(new SeedResolver('s1').shuffle(items)).toEqual(new SeedResolver('s1').shuffle(items))
  })

  it('respects chance probabilities', () => {
    let hits = 0
    for (let index = 0; index < 4000; index++) {
      if (new SeedResolver('chance', index).chance(0.25)) {
        hits++
      }
    }
    expect(hits).toBeGreaterThan(850)
    expect(hits).toBeLessThan(1150)
    expect(new SeedResolver('never').chance(0)).toBe(false)
    expect(new SeedResolver('always').chance(1)).toBe(true)
  })

  it('derives independent child streams', () => {
    const parent = new SeedResolver('parent')
    const a = parent.derive('a')
    const b = parent.derive('b')
    expect(a.hex()).not.toBe(b.hex())
    expect(a.hex()).not.toBe(parent.hex())
    // A child stream is a function of its label alone, so it survives the parent moving on.
    expect(new SeedResolver('parent').derive('a').hex()).toBe(a.hex())
  })

  it('deriving does not disturb the parent stream', () => {
    const control = new SeedResolver('control')
    const expected = [control.nextFloat(), control.nextFloat()]

    const parent = new SeedResolver('control')
    parent.derive('x').nextFloat()
    parent.derive('y').nextFloat()
    expect([parent.nextFloat(), parent.nextFloat()]).toEqual(expected)
  })

  it('exposes a stable 64-character hex fingerprint', () => {
    expect(new SeedResolver('hex').hex()).toMatch(/^[0-9a-f]{64}$/)
    expect(new SeedResolver('hex').hex()).toBe(new SeedResolver('hex').hex())
  })

  it('seeded() builds the same stream as the constructor', () => {
    expect(seeded('a', 1).hex()).toBe(new SeedResolver('a', 1).hex())
  })

  it('coerces numeric inputs to strings, so 1 and "1" agree', () => {
    // This is intentional: `seed: 1` from a JSON config and `seed: '1'` from a CLI flag describe the
    // same request and must not produce two different logos.
    expect(new SeedResolver(1).hex()).toBe(new SeedResolver('1').hex())
    expect(new SeedResolver(1).hex()).not.toBe(new SeedResolver('01').hex())
  })
})
