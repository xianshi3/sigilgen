import type { MessageKey } from '../i18n/locales/zh'
import type { EngineName } from '@sigilgen/types'

/**
 * Display metadata for each engine.
 *
 * The engine ids are domain terms that appear in the generator's own notes, so they are shown
 * unchanged in the inspector and paired with a translated gloss in the picker rather than replaced by
 * it. A user reading `emblem` in the notes should be able to find it in the control that produced it.
 */

/** Label for the engine picker. */
export const ENGINE_LABEL: Record<EngineName, MessageKey> = {
  monogram: 'engine.monogram',
  wordmark: 'engine.wordmark',
  lettermark: 'engine.lettermark',
  abstract: 'engine.abstract',
  emblem: 'engine.emblem',
}

/** One-line explanation shown under the picker. */
export const ENGINE_HINT: Record<EngineName, MessageKey> = {
  monogram: 'engine.monogramHint',
  wordmark: 'engine.wordmarkHint',
  lettermark: 'engine.lettermarkHint',
  abstract: 'engine.abstractHint',
  emblem: 'engine.emblemHint',
}

/**
 * Whether an engine places a pictogram.
 *
 * Only two of the five do: a wordmark pairs the name with one, and an emblem puts one inside its
 * frame. The other three draw letterforms or pure geometry and never touch `resources.icon`. Offering
 * seventy icons to those engines would be offering controls that do nothing.
 *
 * `'auto'` counts as using one, because the router may land on a wordmark or an emblem and the reader
 * is not in a position to know which before generating.
 */
export const ENGINE_USES_ICON: Record<EngineName | 'auto', boolean> = {
  monogram: false,
  lettermark: false,
  abstract: false,
  wordmark: true,
  emblem: true,
  auto: true,
}
