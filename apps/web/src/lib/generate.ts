import { generateLogos } from '@sigilgen/generate'
import type { DesignDimension, EngineName, LogoResult } from '@sigilgen/types'
import type { MessageKey } from '../i18n/locales/zh'

/** Everything the studio can ask the generator for. `'auto'` means "no opinion, let the rules decide". */
export interface StudioConfig {
  name: string
  keywords: string
  brief: string
  engine: EngineName | 'auto'
  /** A palette id, or a comma separated colour list, or `'auto'`. */
  palette: string
  /** A typeface id, or `'auto'`. */
  font: string
  /** A pictogram key, or `'auto'`. */
  icon: string
  size: number
  variations: number
  background: boolean
  seed: number
  /**
   * Design decisions to hold still, keyed by dimension.
   *
   * Absent means the seed chooses, which is the same state as `'auto'` for the resources above: the
   * interface stores the absence rather than a sentinel, so a released control is indistinguishable
   * from one that was never touched.
   */
  preferences: Partial<Record<DesignDimension, string>>
}

export interface GenerationResult {
  concepts: LogoResult[]
  /** A message key when generation failed, so the interface can say so in the user's language. */
  errorKey: MessageKey | null
  /** The generator's own wording, kept for the tooltip on the error state. */
  errorDetail: string | null
}

/**
 * Maps a validation failure onto a translatable key.
 *
 * The core throws `TypeError` with an English sentence, which is the right thing for a library and the
 * wrong thing to show a reader. Matching on the stable part of each message keeps the interface
 * translatable; anything unrecognised falls through to the raw text rather than being swallowed.
 */
function classify(message: string): MessageKey | null {
  if (/at least one letter/.test(message)) {
    return 'error.noLetters'
  }
  if (/at most \d+ characters/.test(message)) {
    return 'error.tooLong'
  }
  if (/"engine"/.test(message)) {
    return 'error.unknownEngine'
  }
  return null
}

/**
 * Runs the generator, converting a thrown validation error into a presentable result.
 *
 * Nothing here catches an unexpected exception: a bug in an engine should surface loudly rather than
 * quietly becoming an empty stage.
 */
export function generate(config: StudioConfig): GenerationResult {
  if (config.name.trim() === '') {
    return { concepts: [], errorKey: null, errorDetail: null }
  }
  // `'auto'` means the mood rules choose. Passing the string through instead would be a request for a
  // palette called `auto`, which the resolver would fail to find and quietly ignore anyway — better to
  // say what is meant by leaving the field out, so an invalid id and an absent one stay distinguishable
  // in the notes.
  const preferences = config.preferences
  const preferencesField = Object.keys(preferences).length === 0 ? {} : { preferences }

  try {
    const concepts = generateLogos({
      name: config.name,
      keywords: config.keywords,
      brief: config.brief,
      ...(config.engine === 'auto' ? {} : { engine: config.engine }),
      ...(config.palette === '' ? {} : { palette: config.palette }),
      ...(config.font === '' ? {} : { font: config.font }),
      ...(config.icon === '' ? {} : { icon: config.icon }),
      size: config.size,
      variations: config.variations,
      background: config.background,
      seed: config.seed,
      ...preferencesField,
    })
    return { concepts, errorKey: null, errorDetail: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { concepts: [], errorKey: classify(detail), errorDetail: detail }
  }
}

/**
 * Encodes SVG as a data URL for use as an image source.
 *
 * A data URL rather than a blob URL or injected markup: nothing is created that has to be revoked
 * later, and the browser parses the SVG as an image, so nothing inside it can reach the page's DOM.
 * The generator also forbids script and event handlers, so the content is safe by construction.
 *
 * @param svg - SVG document text.
 * @returns A URL usable as an `img` source.
 */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
