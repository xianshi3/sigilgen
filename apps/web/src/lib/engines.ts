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
  apparatus: 'engine.apparatus',
  abstract: 'engine.abstract',
  emblem: 'engine.emblem',
  pictogram: 'engine.pictogram',
  halftone: 'engine.halftone',
  scanline: 'engine.scanline',
}

/** One-line explanation shown under the picker. */
export const ENGINE_HINT: Record<EngineName, MessageKey> = {
  monogram: 'engine.monogramHint',
  wordmark: 'engine.wordmarkHint',
  lettermark: 'engine.lettermarkHint',
  apparatus: 'engine.apparatusHint',
  abstract: 'engine.abstractHint',
  emblem: 'engine.emblemHint',
  pictogram: 'engine.pictogramHint',
  halftone: 'engine.halftoneHint',
  scanline: 'engine.scanlineHint',
}

/**
 * Whether an engine places a pictogram.
 *
 * Three do: a wordmark pairs the name with one, an emblem puts one inside its frame, and a pictogram is
 * nothing but one. The rest draw letterforms or pure geometry and never touch `resources.icon`. Offering
 * seventy icons to those engines would be offering controls that do nothing.
 *
 * `'auto'` counts as using one, because the router may land on an icon-led engine and the reader is not
 * in a position to know which before generating.
 */
export const ENGINE_USES_ICON: Record<EngineName | 'auto', boolean> = {
  monogram: false,
  lettermark: false,
  apparatus: false,
  abstract: false,
  halftone: false,
  scanline: false,
  wordmark: true,
  emblem: true,
  pictogram: true,
  auto: true,
}
