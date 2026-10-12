import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/locales/en'
import { zh } from '../src/i18n/locales/zh'
import { DIMENSIONS, valueLabel } from '../src/lib/dimensions'
import { ENGINE_NAMES } from '@sigilgen/types'
import { generateLogos } from '@sigilgen/generate'
import { MODES } from '@sigilgen/engines/abstract'
import { FRAMES } from '@sigilgen/engines/emblem'
import { ACCENTS } from '@sigilgen/engines/lettermark'
import { CONTAINERS, LETTER_LAYOUTS } from '@sigilgen/engines/shared'
import { LAYOUTS, TREATMENTS } from '@sigilgen/engines/wordmark'

/**
 * The placeholders a message uses, sorted so two dictionaries can be compared.
 *
 * Outside the test body on purpose: a helper defined inside would be recreated on every call, which the
 * linter flags as avoidable.
 *
 * @param text - A dictionary entry.
 * @returns Its `{name}` placeholders in a stable order.
 */
function placeholders(text: string): string[] {
  return (text.match(/\{(\w+)\}/g) ?? []).toSorted()
}

describe('translations', () => {
  it('ships the same keys in both languages', () => {
    // The type in `locales/en.ts` already forces this at build time; asserting it too means a
    // hand-edited dictionary that slips past the type — a key added to both, or the type loosened —
    // still fails here rather than showing one language a raw key.
    expect(Object.keys(en).toSorted()).toEqual(Object.keys(zh).toSorted())
  })

  it('has no empty message in either language', () => {
    const empty: string[] = []
    for (const [key, value] of Object.entries(zh)) {
      if (value.trim() === '') empty.push(`zh/${key}`)
    }
    for (const [key, value] of Object.entries(en)) {
      if (value.trim() === '') empty.push(`en/${key}`)
    }
    expect(empty).toEqual([])
  })

  it('keeps the same placeholders in both languages', () => {
    // A placeholder present in one language and not the other leaves the reader staring at `{count}`.
    // The two dictionaries are hand-written, so nothing forces the sets to agree.
    const mismatched: string[] = []
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      const a = placeholders(zh[key])
      const b = placeholders(en[key])
      if (a.join(',') !== b.join(',')) mismatched.push(`${key}: zh [${a}] vs en [${b}]`)
    }
    expect(mismatched).toEqual([])
  })

  it('has a message for every error key the generator can produce', () => {
    // `classify` maps a thrown message onto one of these, so an unmapped one shows the reader the
    // library's English sentence instead of a translated explanation.
    for (const key of ['error.noLetters', 'error.tooLong', 'error.unknownEngine']) {
      expect(zh[key], `zh is missing ${key}`).toBeTruthy()
      expect(en[key], `en is missing ${key}`).toBeTruthy()
    }
  })
})

describe('design dimensions', () => {
  it('covers every engine the router can choose', () => {
    // A missing engine would silently drop its controls rather than fail, so this is the check that a
    // new engine cannot ship without its dimensions being wired up.
    expect(Object.keys(DIMENSIONS).toSorted()).toEqual([...ENGINE_NAMES].toSorted())
  })

  it('offers only dimensions the engine list declares', () => {
    // `mode` must be exactly the abstract engine's `MODES` and not a copy of it. A stale copy would
    // offer a mode the engine has never heard of, and the generator ignores unknown preference values
    // by design — so the control would look like it worked and do nothing.
    const abstract = DIMENSIONS.abstract.find(d => d.dimension === 'mode')
    expect(abstract?.values).toBe(MODES)
    expect(abstract?.values).toContain('lattice')
    expect(abstract?.values.length).toBe(MODES.length)
  })

  it('imports its candidate lists rather than copying them', () => {
    expect(DIMENSIONS.abstract[0]?.values).toBe(MODES)
    expect(DIMENSIONS.emblem[0]?.values).toBe(FRAMES)
    expect(DIMENSIONS.lettermark[0]?.values).toBe(ACCENTS)
    expect(DIMENSIONS.monogram[0]?.values).toBe(CONTAINERS)
    expect(DIMENSIONS.monogram[1]?.values).toBe(LETTER_LAYOUTS)
    expect(DIMENSIONS.wordmark[0]?.values).toBe(LAYOUTS)
    expect(DIMENSIONS.wordmark[1]?.values).toBe(TREATMENTS)
  })

  it('never offers the same value twice within a dimension', () => {
    // A duplicated entry renders two identical buttons where one is chosen, and the reader cannot tell
    // which one they are clearing.
    const duplicates: string[] = []
    for (const [engine, specs] of Object.entries(DIMENSIONS)) {
      for (const spec of specs) {
        const seen = new Set<string>()
        for (const value of spec.values) {
          if (seen.has(value)) duplicates.push(`${engine}/${spec.dimension}/${value}`)
          seen.add(value)
        }
      }
    }
    expect(duplicates).toEqual([])
  })

  it('gives every dimension a label that exists in both dictionaries', () => {
    const missing: string[] = []
    for (const specs of Object.values(DIMENSIONS)) {
      for (const spec of specs) {
        if (typeof zh[spec.label] !== 'string') missing.push(`zh ${spec.label}`)
        if (typeof en[spec.label] !== 'string') missing.push(`en ${spec.label}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('actually changes the output when a dimension is pinned', () => {
    // The point of a preference control is that pinning it changes the mark. If pinning a value the
    // engine accepts changed nothing, the control would be decoration — and the generator silently
    // ignores values it does not recognise, so nothing would complain.
    for (const mode of MODES) {
      const pinned = generateLogos({
        name: 'Northwind Labs',
        keywords: 'tech, space',
        engine: 'abstract',
        variations: 1,
        seed: 5,
        preferences: { mode },
      })
      expect(pinned, `${mode} drew nothing when pinned`).toHaveLength(1)
      expect(
        pinned[0]?.conceptNotes.join(' '),
        `${mode} was pinned but the notes never mention it`
      ).toContain(`Abstract "${mode}"`)
    }
  })
})

describe('value labels', () => {
  it('presents an engine identifier readably without translating it', () => {
    // The identifiers appear verbatim in the design notes, so the label has to stay matchable against
    // them: `corner-frame` becomes `Corner frame`, not a translated noun that matches nothing.
    expect(valueLabel('corner-frame')).toBe('Corner frame')
    expect(valueLabel('circle')).toBe('Circle')
    expect(valueLabel('a')).toBe('A')
    expect(valueLabel('')).toBe('')
  })
})
