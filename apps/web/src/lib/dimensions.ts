import { MODES } from '@sigilgen/engines/abstract'
import { FRAMES } from '@sigilgen/engines/emblem'
import { ACCENTS } from '@sigilgen/engines/lettermark'
import { CONTAINERS, LETTER_LAYOUTS } from '@sigilgen/engines/shared'
import { LAYOUTS, TREATMENTS } from '@sigilgen/engines/wordmark'
import type { DesignDimension, EngineName } from '@sigilgen/types'
import type { MessageKey } from '../i18n/locales/zh'

/**
 * One pinnable decision, as the interface presents it.
 *
 * The candidate lists are imported from the engines rather than copied here, because the engine's own
 * list is the only thing that decides whether a value is usable. A second copy would be free to drift
 * and would eventually offer a choice that silently does nothing.
 */
export interface DimensionSpec {
  dimension: DesignDimension
  /** Heading for the group of choices. */
  label: MessageKey
  /** Every value the engine will accept, in the engine's own order. */
  values: readonly string[]
}

/**
 * The dimensions each engine reads, in the order they should be offered.
 *
 * Only these appear. A pinned value for a dimension the active engine never reads would be a control
 * that does nothing, which is worse than not offering it at all.
 */
export const DIMENSIONS: Record<EngineName, readonly DimensionSpec[]> = {
  monogram: [
    { dimension: 'container', label: 'dimension.container', values: CONTAINERS },
    { dimension: 'layout', label: 'dimension.layout', values: LETTER_LAYOUTS },
  ],
  wordmark: [
    { dimension: 'layout', label: 'dimension.layout', values: LAYOUTS },
    { dimension: 'treatment', label: 'dimension.treatment', values: TREATMENTS },
  ],
  lettermark: [{ dimension: 'accent', label: 'dimension.accent', values: ACCENTS }],
  emblem: [{ dimension: 'frame', label: 'dimension.frame', values: FRAMES }],
  abstract: [{ dimension: 'mode', label: 'dimension.mode', values: MODES }],
}

/**
 * Renders a candidate value as a label.
 *
 * Candidate values are the engines' own identifiers, and they appear verbatim in the design notes the
 * generator writes, so they are shown unchanged rather than replaced by a translation. Hyphens become
 * spaces and the first letter is capitalised — presentation, not translation, and the same in both
 * languages. `corner-frame` reads as `Corner frame`, which a reader can match against the note.
 */
export function valueLabel(value: string): string {
  const spaced = value.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
