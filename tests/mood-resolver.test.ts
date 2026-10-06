import { describe, expect, it } from 'vitest'
import { MoodResolver, extractWords, moodResolver, scoreMood } from '../src/mood-resolver'
import { MOODS, fallbackMood } from '../src/brain/index'
import { normaliseConfig } from '../src/generate'

describe('extractWords', () => {
  it('lowercases and splits on non-alphanumerics', () => {
    expect(extractWords('Tech, Minimal; OPEN-source')).toEqual([
      'tech',
      'minimal',
      'open',
      'source',
    ])
  })

  it('de-duplicates while preserving first-seen order', () => {
    expect(extractWords('acme acme ACME')).toEqual(['acme'])
  })

  it('drops empty and absurdly long tokens', () => {
    expect(extractWords('   ...   ')).toEqual([])
    expect(extractWords(`ok ${'x'.repeat(64)}`)).toEqual(['ok'])
  })

  it('bounds the work it does on a hostile brief', () => {
    const hostile = Array.from({ length: 5000 }, (_, index) => `w${index}`).join(' ')
    expect(extractWords(hostile).length).toBeLessThanOrEqual(64)
  })

  it('is not affected by punctuation tricks', () => {
    expect(extractWords('<script>alert(1)</script>')).toEqual(
      ['script', 'alert', '1', 'script'].slice(0, 3)
    )
  })
})

describe('scoreMood', () => {
  it('scores nothing for the keyword-less fallback rule', () => {
    expect(scoreMood(fallbackMood(), ['tech'])).toBe(0)
  })

  it('matches a word against a longer keyword', () => {
    const rule = MOODS.find(entry => entry.id === 'fintech')
    expect(rule).toBeDefined()
    expect(scoreMood(rule!, ['fintech'])).toBeGreaterThan(0)
    expect(scoreMood(rule!, ['fintechs'])).toBeGreaterThan(0)
  })

  it('matches a longer word that contains a keyword', () => {
    const rule = MOODS.find(entry => entry.id === 'coffee')
    expect(rule).toBeDefined()
    expect(scoreMood(rule!, ['speciality'])).toBe(0)
    expect(scoreMood(rule!, ['coffeebar'])).toBeGreaterThan(0)
  })

  it('counts each word at most once per rule', () => {
    const rule = MOODS.find(entry => entry.id === 'coffee')
    expect(rule).toBeDefined()
    const once = scoreMood(rule!, ['coffee'])
    expect(scoreMood(rule!, ['coffee', 'coffee', 'cafe', 'cafe'])).toBe(once + 1)
  })
})

describe('MoodResolver', () => {
  const resolver = new MoodResolver()

  it('falls back to neutral when nothing matches', () => {
    const match = resolver.resolve('zzzqqq wwwxxx')
    expect(match.mood.id).toBe('neutral')
    expect(match.candidates).toHaveLength(0)
    expect(match.notes.join(' ')).toContain('neutral')
  })

  it('falls back to neutral on empty input', () => {
    expect(resolver.resolve('').mood.id).toBe('neutral')
  })

  it.each([
    ['fintech, lending', 'fintech'],
    ['coffee roastery', 'coffee'],
    ['developer cli sdk', 'developer-tools'],
    ['sustainable outdoor', 'nature'],
    ['luxury jewellery', 'luxury'],
    ['gaming esports', 'gaming'],
    ['generative geometric', 'abstract'],
    ['minimal clean spare', 'minimal'],
  ])('maps %j to the %s mood', (keywords, expected) => {
    expect(resolver.resolve(keywords).mood.id).toBe(expected)
  })

  it('reads the brief as well as the keywords', () => {
    const match = resolver.resolve('', 'a small-batch coffee roastery in Berlin')
    expect(match.mood.id).toBe('coffee')
  })

  it('prefers the stronger match when several moods apply', () => {
    const match = resolver.resolve('coffee coffee coffee, fintech fintech fintech')
    expect(match.mood.id).toBe('coffee')
  })

  it('ranks candidates by score', () => {
    const match = resolver.resolve('coffee cafe barista fintech payments')
    expect(match.candidates.length).toBeGreaterThan(1)
    const scores = match.candidates.map(entry => match.scores[entry.id] ?? 0)
    for (let index = 1; index < scores.length; index++) {
      expect(scores[index - 1]).toBeGreaterThanOrEqual(scores[index] as number)
    }
  })

  it('breaks a score tie on the rule id, not on declaration order', () => {
    // "brewery" is a keyword of both `agriculture` and `beverage`, and both rules list the same
    // number of keywords, so their normalised scores are exactly equal. Without an explicit
    // tie-break the winner would be whichever rule happened to be declared first, which is a
    // property of the data file rather than of the input.
    const match = resolver.resolve('brewery')
    const matched = match.candidates.map(entry => entry.id)
    expect(matched).toContain('agriculture')
    expect(matched).toContain('beverage')
    expect(match.scores['agriculture']).toBe(match.scores['beverage'])
    expect(match.mood.id).toBe('agriculture')
  })

  it('is deterministic', () => {
    const a = resolver.resolve('tech, minimal')
    const b = resolver.resolve('tech, minimal')
    expect(a.mood.id).toBe(b.mood.id)
    expect(a.notes).toEqual(b.notes)
    expect(a.words).toEqual(b.words)
  })

  it('always returns notes that explain the choice', () => {
    const match = resolver.resolve('marine sailing')
    expect(match.notes.length).toBeGreaterThanOrEqual(2)
    expect(match.notes[0]).toContain(match.mood.id)
    expect(match.notes[0]).toContain('matched on')
  })

  it('mentions the runner-up when there is one', () => {
    const match = resolver.resolve('coffee fintech')
    expect(match.candidates.length).toBeGreaterThan(1)
    expect(match.notes.some(note => note.startsWith('Runner-up'))).toBe(true)
  })

  it('only ever returns curated moods', () => {
    const ids = new Set(MOODS.map(entry => entry.id))
    for (const keywords of ['tech', 'coffee', 'nature', 'luxury', 'gaming', '??']) {
      expect(ids.has(resolver.resolve(keywords).mood.id)).toBe(true)
    }
  })

  it('survives a keyword list made of stop words', () => {
    expect(() => resolver.resolve('the and of a an')).not.toThrow()
  })

  it('shares a stateless singleton', () => {
    expect(moodResolver.resolve('coffee').mood.id).toBe('coffee')
    expect(moodResolver.resolve('coffee').mood.id).toBe('coffee')
  })

  it('uses only the keywords of a normalised request', () => {
    const request = normaliseConfig({ name: 'Acme', keywords: 'coffee, cafe', variations: 1 })
    const match = resolver.resolve(request.keywords, request.brief)
    expect(match.mood.id).toBe('coffee')
  })
})
