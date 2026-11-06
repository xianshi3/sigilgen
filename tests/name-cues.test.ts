import { describe, expect, it } from 'vitest'
import { findNameCue, findNameCueIcon } from '../src/name-cues'

/**
 * The brand-name cue table.
 *
 * A name is not a design brief in the same way a keyword list is, but a name that literally says
 * "coffee" or "rocket" is evidence the generator should not ignore. These cases pin the exact/prefix
 * behaviour and the conservative fallback for coined names.
 */

describe('findNameCue', () => {
  it('finds a concrete object named by the brand', () => {
    expect(findNameCue(['rocket'])?.icon.key).toBe('rocket')
    expect(findNameCue(['coffee'])?.icon.key).toBe('coffee-cup')
    expect(findNameCue(['leaf'])?.icon.key).toBe('leaf')
    expect(findNameCue(['forge'])?.icon.key).toBe('hammer')
    expect(findNameCue(['lumen'])?.icon.key).toBe('sun')
  })

  it('accepts a prefix such as a plural', () => {
    expect(findNameCue(['rockets'])?.icon.key).toBe('rocket')
  })

  it('returns nothing for a coined name', () => {
    expect(findNameCue(['zephyr'])).toBeNull()
    expect(findNameCue([])).toBeNull()
  })

  it('is deterministic when two icons score the same', () => {
    const first = findNameCue(['coffee', 'rocket'])
    const second = findNameCue(['rocket', 'coffee'])
    expect(first?.icon.key).toBe(second?.icon.key)
  })

  it('exposes the matching word', () => {
    expect(findNameCue(['northwind', 'coffee'])?.word).toBe('coffee')
    expect(findNameCueIcon(['northwind', 'coffee'])?.key).toBe('coffee-cup')
  })
})
