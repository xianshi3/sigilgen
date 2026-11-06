/**
 * Brand-name cues: words in the name that point at a concrete pictogram.
 *
 * Keywords are the explicit design brief. The brand name is the other half of the same brief, and a
 * name such as "Northwind Coffee" already says `coffee` without anyone typing it twice. This module
 * matches name words against the pictogram catalogue's keys and tags; a hit lets the icon resolver
 * choose the named object instead of drawing from the mood's generic pool.
 *
 * The match is intentionally conservative: exact words score higher than prefixes, and a word that
 * matches no key or tag returns nothing. A coined name should produce no cue rather than a lucky one.
 */

import { ICONS } from './brain/index'
import { matchesWord } from './mood-resolver'
import type { IconEntry } from './types'

/** Score for an exact key segment or tag. */
const EXACT_SCORE = 2

/** Score for a prefix match, such as `rockets` against `rocket`. */
const PREFIX_SCORE = 1

/** A name word and the pictogram it selects. */
export interface NameCue {
  /** The matched pictogram. */
  icon: IconEntry
  /** The name word that produced the match. */
  word: string
  /** Sum of the word's best exact/prefix matches across the icon's terms. */
  score: number
}

/**
 * Finds the pictogram most directly named by a set of brand-name words.
 *
 * @param words - Lowercase words extracted from the brand name.
 * @returns The best matching icon and word, or `null` when the name says nothing concrete.
 */
export function findNameCue(words: readonly string[]): NameCue | null {
  if (words.length === 0) {
    return null
  }

  let best: NameCue | null = null
  for (const icon of ICONS) {
    const terms = [icon.key, ...icon.key.split('-'), ...icon.tags]
    let score = 0
    let matchedWord = ''
    for (const word of words) {
      let bestForWord = 0
      for (const term of terms) {
        if (word === term) {
          bestForWord = Math.max(bestForWord, EXACT_SCORE)
        } else if (matchesWord(word, term)) {
          bestForWord = Math.max(bestForWord, PREFIX_SCORE)
        }
      }
      score += bestForWord
      if (bestForWord > 0 && matchedWord === '') {
        matchedWord = word
      }
    }
    if (score === 0) {
      continue
    }
    if (best === null || score > best.score || (score === best.score && icon.key < best.icon.key)) {
      best = { icon, word: matchedWord, score }
    }
  }
  return best
}

/**
 * The pictogram a brand name directly names, when there is one.
 *
 * @param words - Lowercase words extracted from the brand name.
 * @returns The icon, or `null`.
 */
export function findNameCueIcon(words: readonly string[]): IconEntry | null {
  return findNameCue(words)?.icon ?? null
}
