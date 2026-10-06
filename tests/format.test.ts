import { describe, expect, it } from 'vitest'
import { clamp, fmt, round, sortedKeys } from '../src/format'

describe('fmt', () => {
  it('rounds to two decimals', () => {
    expect(fmt(1.23456)).toBe('1.23')
    expect(fmt(1.005)).toBe('1')
  })

  it('drops trailing zeros', () => {
    expect(fmt(2.5)).toBe('2.5')
    expect(fmt(2.1)).toBe('2.1')
    // Geometry produces integral results from arithmetic all the time; they must render bare.
    expect(fmt(4 / 2)).toBe('2')
  })

  it('normalises negative zero', () => {
    expect(fmt(-0.001)).toBe('0')
    expect(fmt(-0)).toBe('0')
  })

  it('collapses non-finite values rather than emitting NaN into a path', () => {
    // A single NaN would poison an entire path string and be rejected by the serializer downstream.
    expect(fmt(Number.NaN)).toBe('0')
    expect(fmt(Number.POSITIVE_INFINITY)).toBe('0')
    expect(fmt(Number.NEGATIVE_INFINITY)).toBe('0')
  })

  it('never emits exponent notation', () => {
    // Very small and very large magnitudes must stay in plain decimal, or a renderer may reject them.
    expect(fmt(1e21)).not.toContain('e')
    expect(fmt(0.0000001)).not.toContain('e')
    expect(fmt(1e-7)).toBe('0')
  })

  it('handles negatives', () => {
    expect(fmt(-1.567)).toBe('-1.57')
  })

  it('is idempotent', () => {
    for (const value of [0, 1, -1.5, 123.456, 0.001]) {
      expect(fmt(Number(fmt(value)))).toBe(fmt(value))
    }
  })
})

describe('round', () => {
  it('rounds to the same precision as fmt', () => {
    expect(round(1.23456)).toBe(1.23)
  })

  it('normalises negative zero', () => {
    expect(Object.is(round(-0.001), 0)).toBe(true)
  })

  it('collapses non-finite values', () => {
    expect(round(Number.NaN)).toBe(0)
    expect(round(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('clamp', () => {
  it('limits a value to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
  })

  it('includes both bounds', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })

  it('handles an inverted range by returning the minimum', () => {
    expect(clamp(5, 10, 0)).toBe(10)
  })
})

describe('sortedKeys', () => {
  it('returns keys in ascending order regardless of insertion order', () => {
    const forward = sortedKeys({ a: 1, b: 2, c: 3 })
    const reverse = sortedKeys({ c: 3, b: 2, a: 1 })
    expect(forward).toEqual(['a', 'b', 'c'])
    expect(reverse).toEqual(forward)
  })

  it('returns an empty array for an empty record', () => {
    expect(sortedKeys({})).toEqual([])
  })

  it('is the point: iteration order must never influence a numeric choice', () => {
    // Integer-like keys would otherwise sort numerically while string keys sort lexically, which is
    // exactly the kind of hidden ordering dependency determinism forbids.
    expect(sortedKeys({ 10: 1, 2: 1 })).toEqual(['10', '2'])
  })
})
