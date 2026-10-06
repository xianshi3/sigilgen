import { describe, expect, it } from 'vitest'
import { resolveFont } from '../src/resolvers/font-resolver'
import { resolveIcon } from '../src/resolvers/icon-resolver'
import { resolveColour, luminance, resolvePalette } from '../src/resolvers/palette-resolver'
import { FONTS, ICONS, MOODS, PALETTES, findFont } from '../src/brain/index'
import { normaliseConfig } from '../src/generate'
import { SeedResolver } from '../src/seed-resolver'
import { moodResolver } from '../src/mood-resolver'
import type { EngineName, MoodMatch, MoodRule } from '../src/types'

/**
 * Builds a mood match whose rule points at specific font and palette ids.
 *
 * The resolvers are written against brain data, so the only honest way to test their fallback
 * branches is to hand them a rule that the shipped data does not happen to contain.
 *
 * @param fontIds - Font ids the rule claims to suit.
 * @returns The mood match.
 */
function moodWith(fontIds: string[]): MoodMatch {
  const rule: MoodRule = {
    ...(MOODS[0] as MoodRule),
    id: 'synthetic',
    keywords: ['synthetic'],
    fontIds,
  }
  return {
    mood: rule,
    candidates: [rule],
    scores: { synthetic: 1 },
    words: ['synthetic'],
    notes: [],
  }
}

describe('resolveFont', () => {
  it('prefers a face the engine can actually use', () => {
    const match = moodWith(['classic-serif', 'orbit-grotesk'])
    expect(resolveFont('monogram', match, new SeedResolver('font', 0), null).category).toBe(
      'geometric-sans'
    )
  })

  it('falls back to any font the mood names when none suit the engine', () => {
    // A letter mark refuses serifs, but a mood that only lists serifs still has to be drawn with
    // something. Silently substituting a font from outside the mood would be worse than using one of
    // the mood's own faces, so the mood's choice wins even when the engine dislikes it.
    const match = moodWith(['classic-serif', 'garamond-serif'])
    const font = resolveFont('monogram', match, new SeedResolver('font', 0), null)
    expect(['classic-serif', 'garamond-serif']).toContain(font.id)
  })

  it('falls back to the whole brain when the mood names no fonts at all', () => {
    const font = resolveFont('monogram', moodWith([]), new SeedResolver('font', 0), null)
    expect(FONTS).toContain(font)
    // Still filtered by category. `choice` draws uniformly by index, so a merely *sorted* pool would
    // hand a letter mark a didone as often as not — the filter is the only thing enforcing the rule.
    expect(['geometric-sans', 'humanist-sans']).toContain(font.category)
  })

  it('keeps a letter mark out of serifs across every seed, even with no mood fonts', () => {
    for (let round = 0; round < 200; round++) {
      const font = resolveFont('lettermark', moodWith([]), new SeedResolver('font', round), null)
      expect(font.category, font.id).not.toBe('serif')
      expect(font.category, font.id).not.toBe('display')
    }
  })

  it('lets an explicit font id win over every filter', () => {
    // A caller who asks for a specific face gets it, even one a letter mark would otherwise refuse.
    const explicit = findFont('didone-serif')!
    expect(
      resolveFont('monogram', moodWith(['orbit-grotesk']), new SeedResolver('f', 0), 'didone-serif')
    ).toBe(explicit)
  })

  it('ignores an explicit id that names no font in the brain', () => {
    const font = resolveFont(
      'monogram',
      moodWith(['orbit-grotesk']),
      new SeedResolver('f', 0),
      'nope'
    )
    expect(font).toBe(findFont('orbit-grotesk'))
  })

  it('never returns the same face for every seed', () => {
    // A resolver that ignored the seed stream would still produce valid, deterministic output, so
    // only variation across seeds reveals that the stream is actually wired up.
    const match = moodWith(['orbit-grotesk', 'nexus-grotesk', 'vector-grotesk'])
    const seen = new Set<string>()
    for (let round = 0; round < 40; round++) {
      seen.add(resolveFont('monogram', match, new SeedResolver('font', round), null).id)
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('resolveIcon', () => {
  it('returns an icon the brain ships for every engine that draws one', () => {
    const mood = moodResolver.resolve('coffee')
    for (const engine of ['monogram', 'wordmark', 'emblem'] as EngineName[]) {
      expect(ICONS, engine).toContain(resolveIcon(engine, mood, new SeedResolver('icon', 0), null))
    }
  })

  it('returns null for engines that draw no pictogram at all', () => {
    // The concept notes describe what was actually drawn, so handing these engines an unused icon
    // would make the notes lie.
    const mood = moodResolver.resolve('coffee')
    for (const engine of ['lettermark', 'abstract'] as EngineName[]) {
      expect(resolveIcon(engine, mood, new SeedResolver('icon', 0), null), engine).toBeNull()
    }
  })

  it('honours an explicit icon key and ignores one that does not exist', () => {
    const mood = moodResolver.resolve('coffee')
    const explicit = ICONS[0]!
    expect(resolveIcon('wordmark', mood, new SeedResolver('i', 0), explicit.key)).toBe(explicit)
    expect(ICONS).toContain(resolveIcon('wordmark', mood, new SeedResolver('i', 0), 'nope'))
  })
})

describe('resolvePalette', () => {
  it('falls back to a known palette when the mood names none that exist', () => {
    // The brain is a data file, so a typo in a mood's palette list must not leave a concept with no
    // colours at all.
    const rule: MoodRule = {
      ...(MOODS[0] as MoodRule),
      id: 'synthetic',
      keywords: ['synthetic'],
      paletteIds: ['no-such-palette', 'also-missing'],
      fontIds: [],
    }
    const match: MoodMatch = {
      mood: rule,
      candidates: [rule],
      scores: { synthetic: 1 },
      words: ['synthetic'],
      notes: [],
    }
    const request = normaliseConfig({ name: 'Acme' })
    const palette = resolvePalette(request, match, new SeedResolver('palette', 0), 0)
    // Compared by id: the resolver returns a copy with the background applied, not the brain's own
    // object.
    const ids = PALETTES.map(entry => entry.id)
    expect(ids).toContain(palette.id)
  })
})

describe('resolveColour', () => {
  it('normalises hex literals, expanding the short form', () => {
    expect(resolveColour('#AABBCC')).toBe('#aabbcc')
    expect(resolveColour('  #AbC  ')).toBe('#aabbcc')
  })

  it('resolves a named colour, case-insensitively', () => {
    expect(resolveColour('cream')).toMatch(/^#[0-9a-f]{6}$/)
    expect(resolveColour('  CREAM ')).toBe(resolveColour('cream'))
  })

  it('measures luminance identically for short and long hex', () => {
    // The contrast rules are built on these numbers, so `#abc` and `#aabbcc` must not disagree: they
    // are the same colour written two ways.
    expect(luminance('#abc')).toBeCloseTo(luminance('#aabbcc'), 12)
    expect(luminance('abc')).toBeCloseTo(luminance('#aabbcc'), 12)
  })

  it('orders black below white', () => {
    expect(luminance('#000000')).toBeLessThan(luminance('#ffffff'))
    expect(luminance('#000000')).toBeCloseTo(0, 12)
    expect(luminance('#ffffff')).toBeCloseTo(1, 12)
  })

  it('returns null for empty, transparent and unparseable tokens', () => {
    for (const token of ['', '   ', 'transparent', 'none', 'rgb(1,2,3)', 'aabbcc', '#12345']) {
      expect(resolveColour(token), token).toBeNull()
    }
  })
})
