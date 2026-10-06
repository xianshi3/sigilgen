import { describe, expect, it } from 'vitest'
import { generateLogo, generateLogos, normaliseConfig } from '../src/generate'
import { ENGINE_NAMES, type LogoResult } from '../src/types'

/** Elements the flat-SVG contract forbids. */
const FORBIDDEN: readonly RegExp[] = [
  /<linearGradient/i,
  /<radialGradient/i,
  /<filter/i,
  /<mask/i,
  /<clipPath/i,
  /<pattern/i,
  /<image/i,
  /<foreignObject/i,
  /<script/i,
  /<use\b/i,
  /<text/i,
  /\son[a-z]+\s*=/i,
  /xlink:href/i,
  /<a\b/i,
]

/**
 * Asserts the flat-SVG contract for a document.
 *
 * @param svg - The document to check.
 */
function expectFlat(svg: string): void {
  for (const pattern of FORBIDDEN) {
    expect(svg, `output must not contain ${pattern}`).not.toMatch(pattern)
  }
}

/**
 * Very small XML well-formedness check: balanced tags and quoted attributes.
 *
 * A full parser is not available in the test environment, so this verifies the two things a
 * malformed document would break: unclosed tags and unquoted attributes.
 *
 * @param svg - The document to check.
 */
function expectWellFormed(svg: string): void {
  const stack: string[] = []
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g
  let match = tagPattern.exec(svg)
  while (match !== null) {
    const [raw, closing = '', name = '', attrs = '', selfClosing = ''] = match
    if (attrs.includes('=')) {
      for (const attribute of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        expect(raw, `attribute ${attribute[1]} must be quoted`).toMatch(/\s*=\s*["']/)
      }
      // Every attribute must be quoted; an unquoted value would show up as a bare token.
      const bare = attrs.replace(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, '').trim()
      expect(bare, `unexpected tokens in <${name}>: ${bare}`).toBe('')
    }
    if (closing === '/') {
      expect(stack.pop(), `unbalanced closing tag </${name}>`).toBe(name)
    } else if (selfClosing !== '/') {
      stack.push(name)
    }
    match = tagPattern.exec(svg)
  }
  expect(stack, 'all tags should be closed').toEqual([])
  expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
}

describe('normaliseConfig', () => {
  it('rejects a missing or empty name', () => {
    expect(() => normaliseConfig({ name: '' })).toThrow(/non-empty/)
    expect(() => normaliseConfig({ name: '   ' })).toThrow(/non-empty/)
    expect(() => normaliseConfig({} as never)).toThrow(/non-empty/)
  })

  it('rejects a value that is not an object at all', () => {
    // The types forbid this, but the library is published for JavaScript consumers too, and reading
    // `config.name` off `null` would throw an opaque TypeError instead of the actionable message.
    for (const value of [null, undefined, 'Acme', 42] as unknown[]) {
      expect(() => normaliseConfig(value as never), String(value)).toThrow(/configuration object/)
    }
  })

  it('rejects an array, which is an object but not a configuration', () => {
    // `typeof [] === 'object'`, so the guard above cannot catch it. It still has to fail loudly and
    // say what is missing rather than sail through as an empty request.
    expect(() => normaliseConfig([] as never)).toThrow(/non-empty "name"/)
  })

  it('rejects a name with no letters at all', () => {
    expect(() => normaliseConfig({ name: '123 !!!' })).toThrow(/at least one letter/)
  })

  it('rejects an over-long name', () => {
    expect(() => normaliseConfig({ name: 'a'.repeat(65) })).toThrow(/at most 64/)
  })

  it('rejects an unknown engine', () => {
    expect(() => normaliseConfig({ name: 'Acme', engine: 'nope' as never })).toThrow(/engine/)
  })

  it('derives uppercase letters and lowercase words', () => {
    const request = normaliseConfig({ name: 'Northwind Coffee', keywords: 'fintech, calm' })
    expect(request.letters).toBe('NORTHWINDCOFFEE')
    expect(request.nameWords).toEqual(['northwind', 'coffee'])
    expect(request.words).toContain('fintech')
  })

  it('separates name words from keyword words', () => {
    const request = normaliseConfig({ name: 'Ledgerly', keywords: 'fintech' })
    expect(request.nameWords).toEqual(['ledgerly'])
    expect(request.words).toEqual(['ledgerly', 'fintech'])
  })

  it('applies defaults', () => {
    const request = normaliseConfig({ name: 'Acme' })
    expect(request.size).toBe(512)
    expect(request.variations).toBe(3)
    expect(request.seed).toBe(0)
    expect(request.background).toBe(false)
    expect(request.engine).toBeNull()
    expect(request.palette).toBeNull()
  })

  it('clamps out-of-range numbers instead of failing', () => {
    expect(normaliseConfig({ name: 'Acme', size: 1 }).size).toBe(16)
    expect(normaliseConfig({ name: 'Acme', size: 999_999 }).size).toBe(4096)
    expect(normaliseConfig({ name: 'Acme', size: 0 }).size).toBe(512)
    expect(normaliseConfig({ name: 'Acme', variations: 0 }).variations).toBe(3)
    expect(normaliseConfig({ name: 'Acme', variations: 99 }).variations).toBe(6)
    expect(normaliseConfig({ name: 'Acme', variations: -5 }).variations).toBe(3)
  })

  it('accepts randomSeed as an alias for seed', () => {
    expect(normaliseConfig({ name: 'Acme', randomSeed: 42 }).seed).toBe(42)
  })

  it('keeps recognised design preferences and trims them', () => {
    const request = normaliseConfig({
      name: 'Acme',
      preferences: { container: '  hexagon  ', frame: 'shield' },
    })
    expect(request.preferences).toEqual({ container: 'hexagon', frame: 'shield' })
  })

  it('defaults preferences to an empty object', () => {
    expect(normaliseConfig({ name: 'Acme' }).preferences).toEqual({})
  })

  it('drops preferences it does not recognise or cannot use', () => {
    // A preference is a hint about taste. Anything unusable is discarded here rather than reaching an
    // engine, so a stray key from an interface or a stale saved document cannot fail a render.
    const hostile = {
      name: 'Acme',
      preferences: {
        nonsense: 'hexagon',
        container: 42,
        frame: '',
        accent: null,
        mode: '   ',
      },
    } as never
    expect(normaliseConfig(hostile).preferences).toEqual({})
    expect(normaliseConfig({ name: 'Acme', preferences: 'hexagon' } as never).preferences).toEqual(
      {}
    )
    expect(normaliseConfig({ name: 'Acme', preferences: null } as never).preferences).toEqual({})
  })

  it('truncates non-integer seeds', () => {
    expect(normaliseConfig({ name: 'Acme', seed: 7.9 }).seed).toBe(7)
  })

  it('bounds hostile keyword and brief input', () => {
    const request = normaliseConfig({
      name: 'Acme',
      keywords: 'k'.repeat(1000),
      brief: 'b'.repeat(1000),
    })
    expect(request.keywords.length).toBeLessThanOrEqual(240)
    expect(request.brief.length).toBeLessThanOrEqual(600)
  })

  it('ignores blank optional strings', () => {
    const request = normaliseConfig({ name: 'Acme', palette: '  ', font: '', icon: '  ' })
    expect(request.palette).toBeNull()
    expect(request.font).toBeNull()
    expect(request.icon).toBeNull()
  })
})

describe('generateLogo', () => {
  it('returns one concept with the expected shape', () => {
    const logo = generateLogo({ name: 'Acme', keywords: 'tech, minimal' })
    expect(logo.engine).toBeTruthy()
    expect(ENGINE_NAMES).toContain(logo.engine)
    expect(logo.palette.id).toBeTruthy()
    expect(logo.font.id).toBeTruthy()
    expect(logo.conceptNotes.length).toBeGreaterThan(0)
    expect(logo.seed).toMatch(/^[0-9a-f]{12}$/)
    expect(logo.svg.startsWith('<svg ')).toBe(true)
  })

  it('is byte-identical for identical input', () => {
    const config = { name: 'Acme', keywords: 'tech, minimal', seed: 7, size: 256 }
    expect(generateLogo(config).svg).toBe(generateLogo(config).svg)
  })

  it('changes when the seed changes', () => {
    const base = { name: 'Acme', keywords: 'tech, minimal', size: 256 }
    const a = generateLogo({ ...base, seed: 1 })
    const b = generateLogo({ ...base, seed: 2 })
    expect(a.svg).not.toBe(b.svg)
    expect(a.seed).not.toBe(b.seed)
  })

  it('changes when any input changes', () => {
    // A wordmark is used so that every override has something to bite on: a forced icon cannot
    // change an abstract mark, because that engine draws none.
    const base = {
      name: 'Acme',
      keywords: 'tech, minimal',
      size: 256,
      seed: 3,
      engine: 'wordmark' as const,
    }
    const reference = generateLogo(base).svg
    for (const variant of [
      { name: 'Acne' },
      { keywords: 'tech, bold' },
      { size: 257 },
      { palette: 'ink-monolith' },
      { font: 'orbit-grotesk' },
      { icon: 'mountain-peak' },
      { background: true },
    ]) {
      expect(generateLogo({ ...base, ...variant }).svg, JSON.stringify(variant)).not.toBe(reference)
    }
  })

  it('changes when the engine is forced', () => {
    const base = { name: 'Acme', keywords: 'tech', size: 256, seed: 3 }
    expect(generateLogo({ ...base, engine: 'wordmark' }).svg).not.toBe(
      generateLogo({ ...base, engine: 'abstract' }).svg
    )
  })

  it('honours a forced engine', () => {
    for (const engine of ENGINE_NAMES) {
      expect(generateLogo({ name: 'Acme', keywords: 'tech', engine }).engine).toBe(engine)
    }
  })

  it('honours a forced palette id', () => {
    const logo = generateLogo({ name: 'Acme', keywords: 'tech', palette: 'ember-roast' })
    expect(logo.palette.id).toBe('ember-roast')
  })

  it('builds a palette from an explicit colour list', () => {
    const logo = generateLogo({
      name: 'Ember',
      keywords: 'coffee',
      palette: '#2B1B12,cream,rust',
    })
    expect(logo.palette.primary).toBe('#2b1b12')
    expect(logo.palette.secondary).toBe('#fdf6e3')
    expect(logo.palette.accent).toBe('#a4552b')
    expect(logo.palette.tags).toContain('custom')
  })

  it('falls back to the mood pool for an unusable palette string', () => {
    const logo = generateLogo({ name: 'Acme', keywords: 'tech', palette: 'not-a-palette' })
    expect(logo.palette.tags).not.toContain('custom')
  })

  it('honours forced font and icon ids', () => {
    const logo = generateLogo({
      name: 'Acme',
      keywords: 'tech',
      font: 'classic-serif',
      icon: 'mountain-peak',
    })
    expect(logo.font.id).toBe('classic-serif')
    expect(logo.icon?.key).toBe('mountain-peak')
  })

  it('emits a transparent canvas by default and an opaque one on request', () => {
    expect(generateLogo({ name: 'Acme', keywords: 'tech' }).svg).not.toContain('<rect')
    expect(generateLogo({ name: 'Acme', keywords: 'tech', background: true }).svg).toContain(
      '<rect'
    )
  })

  it('gives every engine an icon except the typographic ones', () => {
    const withIcon: string[] = []
    const withoutIcon: string[] = []
    for (const engine of ENGINE_NAMES) {
      const logo = generateLogo({ name: 'Acme', keywords: 'tech', engine })
      ;(logo.icon === null ? withoutIcon : withIcon).push(engine)
    }
    expect(withoutIcon.toSorted()).toEqual(['abstract', 'lettermark'])
    expect(withIcon.toSorted()).toEqual(['emblem', 'monogram', 'wordmark'])
  })

  it('explains every decision in the concept notes', () => {
    const logo = generateLogo({ name: 'Acme', keywords: 'coffee, artisan' })
    const notes = logo.conceptNotes.join('\n')
    expect(notes).toContain('Mood')
    expect(notes).toContain('Engine')
    expect(notes).toContain('Typeface')
    expect(notes).toContain('Palette')
    expect(notes).toContain('Pictogram')
  })

  it('does not leak notes between concepts', () => {
    const [first, second] = generateLogos({ name: 'Acme', keywords: 'coffee', variations: 2 })
    expect(first?.conceptNotes.length).toBeGreaterThan(0)
    expect(second?.conceptNotes.length).toBeGreaterThan(0)
    // Notes accumulate per concept, not across the run, so they stay comparable in length.
    expect(
      Math.abs((first?.conceptNotes.length ?? 0) - (second?.conceptNotes.length ?? 0))
    ).toBeLessThanOrEqual(2)
  })
})

describe('generateLogos', () => {
  it('respects the variations bound', () => {
    expect(generateLogos({ name: 'Acme', variations: 1 })).toHaveLength(1)
    expect(generateLogos({ name: 'Acme', variations: 6 })).toHaveLength(6)
  })

  it('is byte-identical across runs', () => {
    const config = { name: 'Vela', keywords: 'marine, travel', variations: 6, seed: 12 }
    const a = generateLogos(config).map((logo: LogoResult) => logo.svg)
    const b = generateLogos(config).map((logo: LogoResult) => logo.svg)
    expect(a).toEqual(b)
  })

  it('gives each concept its own seed fingerprint', () => {
    const seeds = generateLogos({ name: 'Acme', variations: 4 }).map(logo => logo.seed)
    expect(new Set(seeds).size).toBe(seeds.length)
  })

  it('does not depend on the requested variation count', () => {
    // Concept 2 must be the same whether it is asked for alone or as part of six.
    const [, alone] = generateLogos({ name: 'Vela', keywords: 'marine', variations: 2 })
    const [, among] = generateLogos({ name: 'Vela', keywords: 'marine', variations: 6 })
    expect(alone?.svg).toBe(among?.svg)
  })
})

describe('design preferences', () => {
  it('produces byte-identical output when none are given', () => {
    // The property that makes the feature safe to add: a configuration that predates the field must
    // render exactly as it did before, or every previously recorded output would become stale.
    const withField = generateLogos({
      name: 'Vela',
      keywords: 'marine',
      variations: 3,
      preferences: {},
    })
    const withoutField = generateLogos({ name: 'Vela', keywords: 'marine', variations: 3 })
    expect(withField.map(logo => logo.svg)).toEqual(withoutField.map(logo => logo.svg))
  })

  it('holds one dimension still while the others keep varying', () => {
    // The point of the feature: a set of concepts that share a container but differ in palette and
    // type reads as one brand system rather than six unrelated marks.
    const concepts = generateLogos({
      name: 'Northwind Coffee',
      keywords: 'coffee, artisan',
      engine: 'monogram',
      variations: 4,
      preferences: { container: 'hexagon' },
    })
    expect(concepts).toHaveLength(4)
    for (const concept of concepts) {
      expect(
        concept.conceptNotes.some(note => note.includes('hexagon container')),
        concept.conceptNotes.join(' | ')
      ).toBe(true)
    }
    // Still four different marks, not four copies of one.
    expect(new Set(concepts.map(logo => logo.svg)).size).toBe(4)
  })

  it('changes the output when a dimension is pinned', () => {
    const free = generateLogos({ name: 'Acme Labs', engine: 'emblem', variations: 1 })
    const pinned = generateLogos({
      name: 'Acme Labs',
      engine: 'emblem',
      variations: 1,
      preferences: { frame: 'banner' },
    })
    expect(pinned[0]?.svg).not.toBe(free[0]?.svg)
    expect(pinned[0]?.conceptNotes.join(' ')).toContain('banner')
  })

  it('ignores a value the engine cannot use rather than failing', () => {
    // `trapezoid` is not one of the emblem's frames. A preference is a hint about taste, and a hint
    // must never be able to fail a render, so the seeded choice takes over.
    const result = generateLogos({
      name: 'Acme Labs',
      engine: 'emblem',
      variations: 2,
      preferences: { frame: 'trapezoid' },
    })
    expect(result).toHaveLength(2)
    for (const concept of result) {
      expect(concept.conceptNotes.join(' ')).toMatch(/shield|hexagon|circle|banner/)
    }
  })

  it('leaves a dimension an engine does not read alone', () => {
    // The emblem reads `frame` and nothing else, so a pinned monogram `container` must not reach it —
    // and must not stop it drawing either.
    const concepts = generateLogos({
      name: 'Acme Labs',
      engine: 'emblem',
      variations: 1,
      preferences: { container: 'seal' },
    })
    expect(concepts[0]?.conceptNotes.join(' ')).toMatch(/shield|hexagon|circle|banner/)
  })

  it('pins independently per dimension', () => {
    const concepts = generateLogos({
      name: 'Northwind Coffee',
      keywords: 'coffee, artisan',
      engine: 'monogram',
      variations: 3,
      preferences: { container: 'seal', layout: 'stacked' },
    })
    for (const concept of concepts) {
      const notes = concept.conceptNotes.join(' ')
      expect(notes).toContain('seal container')
      // `stacked` is only reachable with two letters, which is what the initials of a two-word name are.
      expect(notes).toContain('stacked lettering')
    }
  })
})

describe('output contract', () => {
  const samples: LogoResult[] = generateLogos({
    name: 'Acme Labs',
    keywords: 'tech, minimal, fintech',
    variations: 6,
    size: 512,
  })

  it('stays flat for every concept', () => {
    for (const logo of samples) {
      expectFlat(logo.svg)
    }
  })

  it('stays flat for every engine', () => {
    for (const engine of ENGINE_NAMES) {
      expectFlat(generateLogo({ name: 'Acme', keywords: 'tech', engine }).svg)
    }
  })

  it('is well formed for every concept', () => {
    for (const logo of samples) {
      expectWellFormed(logo.svg)
    }
  })

  it('never emits text elements or font references', () => {
    for (const logo of samples) {
      expect(logo.svg).not.toMatch(/font-family|<text/i)
    }
  })

  it('only emits allow-listed element names', () => {
    const allowed = new Set([
      'svg',
      'g',
      'path',
      'circle',
      'ellipse',
      'rect',
      'polygon',
      'line',
      'polyline',
    ])
    for (const logo of samples) {
      for (const match of logo.svg.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)/g)) {
        expect(allowed.has(match[1] as string), `unexpected element <${match[1]}>`).toBe(true)
      }
    }
  })

  it('stays inside the requested canvas', () => {
    for (const logo of samples) {
      const bound = 512 * 2
      for (const match of logo.svg.matchAll(/\sd="([^"]*)"/g)) {
        for (const number of (match[1] ?? '').match(/-?\d+(?:\.\d+)?/g) ?? []) {
          expect(Math.abs(Number(number)), `coordinate ${number} in ${logo.engine}`).toBeLessThan(
            bound
          )
        }
      }
    }
  })

  it('declares the requested canvas in its metadata', () => {
    for (const logo of samples) {
      expect(logo.svg).toContain('viewBox="0 0 512 512"')
      expect(logo.svg).toContain('width="512"')
      expect(logo.svg).toContain('height="512"')
      expect(logo.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    }
  })

  it('only uses colours that match the hex pattern', () => {
    for (const logo of samples) {
      for (const match of logo.svg.matchAll(/\sfill="([^"]*)"/g)) {
        expect(match[1], logo.engine).toMatch(/^none$|^#[0-9a-f]{6}$/)
      }
    }
  })

  it('never emits an ampersand or angle bracket inside an attribute value', () => {
    for (const logo of samples) {
      for (const match of logo.svg.matchAll(/="([^"]*)"/g)) {
        const value = match[1] ?? ''
        expect(value.includes('&') && !value.includes('&amp;'), value).toBe(false)
        expect(value.includes('<')).toBe(false)
      }
    }
  })
})

