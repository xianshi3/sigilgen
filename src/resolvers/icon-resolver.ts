/**
 * Chooses the pictogram for a concept.
 *
 * Icons are authored on a `0 0 24 24` grid as filled paths. The resolver only picks one; scaling and
 * placement belong to the engines, which know the space they are drawing into.
 *
 * Engines that draw no icon at all — `lettermark` and `abstract` — receive `null` rather than an
 * unused pictogram, so the concept notes stay honest about what was actually used.
 */

import { ICONS, findIcon } from '../brain/index'
import { type EngineName, type IconEntry, type MoodMatch } from '../types'
import type { SeedResolver } from '../seed-resolver'

/** Engines that never draw a pictogram. */
const ICONLESS_ENGINES: ReadonlySet<EngineName> = new Set(['lettermark', 'abstract'])

/**
 * Chooses a pictogram.
 *
 * @param engine - The engine that will draw.
 * @param mood - The resolved mood.
 * @param seed - The deterministic stream for this concept.
 * @param forced - A caller-supplied icon key, or `null`.
 * @returns The icon to use, or `null` when the engine draws none.
 */
export function resolveIcon(
  engine: EngineName,
  mood: MoodMatch,
  seed: SeedResolver,
  forced: string | null
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
 * @returns A short rationale.
 */
export function explainIcon(icon: IconEntry | null, forced: string | null): string {
  if (icon === null) {
    return 'Pictogram: none, because this engine is typographic by definition.'
  }
  const source = forced === null ? 'mood pool' : 'requested'
  return `Pictogram "${icon.key}" from the ${icon.category} group (${source}).`
}
