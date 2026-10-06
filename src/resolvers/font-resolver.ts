/**
 * Chooses the typeface for a concept.
 *
 * Two rules shape the pool before anything is picked:
 *
 * - Letter marks (monogram, lettermark) drop serif and display faces. A slab serif or a high-contrast
 *   didone loses its personality at 24px, which is exactly where a letter mark has to work.
 * - Wordmarks and emblems prefer faces with generous side bearings, because a name has to sit next to
 *   an icon or inside a frame.
 *
 * A caller-forced font id always wins, even if it fails those filters — the request is explicit.
 */

import { FONTS, findFont } from '../brain/index'
import type { EngineName, FontCategory, FontEntry, MoodMatch } from '../types'
import type { SeedResolver } from '../seed-resolver'

/** Categories allowed for letter marks. */
const LETTERMARK_CATEGORIES: ReadonlySet<FontCategory> = new Set([
  'geometric-sans',
  'humanist-sans',
])

/** Categories that carry a name well next to an icon. */
const LOCKUP_CATEGORIES: ReadonlySet<FontCategory> = new Set([
  'geometric-sans',
  'humanist-sans',
  'display',
])

/** Preference order used when the mood expresses no opinion. */
const CATEGORY_FALLBACK: readonly FontCategory[] = [
  'geometric-sans',
  'humanist-sans',
  'display',
  'serif',
]

/**
 * Orders candidates deterministically.
 *
 * Preferred categories come first, then the mood's declared order, then the id. Sorting by id last
 * guarantees stability even for fonts the mood never mentioned.
 *
 * Note this only *orders*. `SeedResolver.choice` draws uniformly by index, so ordering decides which
 * face a given seed lands on but does not make a category any more likely. A category preference is
 * therefore only real if the pool has been filtered to it — ordering alone enforces nothing.
 *
 * @param fonts - Candidate fonts.
 * @param preferred - Categories to float to the front, in order.
 * @returns A new, ordered array.
 */
function byPreference(
  fonts: readonly FontEntry[],
  preferred: readonly FontCategory[]
): FontEntry[] {
  return [...fonts].toSorted((a, b) => {
    const rankA = preferred.indexOf(a.category)
    const rankB = preferred.indexOf(b.category)
    const scoreA = rankA === -1 ? preferred.length : rankA
    const scoreB = rankB === -1 ? preferred.length : rankB
    if (scoreA !== scoreB) {
      return scoreA - scoreB
    }
    return compareIds(a.id, b.id)
  })
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
 * Chooses a typeface.
 *
 * @param engine - The engine that will draw.
 * @param mood - The resolved mood.
 * @param seed - The deterministic stream for this concept.
 * @param forced - A caller-supplied font id, or `null`.
 * @returns The typeface to use.
 */
export function resolveFont(
  engine: EngineName,
  mood: MoodMatch,
  seed: SeedResolver,
  forced: string | null
): FontEntry {
  if (forced !== null) {
    const explicit = findFont(forced.trim())
    if (explicit) {
      return explicit
    }
  }

  let preferred: readonly FontCategory[] = CATEGORY_FALLBACK
  if (engine === 'monogram' || engine === 'lettermark') {
    preferred = [...LETTERMARK_CATEGORIES]
  } else if (engine === 'wordmark' || engine === 'emblem') {
    preferred = [...LOCKUP_CATEGORIES]
  }

  const moodPool = mood.mood.fontIds
    .map(id => FONTS.find(entry => entry.id === id))
    .filter((entry): entry is FontEntry => entry !== undefined)

  const candidates = byPreference(
    moodPool.filter(font => preferred.includes(font.category)),
    preferred
  )

  if (candidates.length > 0) {
    return seed.choice(candidates)
  }

  const anyMoodFont = byPreference(moodPool, preferred)
  if (anyMoodFont.length > 0) {
    return seed.choice(anyMoodFont)
  }

  // The mood named no usable font at all, so fall back to the whole brain — but still filtered by the
  // engine's categories. `choice` picks uniformly by index, so merely *ordering* the pool by
  // preference would not bias the draw in any way: the pool itself has to be filtered, exactly as
  // above. Skipping that would let a letter mark be drawn in a didone, which is the one outcome the
  // rules above exist to prevent.
  const globalPool = byPreference(
    FONTS.filter(font => preferred.includes(font.category)),
    preferred
  )
  if (globalPool.length > 0) {
    return seed.choice(globalPool)
  }

  // Defensive: a brain containing no font in any preferred category still has to produce a mark.
  return seed.choice(byPreference(FONTS, preferred))
}

/**
 * Explains the typeface choice in one line.
 *
 * @param font - The chosen typeface.
 * @param engine - The engine that will draw.
 * @param forced - A caller-supplied font id, or `null`.
 * @returns A short rationale.
 */
export function explainFont(font: FontEntry, engine: EngineName, forced: string | null): string {
  const source = forced === null ? 'mood pool' : 'requested'
  const role =
    engine === 'monogram' || engine === 'lettermark'
      ? 'letterforms must survive at icon size'
      : 'the name has to sit with other elements'
  return `Typeface "${font.family}" (${font.category}, weight ${font.weight}, ${source}): ${role}.`
}