describe('determinism under repetition', () => {
  it('produces the same bytes over many generations', () => {
    const config = { name: 'Northwind', keywords: 'outdoor, conservation', variations: 3 }
    const reference = generateLogos(config).map(logo => logo.svg)
    for (let round = 0; round < 25; round++) {
      expect(generateLogos(config).map(logo => logo.svg)).toEqual(reference)
    }
  })

  it('is unaffected by the order fonts and palettes are looked up in', () => {
    const config = { name: 'Vela', keywords: 'marine', variations: 6 }
    const reference = generateLogos(config).map(logo => logo.svg)
    // Interleaving other generations must not perturb the stream.
    for (let round = 0; round < 5; round++) {
      generateLogos({ name: 'Other', keywords: 'gaming', variations: 6 })
      expect(generateLogos(config).map(logo => logo.svg)).toEqual(reference)
    }
  })

  it('does not use wall-clock time or real randomness', () => {
    const before = Date.now()
    const logo = generateLogo({ name: 'Acme', keywords: 'tech' })
    expect(logo.svg).toBe(generateLogo({ name: 'Acme', keywords: 'tech' }).svg)
    expect(Date.now()).toBeGreaterThanOrEqual(before)
  })
})

describe('hostile input', () => {
  it('never leaks markup from the brand name', () => {
    const nasty = '"><script>alert(1)</script>'
    const logo = generateLogo({ name: nasty, keywords: 'tech, minimal' })
    expect(logo.svg).not.toMatch(/<script/i)
    expect(logo.svg).not.toMatch(/onerror|onload/i)
    expectWellFormed(logo.svg)
  })

  it('never leaks markup from the keywords or brief', () => {
    const logo = generateLogo({
      name: 'Acme',
      keywords: '"><image href=x onerror=alert(1)>',
      brief: '</svg><script>alert(2)</script>',
    })
    expect(logo.svg).not.toMatch(/<script|<image|onerror/i)
    expectWellFormed(logo.svg)
  })

  it('rejects a colour value that is not a colour', () => {
    const logo = generateLogo({
      name: 'Acme',
      keywords: 'tech',
      palette: '#000000,javascript:alert(1),red',
    })
    expect(logo.svg).not.toMatch(/javascript/i)
    expectWellFormed(logo.svg)
  })

  it('survives an enormous variation count by clamping it', () => {
    expect(generateLogos({ name: 'Acme', variations: 10_000 })).toHaveLength(6)
  })

  it('rejects a name with no drawable letters rather than emitting an empty logo', () => {
    // v1 does not do CJK outlines (see the design doc's non-goals), so a name made only of characters
    // the brain cannot draw is a clear error, not a silent blank canvas.
    expect(() => generateLogo({ name: '标志 工作室', keywords: 'design, studio' })).toThrow(
      /at least one letter/
    )
  })

  it('keeps the drawable part of a mixed-script name', () => {
    const logo = generateLogo({ name: '标志 Studio', keywords: 'design' })
    expect(logo.svg).toContain('<svg')
    expectWellFormed(logo.svg)
  })
})
