/**
 * Chooses the pictogram for a concept.
 *
 * Icons are authored on a `0 0 24 24` grid as filled paths. The resolver only picks one; scaling and
 * placement belong to the engines, which know the space they are drawing into.
 *
 * Engines that draw no icon at all — the typographic and geometric ones, see {@link ICONLESS_ENGINES} —
 * receive `null` rather than an unused pictogram, so the concept notes stay honest about what was
 * actually used.
 */

import { ICONS, findIcon } from '../brain/index'
import { findNameCue } from '../name-cues'
import { type EngineName, type IconEntry, type MoodMatch } from '../types'
import type { SeedResolver } from '../seed-resolver'

/** Engines that never draw a pictogram. */
const ICONLESS_ENGINES: ReadonlySet<EngineName> = new Set([
  'lettermark',
  'apparatus',
  'abstract',
  'halftone',
  'scanline',
])

/**
 * Chooses a pictogram.
 *
 * @param engine - The engine that will draw.
 * @param mood - The resolved mood.
 * @param seed - The deterministic stream for this concept.
 * @param forced - A caller-supplied icon key, or `null`.
 * @param nameWords - Lowercase words from the brand name.
 * @returns The icon to use, or `null` when the engine draws none.
 */
export function resolveIcon(
  engine: EngineName,
  mood: MoodMatch,
  seed: SeedResolver,
  forced: string | null,
  nameWords: readonly string[] = []
): IconEntry | null {
  if (ICONLESS_ENGINES.has(engine)) {
    return null
  }

  if (forced !== null) {
    const explicit = findIcon(forced.trim())
    if (explicit) {
      return explicit
    }
  }

  // A name that literally says `rocket` or `coffee` should draw that object, not a generic mark from
  // the mood pool. The cue is checked after an explicit request, which still wins.
  const cue = findNameCue(nameWords)
  if (cue !== null) {
    return cue.icon
  }

  const pool = mood.mood.iconKeys
    .map(key => ICONS.find(entry => entry.key === key))
    .filter((entry): entry is IconEntry => entry !== undefined)

  if (pool.length > 0) {
    return seed.choice(pool)
  }

  // Every engine that wants an icon can fall back to a neutral geometric mark.
  const neutral =
    mood.mood.id === 'neutral' ? null : ICONS.find(entry => entry.key === 'hexagon-node')
  return neutral ?? seed.choice(ICONS)
}

/**
 * Explains the pictogram choice in one line.
 *
 * @param icon - The chosen icon, or `null`.
 * @param forced - A caller-supplied icon key, or `null`.
 * @param nameWords - Lowercase words from the brand name.
 * @returns A short rationale.
 */
export function explainIcon(
  icon: IconEntry | null,
  forced: string | null,
  nameWords: readonly string[] = []
): string {
  if (icon === null) {
    return 'Pictogram: none, because this engine is typographic by definition.'
  }
  const cue = findNameCue(nameWords)
  const source =
    forced !== null
      ? 'requested'
      : cue !== null && cue.icon.key === icon.key
        ? `name cue "${cue.word}"`
        : 'mood pool'
  return `Pictogram "${icon.key}" from the ${icon.category} group (${source}).`
}
