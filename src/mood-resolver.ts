/**
 * Turns keywords and a free-text brief into a coherent set of design resources.
 *
 * Mood is the first design decision in the pipeline: it narrows the palette, typeface and pictogram
 * candidates before anything is drawn, and it supplies the engine weights. Matching is substring
 * based in both directions so `fintech` matches a rule keyed on `fin`, and `wg` matches `wg`.
 *
 * Every decision is explainable: {@link MoodMatch.notes} carries the reasons through to the concept
 * output.
 */

import { MOODS, fallbackMood } from './brain/index'
import type { MoodMatch, MoodRule } from './types'

/** Longest brief considered. Longer text is truncated so pathological input cannot stall the scan. */
const MAX_BRIEF = 400

/** Maximum number of distinct words considered. */
const MAX_WORDS = 64

/**
 * Extracts lowercase alphanumeric words from a string.
 *
 * @param text - Arbitrary user text.
 * @returns De-duplicated words, in first-seen order.
 */
export function extractWords(text: string): string[] {
  const trimmed = text.slice(0, MAX_BRIEF).toLowerCase()
  const found: string[] = []
  const seen = new Set<string>()
  for (const token of trimmed.split(/[^a-z0-9]+/)) {
    if (token.length === 0 || token.length > 32 || seen.has(token)) {
      continue
    }
    seen.add(token)
    found.push(token)
    if (found.length >= MAX_WORDS) {
      break
    }
  }
  return found
}

/**
 * Reports whether a word activates a keyword.
 *
 * Matching is prefix based rather than substring based. Plain substring containment is far too
 * eager at this scale: `sustainable` contains `ai`, `batch` contains `bar`, and `Berlin` contains
 * nothing useful — a keyword list this broad would match almost everything.
 *
 * The three accepted forms are therefore:
 *
 * - exact equality, at any length;
 * - a longer word that *starts with* the keyword, which catches `fintechs` → `fin`;
 * - a longer keyword that *starts with* the word, which catches `wg` → `wg-network`.
 *
 * Prefix matching needs a floor, or a two-letter keyword matches most of the dictionary. Three
 * characters is the shortest prefix that stays specific in practice.
 *
 * @param word - A word from the request.
 * @param keyword - A keyword declared by a mood rule.
 * @returns `true` when the keyword applies.
 */
export function matchesWord(word: string, keyword: string): boolean {
  if (word === keyword) {
    return true
  }
  if (word.length < 3 || keyword.length < 3) {
    return false
  }
  return word.startsWith(keyword) || keyword.startsWith(word)
}

/**
 * Scores a mood rule against a set of words.
 *
 * Words are de-duplicated first, so repeating a keyword cannot inflate a score, and a word contributes
 * at most its single best match per rule.
 *
 * An exact match scores `1`; a prefix match scores `0.6`. That distinction matters: with flat scoring,
 * a rule that happens to list fewer synonyms outranks a rule whose keyword matches the word outright,
 * purely on list length.
 *
 * @param rule - The mood rule to score.
 * @param words - Normalised words from the request.
 * @returns The match count, `0` when the rule does not apply.
 */
export function scoreMood(rule: MoodRule, words: readonly string[]): number {
  if (rule.keywords.length === 0 || words.length === 0) {
    return 0
  }
  let score = 0
  for (const word of new Set(words)) {
    let best = 0
    for (const keyword of rule.keywords) {
      if (word === keyword) {
        best = Math.max(best, 1)
      } else if (matchesWord(word, keyword)) {
        best = Math.max(best, 0.6)
      }
    }
    score += best
  }
  return score
}

/**
 * Orders two ids without a nested ternary.
 *
 * @param a - First id.
 * @param b - Second id.
 * @returns `-1`, `0` or `1` in ascending code-unit order.
 */
function compareIds(a: string, b: string): number {
  if (a < b) {
    return -1
  }
  return a > b ? 1 : 0
}

/**
 * Matches keywords and a brief against the curated mood rules.
 *
 * Scores are normalised by how many keywords each rule declares, so a broad rule with thirty
 * synonyms does not automatically beat a precise one with three. Ties break on the rule id, which
 * keeps the outcome stable.
 */
export class MoodResolver {
  /**
   * Resolves the mood for a request.
   *
   * @param keywords - Comma or space separated keywords.
   * @param brief - Optional free text; its words are considered too.
   * @returns The winning mood, all scored candidates, the words considered, and human-readable notes.
   */
  resolve(keywords: string, brief = ''): MoodMatch {
    const words = extractWords(`${keywords} ${brief}`)
    /** @type {Record<string, number>} */
    const scores: Record<string, number> = {}
    /** @type {MoodRule[]} */
    const candidates: MoodRule[] = []

    for (const mood of MOODS) {
      if (mood.keywords.length === 0) {
        continue
      }
      const raw = scoreMood(mood, words)
      if (raw === 0) {
        continue
      }
      // Normalise so broad rules are not favoured purely for listing more synonyms.
      const normalised = raw / Math.sqrt(mood.keywords.length)
      scores[mood.id] = normalised
      candidates.push(mood)
    }

    // `toSorted` returns a new array; the result has to be kept. Assigning nothing here would leave the
    // candidates in declaration order, which makes "strongest match" mean "first declared" by accident.
    const ranked = candidates.toSorted((a, b) => {
      const delta = (scores[b.id] as number) - (scores[a.id] as number)
      if (delta !== 0) {
        return delta
      }
      return compareIds(a.id, b.id)
    })

    if (ranked.length === 0) {
      const mood = fallbackMood()
      return {
        mood,
        candidates: [],
        scores: {},
        words,
        notes: [
          'No keyword matched a mood rule, so the neutral baseline was used.',
          `Palette pool: ${mood.paletteIds.join(', ')}.`,
        ],
      }
    }

    const winner = ranked[0] as MoodRule
    const matchedKeywords = winner.keywords.filter(keyword =>
      words.some(word => matchesWord(word, keyword))
    )

    const notes = [
      `Mood "${winner.id}" matched on ${matchedKeywords.slice(0, 6).join(', ')}.`,
      `Palette pool: ${winner.paletteIds.join(', ')}.`,
      `Typeface pool: ${winner.fontIds.join(', ')}.`,
    ]
    if (ranked.length > 1) {
      const runnerUp = ranked[1] as MoodRule
      notes.push(`Runner-up mood: ${runnerUp.id}.`)
    }

    return { mood: winner, candidates: ranked, scores, words, notes }
  }
}

/** Shared resolver instance; the class holds no state. */
export const moodResolver = new MoodResolver()
